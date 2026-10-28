import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/features/auth/session';
import { getAI } from '@/features/ai';
import { checkRunRateLimit, errorResponse, jsonError, methodNotAllowed } from '@/lib/http';
import { retryExecution } from '@/lib/workflow-engine/run';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.workspaceId) return jsonError(401, 'Authentication required');

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError(404, 'Execution not found');

  const limit = await checkRunRateLimit(session.supabase, session.workspaceId, session.user.id);
  if (!limit.ok)
    return jsonError(429, 'Too many runs. Please wait a minute.', {
      'Retry-After': String(limit.retryAfter),
    });

  try {
    const result = await retryExecution({
      supabase: session.supabase,
      session,
      executionId: id,
      ai: getAI(),
    });
    return NextResponse.json(result, {
      status: result.deduplicated ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = () => methodNotAllowed('POST');
