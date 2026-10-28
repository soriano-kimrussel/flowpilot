'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { toggleIntegrationAction } from '@/features/integrations/actions';
import { cn } from '@/lib/utils/format';

export function IntegrationToggle({ provider, enabled, disabled, label }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label}: ${enabled ? 'enabled' : 'disabled'}`}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const res = await toggleIntegrationAction({ provider, enabled: !enabled });
          if (!res.ok) return toast.error('Not changed', res.error);
          toast.success(`${label} ${enabled ? 'disabled' : 'enabled'}`);
          router.refresh();
        })
      }
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        enabled ? 'bg-brand-600' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
