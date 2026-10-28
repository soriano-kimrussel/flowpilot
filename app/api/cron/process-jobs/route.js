import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { getAI } from '@/features/ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/http';
import { enqueueDueSchedules, processQueuedJobs } from '@/lib/workflow-engine/queue';

export const maxDuration = 60;

function authorized(request, secret) {
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Called by Vercel Cron (daily on the Hobby plan). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * Enqueues due scheduled workflows and processes a bounded batch of queued jobs.
 */
export async function GET(request) {
  const env = getServerEnv();
  if (!authorized(request, env.CRON_SECRET)) return jsonError(401, 'Unauthorized');

  const admin = createAdminClient();
  if (!admin) {
    return jsonError(
      503,
      'SUPABASE_SECRET_KEY is not configured; queued jobs are processed from the dashboard instead.',
    );
  }

  try {
    const scheduled = await enqueueDueSchedules(admin, null);
    const result = await processQueuedJobs({
      supabase: admin,
      workspaceId: null,
      limit: 20,
      workerId: 'cron',
      ai: getAI(),
    });
    return NextResponse.json({
      ok: true,
      scheduled,
      claimed: result.claimed,
      results: result.results.map(({ jobId, status }) => ({ jobId, status })),
    });
  } catch (error) {
    console.error('[cron] failed:', error.message);
    return jsonError(500, 'Cron processing failed');
  }
}
