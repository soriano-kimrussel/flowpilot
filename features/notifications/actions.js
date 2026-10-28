'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionSession } from '@/features/auth/session';
import { toActionError, unwrap } from '@/features/actions-util';

export async function markNotificationsReadAction(ids) {
  try {
    const session = await requireActionSession();
    let query = session.supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('workspace_id', session.workspaceId)
      .is('read_at', null);
    if (ids !== 'all') query = query.in('id', z.array(z.string().uuid()).max(100).parse(ids));
    unwrap(await query);
    revalidatePath('/dashboard', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteNotificationAction(id) {
  try {
    const session = await requireActionSession();
    unwrap(
      await session.supabase
        .from('notifications')
        .delete()
        .eq('id', z.string().uuid().parse(id))
        .eq('user_id', session.user.id),
    );
    revalidatePath('/dashboard', 'layout');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
