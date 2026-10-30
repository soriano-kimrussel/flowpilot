import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Database,
  GitBranch,
  ListChecks,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Webhook,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/format';

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

const STATS = [
  { value: '50', label: 'steps per workflow' },
  { value: '25 s', label: 'execution budget' },
  { value: '0', label: 'paid APIs required' },
  { value: '100%', label: 'steps logged & replayable' },
];

// Hub diagram: inputs on the left, actions on the right, joined to the center card.
const HUB_CHIPS = [
  { icon: Webhook, label: 'Webhooks', tag: 'Forms', pos: 'left-0 top-6', line: [14, 16] },
  { icon: Database, label: 'CSV import', tag: 'Leads', pos: 'left-0 bottom-10', line: [14, 82] },
  { icon: Mail, label: 'Email', tag: 'Drafts', pos: 'right-0 top-10', line: [86, 20] },
  { icon: Bell, label: 'Alerts', tag: 'Routing', pos: 'right-0 bottom-6', line: [86, 86] },
];

function AutomationHub() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-label="Automation overview">
      {/* Desktop: floating chips joined to the center card. Mobile: simple chip grid. */}
      <div className="relative hidden h-[26rem] sm:block">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="hub-line" x1="0" x2="1">
              <stop offset="0" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          {HUB_CHIPS.map(({ label, line: [x, y] }) => (
            <path
              key={label}
              d={`M${x} ${y} C ${(x + 50) / 2} ${y}, ${(x + 50) / 2} 50, 50 50`}
              fill="none"
              stroke="url(#hub-line)"
              strokeWidth={1.5}
              strokeDasharray="1.5 1.5"
              vectorEffect="non-scaling-stroke"
              className="animate-dash opacity-70"
            />
          ))}
        </svg>

        <HubCard
          idPrefix="hub-desktop"
          className="absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2"
        />

        {HUB_CHIPS.map(({ icon: Icon, label, tag, pos }, i) => (
          <div
            key={label}
            className={cn('animate-float absolute', pos)}
            style={{ animationDelay: `${i * 0.8}s` }}
          >
            <Chip icon={Icon} label={label} tag={tag} />
          </div>
        ))}
      </div>

      <div className="space-y-4 sm:hidden">
        <HubCard idPrefix="hub-mobile" />
        <div className="grid grid-cols-2 gap-2">
          {HUB_CHIPS.map(({ icon: Icon, label, tag }) => (
            <Chip key={label} icon={Icon} label={label} tag={tag} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, tag }) {
  return (
    <div className="glass flex items-center gap-2 rounded-full border border-line-strong py-1.5 pr-2 pl-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-brand-500 to-accent-500 text-white">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-ink-muted">{tag}</span>
    </div>
  );
}

// Rendered twice (desktop and mobile layouts), so SVG gradient ids need a per-instance prefix.
function HubCard({ className, idPrefix }) {
  return (
    <div className={cn('glass ring-gradient glow-brand rounded-2xl p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-subtle">Qualified leads</p>
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> Live
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
        96<span className="text-base text-ink-subtle">% on time</span>
      </p>
      <svg viewBox="0 0 200 70" className="mt-3 h-20 w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`${idPrefix}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-stroke`} x1="0" x2="1">
            <stop offset="0" stopColor="#fb923c" />
            <stop offset="0.5" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path
          d="M0 58 C 25 55, 35 48, 55 46 S 90 50, 110 36 S 150 30, 165 18 S 190 10, 200 6 L200 70 L0 70Z"
          fill={`url(#${idPrefix}-area)`}
        />
        <path
          d="M0 58 C 25 55, 35 48, 55 46 S 90 50, 110 36 S 150 30, 165 18 S 190 10, 200 6"
          fill="none"
          stroke={`url(#${idPrefix}-stroke)`}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="110" cy="36" r="3.5" fill="#fb923c" />
        <circle cx="200" cy="6" r="3.5" fill="#22d3ee" />
      </svg>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['82', 'Avg score'],
          ['0.4s', 'Run time'],
          ['9', 'Steps'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-gray-50 px-1 py-1.5">
            <p className="text-sm font-semibold text-ink tabular-nums">{v}</p>
            <p className="text-[10px] text-ink-subtle">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          className="bg-grid pointer-events-none absolute inset-0 opacity-50"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/60 px-3 py-1 text-xs font-medium text-ink-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500 shadow-[0_0_8px_var(--color-accent-500)]" />
              Portfolio project · $0 to run
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
              Automate lead intake and follow-up{' '}
              <span className="text-gradient">without adding headcount</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
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
          <AutomationHub />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <dl className="glass grid grid-cols-2 divide-line rounded-2xl border border-line sm:grid-cols-4 sm:divide-x">
          {STATS.map(({ value, label }) => (
            <div key={label} className="px-5 py-6 text-center">
              <dt className="sr-only">{label}</dt>
              <dd>
                <span className="text-gradient block text-3xl font-semibold tracking-tight">
                  {value}
                </span>
                <span className="mt-1 block text-xs text-ink-subtle">{label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <Badge tone="indigo">Execution log</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink">
            See <span className="text-gradient-warm">every step</span> the automation took
          </h2>
          <p className="mt-3 max-w-lg text-ink-muted">
            Each run is persisted step by step, with inputs, outputs, timing and retries. Simulated
            integrations are labeled, so nothing surprising ever leaves the app.
          </p>
        </div>
        <div
          className="glass min-w-0 rounded-2xl border border-line p-4 sm:p-6"
          aria-label="Example execution"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Lead qualification pipeline</p>
              <p className="text-xs text-ink-subtle">Example execution · 9 steps · 0.4 s</p>
            </div>
            <Badge tone="green">Succeeded</Badge>
          </div>
          <ol className="relative space-y-2 before:absolute before:top-3 before:bottom-3 before:left-[1.1rem] before:w-px before:bg-linear-to-b before:from-brand-500 before:to-accent-500 before:opacity-50">
            {PIPELINE.map((step, i) => (
              <li
                key={step.label}
                className="relative flex items-start gap-3 rounded-lg border border-line bg-surface/60 px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-500 to-accent-500 text-[11px] font-semibold text-white">
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

      <section className="border-y border-line bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink">
            Everything a small team needs to{' '}
            <span className="text-gradient">automate repetitive work</span>
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Built with Next.js, Supabase and PostgreSQL. Runs on free tiers.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="glass group relative overflow-hidden rounded-2xl border border-line p-5 transition-colors hover:border-brand-500/40"
              >
                <div
                  className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-brand-500/0 blur-2xl transition-colors group-hover:bg-brand-500/25"
                  aria-hidden="true"
                />
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-accent-500 text-white shadow-[0_8px_20px_-8px_rgb(124_58_237/0.8)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="ring-gradient relative overflow-hidden rounded-3xl border border-line bg-linear-to-br from-brand-600/25 via-surface to-accent-500/15 p-8 sm:flex sm:items-center sm:justify-between sm:p-12">
          <div
            className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-glow-orange/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Try it with demo data in under a minute
            </h2>
            <p className="mt-2 text-sm text-ink-muted sm:text-base">
              Register, load sample leads and workflows from Settings, then run your first
              automation.
            </p>
          </div>
          <ButtonLink href="/register" size="lg" className="relative mt-6 sm:mt-0">
            Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
