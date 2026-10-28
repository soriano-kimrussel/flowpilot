import 'server-only';
import { unwrap } from '@/features/actions-util';
import { buildDashboardMetrics } from './metrics';

export async function getDashboardData(session, { includeDemo = true, days = 14 } = {}) {
  const { supabase, workspaceId } = session;
  const demoFilter = (q) => (includeDemo ? q : q.eq('is_demo', false));

  const [metricsRaw, recentExecutions, recentLeads, activity] = await Promise.all([
    supabase.rpc('get_dashboard_metrics', {
      p_workspace_id: workspaceId,
      p_days: days,
      p_include_demo: includeDemo,
    }),
    demoFilter(
      supabase
        .from('workflow_executions')
        .select('id, status, trigger_type, created_at, duration_ms, is_demo, workflows(name)')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(6),
    ),
    demoFilter(
      supabase
        .from('leads')
        .select('id, name, company, score, status, created_at, is_demo')
        .eq('workspace_id', workspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(6),
    ),
    supabase
      .from('lead_activities')
      .select('id, type, description, created_at, lead_id, leads(name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return {
    metrics: buildDashboardMetrics(unwrap(metricsRaw, 'Could not load metrics')),
    recentExecutions: unwrap(recentExecutions),
    recentLeads: unwrap(recentLeads),
    activity: unwrap(activity),
  };
}
