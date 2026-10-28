// Pure transformation of the get_dashboard_metrics() result into display-ready values.
import { actionLabel } from '@/lib/workflow-engine/catalog';
import { LEAD_STATUSES } from '@/lib/workflow-engine/constants';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function successRate(succeeded, failed) {
  const finished = num(succeeded) + num(failed);
  if (finished === 0) return null; // no finished executions: rate is undefined, not 0%
  return Math.round((num(succeeded) / finished) * 1000) / 10;
}

export function buildDashboardMetrics(raw) {
  const r = raw ?? {};
  const executions = r.executions ?? {};
  const byStatus = r.leads_by_status ?? {};

  return {
    periodDays: num(r.period_days) || 14,
    workflows: { total: num(r.workflows?.total), active: num(r.workflows?.active) },
    executions: {
      total: num(executions.total),
      succeeded: num(executions.succeeded),
      failed: num(executions.failed),
      inProgress: num(executions.in_progress),
      cancelled: num(executions.cancelled),
      avgDurationMs: num(executions.avg_duration_ms),
      successRate: successRate(executions.succeeded, executions.failed),
    },
    leads: {
      total: num(r.leads?.total),
      createdInPeriod: num(r.leads?.created_in_period),
      avgScore: num(r.leads?.avg_score),
      byStatus: LEAD_STATUSES.map((status) => ({ status, count: num(byStatus[status]) })),
    },
    volume: (r.volume ?? []).map((d) => ({
      day: d.day,
      succeeded: num(d.succeeded),
      failed: num(d.failed),
      other: num(d.other),
    })),
    failingActions: (r.failing_actions ?? []).map((f) => ({
      stepType: f.step_type,
      label: actionLabel(f.step_type),
      failures: num(f.failures),
    })),
    hasDemoData: Boolean(r.has_demo_data),
    isEmpty:
      num(r.workflows?.total) === 0 && num(executions.total) === 0 && num(r.leads?.total) === 0,
  };
}
