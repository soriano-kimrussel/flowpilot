import { CheckCircle2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { LIMITS } from '@/lib/workflow-engine/constants';

export const metadata = { title: 'Pricing' };

const INCLUDED = [
  'Unlimited workflows and leads (within database free-tier storage)',
  `Up to ${LIMITS.MAX_STEPS} steps per workflow, ${LIMITS.MAX_EXECUTION_MS / 1000}s per execution`,
  'Rule-based AI classification, scoring, summaries and drafts',
  'Authenticated webhooks (30 requests/minute per endpoint)',
  'In-app notification center',
  'Simulated CRM and email integrations',
  'Owner, admin and member roles',
  'CSV export with formula-injection protection',
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">
        <span className="text-gradient">Pricing</span>
      </h1>
      <p className="mt-3 max-w-2xl text-ink-muted">
        FlowPilot AI is a portfolio demonstration. There is one plan, it is free, and there is no
        payment processing anywhere in the product.
      </p>

      <div className="glass ring-gradient glow-brand mt-10 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Demo plan</h2>
            <p className="text-sm text-ink-muted">For evaluation and learning</p>
          </div>
          <p className="text-3xl font-semibold">
            <span className="text-gradient text-5xl">$0</span>{' '}
            <span className="text-base font-normal text-ink-subtle">forever</span>
          </p>
        </div>
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
        <ButtonLink href="/register" className="mt-8">
          Create a free workspace
        </ButtonLink>
      </div>

      <section className="mt-10 text-sm text-ink-muted">
        <h2 className="text-base font-semibold text-ink">Limits you should know about</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            The hosted demo runs on free infrastructure tiers. Inactive databases may be paused and
            take a moment to resume.
          </li>
          <li>
            Scheduled workflows are enqueued at most daily by the free cron, or when a member
            processes the queue.
          </li>
          <li>Authentication emails use the default free email service and are rate limited.</li>
        </ul>
      </section>
    </div>
  );
}
