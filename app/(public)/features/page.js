import { ACTION_CATALOG, ACTION_CATEGORIES } from '@/lib/workflow-engine/catalog';
import { TRIGGERS } from '@/lib/workflow-engine/constants';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';

export const metadata = { title: 'Features' };

export default function FeaturesPage() {
  const byCategory = Object.entries(ACTION_CATEGORIES).map(([key, label]) => ({
    key,
    label,
    actions: Object.entries(ACTION_CATALOG).filter(([, a]) => a.category === key),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">
        <span className="text-gradient">Features</span>
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted">
        FlowPilot combines a structured workflow builder, a persistent execution engine and
        transparent AI assistance. Every action below is a real, tested module in the open action
        registry.
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Triggers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(TRIGGERS).map(([type, t]) => (
            <div
              key={type}
              className="glass rounded-2xl border border-line p-4 transition-colors hover:border-brand-500/40"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t.label}</h3>
                <code className="text-xs text-ink-subtle">{type}</code>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      {byCategory.map((cat) => (
        <section key={cat.key} className="mt-12">
          <h2 className="text-lg font-semibold">{cat.label}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cat.actions.map(([type, a]) => (
              <div
                key={type}
                className="glass rounded-2xl border border-line p-4 transition-colors hover:border-brand-500/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{a.label}</h3>
                  {a.simulated ? (
                    <SimulatedBadge />
                  ) : a.category === 'ai' ? (
                    <Badge tone="indigo">Rule-based</Badge>
                  ) : null}
                </div>
                <code className="text-xs text-ink-subtle">{type}</code>
                <p className="mt-2 text-sm text-ink-muted">{a.description}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="glass ring-gradient mt-14 rounded-2xl border border-line p-6 sm:p-8">
        <h2 className="text-lg font-semibold">How AI is used, honestly</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>
            By default, classification, scoring, summaries and drafts are deterministic rules and
            templates. They are labeled “Rule-based (simulated AI)”.
          </li>
          <li>
            Developers can optionally connect a local Ollama model or an OpenAI-compatible API they
            configure themselves. Those results are labeled with the model name.
          </li>
          <li>Scoring always stays rule-based, so every point can be explained.</li>
          <li>
            Model output is validated, size-limited and never executed. Failures fall back to rules
            and are labeled as fallbacks.
          </li>
        </ul>
        <ButtonLink href="/register" className="mt-6">
          Create a workspace
        </ButtonLink>
      </section>
    </div>
  );
}
