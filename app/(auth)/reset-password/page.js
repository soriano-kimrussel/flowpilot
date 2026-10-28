import { ResetPasswordForm } from '@/components/forms/auth-forms';

export const metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        You opened a password reset link. Set a new password below.
      </p>
      <ResetPasswordForm />
    </>
  );
}
