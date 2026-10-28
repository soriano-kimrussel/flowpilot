'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionSession } from '@/features/auth/session';
import { fieldErrorsFrom, toActionError, unwrap } from '@/features/actions-util';
import { logAudit } from '@/features/audit/log';
import { getAI } from '@/features/ai';
import { getSiteUrl } from '@/lib/env';
import { generateWebhookCredentials } from '@/lib/security/webhook';
import { stableStringify } from '@/lib/utils/stable-json';
import { createWorkflowSchema, workflowMetaSchema } from '@/lib/validation/workflow';
import { emptyDefinition, validateDefinition } from '@/lib/workflow-engine/definition';

const idSchema = z.string().uuid();

function defaultDefinition(triggerType) {
  const def = emptyDefinition(triggerType);
  def.steps = [
    {
      id: 'log',
      type: 'execution.log',
      name: 'Log run',
      config: { message: 'Workflow started', level: 'info' },
      onError: 'stop',
    },
  ];
  return def;
}

async function saveVersion(session, workflowId, definition) {
  const { data, error } = await session.supabase.rpc('create_workflow_version', {
    p_workflow_id: workflowId,
    p_definition: definition,
  });
  return unwrap({ data, error }, 'Could not save workflow version');
}

export async function createWorkflowAction(values) {
  let newId;
  try {
    const session = await requireActionSession('workflow.edit');
    const parsed = createWorkflowSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    let definition = defaultDefinition(parsed.data.triggerType);
    if (parsed.data.templateId) {
      const { data: template } = await session.supabase
        .from('workflow_templates')
        .select('definition')
        .eq('id', parsed.data.templateId)
        .maybeSingle();
      if (!template) return { ok: false, error: 'Template not found.' };
      definition = template.definition;
    }
    const validation = validateDefinition(definition);
    if (!validation.success)
      return { ok: false, error: 'The template definition is invalid.', issues: validation.issues };

    const workflow = unwrap(
      await session.supabase
        .from('workflows')
        .insert({
          workspace_id: session.workspaceId,
          name: parsed.data.name,
          description: parsed.data.description || null,
          status: 'draft',
          trigger_type: validation.data.trigger.type,
          created_by: session.user.id,
          updated_by: session.user.id,
        })
        .select('id')
        .single(),
      'Could not create workflow',
    );
    await saveVersion(session, workflow.id, validation.data);
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'workflow.created',
      entityType: 'workflow',
      entityId: workflow.id,
      metadata: { fromTemplate: Boolean(parsed.data.templateId) },
    });
    newId = workflow.id;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath('/dashboard/workflows');
  redirect(`/dashboard/workflows/${newId}`);
}

