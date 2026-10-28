'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, RotateCcw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import {
  cancelExecutionAction,
  cancelJobAction,
  processQueueAction,
} from '@/features/executions/actions';

export function ProcessQueueButton() {
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
          const res = await processQueueAction();
          if (!res.ok) return toast.error('Queue processing failed', res.error);
          toast.success(
            res.processed ? `${res.processed} job(s) processed` : 'Queue is empty',
            res.scheduled ? `${res.scheduled} scheduled run(s) were due and enqueued.` : undefined,
          );
          router.refresh();
        })
      }
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" /> Process queue now
    </Button>
  );
}

export function RetryExecutionButton({ executionId }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      const res = await fetch(`/api/executions/${executionId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Retry not started', data.error);
        return;
      }
      setOpen(false);
      toast[data.status === 'succeeded' ? 'success' : 'warning'](
        `Retry ${data.status}`,
        data.deduplicated ? 'This execution was already retried; showing that attempt.' : undefined,
      );
      router.push(`/dashboard/executions/${data.executionId}`);
    } catch {
      toast.error('Network error');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={retry}
        loading={pending}
        tone="primary"
        title="Retry this execution?"
        description="A new attempt runs the same workflow version with the same trigger data. Side effects that already succeeded (notifications, CRM sync, emails, lead updates) are replayed from the log, not repeated."
        confirmLabel="Retry"
      />
    </>
  );
}

export function CancelExecutionButton({ executionId }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Square className="h-4 w-4" aria-hidden="true" /> Cancel
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        loading={pending}
        title="Cancel execution?"
        description="The engine stops before the next step. Steps that already ran are not undone."
        confirmLabel="Cancel execution"
        onConfirm={() =>
          startTransition(async () => {
            const res = await cancelExecutionAction(executionId);
            if (!res.ok) return toast.error('Not cancelled', res.error);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

export function CancelJobButton({ jobId }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelJobAction(jobId);
          if (!res.ok) return toast.error('Not cancelled', res.error);
          router.refresh();
        })
      }
    >
      Cancel
    </Button>
  );
}
