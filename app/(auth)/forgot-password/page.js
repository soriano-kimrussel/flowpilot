import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/forms/auth-forms';

export const metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Reset your password</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Enter your account email and we&apos;ll send a reset link.{' '}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </p>
      <ForgotPasswordForm />
    </>
  );
}
