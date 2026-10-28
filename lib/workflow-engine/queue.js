// Database-backed job queue processing (webhook, lead event and scheduled triggers).
//
// Jobs are claimed with FOR UPDATE SKIP LOCKED (claim_workflow_jobs), processed with bounded
// time, and each job maps to at most one execution via the idempotency key `job:<id>`.
// No long-running worker is assumed: processing happens in short bursts triggered by requests
// (dashboard actions, webhook `after()`, the daily cron).

import { loadLead, loadWorkflowWithVersion, startExecution } from './run';

const STALE_EXECUTION_MINUTES = 10;
const JOB_BURST_MS = 20_000;

/** Marks executions that never finished (e.g. a serverless function was killed) as failed. */
export async function failStaleExecutions(supabase, workspaceId) {
  const cutoff = new Date(Date.now() - STALE_EXECUTION_MINUTES * 60_000).toISOString();
  let query = supabase
    .from('workflow_executions')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'INTERRUPTED',
      error_message: `Execution did not finish within ${STALE_EXECUTION_MINUTES} minutes and was marked as failed. It can be retried.`,
    })
    .in('status', ['pending', 'running'])
    .lt('created_at', cutoff);
  if (workspaceId) query = query.eq('workspace_id', workspaceId);
  const { error } = await query;
  if (error) throw new Error(`Could not sweep stale executions: ${error.message}`);
}

export async function enqueueDueSchedules(supabase, workspaceId) {
  const { data, error } = await supabase.rpc('enqueue_due_scheduled_workflows', {
    p_workspace_id: workspaceId ?? null,
  });
  if (error) throw new Error(`Could not enqueue scheduled workflows: ${error.message}`);
  return data ?? 0;
}

async function updateJob(supabase, job, patch) {
  const { error } = await supabase
    .from('workflow_jobs')
    .update({ ...patch, locked_at: null })
    .eq('id', job.id)
    .eq('workspace_id', job.workspace_id)
    .eq('status', 'processing');
  if (error) throw new Error(`Could not update job: ${error.message}`);
}

async function processJob({ supabase, job, actorId, ai }) {
  let workflow;
  let version;
  try {
    ({ workflow, version } = await loadWorkflowWithVersion(
      supabase,
      job.workspace_id,
      job.workflow_id,
    ));
  } catch (error) {
    await updateJob(supabase, job, {
      status: 'cancelled',
      last_error: error.message.slice(0, 2000),
    });
    return { jobId: job.id, status: 'cancelled' };
  }
  if (workflow.status !== 'active' || workflow.trigger_type !== job.trigger_type) {
    await updateJob(supabase, job, {
      status: 'cancelled',
      last_error: 'Workflow is no longer active for this trigger; job skipped.',
    });
    return { jobId: job.id, status: 'cancelled' };
  }

  const leadRow = job.lead_id
    ? await loadLead(supabase, job.workspace_id, job.lead_id).catch(() => null)
    : null;
  if (job.lead_id && !leadRow) {
    await updateJob(supabase, job, {
      status: 'cancelled',
      last_error: 'Lead no longer exists; job skipped.',
    });
    return { jobId: job.id, status: 'cancelled' };
  }

  const result = await startExecution({
    supabase,
    workspaceId: job.workspace_id,
    workflow,
    version,
    trigger: { type: job.trigger_type, payload: job.payload },
    leadRow,
    idempotencyKey: `job:${job.id}`,
    actorId,
    ai,
  });
  // The job is complete once an execution exists; the execution records success or failure.
  await updateJob(supabase, job, {
    status: 'completed',
    execution_id: result.executionId,
    last_error: null,
  });
  return {
    jobId: job.id,
    status: 'completed',
    executionId: result.executionId,
    executionStatus: result.status,
  };
}

/**
 * Claims and processes up to `limit` jobs. `workspaceId` is required for user sessions and
 * null only for the admin client (cron), which processes all workspaces.
 */
export async function processQueuedJobs({
  supabase,
  workspaceId = null,
  actorId = null,
  limit = 5,
  workerId,
  ai,
}) {
  const started = Date.now();
  await failStaleExecutions(supabase, workspaceId);

  const { data: jobs, error } = await supabase.rpc('claim_workflow_jobs', {
    p_workspace_id: workspaceId,
    p_limit: limit,
    p_worker: workerId ?? `worker-${Math.random().toString(36).slice(2, 10)}`,
  });
  if (error) throw new Error(`Could not claim jobs: ${error.message}`);

  const results = [];
  for (const job of jobs ?? []) {
    if (Date.now() - started > JOB_BURST_MS) {
      // Out of time budget: release the job for the next burst.
      await updateJob(supabase, job, { status: 'queued', attempts: Math.max(0, job.attempts - 1) });
      results.push({ jobId: job.id, status: 'released' });
      continue;
    }
    try {
      results.push(await processJob({ supabase, job, actorId, ai }));
    } catch (err) {
      const exhausted = job.attempts >= job.max_attempts;
      await updateJob(supabase, job, {
        status: exhausted ? 'failed' : 'queued',
        run_after: new Date(Date.now() + 30_000 * job.attempts).toISOString(),
        last_error: String(err?.message ?? 'Job failed').slice(0, 2000),
      }).catch(() => {});
      results.push({
        jobId: job.id,
        status: exhausted ? 'failed' : 'requeued',
        error: err?.message,
      });
    }
  }
  return { claimed: jobs?.length ?? 0, results };
}
