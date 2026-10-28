import { cn, humanize } from '@/lib/utils/format';

const TONES = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'gray', className, children, title }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES = {
  // executions / steps
  pending: 'gray',
  running: 'blue',
  succeeded: 'green',
  failed: 'red',
  cancelled: 'gray',
  skipped: 'gray',
  // workflows
  draft: 'gray',
  active: 'green',
  inactive: 'amber',
  archived: 'gray',
  // leads
  new: 'blue',
  contacted: 'indigo',
  qualified: 'green',
  proposal: 'violet',
  won: 'green',
  lost: 'gray',
  // jobs
  queued: 'gray',
  processing: 'blue',
  completed: 'green',
};

export function StatusBadge({ status, className }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'gray'} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {humanize(status)}
    </Badge>
  );
}

export function DemoBadge({ className }) {
  return (
    <Badge tone="amber" className={className} title="Seeded demonstration data">
      Demo data
    </Badge>
  );
}

export function SimulatedBadge({ label = 'Simulated', className }) {
  return (
    <Badge tone="violet" className={className} title="No external request is made">
      {label}
    </Badge>
  );
}

export function ScoreBadge({ score }) {
  if (score === null || score === undefined) return <span className="text-ink-subtle">—</span>;
  const tone = score >= 75 ? 'green' : score >= 50 ? 'blue' : score >= 25 ? 'amber' : 'gray';
  return (
    <Badge tone={tone} className="tabular-nums">
      {score}
    </Badge>
  );
}
