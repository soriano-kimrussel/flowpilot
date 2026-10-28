import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/security/permissions';
import { AuthorizationError } from '@/lib/workflow-engine/errors';

export const WORKSPACE_COOKIE = 'fp_workspace';

/**
 * Resolves the verified user (JWT validated by Supabase via getClaims), their profile, memberships
 * and active workspace. The user ID always comes from the verified session, never from the client.
 * Cached per request.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (error || !userId) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, default_workspace_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('workspace_members')
      .select('id, role, workspace_id, workspaces(id, name, slug)')
      .eq('user_id', userId)
      .order('created_at'),
  ]);

  const list = memberships ?? [];
  const cookieStore = await cookies();
  const preferred = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const active =
    list.find((m) => m.workspace_id === preferred) ??
    list.find((m) => m.workspace_id === profile?.default_workspace_id) ??
    list[0] ??
    null;

  return {
    supabase,
    user: { id: userId, email: claimsData.claims.email ?? profile?.email ?? '' },
    profile,
    memberships: list,
    workspace: active?.workspaces ?? null,
    workspaceId: active?.workspace_id ?? null,
    role: active?.role ?? null,
  };
});

/** For pages: redirects to /login or /unauthorized instead of rendering. */
export async function requireSession({ permission } = {}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.workspaceId) redirect('/unauthorized?reason=no-workspace');
  if (permission && !can(session.role, permission))
    redirect(`/unauthorized?reason=role&permission=${encodeURIComponent(permission)}`);
  return session;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActionSession(permission) {
  const session = await getSession();
  if (!session) throw new AuthorizationError('Your session has expired. Sign in again.');
  if (!session.workspaceId) throw new AuthorizationError('You are not a member of any workspace.');
  if (permission && !can(session.role, permission)) {
    throw new AuthorizationError(`Your role (${session.role}) does not allow this action.`);
  }
  return session;
}
