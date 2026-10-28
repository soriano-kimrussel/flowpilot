import { cn } from '@/lib/utils/format';

export function Card({ className, children, as: Tag = 'section', ...props }) {
  return (
    <Tag className={cn('rounded-lg border border-line bg-surface shadow-sm', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('px-4 py-4 sm:px-5', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1 text-sm text-ink-subtle">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {Icon && (
        <div className="mb-3 rounded-full bg-gray-100 p-3 text-ink-subtle">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-gray-200/70', className)} aria-hidden="true" />
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-md border px-4 py-3 text-sm', tones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && 'mt-1', 'opacity-90')}>{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </Card>
  );
}

export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('min-w-full divide-y divide-line text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className, ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        'bg-gray-50/80 px-4 py-2.5 text-left text-xs font-medium tracking-wide text-ink-subtle uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, ...props }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-ink', className)} {...props}>
      {children}
    </td>
  );
}

export function DefinitionList({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
