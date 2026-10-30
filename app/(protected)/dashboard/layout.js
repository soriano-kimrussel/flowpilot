import { AppShell } from '@/components/layout/app-shell';
import { Logo } from '@/components/layout/logo';
import { requireSession } from '@/features/auth/session';
import { isSupabaseConfigured } from '@/lib/env';

// Always evaluated per request: depends on the session cookie and runtime configuration.
export const dynamic = 'force-dynamic';

function SetupRequired() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Logo />
      <h1 className="mt-8 text-xl font-semibold">Connect a Supabase project to continue</h1>
      <p className="mt-2 text-sm text-ink-muted">
        The dashboard needs a database. Create a free Supabase project, apply the SQL migrations in{' '}
        <code>supabase/migrations</code>, then set these variables in <code>.env.local</code> (or in
        Vercel) and restart:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-code p-4 text-xs text-code-ink">{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}</pre>
      <p className="mt-4 text-sm text-ink-muted">
        See README.md → “Supabase setup” for step-by-step instructions.
      </p>
    </div>
  );
}

export default async function DashboardLayout({ children }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  const session = await requireSession();
  const { count } = await session.supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('workspace_id', session.workspaceId)
    .is('read_at', null);

  return (
    <AppShell
      workspace={session.workspace}
      memberships={session.memberships}
      role={session.role}
      unread={count ?? 0}
      user={{ name: session.profile?.full_name, email: session.user.email }}
    >
      {children}
    </AppShell>
  );
}
