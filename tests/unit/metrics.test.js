import { describe, expect, it } from 'vitest';
import { buildDashboardMetrics, successRate } from '@/features/analytics/metrics';

describe('dashboard metrics', () => {
  it('computes success rate from finished executions only', () => {
    expect(successRate(9, 1)).toBe(90);
    expect(successRate(2, 1)).toBe(66.7);
    expect(successRate(0, 0)).toBeNull();
    expect(successRate('3', undefined)).toBe(100);
  });

  it('normalizes the database payload', () => {
    const m = buildDashboardMetrics({
      period_days: 14,
      workflows: { total: 3, active: 1 },
      executions: {
        total: 12,
        succeeded: 9,
        failed: 2,
        in_progress: 1,
        cancelled: 0,
        avg_duration_ms: 420,
      },
      leads: { total: 13, created_in_period: 5, avg_score: 58 },
      leads_by_status: { new: 4, qualified: 3 },
      volume: [{ day: '2026-10-27', succeeded: 2, failed: 1, other: 0 }],
      failing_actions: [{ step_type: 'crm.demo_sync', failures: 3 }],
      has_demo_data: true,
    });
    expect(m.executions.successRate).toBe(81.8);
    expect(m.leads.byStatus).toEqual([
      { status: 'new', count: 4 },
      { status: 'contacted', count: 0 },
      { status: 'qualified', count: 3 },
      { status: 'proposal', count: 0 },
      { status: 'won', count: 0 },
      { status: 'lost', count: 0 },
    ]);
    expect(m.failingActions[0]).toEqual({
      stepType: 'crm.demo_sync',
      label: 'Sync to CRM',
      failures: 3,
    });
    expect(m.hasDemoData).toBe(true);
    expect(m.isEmpty).toBe(false);
  });

  it('handles an empty workspace', () => {
    const m = buildDashboardMetrics(null);
    expect(m.isEmpty).toBe(true);
    expect(m.executions.successRate).toBeNull();
    expect(m.volume).toEqual([]);
  });
});
