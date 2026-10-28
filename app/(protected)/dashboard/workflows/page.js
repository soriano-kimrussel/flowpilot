import Link from 'next/link';
import { Plus, Workflow } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { listWorkflows } from '@/features/workflows/queries';
import { DemoBadge, StatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui/layout';
import { TRIGGERS, WORKFLOW_STATUSES } from '@/lib/workflow-engine/constants';
import { can } from '@/lib/security/permissions';
import { formatRelative, humanize } from '@/lib/utils/format';
import { z } from 'zod';

export const metadata = { title: 'Workflows' };

const filterSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  status: z.enum(WORKFLOW_STATUSES).optional().catch(undefined),
  trigger: z.enum(Object.keys(TRIGGERS)).optional().catch(undefined),
});

export default async function WorkflowsPage({ searchParams }) {
  const session = await requireSession();
  const filters = filterSchema.parse(await searchParams);
  const workflows = await listWorkflows(session, filters);
  const canEdit = can(session.role, 'workflow.edit');
  const filtered = Boolean(filters.q || filters.status || filters.trigger);

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Automations made of a trigger and ordered steps. Each save creates a new immutable version."
        actions={
          canEdit && (
            <ButtonLink href="/dashboard/workflows/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" /> New workflow
            </ButtonLink>
          )
        }
      />
      <Card>
        <form
          className="flex flex-wrap gap-3 border-b border-line p-4"
          role="search"
          aria-label="Filter workflows"
        >
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Search by name"
            className="w-full sm:w-64"
          />
          <label htmlFor="status" className="sr-only">
            Status
          </label>
          <Select
            id="status"
            name="status"
            defaultValue={filters.status ?? ''}
            className="w-full sm:w-40"
          >
            <option value="">All (except archived)</option>
            {WORKFLOW_STATUSES.map((s) => (
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
              href="/dashboard/workflows"
              className="self-center text-sm text-brand-700 hover:underline"
            >
              Clear
            </Link>
          )}
        </form>

        {workflows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title={filtered ? 'No workflows match' : 'No workflows yet'}
            description={
              filtered
                ? 'Try different filters.'
                : 'Start from a template; the lead qualification pipeline is a good first one.'
            }
            action={
              canEdit &&
              !filtered && (
                <ButtonLink href="/dashboard/templates" size="sm">
                  Browse templates
                </ButtonLink>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Workflow</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Trigger</Th>
                <Th className="hidden lg:table-cell">Version</Th>
                <Th className="hidden sm:table-cell">Last run</Th>
                <Th className="hidden lg:table-cell">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workflows.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/dashboard/workflows/${w.id}`}
                      className="font-medium hover:text-brand-700 hover:underline"
                    >
                      {w.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      {w.description && (
                        <p className="line-clamp-1 max-w-md text-xs text-ink-subtle">
                          {w.description}
                        </p>
                      )}
                      {w.is_demo && <DemoBadge />}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={w.status} />
                  </Td>
                  <Td className="hidden text-ink-muted md:table-cell">
                    {TRIGGERS[w.trigger_type]?.label}
                  </Td>
                  <Td className="hidden text-ink-muted lg:table-cell">
                    {w.version ? `v${w.version}` : '—'}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    {w.lastRun ? (
                      <Link
                        href={`/dashboard/executions?workflow=${w.id}`}
                        className="flex items-center gap-2"
                      >
                        <StatusBadge status={w.lastRun.status} />
                        <span className="text-xs text-ink-subtle">
                          {formatRelative(w.lastRun.created_at)}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-subtle">Never</span>
                    )}
                  </Td>
                  <Td className="hidden text-ink-subtle lg:table-cell">
                    {formatRelative(w.updated_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
