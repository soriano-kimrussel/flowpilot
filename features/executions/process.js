import 'server-only';
import { processQueuedJobs } from '@/lib/workflow-engine/queue';
import { getAI } from '@/features/ai';

/**
 * Processes a small burst of queued jobs for the current workspace using the member's session
 * (RLS applies). Called after lead events so lead-triggered workflows run immediately without
 * a background worker. Never throws: the user's action already succeeded.
 */
export async function processWorkspaceJobs(session, { limit = 3 } = {}) {
  try {
    const result = await processQueuedJobs({
      supabase: session.supabase,
      workspaceId: session.workspaceId,
      actorId: session.user.id,
      limit,
      workerId: `user-${session.user.id.slice(0, 8)}`,
      ai: getAI(),
    });
    return {
      processed: result.results.filter((r) => r.status === 'completed').length,
      results: result.results,
    };
  } catch (error) {
    console.error('[jobs] processing failed:', error.message);
    return { processed: 0, error: error.message };
  }
}
