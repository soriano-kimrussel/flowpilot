import { LayoutTemplate } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { listTemplates } from '@/features/workflows/queries';
import { DeleteTemplateButton } from '@/components/workflows/template-actions';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, EmptyState, PageHeader } from '@/components/ui/layout';
import { ACTION_CATALOG, actionLabel } from '@/lib/workflow-engine/catalog';
import { TRIGGERS } from '@/lib/workflow-engine/constants';
import { countSteps, walkSteps } from '@/lib/workflow-engine/definition';
import { can } from '@/lib/security/permissions';
import { humanize } from '@/lib/utils/format';

export const metadata = { title: 'Templates' };

export default async function TemplatesPage() {
  const session = await requireSession();
  const templates = await listTemplates(session);
  const canEdit = can(session.role, 'workflow.edit');

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable workflow definitions. Using a template creates an editable draft workflow."
      />
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutTemplate}
            title="No templates"
            description="Built-in templates are installed by the database migrations."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const types = [];
            const steps = Array.isArray(t.definition?.steps) ? t.definition.steps : [];
            walkSteps(steps, (s) => types.push(s.type));
            const simulated = types.some((type) => ACTION_CATALOG[type]?.simulated);
            return (
              <Card key={t.id} className="flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={t.is_system ? 'indigo' : 'gray'}>
                      {t.is_system ? 'Built-in' : 'Workspace'}
                    </Badge>
                    <Badge>{humanize(t.category)}</Badge>
                    {simulated && <SimulatedBadge label="Uses simulations" />}
                  </div>
                  <h2 className="mt-3 text-sm font-semibold">{t.name}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{t.description}</p>
                  <p className="mt-3 text-xs text-ink-subtle">
                    Trigger: {TRIGGERS[t.definition.trigger?.type]?.label} ·{' '}
                    {countSteps(t.definition)} steps
                  </p>
                  <ol className="mt-2 flex-1 space-y-0.5 text-xs text-ink-muted">
                    {steps.slice(0, 6).map((s, i) => (
                      <li key={s.id}>
                        {i + 1}. {s.name || actionLabel(s.type)}
                      </li>
                    ))}
                    {steps.length > 6 && <li>…and {steps.length - 6} more</li>}
                  </ol>
                  {canEdit && (
                    <div className="mt-4 flex gap-2">
                      <ButtonLink href={`/dashboard/workflows/new?template=${t.id}`} size="sm">
                        Use template
                      </ButtonLink>
                      {!t.is_system && <DeleteTemplateButton templateId={t.id} />}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