/** Saves name/description and, if the definition changed, a new immutable version. */
export async function saveWorkflowAction(id, { name, description, definition }) {
  try {
    const session = await requireActionSession('workflow.edit');
    const workflowId = idSchema.parse(id);
    const meta = workflowMetaSchema.safeParse({ name, description });
    if (!meta.success) return { ok: false, fieldErrors: fieldErrorsFrom(meta.error) };
    const validation = validateDefinition(definition);
    if (!validation.success)
      return {
        ok: false,
        error: 'Fix the highlighted problems before saving.',
        issues: validation.issues,
      };

    const { data: current } = await session.supabase
      .from('workflows')
      .select(
        'id, status, current_version_id, workflow_versions!workflows_current_version_fk(definition, version_number)',
      )
      .eq('id', workflowId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!current) return { ok: false, error: 'Workflow not found.' };

    unwrap(
      await session.supabase
        .from('workflows')
        .update({
          name: meta.data.name,
          description: meta.data.description || null,
          updated_by: session.user.id,
        })
        .eq('id', workflowId)
        .eq('workspace_id', session.workspaceId),
    );

    const changed =
      stableStringify(current.workflow_versions?.definition) !== stableStringify(validation.data);
    let versionNumber = current.workflow_versions?.version_number ?? null;
    if (changed) {
      const version = await saveVersion(session, workflowId, validation.data);
      versionNumber = version.version_number;
      await logAudit(session.supabase, {
        workspaceId: session.workspaceId,
        actorId: session.user.id,
        action: 'workflow.version_saved',
        entityType: 'workflow',
        entityId: workflowId,
        metadata: { version: versionNumber },
      });
    }
    revalidatePath(`/dashboard/workflows/${workflowId}`);
    return { ok: true, versionNumber, newVersion: changed };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setWorkflowStatusAction(id, status) {
  try {
    const session = await requireActionSession('workflow.edit');
    const workflowId = idSchema.parse(id);
    const nextStatus = z.enum(['active', 'inactive', 'draft', 'archived']).parse(status);
    const { data: wf } = await session.supabase
      .from('workflows')
      .select(
        'id, trigger_type, current_version_id, workflow_versions!workflows_current_version_fk(definition)',
      )
      .eq('id', workflowId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!wf) return { ok: false, error: 'Workflow not found.' };

    if (nextStatus === 'active') {
      const validation = validateDefinition(wf.workflow_versions?.definition);
      if (!validation.success)
        return {
          ok: false,
          error: 'The saved version is invalid. Fix and save it before activating.',
        };
    }
    unwrap(
      await session.supabase
        .from('workflows')
        .update({ status: nextStatus, updated_by: session.user.id })
        .eq('id', workflowId)
        .eq('workspace_id', session.workspaceId),
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: `workflow.${nextStatus}`,
      entityType: 'workflow',
      entityId: workflowId,
    });
    revalidatePath(`/dashboard/workflows/${workflowId}`);
    revalidatePath('/dashboard/workflows');
    let warning;
    if (nextStatus === 'active' && wf.trigger_type === 'webhook') {
      const { data: endpoint } = await session.supabase
        .from('webhook_endpoints')
        .select('id')
        .eq('workflow_id', workflowId)
        .is('revoked_at', null)
        .maybeSingle();
      if (!endpoint)
        warning = 'Generate a webhook secret so external systems can call this workflow.';
    }
    return { ok: true, warning };
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateWorkflowAction(id) {
  let newId;
  try {
    const session = await requireActionSession('workflow.edit');
    const workflowId = idSchema.parse(id);
    const { data: source } = await session.supabase
      .from('workflows')
      .select(
        'name, description, trigger_type, workflow_versions!workflows_current_version_fk(definition)',
      )
      .eq('id', workflowId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!source?.workflow_versions)
      return { ok: false, error: 'Workflow not found or has no saved version.' };

    const copy = unwrap(
      await session.supabase
        .from('workflows')
        .insert({
          workspace_id: session.workspaceId,
          name: `${source.name} (copy)`.slice(0, 120),
          description: source.description,
          status: 'draft',
          trigger_type: source.trigger_type,
          created_by: session.user.id,
          updated_by: session.user.id,
        })
        .select('id')
        .single(),
    );
    await saveVersion(session, copy.id, source.workflow_versions.definition);
    newId = copy.id;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath('/dashboard/workflows');
  redirect(`/dashboard/workflows/${newId}`);
}

export async function deleteWorkflowAction(id) {
  try {
    const session = await requireActionSession('workflow.edit');
    const workflowId = idSchema.parse(id);
    const deleted = unwrap(
      await session.supabase
        .from('workflows')
        .delete()
        .eq('id', workflowId)
        .eq('workspace_id', session.workspaceId)
        .select('id, name'),
    );
    if (!deleted.length) return { ok: false, error: 'Workflow not found.' };
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'workflow.deleted',
      entityType: 'workflow',
      entityId: workflowId,
      metadata: { name: deleted[0].name },
    });
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath('/dashboard/workflows');
  redirect('/dashboard/workflows');
}

/** Creates or rotates the webhook endpoint. The plaintext secret is returned exactly once. */
export async function generateWebhookSecretAction(id) {
  try {
    const session = await requireActionSession('webhook.manage');
    const workflowId = idSchema.parse(id);
    const { data: wf } = await session.supabase
      .from('workflows')
      .select('id')
      .eq('id', workflowId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!wf) return { ok: false, error: 'Workflow not found.' };

    const creds = generateWebhookCredentials();
    unwrap(
      await session.supabase.from('webhook_endpoints').upsert(
        {
          workspace_id: session.workspaceId,
          workflow_id: workflowId,
          public_id: creds.publicId,
          secret_hash: creds.secretHash,
          secret_hint: creds.secretHint,
          revoked_at: null,
          created_by: session.user.id,
        },
        { onConflict: 'workflow_id' },
      ),
      'Could not save webhook endpoint',
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'webhook.secret_generated',
      entityType: 'workflow',
      entityId: workflowId,
    });
    revalidatePath(`/dashboard/workflows/${workflowId}`);
    return {
      ok: true,
      url: `${getSiteUrl()}/api/webhooks/${creds.publicId}`,
      secret: creds.secret,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeWebhookAction(id) {
  try {
    const session = await requireActionSession('webhook.manage');
    const workflowId = idSchema.parse(id);
    unwrap(
      await session.supabase
        .from('webhook_endpoints')
        .update({ revoked_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .eq('workspace_id', session.workspaceId),
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'webhook.revoked',
      entityType: 'workflow',
      entityId: workflowId,
    });
    revalidatePath(`/dashboard/workflows/${workflowId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function suggestStepsAction(goal) {
  try {
    await requireActionSession('workflow.view');
    const text = z
      .string()
      .trim()
      .min(3, 'Describe the goal in a few words')
      .max(500)
      .safeParse(goal);
    if (!text.success) return { ok: false, error: text.error.issues[0].message };
    const { result, meta } = await getAI().suggestSteps(text.data);
    return { ok: true, ...result, meta };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveAsTemplateAction(id) {
  try {
    const session = await requireActionSession('template.manage');
    const workflowId = idSchema.parse(id);
    const { data: wf } = await session.supabase
      .from('workflows')
      .select('name, description, workflow_versions!workflows_current_version_fk(definition)')
      .eq('id', workflowId)
      .eq('workspace_id', session.workspaceId)
      .maybeSingle();
    if (!wf?.workflow_versions) return { ok: false, error: 'Save the workflow first.' };
    unwrap(
      await session.supabase.from('workflow_templates').insert({
        workspace_id: session.workspaceId,
        name: wf.name,
        description: wf.description,
        category: 'workspace',
        definition: wf.workflow_versions.definition,
        is_system: false,
        created_by: session.user.id,
      }),
    );
    revalidatePath('/dashboard/templates');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTemplateAction(id) {
  try {
    const session = await requireActionSession('template.manage');
    const templateId = idSchema.parse(id);
    unwrap(
      await session.supabase
        .from('workflow_templates')
        .delete()
        .eq('id', templateId)
        .eq('workspace_id', session.workspaceId)
        .eq('is_system', false),
    );
    revalidatePath('/dashboard/templates');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
