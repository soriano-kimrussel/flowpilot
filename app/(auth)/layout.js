import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { ThemeToggle } from '@/components/theme/theme';

export default function AuthLayout({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div
        className="pointer-events-none absolute top-1/3 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/25 blur-3xl"
        aria-hidden="true"
      />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="relative mb-8">
        <Logo />
      </div>
      <div className="glass ring-gradient relative w-full max-w-md rounded-2xl border border-line p-6 sm:p-8">
        {children}
      </div>
      <p className="relative mt-6 text-xs text-ink-subtle">
        Portfolio demo ·{' '}
        <Link href="/privacy" className="underline hover:text-ink">
          Privacy &amp; data handling
        </Link>
      </p>
    </div>
  );
}
