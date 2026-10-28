import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { unwrap } from '@/features/actions-util';
import { EXECUTION_STATUSES, TRIGGER_TYPES } from '@/lib/workflow-engine/constants';

export const EXECUTIONS_PAGE_SIZE = 25;

export const executionFilterSchema = z.object({
  status: z.enum(EXECUTION_STATUSES).optional().catch(undefined),
  trigger: z.enum(TRIGGER_TYPES).optional().catch(undefined),
  workflow: z.string().uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export async function listExecutions(session, filters) {
  const from = (filters.page - 1) * EXECUTIONS_PAGE_SIZE;
  let query = session.supabase
    .from('workflow_executions')
    .select(
      'id, status, trigger_type, created_at, started_at, duration_ms, attempt, error_message, is_demo, workflow_id, workflows(name), leads(id, name), workflow_versions(version_number)',
      { count: 'exact' },
    )
    .eq('workspace_id', session.workspaceId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.trigger) query = query.eq('trigger_type', filters.trigger);
  if (filters.workflow) query = query.eq('workflow_id', filters.workflow);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, from + EXECUTIONS_PAGE_SIZE - 1);
  unwrap({ data, error }, 'Could not load executions');
  return { executions: data, total: count ?? 0 };
}

export async function getQueueSummary(session) {
  const { data, error } = await session.supabase
    .from('workflow_jobs')
    .select(
      'id, status, trigger_type, attempts, max_attempts, last_error, created_at, run_after, workflows(name)',
    )
    .eq('workspace_id', session.workspaceId)
    .in('status', ['queued', 'processing', 'failed'])
    .order('created_at', { ascending: false })
    .limit(20);
  return unwrap({ data, error });
}

export async function getExecutionDetail(session, id) {
  const { supabase, workspaceId } = session;
  const execution = unwrap(
    await supabase
      .from('workflow_executions')
      .select(
        '*, workflows(id, name), workflow_versions(version_number), leads(id, name, email), profiles(full_name)',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  );
  if (!execution) notFound();

  const rootId = execution.root_execution_id ?? execution.id;
  const [steps, attempts] = await Promise.all([
    supabase
      .from('workflow_execution_steps')
      .select('*')
      .eq('execution_id', id)
      .eq('workspace_id', workspaceId)
      .order('position'),
    supabase
      .from('workflow_executions')
      .select('id, status, attempt, created_at')
      .eq('workspace_id', workspaceId)
      .or(`id.eq.${rootId},root_execution_id.eq.${rootId}`)
      .order('attempt'),
  ]);
  return { execution, steps: unwrap(steps), attempts: unwrap(attempts) };
}
