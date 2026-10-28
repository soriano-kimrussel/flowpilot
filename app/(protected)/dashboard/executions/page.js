import Link from 'next/link';
import { PlayCircle } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import {
  EXECUTIONS_PAGE_SIZE,
  executionFilterSchema,
  getQueueSummary,
  listExecutions,
} from '@/features/executions/queries';
import { CancelJobButton, ProcessQueueButton } from '@/components/executions/execution-controls';
import { DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/layout';
import { Pagination } from '@/components/ui/pagination';
import { EXECUTION_STATUSES, TRIGGERS } from '@/lib/workflow-engine/constants';
import { can } from '@/lib/security/permissions';
import { formatDateTime, formatDuration, formatRelative, humanize } from '@/lib/utils/format';

export const metadata = { title: 'Executions' };

export default async function ExecutionsPage({ searchParams }) {
  const session = await requireSession();
  const raw = await searchParams;
  const filters = executionFilterSchema.parse(raw);
  const [{ executions, total }, jobs] = await Promise.all([
    listExecutions(session, filters),
    getQueueSummary(session),
  ]);
  const filtered = Boolean(filters.status || filters.trigger || filters.workflow);
  const pendingJobs = jobs.filter((j) => j.status !== 'failed');

  return (
    <>
      <PageHeader
        title="Executions"
        description="Every workflow run with its status, timing and step-by-step results. Stored in PostgreSQL, so history survives refreshes and deploys."
        actions={<ProcessQueueButton />}
      />

      {jobs.length > 0 && (
        <Card className="mb-6">
          <CardHeader
            title={`Job queue · ${pendingJobs.length} waiting`}
            description="Webhook, lead-event and scheduled triggers are queued in the database and processed in short bursts."
          />
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{job.workflows?.name}</span>{' '}
                  <span className="text-ink-subtle">
                    · {humanize(job.trigger_type)} · queued {formatRelative(job.created_at)} ·
                    attempt {job.attempts}/{job.max_attempts}
                  </span>
                  {job.last_error && <p className="text-xs text-red-700">{job.last_error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  {job.status !== 'failed' && can(session.role, 'execution.cancel') && (
                    <CancelJobButton jobId={job.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <form
          className="flex flex-wrap gap-3 border-b border-line p-4"
          aria-label="Filter executions"
        >
          {filters.workflow && <input type="hidden" name="workflow" value={filters.workflow} />}
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={filters.status ?? ''}
            className="w-full sm:w-44"
          >
            <option value="">All statuses</option>
            {EXECUTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <label htmlFor="trigger" className="sr-only">
            Trigger
          </label>
          <Select
            id="trigger"
            name="trigger"
            defaultValue={filters.trigger ?? ''}
            className="w-full sm:w-48"
          >
            <option value="">All triggers</option>
            {Object.entries(TRIGGERS).map(([type, t]) => (
              <option key={type} value={type}>
                {t.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {filtered && (
            <Link
              href="/dashboard/executions"
              className="self-center text-sm text-brand-700 hover:underline"
            >
              Clear filters
            </Link>
          )}
        </form>

        {executions.length === 0 ? (
          <EmptyState
            icon={PlayCircle}
            title={filtered ? 'No executions match' : 'No executions yet'}
            description={
              filtered
                ? 'Try different filters.'
                : 'Open a workflow and click “Run now”, or create a lead to trigger an active workflow.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Workflow</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Trigger</Th>
                <Th className="hidden lg:table-cell">Lead</Th>
                <Th className="hidden sm:table-cell">Started</Th>
                <Th className="hidden md:table-cell">Duration</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {executions.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/dashboard/executions/${e.id}`}
                      className="font-medium hover:text-brand-700 hover:underline"
                    >
                      {e.workflows?.name ?? 'Workflow'}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                      v{e.workflow_versions?.version_number}
                      {e.attempt > 1 && <span>· attempt {e.attempt}</span>}
                      {e.is_demo && <DemoBadge />}
                    </div>
                    {e.status === 'failed' && e.error_message && (
                      <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-red-700">
                        {e.error_message}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {TRIGGERS[e.trigger_type]?.label ?? e.trigger_type}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    {e.leads ? (
                      <Link
                        href={`/dashboard/leads/${e.leads.id}`}
                        className="text-ink-muted hover:underline"
                      >
                        {e.leads.name}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </Td>
                  <Td
                    className="hidden text-ink-subtle sm:table-cell"
                    title={formatDateTime(e.created_at)}
                  >
                    {formatRelative(e.created_at)}
                  </Td>
                  <Td className="hidden text-ink-subtle tabular-nums md:table-cell">
                    {formatDuration(e.duration_ms)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          basePath="/dashboard/executions"
          searchParams={raw}
          page={filters.page}
          pageSize={EXECUTIONS_PAGE_SIZE}
          total={total}
        />
      </Card>
    </>
  );
}
