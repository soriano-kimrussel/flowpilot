'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Blocks,
  ChevronsUpDown,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  PlayCircle,
  Settings,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { logoutAction, switchWorkspaceAction } from '@/features/auth/actions';
import { cn } from '@/lib/utils/format';
import { ThemeToggle } from '@/components/theme/theme';
import { LogoMark } from './logo';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/workflows', label: 'Workflows', icon: Workflow },
  { href: '/dashboard/executions', label: 'Executions', icon: PlayCircle },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Blocks },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, badgeKey: 'unread' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function NavLinks({ pathname, unread, onNavigate }) {
  return (
    <nav aria-label="Application" className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon, exact, badgeKey }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-linear-to-r from-brand-100 to-transparent text-ink ring-1 ring-brand-200 ring-inset before:absolute before:inset-y-2 before:-left-4 before:w-1 before:rounded-r before:bg-linear-to-b before:from-brand-400 before:to-accent-500 before:shadow-[0_0_12px_var(--color-brand-500)]'
                : 'text-ink-muted hover:bg-gray-100 hover:text-ink',
            )}
          >
            <Icon
              className={cn('h-4 w-4 shrink-0', active && 'text-brand-700')}
              aria-hidden="true"
            />
            <span className="flex-1">{label}</span>
            {badgeKey === 'unread' && unread > 0 && (
              <span className="rounded-full bg-linear-to-r from-brand-600 to-accent-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceSwitcher({ workspace, memberships, role }) {
  const [pending, startTransition] = useTransition();
  if (memberships.length <= 1) {
    return (
      <div className="rounded-lg border border-line bg-gray-50 px-3 py-2">
        <p className="truncate text-sm font-medium text-ink">{workspace?.name}</p>
        <p className="text-xs text-ink-subtle capitalize">{role}</p>
      </div>
    );
  }
  return (
    <div className="relative">
      <label htmlFor="workspace-switcher" className="sr-only">
        Switch workspace
      </label>
      <select
        id="workspace-switcher"
        value={workspace?.id}
        disabled={pending}
        onChange={(e) => startTransition(() => switchWorkspaceAction(e.target.value))}
        className="block h-auto w-full appearance-none rounded-lg border border-line bg-gray-50 py-2 pr-8 pl-3 text-sm font-medium text-ink"
      >
        {memberships.map((m) => (
          <option key={m.workspace_id} value={m.workspace_id}>
            {m.workspaces?.name} ({m.role})
          </option>
        ))}
      </select>
      <ChevronsUpDown
        className="pointer-events-none absolute top-2.5 right-2.5 h-4 w-4 text-ink-subtle"
        aria-hidden="true"
      />
    </div>
  );
}

function SidebarContent({ pathname, unread, workspace, memberships, role, user, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-1 font-semibold tracking-tight"
          onClick={onNavigate}
        >
          <LogoMark className="h-7 w-7" />
          FlowPilot <span className="text-gradient -ml-1">AI</span>
        </Link>
        {/* Below lg this renders in the drawer, next to its close button. */}
        <ThemeToggle className="ml-auto max-lg:mr-8" />
      </div>
      <WorkspaceSwitcher workspace={workspace} memberships={memberships} role={role} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks pathname={pathname} unread={unread} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line pt-3">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-500 to-accent-500 text-xs font-semibold text-white uppercase">
            {(user.name || user.email || '?').slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user.name || 'Account'}</p>
            <p className="truncate text-xs text-ink-subtle">{user.email}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md p-1.5 text-ink-subtle hover:bg-gray-100 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, ...props }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line lg:block">
        <SidebarContent pathname={pathname} {...props} />
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-[#04060f]/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-line bg-surface shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 rounded-md p-1.5 text-ink-subtle hover:bg-gray-100"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              {...props}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-ink-muted hover:bg-gray-100"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 font-semibold">
            <LogoMark className="h-6 w-6" /> FlowPilot
          </span>
          <ThemeToggle className="ml-auto" />
          <Link
            href="/dashboard/notifications"
            className="relative rounded-md p-1.5 text-ink-muted hover:bg-gray-100"
            aria-label={`Notifications (${props.unread} unread)`}
          >
            <Bell className="h-5 w-5" />
            {props.unread > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent-500 shadow-[0_0_8px_var(--color-accent-500)]" />
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
