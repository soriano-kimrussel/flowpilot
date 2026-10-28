'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({ error, reset }) {
  const isConfig = /configuration error/i.test(error?.message ?? '');
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold">
        {isConfig ? 'FlowPilot is not configured yet' : 'Something went wrong'}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {isConfig
          ? 'Copy .env.example to .env.local, add your Supabase URL and publishable key, then restart the dev server.'
          : 'This page could not be loaded. Your data is safe. Try again, and if it keeps happening, check the server logs.'}
      </p>
      {error?.digest && (
        <p className="mt-2 font-mono text-xs text-ink-subtle">Reference: {error.digest}</p>
      )}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
