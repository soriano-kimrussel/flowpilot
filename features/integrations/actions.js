'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionSession } from '@/features/auth/session';
import { toActionError, unwrap } from '@/features/actions-util';
import { logAudit } from '@/features/audit/log';

const toggleSchema = z.object({
  provider: z.enum(['demo_crm', 'demo_email']),
  enabled: z.boolean(),
});

export async function toggleIntegrationAction(input) {
  try {
    const session = await requireActionSession('integration.edit');
    const { provider, enabled } = toggleSchema.parse(input);
    unwrap(
      await session.supabase
        .from('integrations')
        .upsert(
          {
            workspace_id: session.workspaceId,
            provider,
            enabled,
            updated_by: session.user.id,
            created_by: session.user.id,
          },
          { onConflict: 'workspace_id,provider' },
        ),
    );
    await logAudit(session.supabase, {
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      action: `integration.${enabled ? 'enabled' : 'disabled'}`,
      entityType: 'integration',
      metadata: { provider },
    });
    revalidatePath('/dashboard/integrations');
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
