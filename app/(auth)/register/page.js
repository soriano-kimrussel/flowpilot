import Link from 'next/link';
import { RegisterForm } from '@/components/forms/auth-forms';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Create your workspace</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Free demo, no credit card. Already registered?{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <RegisterForm />
    </>
  );
}
