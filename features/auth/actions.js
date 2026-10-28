'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSiteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  safeRedirectPath,
} from '@/lib/validation/auth';
import { fieldErrorsFrom } from '@/features/actions-util';
import { getSession, WORKSPACE_COOKIE } from './session';

export async function loginAction(values, next) {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Generic message: do not reveal whether the account exists.
    const unconfirmed = error.code === 'email_not_confirmed';
    return {
      ok: false,
      error: unconfirmed
        ? 'Please confirm your email address first. Check your inbox for the confirmation link.'
        : 'Invalid email or password.',
    };
  }
  redirect(safeRedirectPath(next));
}

export async function registerAction(values) {
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const { email, password, fullName, workspaceName } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, workspace_name: workspaceName || undefined },
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    if (error.code === 'weak_password')
      return { ok: false, fieldErrors: { password: error.message } };
    if (error.code === 'over_email_send_rate_limit') {
      return {
        ok: false,
        error:
          'Too many sign-up emails were sent recently. Please wait a few minutes and try again.',
      };
    }
    return {
      ok: false,
      error: 'Could not create the account. Please check your details and try again.',
    };
  }

  if (data.session) redirect('/dashboard');
  return { ok: true, needsConfirmation: true };
}

export async function forgotPasswordAction(values) {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });
  // Always report success so the form cannot be used to discover registered emails.
  return { ok: true };
}

export async function resetPasswordAction(values) {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, error: 'Your reset link has expired. Request a new one.' };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      error:
        error.code === 'same_password'
          ? 'Choose a password you have not used before.'
          : 'Could not update the password.',
    };
  }
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(WORKSPACE_COOKIE);
  redirect('/login');
}

export async function switchWorkspaceAction(workspaceId) {
  const session = await getSession();
  if (!session) redirect('/login');
  // Only allow switching to a workspace the verified user belongs to.
  if (!session.memberships.some((m) => m.workspace_id === workspaceId)) {
    return { ok: false, error: 'You are not a member of that workspace.' };
  }
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect('/dashboard');
}
