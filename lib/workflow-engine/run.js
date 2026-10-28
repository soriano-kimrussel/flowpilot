// Orchestration: creates execution records and runs the engine for manual runs, retries and
// queued jobs. Receives an explicit Supabase client so it works for user sessions (RLS) and for
// the narrowly-scoped admin client used by cron/webhooks.

import { can } from '@/lib/security/permissions';
import { redact } from '@/lib/security/redact';
import { LIMITS } from './constants';
import { AuthorizationError, NotFoundError } from './errors';
import { executeWorkflow } from './executor';
import { leadContext } from './lead-fields';
import { createServices } from './services';
import { createSupabaseStore } from './supabase-store';

async function loadWorkflowWithVersion(supabase, workspaceId, workflowId, versionId) {
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('id, workspace_id, name, status, trigger_type, current_version_id, is_demo')
    .eq('id', workflowId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load workflow: ${error.message}`);
  if (!workflow) throw new NotFoundError('Workflow not found');

  const targetVersion = versionId ?? workflow.current_version_id;
  if (!targetVersion)
    throw new NotFoundError('This workflow has no saved version yet. Save it first.');
  const { data: version, error: versionError } = await supabase
    .from('workflow_versions')
    .select('id, version_number, definition')
    .eq('id', targetVersion)
    .eq('workflow_id', workflowId)
    .single();
  if (versionError) throw new NotFoundError('Workflow version not found');
  return { workflow, version };
}

async function loadLead(supabase, workspaceId, leadId) {
  if (!leadId) return null;
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load lead: ${error.message}`);
  if (!data) throw new NotFoundError('Lead not found in this workspace');
  return data;
}

/** Creates the execution row (idempotently) and runs it to completion within bounded limits. */
export async function startExecution({
  supabase,
  workspaceId,
  workflow,
  version,
  trigger,
  leadRow = null,
  idempotencyKey = null,
  actorId = null,
  retryOf = null,
  ai,
}) {
  const store = createSupabaseStore(supabase, workspaceId);
  const { execution, existing } = await store.createExecution({
    workflow_id: workflow.id,
    workflow_version_id: version.id,
    status: 'pending',
    trigger_type: trigger.type,
    trigger_payload: redact(trigger.payload ?? {}, { maxBytes: LIMITS.MAX_PAYLOAD_BYTES }),
    lead_id: leadRow?.id ?? null,
    idempotency_key: idempotencyKey,
    root_execution_id: retryOf ? (retryOf.root_execution_id ?? retryOf.id) : null,
    retry_of_id: retryOf?.id ?? null,
    attempt: retryOf ? (retryOf.attempt ?? 1) + 1 : 1,
    created_by: actorId,
  });

  if (existing) {
    return { executionId: execution.id, status: execution.status, deduplicated: true };
  }

  const services = createServices({ supabase, workspaceId, actorId, ai });
  const result = await executeWorkflow({
    execution,
    definition: version.definition,
    workflow,
    trigger,
    lead: leadContext(leadRow),
    store,
    services,
  });

  if (result.status === 'failed') {
    // Failure alert in the in-app notification center (no email required).
    try {
      await services.notifications.create({
        audience: 'actor',
        title: `Workflow failed: ${workflow.name}`.slice(0, 160),
        body: result.error_message,
        severity: 'error',
        link: `/dashboard/executions/${execution.id}`,
        executionId: execution.id,
        idempotencyKey: `execution-failed:${execution.id}`,
      });
    } catch {
      // Notification failures must not mask the execution result.
    }
  }
  return result;
}

/** Manual run requested by a signed-in member. */
export async function runWorkflowManually({
  supabase,
  session,
  workflowId,
  leadId,
  payload,
  idempotencyKey,
  ai,
}) {
  if (!can(session.role, 'workflow.run')) throw new AuthorizationError();
  const { workflow, version } = await loadWorkflowWithVersion(
    supabase,
    session.workspaceId,
    workflowId,
  );
  if (workflow.status === 'archived') {
    throw new AuthorizationError('Archived workflows cannot be run. Restore it first.');
  }
  const leadRow = await loadLead(supabase, session.workspaceId, leadId);
  return startExecution({
    supabase,
    workspaceId: session.workspaceId,
    workflow,
    version,
    trigger: { type: 'manual', payload: payload ?? {} },
    leadRow,
    idempotencyKey,
    actorId: session.user.id,
    ai,
  });
}

/**
 * Retries a failed execution as a new attempt with the SAME workflow version and trigger payload.
 * Side-effect steps that succeeded in earlier attempts are replayed, not repeated.
 */
export async function retryExecution({ supabase, session, executionId, ai }) {
  if (!can(session.role, 'execution.retry')) throw new AuthorizationError();
  const { data: original, error } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', executionId)
    .eq('workspace_id', session.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load execution: ${error.message}`);
  if (!original) throw new NotFoundError('Execution not found');
  if (original.status !== 'failed') {
    throw new AuthorizationError(
      `Only failed executions can be retried (this one is ${original.status}).`,
    );
  }

  const rootId = original.root_execution_id ?? original.id;
  const { count, error: countError } = await supabase
    .from('workflow_executions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', session.workspaceId)
    .or(`id.eq.${rootId},root_execution_id.eq.${rootId}`);
  if (countError) throw new Error(`Could not count attempts: ${countError.message}`);
  if (count >= LIMITS.MAX_EXECUTION_ATTEMPTS) {
    throw new AuthorizationError(
      `This execution already used all ${LIMITS.MAX_EXECUTION_ATTEMPTS} attempts.`,
    );
  }

  const { workflow, version } = await loadWorkflowWithVersion(
    supabase,
    session.workspaceId,
    original.workflow_id,
    original.workflow_version_id,
  );
  const leadRow = original.lead_id
    ? await loadLead(supabase, session.workspaceId, original.lead_id).catch(() => null)
    : null;

  return startExecution({
    supabase,
    workspaceId: session.workspaceId,
    workflow,
    version,
    trigger: { type: original.trigger_type, payload: original.trigger_payload },
    leadRow,
    // One retry per failed execution, even if the button is clicked twice.
    idempotencyKey: `retry:${original.id}`,
    actorId: session.user.id,
    retryOf: original,
    ai,
  });
}

export { loadWorkflowWithVersion, loadLead };
