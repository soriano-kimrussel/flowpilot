import Link from 'next/link';
import { Activity, CheckCircle2, Gauge, PlayCircle, Users, Workflow, XCircle } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { getDashboardData } from '@/features/analytics/queries';
import { ExecutionVolumeChart, HorizontalBars } from '@/components/dashboard/charts';
import { DemoBadge, ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from '@/components/ui/layout';
import { formatDuration, formatNumber, formatRelative, humanize } from '@/lib/utils/format';
import { can } from '@/lib/security/permissions';

export const metadata = { title: 'Overview' };

export default async function DashboardPage({ searchParams }) {
  const session = await requireSession();
  const { demo } = await searchParams;
  const includeDemo = demo !== 'exclude';
  const { metrics, recentExecutions, recentLeads, activity } = await getDashboardData(session, {
    includeDemo,
  });
  const { executions, workflows, leads } = metrics;

  return (
    <>
      <PageHeader
        title={`Welcome back${session.profile?.full_name ? `, ${session.profile.full_name.split(' ')[0]}` : ''}`}
        description={`Automation activity in ${session.workspace?.name} over the last ${metrics.periodDays} days.`}
        actions={
          <>
            {metrics.hasDemoData && (
              <ButtonLink
                href={includeDemo ? '/dashboard?demo=exclude' : '/dashboard'}
                variant="secondary"
                size="sm"
              >
                {includeDemo ? 'Hide demo data' : 'Include demo data'}
              </ButtonLink>
            )}
            <ButtonLink href="/dashboard/workflows/new" size="sm">
              New workflow
            </ButtonLink>
          </>
        }
      />

      {metrics.isEmpty && (
        <Alert tone="info" title="Your workspace is empty" className="mb-6">
          Create a workflow from a template, add a lead, or{' '}
          {can(session.role, 'demo.manage') ? (
            <Link href="/dashboard/settings#demo" className="font-medium underline">
              load demo data
            </Link>
          ) : (
            'ask an admin to load demo data'
          )}{' '}
          to explore FlowPilot. Metrics below are calculated live from your workspace records.
        </Alert>
      )}
      {metrics.hasDemoData && includeDemo && (
        <p className="mb-4 flex items-center gap-2 text-xs text-ink-subtle">
          <DemoBadge /> Metrics include seeded demo records. Use “Hide demo data” to see only real
          activity.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Workflows"
          value={formatNumber(workflows.total)}
          hint={`${workflows.active} active`}
          icon={Workflow}
        />
        <StatCard
          label="Executions"
          value={formatNumber(executions.total)}
          hint={`${executions.inProgress} in progress`}
          icon={PlayCircle}
        />
        <StatCard
          label="Success rate"
          value={executions.successRate === null ? '—' : `${executions.successRate}%`}
          hint={`${executions.succeeded} succeeded · ${executions.failed} failed`}
          icon={Gauge}
        />
        <StatCard
          label="Leads"
          value={formatNumber(leads.total)}
          hint={`${leads.createdInPeriod} new · avg score ${leads.avgScore}`}
          icon={Users}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Execution volume"
            description={`Per day, last ${metrics.periodDays} days · avg successful run ${formatDuration(executions.avgDurationMs)}`}
          />
          <CardBody>
            {executions.total === 0 ? (
              <EmptyState
                icon={Activity}
                title="No executions yet"
                description="Run a workflow manually or trigger one with a new lead."
              />
            ) : (
              <ExecutionVolumeChart data={metrics.volume} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Leads by status" description="Active (non-archived) leads" />
          <CardBody>
            <HorizontalBars
              data={leads.byStatus.map((s) => ({ label: humanize(s.status), value: s.count }))}
              valueLabel="Leads by status"
              emptyText="No leads yet"
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Most frequently failing actions"
            description={`Failed steps, last ${metrics.periodDays} days`}
          />
          <CardBody>
            <HorizontalBars
              data={metrics.failingActions.map((f) => ({
                label: f.label,
                value: f.failures,
                color: '#dc2626',
              }))}
              valueLabel="Failures by action"
              emptyText="No failed steps. Nice."
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent executions"
            actions={
              <Link href="/dashboard/executions" className="text-sm text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {recentExecutions.length === 0 ? (
            <EmptyState title="Nothing has run yet" />
          ) : (
            <ul className="divide-y divide-line">
              {recentExecutions.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/executions/${e.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5"
                  >
                    {e.status === 'succeeded' ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : e.status === 'failed' ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    ) : (
                      <PlayCircle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {e.workflows?.name ?? 'Workflow'}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {humanize(e.trigger_type)} · {formatRelative(e.created_at)} ·{' '}
                        {formatDuration(e.duration_ms)}
                      </p>
                    </div>
                    {e.is_demo && <DemoBadge />}
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Newest leads"
            actions={
              <Link href="/dashboard/leads" className="text-sm text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          {recentLeads.length === 0 ? (
            <EmptyState
              title="No leads yet"
              action={
                <ButtonLink href="/dashboard/leads/new" size="sm">
                  Add a lead
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {recentLeads.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/dashboard/leads/${l.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {l.company ?? 'No company'} · {formatRelative(l.created_at)}
                      </p>
                    </div>
                    <ScoreBadge score={l.score} />
                    <StatusBadge status={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" />
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-3 sm:px-5">
                  <p className="text-sm text-ink">
                    <Link
                      href={`/dashboard/leads/${a.lead_id}`}
                      className="font-medium hover:underline"
                    >
                      {a.leads?.name ?? 'Lead'}
                    </Link>{' '}
                    <span className="text-ink-muted">{a.description}</span>
                  </p>
                  <p className="text-xs text-ink-subtle">{formatRelative(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
