'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  deleteNotificationAction,
  markNotificationsReadAction,
} from '@/features/notifications/actions';
import { cn, formatRelative } from '@/lib/utils/format';

const ICONS = {
  info: <Info className="h-5 w-5 text-brand-600" aria-hidden="true" />,
  success: <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />,
  error: <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />,
};

export function MarkAllReadButton({ disabled }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markNotificationsReadAction('all');
          if (!res.ok) return toast.error('Could not update', res.error);
          router.refresh();
        })
      }
    >
      Mark all as read
    </Button>
  );
}

export function NotificationItem({ notification: n }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = !n.read_at;
  return (
    <li className={cn('flex gap-3 px-5 py-4', unread && 'bg-brand-50/40')}>
      <div className="mt-0.5 shrink-0">{ICONS[n.severity] ?? ICONS.info}</div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          {unread && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}
          {n.title}
          {n.is_demo && <DemoBadge />}
        </p>
        {n.body && <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-subtle">
          <span>{formatRelative(n.created_at)}</span>
          {n.link && (
            <Link
              href={n.link}
              className="text-brand-700 hover:underline"
              onClick={() => unread && startTransition(() => markNotificationsReadAction([n.id]))}
            >
              Open
            </Link>
          )}
          {unread && (
            <button
              type="button"
              className="text-brand-700 hover:underline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await markNotificationsReadAction([n.id]);
                  router.refresh();
                })
              }
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete notification"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteNotificationAction(n.id);
            router.refresh();
          })
        }
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
