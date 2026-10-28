'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    name: 'Jordan Blake',
    email: 'jordan@acme-robotics.example',
    company: 'Acme Robotics',
    job_title: 'Head of Operations',
    company_size: 45,
    budget: 12000,
    message: 'Can we get pricing and a demo next week?',
  },
  null,
  2,
);

export function RunWorkflowButton({ workflowId, leads, dirty, triggerType, disabled }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [payload, setPayload] = useState(triggerType === 'webhook' ? SAMPLE_PAYLOAD : '{}');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setError(null);
    let parsed;
    try {
      parsed = payload.trim() ? JSON.parse(payload) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    } catch {
      setError('Payload must be a JSON object.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `ui-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ leadId: leadId || null, payload: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'The run could not be started.');
        return;
      }
      if (data.status === 'succeeded') toast.success('Run succeeded');
      else toast.warning(`Run ${data.status}`, data.error_message);
      router.push(`/dashboard/executions/${data.executionId}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Play className="h-4 w-4" aria-hidden="true" /> Run now
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Run workflow manually"
        description="Runs the last saved version. Results are stored as an execution you can inspect."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={run} loading={pending}>
              Run
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {dirty && (
            <Alert tone="warning">
              You have unsaved changes. The run uses the last saved version.
            </Alert>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            id="run-lead"
            label="Lead"
            optional
            help="Lead actions (score, update, draft…) need a lead unless the workflow creates one."
          >
            {(aria) => (
              <Select {...aria} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">No lead</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.email}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="run-payload"
            label="Trigger payload (JSON)"
            help="Available as {{trigger.payload.*}}. Used by “Create lead” and webhook-style workflows."
          >
            {(aria) => (
              <Textarea
                {...aria}
                rows={8}
                className="font-mono text-xs"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
