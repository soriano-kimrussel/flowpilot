'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import {
  analyzeLeadAction,
  bulkLeadAction,
  updateLeadStatusAction,
} from '@/features/leads/actions';
import { LEAD_STATUSES } from '@/lib/workflow-engine/constants';
import { humanize } from '@/lib/utils/format';
import { ConfirmDialog } from '@/components/ui/dialog';

export function LeadStatusSelect({ leadId, status }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <label htmlFor="lead-status" className="sr-only">
        Lead status
      </label>
      <Select
        key={status}
        id="lead-status"
        defaultValue={status}
        disabled={pending}
        className="h-8 w-40"
        onChange={(e) => {
          const value = e.target.value;
          startTransition(async () => {
            const result = await updateLeadStatusAction(leadId, value);
            if (!result.ok) return toast.error('Could not change status', result.error);
            toast.success(
              `Status set to ${humanize(value)}`,
              result.workflowsRun ? `${result.workflowsRun} workflow(s) ran.` : undefined,
            );
            router.refresh();
          });
        }}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {humanize(s)}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function AnalyzeLeadButton({ leadId }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await analyzeLeadAction(leadId);
          if (!result.ok) return toast.error('Analysis failed', result.error);
          toast.success('Lead analyzed', `Score: ${result.score}/100`);
          router.refresh();
        })
      }
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" /> Analyze
    </Button>
  );
}

export function ArchiveLeadButton({ leadId, archived }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {archived ? 'Restore' : 'Archive'}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        tone="primary"
        loading={pending}
        title={archived ? 'Restore this lead?' : 'Archive this lead?'}
        description={
          archived
            ? 'The lead will appear in lists and metrics again.'
            : 'Archived leads are hidden from lists and metrics but keep their history.'
        }
        confirmLabel={archived ? 'Restore' : 'Archive'}
        onConfirm={() =>
          startTransition(async () => {
            const result = await bulkLeadAction({
              ids: [leadId],
              action: archived ? 'unarchive' : 'archive',
            });
            if (!result.ok) return toast.error('Action failed', result.error);
            setOpen(false);
            toast.success(archived ? 'Lead restored' : 'Lead archived');
            router.refresh();
          })
        }
      />
    </>
  );
}

/** Manually runs a selected workflow for this lead through the run API. */
export function RunWorkflowForLead({ leadId, workflows }) {
  const router = useRouter();
  const toast = useToast();
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? '');
  const [pending, setPending] = useState(false);

  if (!workflows.length) {
    return (
      <p className="text-sm text-ink-subtle">
        No saved workflows yet.{' '}
        <Link href="/dashboard/workflows/new" className="text-brand-700 hover:underline">
          Create one
        </Link>
        .
      </p>
    );
  }

  async function run() {
    setPending(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Run failed to start', data.error);
        return;
      }
      if (data.status === 'succeeded') toast.success('Workflow succeeded');
      else toast.warning(`Workflow ${data.status}`, data.error_message);
      router.push(`/dashboard/executions/${data.executionId}`);
    } catch {
      toast.error('Network error', 'Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="run-workflow" className="sr-only">
        Workflow to run
      </label>
      <Select
        id="run-workflow"
        value={workflowId}
        onChange={(e) => setWorkflowId(e.target.value)}
        className="sm:flex-1"
      >
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} {w.status !== 'active' ? `(${w.status})` : ''}
          </option>
        ))}
      </Select>
      <Button onClick={run} loading={pending}>
        <Play className="h-4 w-4" aria-hidden="true" /> Run
      </Button>
    </div>
  );
}
