import Link from 'next/link';
import { Download, Plus, Users } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { listLeads, LEADS_PAGE_SIZE } from '@/features/leads/queries';
import { LeadsTable } from '@/components/leads/leads-table';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { Pagination } from '@/components/ui/pagination';
import { LEAD_SOURCES, leadFilterSchema } from '@/lib/validation/lead';
import { LEAD_STATUSES } from '@/lib/workflow-engine/constants';
import { can } from '@/lib/security/permissions';
import { humanize } from '@/lib/utils/format';

export const metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }) {
  const session = await requireSession();
  const raw = await searchParams;
  const filters = leadFilterSchema.parse(raw);
  const { leads, total } = await listLeads(session, filters);
  const exportParams = new URLSearchParams(
    Object.entries({
      q: filters.q,
      status: filters.status,
      source: filters.source,
      minScore: filters.minScore,
      archived: filters.archived,
    }).filter(([, v]) => v !== undefined && v !== ''),
  ).toString();
  const hasFilters = Boolean(
    filters.q || filters.status || filters.source || filters.minScore !== undefined,
  );

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every lead in this workspace, with scores, status and workflow activity."
        actions={
          <>
            <ButtonLink
              href={`/api/leads/export${exportParams ? `?${exportParams}` : ''}`}
              variant="secondary"
              size="sm"
              prefetch={false}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </ButtonLink>
            <ButtonLink href="/dashboard/leads/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" /> New lead
            </ButtonLink>
          </>
        }
      />

      <Card>
        <form
          className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6"
          role="search"
          aria-label="Filter leads"
        >
          <div className="lg:col-span-2">
            <label htmlFor="q" className="sr-only">
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={filters.q}
              placeholder="Search name, email or company"
            />
          </div>
          <div>
            <label htmlFor="status" className="sr-only">
              Status
            </label>
            <Select id="status" name="status" defaultValue={filters.status ?? ''}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="source" className="sr-only">
              Source
            </label>
            <Select id="source" name="source" defaultValue={filters.source ?? ''}>
              <option value="">All sources</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="sort" className="sr-only">
              Sort
            </label>
            <Select id="sort" name="sort" defaultValue={filters.sort}>
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
              <option value="score_desc">Highest score</option>
              <option value="activity_desc">Recent activity</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <label htmlFor="minScore" className="sr-only">
              Minimum score
            </label>
            <Input
              id="minScore"
              name="minScore"
              type="number"
              min={0}
              max={100}
              defaultValue={filters.minScore}
              placeholder="Min score"
            />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm sm:col-span-2 lg:col-span-6">
            <label className="flex items-center gap-2 text-ink-muted">
              <input
                type="checkbox"
                name="archived"
                value="1"
                defaultChecked={Boolean(filters.archived)}
                className="h-4 w-4 rounded border-line-strong"
              />
              Show archived only
            </label>
            {(hasFilters || filters.archived) && (
              <Link href="/dashboard/leads" className="text-brand-700 hover:underline">
                Clear filters
              </Link>
            )}
          </div>
        </form>

        {leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              hasFilters
                ? 'No leads match these filters'
                : filters.archived
                  ? 'No archived leads'
                  : 'No leads yet'
            }
            description={
              hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Add a lead manually, import via webhook, or load demo data from Settings.'
            }
            action={
              !hasFilters && (
                <ButtonLink href="/dashboard/leads/new" size="sm">
                  Add your first lead
                </ButtonLink>
              )
            }
          />
        ) : (
          <LeadsTable
            leads={leads}
            canDelete={can(session.role, 'lead.delete')}
            archivedView={Boolean(filters.archived)}
          />
        )}
        <Pagination
          basePath="/dashboard/leads"
          searchParams={raw}
          page={filters.page}
          pageSize={LEADS_PAGE_SIZE}
          total={total}
        />
      </Card>
    </>
  );
}
