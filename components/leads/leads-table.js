'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DemoBadge, ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import { bulkLeadAction } from '@/features/leads/actions';
import { LEAD_STATUSES } from '@/lib/workflow-engine/constants';
import { formatRelative, humanize } from '@/lib/utils/format';

const ACTION_COPY = {
  set_status: { title: 'Change status', confirm: 'Update leads', tone: 'primary' },
  archive: { title: 'Archive leads', confirm: 'Archive', tone: 'primary' },
  unarchive: { title: 'Restore leads', confirm: 'Restore', tone: 'primary' },
  delete: { title: 'Delete leads permanently', confirm: 'Delete', tone: 'danger' },
};

export function LeadsTable({ leads, canDelete, archivedView }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState(() => new Set());
  const [pendingAction, setPendingAction] = useState(null);
  const [status, setStatus] = useState('contacted');
  const [isPending, startTransition] = useTransition();

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function confirm() {
    startTransition(async () => {
      const result = await bulkLeadAction({ ids: [...selected], action: pendingAction, status });
      if (!result.ok) {
        toast.error('Bulk action failed', result.error);
        return;
      }
      toast.success(`${result.count} lead(s) updated`);
      setSelected(new Set());
      setPendingAction(null);
      router.refresh();
    });
  }

  const copy = pendingAction ? ACTION_COPY[pendingAction] : null;

  return (
    <>
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-50/60 px-4 py-2.5"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="mr-2 text-sm font-medium">{selected.size} selected</span>
          <label htmlFor="bulk-status" className="sr-only">
            New status
          </label>
          <Select
            id="bulk-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 w-36"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={() => setPendingAction('set_status')}>
            Set status
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPendingAction(archivedView ? 'unarchive' : 'archive')}
          >
            {archivedView ? 'Restore' : 'Archive'}
          </Button>
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => setPendingAction('delete')}>
              Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                aria-label="Select all leads on this page"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))
                }
                className="h-4 w-4 rounded border-line-strong text-brand-600"
              />
            </Th>
            <Th>Lead</Th>
            <Th className="hidden md:table-cell">Company</Th>
            <Th>Status</Th>
            <Th>Score</Th>
            <Th className="hidden lg:table-cell">Segment</Th>
            <Th className="hidden lg:table-cell">Source</Th>
            <Th className="hidden sm:table-cell">Last activity</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className={selected.has(lead.id) ? 'bg-brand-50/40' : 'hover:bg-gray-50'}
            >
              <Td>
                <input
                  type="checkbox"
                  aria-label={`Select ${lead.name}`}
                  checked={selected.has(lead.id)}
                  onChange={() => toggle(lead.id)}
                  className="h-4 w-4 rounded border-line-strong text-brand-600"
                />
              </Td>
              <Td>
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="font-medium text-ink hover:text-brand-700 hover:underline"
                >
                  {lead.name}
                </Link>
                <div className="flex items-center gap-2 text-xs text-ink-subtle">
                  <span className="truncate">{lead.email}</span>
                  {lead.is_demo && <DemoBadge />}
                </div>
              </Td>
              <Td className="hidden text-ink-muted md:table-cell">{lead.company ?? '—'}</Td>
              <Td>
                <StatusBadge status={lead.status} />
              </Td>
              <Td>
                <ScoreBadge score={lead.score} />
              </Td>
              <Td className="hidden text-ink-muted lg:table-cell">
                {lead.classification ? humanize(lead.classification) : '—'}
              </Td>
              <Td className="hidden text-ink-muted lg:table-cell">{humanize(lead.source)}</Td>
              <Td className="hidden text-ink-subtle sm:table-cell">
                {formatRelative(lead.last_activity_at)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        onConfirm={confirm}
        loading={isPending}
        title={copy?.title}
        tone={copy?.tone}
        confirmLabel={copy?.confirm}
        description={
          pendingAction === 'delete'
            ? `Permanently delete ${selected.size} lead(s) and their activity history? This cannot be undone.`
            : pendingAction === 'set_status'
              ? `Set the status of ${selected.size} lead(s) to “${humanize(status)}”? Status-change workflows may run.`
              : `${copy?.title} for ${selected.size} lead(s)?`
        }
      />
    </>
  );
}
