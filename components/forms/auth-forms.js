'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/layout';
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
} from '@/features/auth/actions';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/lib/validation/auth';

function useServerForm(schema, defaultValues) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const [formError, setFormError] = useState(null);

  function applyResult(result) {
    if (!result || result.ok) return true;
    if (result.fieldErrors) {
      Object.entries(result.fieldErrors).forEach(([name, message]) =>
        form.setError(name, { message }),
      );
    }
    setFormError(result.error ?? null);
    return false;
  }
  return { form, formError, setFormError, applyResult };
}

function TextField({ form, name, label, type = 'text', autoComplete, help, optional }) {
  const error = form.formState.errors[name]?.message;
  return (
    <Field id={name} label={label} error={error} help={help} optional={optional}>
      {(aria) => (
        <Input type={type} autoComplete={autoComplete} {...aria} {...form.register(name)} />
      )}
    </Field>
  );
}

export function LoginForm({ next, linkError }) {
  const { form, formError, setFormError, applyResult } = useServerForm(loginSchema, {
    email: '',
    password: '',
  });
  const onSubmit = async (values) => {
    setFormError(null);
    applyResult(await loginAction(values, next));
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {linkError && (
        <Alert tone="warning">
          That link is invalid or has expired. Sign in or request a new link.
        </Alert>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField form={form} name="email" label="Email" type="email" autoComplete="email" />
      <TextField
        form={form}
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-brand-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const { form, formError, setFormError, applyResult } = useServerForm(registerSchema, {
    fullName: '',
    workspaceName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [confirmationSent, setConfirmationSent] = useState(false);

  const onSubmit = async (values) => {
    setFormError(null);
    const result = await registerAction(values);
    if (applyResult(result) && result?.needsConfirmation) setConfirmationSent(true);
  };

  if (confirmationSent) {
    return (
      <Alert tone="success" title="Check your email">
        We sent a confirmation link to <strong>{form.getValues('email')}</strong>. Open it to
        activate your account. On the Supabase free plan, auth emails are rate limited; if nothing
        arrives, wait a few minutes and check spam.
      </Alert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField form={form} name="fullName" label="Full name" autoComplete="name" />
      <TextField
        form={form}
        name="workspaceName"
        label="Workspace name"
        optional
        help="Defaults to “<your name>'s workspace”."
      />
      <TextField form={form} name="email" label="Work email" type="email" autoComplete="email" />
      <TextField
        form={form}
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        help="At least 8 characters with a letter and a number."
      />
      <TextField
        form={form}
        name="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
      />
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { form, formError, setFormError, applyResult } = useServerForm(forgotPasswordSchema, {
    email: '',
  });
  const [sent, setSent] = useState(false);
  const onSubmit = async (values) => {
    setFormError(null);
    if (applyResult(await forgotPasswordAction(values))) setSent(true);
  };

  if (sent) {
    return (
      <Alert tone="success" title="Check your email">
        If an account exists for that address, a password reset link is on its way.
      </Alert>
    );
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField form={form} name="email" label="Email" type="email" autoComplete="email" />
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const { form, formError, setFormError, applyResult } = useServerForm(resetPasswordSchema, {
    password: '',
    confirmPassword: '',
  });
  const [done, setDone] = useState(false);
  const onSubmit = async (values) => {
    setFormError(null);
    if (applyResult(await resetPasswordAction(values))) setDone(true);
  };

  if (done) {
    return (
      <Alert tone="success" title="Password updated">
        Your password was changed.{' '}
        <Link href="/dashboard" className="font-medium underline">
          Continue to the dashboard
        </Link>
        .
      </Alert>
    );
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        form={form}
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
      />
      <TextField
        form={form}
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
      />
      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Update password
      </Button>
    </form>
  );
}
