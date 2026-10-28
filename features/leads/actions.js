'use server';

import { revalidatePath } from 'next/cache';
import { requireActionSession } from '@/features/auth/session';
import { fieldErrorsFrom, toActionError, unwrap } from '@/features/actions-util';
import { logAudit } from '@/features/audit/log';
import { getAI } from '@/features/ai';
import { processWorkspaceJobs } from '@/features/executions/process';
import { bulkLeadActionSchema, extractTextSchema, leadFormSchema } from '@/lib/validation/lead';
import { LEAD_STATUSES } from '@/lib/workflow-engine/constants';
import { z } from 'zod';

const idSchema = z.string().uuid('Invalid lead id');

function cleanLead(values) {
  // Normalize optional empties to null for the database.
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v === undefined ? null : v]),
  );
}

export async function createLeadAction(values) {
  try {
    const session = await requireActionSession('lead.edit');
    const parsed = leadFormSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    const { data, error } = await session.supabase
      .from('leads')
      .insert({
        ...cleanLead(parsed.data),
        workspace_id: session.workspaceId,
        created_by: session.user.id,
        updated_by: session.user.id,
      })
      .select('id')
      .single();

    if (error?.code === '23505') {
      const { data: existing } = await session.supabase
        .from('leads')
        .select('id')
        .eq('workspace_id', session.workspaceId)
        .eq('email_normalized', parsed.data.email.trim().toLowerCase())
        .maybeSingle();
      return {
        ok: false,
        fieldErrors: { email: 'A lead with this email already exists in this workspace.' },
        duplicateId: existing?.id ?? null,
      };
    }
    unwrap({ data, error }, 'Could not create lead');

    await session.supabase.from('lead_activities').insert({
      workspace_id: session.workspaceId,
      lead_id: data.id,
      type: 'created',
      description: `Lead created manually (source: ${parsed.data.source})`,
      actor_id: session.user.id,
    });
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'lead.created',
      entityType: 'lead',
      entityId: data.id,
    });

    // The DB trigger queued jobs for "lead created" workflows; run them now (bounded).
    const jobs = await processWorkspaceJobs(session);
    revalidatePath('/dashboard/leads');
    return { ok: true, id: data.id, workflowsRun: jobs.processed };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLeadAction(id, values) {
  try {
    const session = await requireActionSession('lead.edit');
    const leadId = idSchema.parse(id);
    const parsed = leadFormSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    const { data: before } = await session.supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!before) return { ok: false, error: 'Lead not found.' };

    const { error } = await session.supabase
      .from('leads')
      .update({
        ...cleanLead(parsed.data),
        updated_by: session.user.id,
        last_changed_by_execution_id: null, // a human made this change
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('workspace_id', session.workspaceId);
    if (error?.code === '23505')
      return { ok: false, fieldErrors: { email: 'Another lead already uses this email.' } };
    unwrap({ error }, 'Could not update lead');

    const statusChanged = before.status !== parsed.data.status;
    await session.supabase.from('lead_activities').insert({
      workspace_id: session.workspaceId,
      lead_id: leadId,
      type: statusChanged ? 'status_changed' : 'updated',
      description: statusChanged
        ? `Status changed from ${before.status} to ${parsed.data.status}`
        : 'Lead details updated',
      actor_id: session.user.id,
    });
    const jobs = statusChanged ? await processWorkspaceJobs(session) : { processed: 0 };
    revalidatePath(`/dashboard/leads/${leadId}`);
    revalidatePath('/dashboard/leads');
    return { ok: true, workflowsRun: jobs.processed };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLeadStatusAction(id, status) {
  try {
    const session = await requireActionSession('lead.edit');
    const leadId = idSchema.parse(id);
    const nextStatus = z.enum(LEAD_STATUSES).parse(status);
    const { data: before } = await session.supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!before) return { ok: false, error: 'Lead not found.' };
    if (before.status === nextStatus) return { ok: true, workflowsRun: 0 };

    unwrap(
      await session.supabase
        .from('leads')
        .update({
          status: nextStatus,
          updated_by: session.user.id,
          last_changed_by_execution_id: null,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .eq('workspace_id', session.workspaceId),
    );
    await session.supabase.from('lead_activities').insert({
      workspace_id: session.workspaceId,
      lead_id: leadId,
      type: 'status_changed',
      description: `Status changed from ${before.status} to ${nextStatus}`,
      actor_id: session.user.id,
    });
    const jobs = await processWorkspaceJobs(session);
    revalidatePath(`/dashboard/leads/${leadId}`);
    return { ok: true, workflowsRun: jobs.processed };
  } catch (error) {
    return toActionError(error);
  }
}

export async function bulkLeadAction(input) {
  try {
    const parsed = bulkLeadActionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const { ids, action, status } = parsed.data;
    const session = await requireActionSession(action === 'delete' ? 'lead.delete' : 'lead.edit');
    const base = () => session.supabase.from('leads');
    let result;

    if (action === 'delete') {
      result = await base()
        .delete()
        .eq('workspace_id', session.workspaceId)
        .in('id', ids)
        .select('id');
    } else if (action === 'archive' || action === 'unarchive') {
      result = await base()
        .update({
          archived_at: action === 'archive' ? new Date().toISOString() : null,
          updated_by: session.user.id,
          last_changed_by_execution_id: null,
        })
        .eq('workspace_id', session.workspaceId)
        .in('id', ids)
        .select('id');
    } else {
      if (!status) return { ok: false, error: 'Choose a status.' };
      result = await base()
        .update({
          status,
          updated_by: session.user.id,
          last_changed_by_execution_id: null,
          last_activity_at: new Date().toISOString(),
        })
        .eq('workspace_id', session.workspaceId)
        .in('id', ids)
        .select('id');
    }
    const changed = unwrap(result, 'Bulk update failed');
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: `lead.bulk_${action}`,
      entityType: 'lead',
      metadata: { count: changed.length, status: status ?? null },
    });
    if (action === 'set_status') await processWorkspaceJobs(session, { limit: 5 });
    revalidatePath('/dashboard/leads');
    return { ok: true, count: changed.length };
  } catch (error) {
    return toActionError(error);
  }
}

export async function extractLeadFieldsAction(input) {
  try {
    await requireActionSession('lead.edit');
    const parsed = extractTextSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const { result, meta } = await getAI().extractLeadFields(parsed.data.text);
    return { ok: true, fields: result.fields, found: result.found, meta };
  } catch (error) {
    return toActionError(error);
  }
}

/** On-demand AI assist: score, classify and summarize a single lead, persisting results. */
export async function analyzeLeadAction(id) {
  try {
    const session = await requireActionSession('lead.edit');
    const leadId = idSchema.parse(id);
    const { data: lead } = await session.supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!lead) return { ok: false, error: 'Lead not found.' };

    const ai = getAI();
    const [score, classification] = await Promise.all([ai.scoreLead(lead), ai.classifyLead(lead)]);
    const summary = await ai.summarizeLead(lead, { score: score.result });
    const prefix = summary.meta.simulated ? '[Rule-based summary] ' : `[${summary.meta.label}] `;

    unwrap(
      await session.supabase
        .from('leads')
        .update({
          score: score.result.score,
          score_details: { ...score.result, ai: score.meta, scored_at: new Date().toISOString() },
          classification: classification.result.segment,
          classification_details: { ...classification.result, ai: classification.meta },
          ai_summary: `${prefix}${summary.result.summary}`.slice(0, 4000),
          updated_by: session.user.id,
          last_changed_by_execution_id: null,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .eq('workspace_id', session.workspaceId),
    );
    await session.supabase.from('lead_activities').insert({
      workspace_id: session.workspaceId,
      lead_id: leadId,
      type: 'analyzed',
      description: `Analyzed with ${score.meta.label}: score ${score.result.score}, ${classification.result.segment.replace('_', ' ')}`,
      actor_id: session.user.id,
    });
    revalidatePath(`/dashboard/leads/${leadId}`);
    return { ok: true, score: score.result.score };
  } catch (error) {
    return toActionError(error);
  }
}
