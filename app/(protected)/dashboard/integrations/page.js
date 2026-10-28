import Link from 'next/link';
import { Bot, Database, Mail, Webhook } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { getAIDescription } from '@/features/ai';
import { IntegrationToggle } from '@/components/integrations/integration-toggle';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { Alert, Card, CardBody, CardHeader, PageHeader } from '@/components/ui/layout';
import { can } from '@/lib/security/permissions';
import { formatRelative } from '@/lib/utils/format';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage() {
  const session = await requireSession();
  const { supabase, workspaceId, role } = session;
  const canEdit = can(role, 'integration.edit');

  const [{ data: integrations }, { data: outbox }, { data: endpoints }] = await Promise.all([
    supabase
      .from('integrations')
      .select('provider, enabled, updated_at')
      .eq('workspace_id', workspaceId),
    supabase
      .from('lead_activities')
      .select('id, type, description, created_at, lead_id, leads(name)')
      .eq('workspace_id', workspaceId)
      .in('type', ['email_simulated', 'crm_sync_simulated'])
      .order('created_at', { ascending: false })
      .limit(10),
    can(role, 'webhook.manage')
      ? supabase
          .from('webhook_endpoints')
          .select('public_id, secret_hint, last_used_at, revoked_at, workflows(id, name, status)')
          .eq('workspace_id', workspaceId)
      : Promise.resolve({ data: null }),
  ]);
  const enabled = (provider) =>
    Boolean(integrations?.find((i) => i.provider === provider)?.enabled);
  const ai = getAIDescription();

  const demoIntegrations = [
    {
      provider: 'demo_crm',
      icon: Database,
      title: 'Demo CRM',
      text: 'Used by “Sync to CRM”. Records an upsert with a stable demo ID in the lead activity log. No external API is called. Disable it to see how failed steps and retries behave.',
    },
    {
      provider: 'demo_email',
      icon: Mail,
      title: 'Demo email outbox',
      text: 'Used by “Send email”. Messages are stored in the lead activity log and never delivered. No email provider is configured or needed.',
    },
  ];

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connections used by workflow actions. Everything here works on a $0 budget."
      />
      {!canEdit && (
        <Alert tone="info" className="mb-6">
          Only owners and admins can change integration settings.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {demoIntegrations.map(({ provider, icon: Icon, title, text }) => (
          <Card key={provider}>
            <CardBody className="flex items-start gap-4">
              <div className="rounded-md bg-gray-100 p-2 text-ink-muted">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <SimulatedBadge />
                  <Badge tone={enabled(provider) ? 'green' : 'gray'}>
                    {enabled(provider) ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </div>
              <IntegrationToggle
                provider={provider}
                enabled={enabled(provider)}
                disabled={!canEdit}
                label={title}
              />
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardBody className="flex items-start gap-4">
            <div className="rounded-md bg-gray-100 p-2 text-ink-muted">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">AI provider</h2>
                <Badge tone={ai.mode === 'demo' ? 'violet' : 'indigo'}>{ai.mode}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{ai.label}.</p>
              <p className="mt-2 text-xs text-ink-subtle">
                Configured by the server operator with environment variables (AI_PROVIDER, OLLAMA_*,
                AI_API_*). API keys are never stored in the database or sent to the browser. Scoring
                always stays rule-based for explainability.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-start gap-4">
            <div className="rounded-md bg-gray-100 p-2 text-ink-muted">
              <Webhook className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Incoming webhooks</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Each webhook-triggered workflow gets its own URL and secret. Manage them from the
                workflow editor.
              </p>
              {endpoints && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {endpoints.length === 0 && (
                    <li className="text-ink-subtle">No webhook endpoints yet.</li>
                  )}
                  {endpoints.map((e) => (
                    <li key={e.public_id} className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/workflows/${e.workflows?.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {e.workflows?.name}
                      </Link>
                      <Badge tone={e.revoked_at ? 'gray' : 'green'}>
                        {e.revoked_at ? 'Revoked' : 'Active'}
                      </Badge>
                      <span className="text-xs text-ink-subtle">
                        {e.last_used_at ? `used ${formatRelative(e.last_used_at)}` : 'never used'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Simulated outbox & CRM log"
          description="What the demo integrations recorded instead of calling external services."
        />
        {(outbox ?? []).length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-subtle">
              Nothing yet. Run a workflow with “Send email” or “Sync to CRM”.
            </p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {outbox.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span>
                  <Link
                    href={`/dashboard/leads/${a.lead_id}`}
                    className="font-medium hover:underline"
                  >
                    {a.leads?.name}
                  </Link>{' '}
                  <span className="text-ink-muted">{a.description}</span>
                </span>
                <span className="text-xs text-ink-subtle">{formatRelative(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Alert tone="info" title="Real third-party integrations" className="mt-6">
        Paid CRMs, email and SMS providers are intentionally not connected, to keep the project
        free. The action registry is the place to add a real adapter later: implement the same
        input/output schema and keep the demo version for testing.
      </Alert>
    </>
  );
}
