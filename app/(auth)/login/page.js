import Link from 'next/link';
import { LoginForm } from '@/components/forms/auth-forms';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-lg font-semibold">Sign in to FlowPilot</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create a free account
        </Link>
      </p>
      <LoginForm next={typeof next === 'string' ? next : undefined} linkError={error === 'link'} />
    </>
  );
}
