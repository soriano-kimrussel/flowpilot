import Link from 'next/link';
import { Logo } from '@/components/layout/logo';

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-6 text-xs text-ink-subtle">
        Portfolio demo ·{' '}
        <Link href="/privacy" className="underline hover:text-ink">
          Privacy &amp; data handling
        </Link>
      </p>
    </div>
  );
}
