import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/features/auth/session';
import { getAI } from '@/features/ai';
import {
  checkRunRateLimit,
  errorResponse,
  jsonError,
  methodNotAllowed,
  readJsonBody,
} from '@/lib/http';
import { runRequestSchema } from '@/lib/validation/workflow';
import { LIMITS } from '@/lib/workflow-engine/constants';
import { normalizeIdempotencyKey } from '@/lib/workflow-engine/idempotency';
import { runWorkflowManually } from '@/lib/workflow-engine/run';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const session = await getSession();
  if (!session?.workspaceId) return jsonError(401, 'Authentication required');

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return jsonError(404, 'Workflow not found');

  let idempotencyKey;
  try {
    idempotencyKey = normalizeIdempotencyKey(request.headers.get('idempotency-key'));
  } catch (error) {
    return jsonError(400, error.message);
  }

  const body = await readJsonBody(request, LIMITS.MAX_PAYLOAD_BYTES);
  if (!body.ok) return body.response;
  const parsed = runRequestSchema.safeParse(body.body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0].message);

  const limit = await checkRunRateLimit(session.supabase, session.workspaceId, session.user.id);
  if (!limit.ok)
    return jsonError(429, 'Too many runs. Please wait a minute.', {
      'Retry-After': String(limit.retryAfter),
    });

  try {
    const result = await runWorkflowManually({
      supabase: session.supabase,
      session,
      workflowId: id,
      leadId: parsed.data.leadId ?? null,
      payload: parsed.data.payload ?? {},
      idempotencyKey,
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
