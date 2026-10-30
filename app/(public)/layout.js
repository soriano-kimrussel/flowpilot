import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { ButtonLink } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme';

const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
];

export default function PublicLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav
            aria-label="Main"
            className="hidden items-center gap-1 rounded-full border border-line bg-surface/50 p-1 text-sm text-ink-muted sm:flex"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-1.5 transition-colors hover:bg-gray-100 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <ButtonLink href="/login" variant="ghost" size="sm" className="max-sm:hidden">
              Sign in
            </ButtonLink>
            <ButtonLink href="/register" size="sm">
              Start free
            </ButtonLink>
          </div>
        </div>
        <nav
          aria-label="Main mobile"
          className="flex justify-center gap-6 border-t border-line py-2 text-sm text-ink-muted sm:hidden"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-surface/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>FlowPilot AI is a portfolio demonstration project. No payments, no paid APIs.</p>
          <div className="flex gap-4">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
