'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import { generateWebhookSecretAction, revokeWebhookAction } from '@/features/workflows/actions';
import { RelativeTime } from '@/components/ui/relative-time';

function CodeBlock({ children }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-code p-3 text-xs leading-relaxed text-code-ink">
      {children}
    </pre>
  );
}

export function WebhookPanel({ workflowId, endpoint, siteUrl, status }) {
  const router = useRouter();
  const toast = useToast();
  const [revealed, setRevealed] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pending, startTransition] = useTransition();
  const active = endpoint && !endpoint.revoked_at;
  const url = revealed?.url ?? (endpoint ? `${siteUrl}/api/webhooks/${endpoint.public_id}` : null);

  function generate() {
    startTransition(async () => {
      const res = await generateWebhookSecretAction(workflowId);
      setConfirm(null);
      if (!res.ok) return toast.error('Could not generate secret', res.error);
      setRevealed(res);
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokeWebhookAction(workflowId);
      setConfirm(null);
      if (!res.ok) return toast.error('Could not revoke', res.error);
      setRevealed(null);
      toast.success('Webhook revoked', 'Requests to the old URL are now rejected.');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {status !== 'active' && (
        <Alert tone="info">The workflow must be active before webhook requests are accepted.</Alert>
      )}
      {revealed && (
        <Alert tone="warning" title="Copy this secret now">
          It is shown only once and stored as a hash.
          <code className="mt-2 block rounded bg-surface/70 px-2 py-1 font-mono text-xs break-all text-ink">
            {revealed.secret}
          </code>
        </Alert>
      )}
      {active ? (
        <>
          <div>
            <p className="text-xs font-medium text-ink-subtle">Endpoint URL</p>
            <code className="mt-1 block rounded bg-gray-50 px-2 py-1.5 font-mono text-xs break-all">
              {url}
            </code>
            <p className="mt-1 text-xs text-ink-subtle">
              Secret {endpoint.secret_hint} ·{' '}
              {endpoint.last_used_at ? (
                <>
                  last used <RelativeTime value={endpoint.last_used_at} />
                </>
              ) : (
                'never used'
              )}
            </p>
          </div>
          <CodeBlock>{`curl -X POST "${url}" \\
  -H "Authorization: Bearer <secret>" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: form-submission-123" \\
  -d '{"name":"Jordan Blake","email":"jordan@acme.example","message":"Pricing please"}'`}</CodeBlock>
          <p className="text-xs text-ink-subtle">
            Limits: JSON object ≤ 32 KB, 30 requests/minute and 1,000/day per endpoint. Requests
            with the same Idempotency-Key (or identical payloads without one) are accepted once.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirm('rotate')}>
              Rotate secret
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirm('revoke')}>
              Revoke
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" onClick={generate} loading={pending}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />{' '}
          {endpoint ? 'Create new endpoint' : 'Generate webhook URL & secret'}
        </Button>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        loading={pending}
        title={confirm === 'rotate' ? 'Rotate webhook secret?' : 'Revoke webhook?'}
        description={
          confirm === 'rotate'
            ? 'A new URL and secret are generated. The current URL stops working immediately.'
            : 'The webhook URL stops accepting requests immediately.'
        }
        confirmLabel={confirm === 'rotate' ? 'Rotate' : 'Revoke'}
        onConfirm={confirm === 'rotate' ? generate : revoke}
      />
    </div>
  );
}
