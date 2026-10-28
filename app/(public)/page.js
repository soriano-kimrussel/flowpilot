import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  ListChecks,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Webhook,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Badge, SimulatedBadge } from '@/components/ui/badge';

const PIPELINE = [
  { label: 'New lead received', detail: 'Webhook · website form', status: 'done' },
  {
    label: 'Validate & detect duplicates',
    detail: 'Email format, disposable domains, +tag matches',
    status: 'done',
  },
  { label: 'Classify lead', detail: 'Mid-market · sales inquiry · high intent', status: 'done' },
  {
    label: 'Score lead',
    detail: '82 / 100: business email +15, director title +16, budget +20…',
    status: 'done',
  },
  { label: 'Draft follow-up', detail: 'Personalized reply, friendly tone', status: 'done' },
  { label: 'Route to senior AE', detail: 'Condition: score ≥ 70 → then branch', status: 'done' },
  { label: 'Send email', detail: 'Demo outbox, nothing leaves the app', status: 'simulated' },
];

const FEATURES = [
  {
    icon: ListChecks,
    title: 'Structured workflow builder',
    text: 'Triggers, actions, conditional branches and validation, saved as immutable versions.',
  },
  {
    icon: Sparkles,
    title: 'Transparent AI assistance',
    text: 'Explainable rule-based scoring and drafting by default. Optional local or self-configured models.',
  },
  {
    icon: GitBranch,
    title: 'Reliable execution engine',
    text: 'Persisted step logs, bounded retries and idempotent side effects. Nothing is held only in memory.',
  },
  {
    icon: Webhook,
    title: 'Authenticated webhooks',
    text: 'Per-endpoint secrets, rate limits, payload validation and de-duplication.',
  },
  {
    icon: ShieldCheck,
    title: 'Workspace isolation',
    text: 'Row Level Security in PostgreSQL keeps every workspace’s data private.',
  },
  {
    icon: MailCheck,
    title: 'Safe demo integrations',
    text: 'CRM and email actions are clearly labeled simulations that make no external calls.',
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="min-w-0">
          <Badge tone="indigo">Portfolio project · $0 to run</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Automate lead intake and follow-up without adding headcount
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
            FlowPilot validates, scores and routes every new lead, drafts a personalized reply and
            logs each step, so small teams respond faster and can see exactly what the automation
            did.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg">
              Create a free workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/features" size="lg" variant="secondary">
              See how it works
            </ButtonLink>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-ink-muted">
            {[
              'No credit card, no paid AI key required',
              'Every AI result labeled as rule-based or model-generated',
              'Execution history you can audit step by step',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="min-w-0 rounded-xl border border-line bg-canvas p-4 shadow-sm sm:p-6"
          aria-label="Example execution"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Lead qualification pipeline</p>
              <p className="text-xs text-ink-subtle">Example execution · 9 steps · 0.4 s</p>
            </div>
            <Badge tone="green">Succeeded</Badge>
          </div>
          <ol className="space-y-2">
            {PIPELINE.map((step, i) => (
              <li
                key={step.label}
                className="flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{step.label}</p>
                  <p className="truncate text-xs text-ink-subtle">{step.detail}</p>
                </div>
                {step.status === 'simulated' ? (
                  <SimulatedBadge />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Succeeded" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Everything a small team needs to automate repetitive work
          </h2>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Built with Next.js, Supabase and PostgreSQL. Runs on free tiers.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-lg border border-line bg-surface p-5">
                <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-xl border border-line bg-surface p-8 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Try it with demo data in under a minute</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Register, load sample leads and workflows from Settings, then run your first
              automation.
            </p>
          </div>
          <ButtonLink href="/register" className="mt-4 sm:mt-0">
            Get started
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
