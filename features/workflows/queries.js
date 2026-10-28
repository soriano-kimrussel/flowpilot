import 'server-only';
import { notFound } from 'next/navigation';
import { unwrap } from '@/features/actions-util';
import { can } from '@/lib/security/permissions';
import { sanitizeSearch, UUID_RE } from '@/features/leads/queries';

export async function listWorkflows(session, { q, status, trigger }) {
  let query = session.supabase
    .from('workflows')
    .select(
      'id, name, description, status, trigger_type, is_demo, updated_at, current_version_id, workflow_versions!workflows_current_version_fk(version_number)',
    )
    .eq('workspace_id', session.workspaceId);
  const search = sanitizeSearch(q);
  if (search) query = query.ilike('name', `%${search}%`);
  if (status) query = query.eq('status', status);
  else query = query.neq('status', 'archived');
  if (trigger) query = query.eq('trigger_type', trigger);
  const workflows = unwrap(
    await query.order('updated_at', { ascending: false }).limit(200),
    'Could not load workflows',
  );

  // Last execution per workflow (single query, small result set).
  const ids = workflows.map((w) => w.id);
  const lastRuns = {};
  if (ids.length) {
    const { data } = await session.supabase
      .from('workflow_executions')
      .select('workflow_id, status, created_at')
      .eq('workspace_id', session.workspaceId)
      .in('workflow_id', ids)
      .order('created_at', { ascending: false })
      .limit(500);
    for (const run of data ?? []) if (!lastRuns[run.workflow_id]) lastRuns[run.workflow_id] = run;
  }
  return workflows.map((w) => ({
    ...w,
    version: w.workflow_versions?.version_number ?? null,
    lastRun: lastRuns[w.id] ?? null,
  }));
}

export async function getWorkflowForEditor(session, id) {
  const { supabase, workspaceId } = session;
  if (!UUID_RE.test(String(id))) notFound();
  const workflow = unwrap(
    await supabase
      .from('workflows')
      .select(
        'id, name, description, status, trigger_type, current_version_id, is_demo, next_run_at, schedule_interval, updated_at, created_at, profiles!workflows_updated_by_fkey(full_name)',
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  );
  if (!workflow) notFound();

  const [version, versions, executions, endpoint] = await Promise.all([
    workflow.current_version_id
      ? supabase
          .from('workflow_versions')
          .select('id, version_number, definition, created_at')
          .eq('id', workflow.current_version_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('workflow_versions')
      .select('id, version_number, created_at, profiles(full_name)')
      .eq('workflow_id', id)
      .order('version_number', { ascending: false })
      .limit(10),
    supabase
      .from('workflow_executions')
      .select(
        'id, status, trigger_type, created_at, duration_ms, attempt, workflow_versions(version_number)',
      )
      .eq('workspace_id', workspaceId)
      .eq('workflow_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    can(session.role, 'webhook.manage')
      ? supabase
          .from('webhook_endpoints')
          .select('public_id, secret_hint, last_used_at, revoked_at, created_at')
          .eq('workflow_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    workflow,
    version: unwrap(version),
    versions: unwrap(versions),
    executions: unwrap(executions),
    endpoint: unwrap(endpoint),
  };
}

export async function listTemplates(session) {
  return unwrap(
    await session.supabase
      .from('workflow_templates')
      .select('id, name, description, category, definition, is_system, workspace_id, created_at')
      .or(`is_system.eq.true,workspace_id.eq.${session.workspaceId}`)
      .order('is_system', { ascending: false })
      .order('name'),
    'Could not load templates',
  );
}
