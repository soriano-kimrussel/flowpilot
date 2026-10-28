'use client';

import { useSyncExternalStore } from 'react';
import { formatRelative } from '@/lib/utils/format';

const subscribe = () => () => {};

/**
 * Relative time for client components. The server (UTC) and browser (local time zone, later
 * clock) format differently, so the server text is kept during hydration and re-rendered on the
 * client right after.
 */
export function RelativeTime({ value }) {
  // false while hydrating, true afterwards: forces one client re-render with local formatting.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!value) return '—';
  return (
    <time dateTime={value} data-hydrated={hydrated || undefined} suppressHydrationWarning>
      {formatRelative(value)}
    </time>
  );
}
