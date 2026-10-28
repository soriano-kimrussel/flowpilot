import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/format';

function hrefFor(basePath, searchParams, page) {
  const params = new URLSearchParams();
  Object.entries(searchParams ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && k !== 'page') params.set(k, String(v));
  });
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ basePath, searchParams, page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkClass =
    'inline-flex h-8 items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 text-sm';

  return (
    <nav
      className="flex items-center justify-between border-t border-line px-4 py-3"
      aria-label="Pagination"
    >
      <p className="text-sm text-ink-subtle">
        Showing <span className="font-medium text-ink">{from}</span>–
        <span className="font-medium text-ink">{to}</span> of{' '}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            className={cn(linkClass, 'hover:bg-gray-50')}
            href={hrefFor(basePath, searchParams, page - 1)}
            rel="prev"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span className={cn(linkClass, 'cursor-not-allowed opacity-50')} aria-disabled="true">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
          </span>
        )}
        {page < pages ? (
          <Link
            className={cn(linkClass, 'hover:bg-gray-50')}
            href={hrefFor(basePath, searchParams, page + 1)}
            rel="next"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(linkClass, 'cursor-not-allowed opacity-50')} aria-disabled="true">
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
