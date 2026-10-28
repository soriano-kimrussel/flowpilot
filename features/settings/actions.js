'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionSession, WORKSPACE_COOKIE } from '@/features/auth/session';
import { fieldErrorsFrom, toActionError, unwrap } from '@/features/actions-util';
import { logAudit } from '@/features/audit/log';
import { resetPasswordSchema } from '@/lib/validation/auth';

const profileSchema = z.object({ fullName: z.string().trim().min(1, 'Enter your name').max(120) });
const workspaceSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(80) });
const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(['admin', 'member']),
});

export async function updateProfileAction(values) {
  try {
    const session = await requireActionSession();
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    unwrap(
      await session.supabase
        .from('profiles')
        .update({ full_name: parsed.data.fullName })
        .eq('id', session.user.id),
    );
    revalidatePath('/dashboard', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changePasswordAction(values) {
  try {
    const session = await requireActionSession();
    const parsed = resetPasswordSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    const { error } = await session.supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return {
        ok: false,
        error:
          error.code === 'same_password'
            ? 'Choose a password you have not used before.'
            : 'Could not change the password. You may need to sign in again first.',
      };
    }
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: session.user.id,
    });
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function renameWorkspaceAction(values) {
  try {
    const session = await requireActionSession('workspace.rename');
    const parsed = workspaceSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    unwrap(
      await session.supabase
        .from('workspaces')
        .update({ name: parsed.data.name })
        .eq('id', session.workspaceId),
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'workspace.renamed',
      entityType: 'workspace',
      entityId: session.workspaceId,
    });
    revalidatePath('/dashboard', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createWorkspaceAction(values) {
  let workspaceId;
  try {
    const session = await requireActionSession();
    const parsed = workspaceSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    workspaceId = unwrap(
      await session.supabase.rpc('create_workspace', { p_name: parsed.data.name }),
    );
    const cookieStore = await cookies();
    cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  } catch (error) {
    return toActionError(error);
  }
  redirect('/dashboard');
}

export async function addMemberAction(values) {
  try {
    const session = await requireActionSession('member.manage');
    const parsed = memberSchema.safeParse(values);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    const { error } = await session.supabase.rpc('add_workspace_member', {
      p_workspace_id: session.workspaceId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/dashboard/settings');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMemberRoleAction(memberId, role) {
  try {
    const session = await requireActionSession('member.manage');
    const { error } = await session.supabase.rpc('update_member_role', {
      p_member_id: z.string().uuid().parse(memberId),
      p_role: z.enum(['admin', 'member']).parse(role),
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/dashboard/settings');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeMemberAction(memberId) {
  try {
    const session = await requireActionSession();
    const id = z.string().uuid().parse(memberId);
    const target = unwrap(
      await session.supabase
        .from('workspace_members')
        .select('role, user_id')
        .eq('id', id)
        .eq('workspace_id', session.workspaceId)
        .maybeSingle(),
    );
    if (target?.role === 'admin' && session.role !== 'owner' && target.user_id !== session.user.id)
      return { ok: false, error: 'Only owners can remove admins.' };
    const removed = unwrap(
      await session.supabase
        .from('workspace_members')
        .delete()
        .eq('id', id)
        .eq('workspace_id', session.workspaceId)
        .select('id, user_id'),
    );
    if (!removed.length)
      return {
        ok: false,
        error:
          'You cannot remove this member. Owners cannot be removed, and only admins can remove others.',
      };
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'member.removed',
      entityType: 'workspace_member',
      entityId: id,
    });
    revalidatePath('/dashboard/settings');
    if (removed[0].user_id === session.user.id) {
      (await cookies()).delete(WORKSPACE_COOKIE);
      redirect('/dashboard');
    }
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function loadDemoDataAction() {
  try {
    const session = await requireActionSession('demo.manage');
    const result = unwrap(
      await session.supabase.rpc('seed_demo_data', { p_workspace_id: session.workspaceId }),
      'Could not load demo data',
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'demo.loaded',
      entityType: 'workspace',
      entityId: session.workspaceId,
      metadata: result,
    });
    revalidatePath('/dashboard', 'layout');
    return { ok: true, result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function clearDemoDataAction() {
  try {
    const session = await requireActionSession('demo.manage');
    const result = unwrap(
      await session.supabase.rpc('clear_demo_data', { p_workspace_id: session.workspaceId }),
      'Could not remove demo data',
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: 'demo.cleared',
      entityType: 'workspace',
      entityId: session.workspaceId,
      metadata: result,
    });
    revalidatePath('/dashboard', 'layout');
    return { ok: true, result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteWorkspaceAction(confirmName) {
  try {
    const session = await requireActionSession('workspace.delete');
    if (String(confirmName ?? '').trim() !== session.workspace?.name) {
      return { ok: false, error: 'Type the exact workspace name to confirm.' };
    }
    if (
      session.memberships.filter((m) => m.role === 'owner').length <= 1 &&
      session.memberships.length <= 1
    ) {
      return {
        ok: false,
        error: 'This is your only workspace. Create another workspace before deleting this one.',
      };
    }
    const deleted = unwrap(
      await session.supabase.from('workspaces').delete().eq('id', session.workspaceId).select('id'),
    );
    if (!deleted.length) return { ok: false, error: 'Workspace could not be deleted.' };
    (await cookies()).delete(WORKSPACE_COOKIE);
  } catch (error) {
    return toActionError(error);
  }
  redirect('/dashboard');
}
