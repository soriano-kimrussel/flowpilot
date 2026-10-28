import Link from 'next/link';
import { Bell } from 'lucide-react';
import { requireSession } from '@/features/auth/session';
import { MarkAllReadButton, NotificationItem } from '@/components/notifications/notification-list';
import { Card, EmptyState, PageHeader } from '@/components/ui/layout';
import { cn } from '@/lib/utils/format';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({ searchParams }) {
  const session = await requireSession();
  const { filter } = await searchParams;
  const unreadOnly = filter === 'unread';
  let query = session.supabase
    .from('notifications')
    .select('id, title, body, severity, link, read_at, created_at, is_demo')
    .eq('user_id', session.user.id)
    .eq('workspace_id', session.workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (unreadOnly) query = query.is('read_at', null);
  const { data: notifications } = await query;
  const list = notifications ?? [];
  const tab = (active) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm font-medium',
      active ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-gray-100',
    );

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app alerts from workflows and the system. FlowPilot never requires email or SMS delivery."
        actions={<MarkAllReadButton disabled={!list.some((n) => !n.read_at)} />}
      />
      <Card>
        <div
          className="flex gap-1 border-b border-line p-2"
          role="tablist"
          aria-label="Filter notifications"
        >
          <Link
            href="/dashboard/notifications"
            className={tab(!unreadOnly)}
            role="tab"
            aria-selected={!unreadOnly}
          >
            All
          </Link>
          <Link
            href="/dashboard/notifications?filter=unread"
            className={tab(unreadOnly)}
            role="tab"
            aria-selected={unreadOnly}
          >
            Unread
          </Link>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? 'All caught up' : 'No notifications yet'}
            description="Workflows with a “Notification” step and failed executions show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <NotificationItem key={n.id} notification={n} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
