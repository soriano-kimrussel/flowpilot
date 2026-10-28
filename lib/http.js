import { NextResponse } from 'next/server';
import { AuthorizationError, NotFoundError } from '@/lib/workflow-engine/errors';

export function jsonError(status, error, headers) {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

export function methodNotAllowed(allowed = 'POST') {
  return jsonError(405, `Method not allowed. Use ${allowed}.`, { Allow: allowed });
}

/** Maps domain errors to HTTP responses without leaking internals. */
export function errorResponse(error) {
  if (error instanceof AuthorizationError) return jsonError(403, error.message);
  if (error instanceof NotFoundError) return jsonError(404, error.message);
  console.error('[api] unexpected error:', error?.message ?? error);
  return jsonError(500, 'Unexpected server error. The failure was logged.');
}

/** Reads a JSON body with a hard size cap. */
export async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes)
    return { ok: false, response: jsonError(413, `Body exceeds ${maxBytes} bytes`) };
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes)
    return { ok: false, response: jsonError(413, `Body exceeds ${maxBytes} bytes`) };
  if (!text.trim()) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonError(400, 'Body is not valid JSON') };
  }
}

/** Simple DB-backed rate limit: counts recent executions created by this user. */
export async function checkRunRateLimit(
  supabase,
  workspaceId,
  userId,
  { limit = 20, windowSeconds = 60 } = {},
) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await supabase
    .from('workflow_executions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('created_by', userId)
    .gte('created_at', since);
  if (error) return { ok: true }; // fail open on a read error; RLS and limits still apply
  return count >= limit ? { ok: false, retryAfter: windowSeconds } : { ok: true };
}
