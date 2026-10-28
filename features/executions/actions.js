'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionSession } from '@/features/auth/session';
import { toActionError, unwrap } from '@/features/actions-util';
import { logAudit } from '@/features/audit/log';
import { enqueueDueSchedules } from '@/lib/workflow-engine/queue';
import { processWorkspaceJobs } from './process';

export async function processQueueAction() {
  try {
    const session = await requireActionSession('queue.process');
    const scheduled = await enqueueDueSchedules(session.supabase, session.workspaceId);
    const result = await processWorkspaceJobs(session, { limit: 10 });
    if (result.error) return { ok: false, error: result.error };
    revalidatePath('/dashboard/executions');
    return { ok: true, scheduled, processed: result.processed, results: result.results };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelExecutionAction(id) {
  try {
    const session = await requireActionSession('execution.cancel');
    const executionId = z.string().uuid().parse(id);
    const updated = unwrap(
      await session.supabase
        .from('workflow_executions')
        .update({
          status: 'cancelled',
          finished_at: new Date().toISOString(),
          error_message: 'Cancelled by a workspace admin',
          error_code: 'CANCELLED',
        })
        .eq('id', executionId)
        .eq('workspace_id', session.workspaceId)
        .in('status', ['pending', 'running'])
        .select('id'),
    );
    if (!updated.length)
      return { ok: false, error: 'Only pending or running executions can be cancelled.' };
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'execution.cancelled',
      entityType: 'execution',
      entityId: executionId,
    });
    revalidatePath(`/dashboard/executions/${executionId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelJobAction(id) {
  try {
    const session = await requireActionSession('execution.cancel');
    const jobId = z.string().uuid().parse(id);
    // Only queued jobs can be cancelled; a processing job is already running its execution.
    const cancelled = unwrap(
      await session.supabase
        .from('workflow_jobs')
        .update({ status: 'cancelled', last_error: 'Cancelled by a workspace admin' })
        .eq('id', jobId)
        .eq('workspace_id', session.workspaceId)
        .eq('status', 'queued')
        .select('id'),
    );
    if (!cancelled.length)
      return {
        ok: false,
        error: 'This job is already running or finished. Cancel its execution instead.',
      };
    revalidatePath('/dashboard/executions');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
