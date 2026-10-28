import { after, NextResponse } from 'next/server';
import { getAI } from '@/features/ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAnonClient } from '@/lib/supabase/anon';
import { jsonError, methodNotAllowed } from '@/lib/http';
import { LIMITS } from '@/lib/workflow-engine/constants';
import { processQueuedJobs } from '@/lib/workflow-engine/queue';
import {
  extractSecret,
  hashSecret,
  isValidPublicId,
  validateIdempotencyHeader,
  validateWebhookRequest,
} from '@/lib/security/webhook';

export const maxDuration = 60;

const UNAUTHORIZED = 'Invalid webhook URL or secret';

/**
 * Incoming webhook trigger.
 * - The URL contains an opaque public ID (never the workflow ID).
 * - The caller proves knowledge of the per-endpoint secret (Authorization: Bearer <secret>).
 * - Method, content type, size and JSON shape are validated before any database work.
 * - ingest_webhook() verifies the secret hash, required fields, rate limits and idempotency,
 *   then queues a job. The response never reveals internal IDs.
 */
export async function POST(request, { params }) {
  const { endpointId } = await params;
  if (!isValidPublicId(endpointId)) return jsonError(401, UNAUTHORIZED);

  const secret = extractSecret(request.headers);
  if (!secret || secret.length > 200) return jsonError(401, UNAUTHORIZED);

  const idempotency = validateIdempotencyHeader(request.headers.get('idempotency-key'));
  if (!idempotency.ok) return jsonError(400, idempotency.error);

  if (Number(request.headers.get('content-length') ?? 0) > LIMITS.MAX_PAYLOAD_BYTES) {
    return jsonError(413, `Payload exceeds ${LIMITS.MAX_PAYLOAD_BYTES} bytes`);
  }
  const rawBody = await request.text();
  const check = validateWebhookRequest({
    method: request.method,
    contentType: request.headers.get('content-type'),
    rawBody,
  });
  if (!check.ok) return jsonError(check.status, check.error);

  const { data, error } = await createAnonClient().rpc('ingest_webhook', {
    p_public_id: endpointId,
    p_secret_hash: hashSecret(secret),
    p_payload: check.payload,
    p_idempotency_key: idempotency.key,
  });
  if (error) {
    console.error('[webhook] ingest failed:', error.code);
    return jsonError(500, 'Could not accept the webhook. Try again later.');
  }

  switch (data?.status) {
    case 'accepted': {
      const admin = createAdminClient();
      if (admin) {
        // Process right after responding (bounded). Without a secret key the job waits for
        // the next dashboard "Process queue" action or the daily cron.
        after(() =>
          processQueuedJobs({
            supabase: admin,
            workspaceId: data.workspace_id,
            limit: 3,
            workerId: 'webhook',
            ai: getAI(),
          }).catch((e) => console.error('[webhook] background processing failed:', e.message)),
        );
      }
      return NextResponse.json(
        { status: 'accepted', jobId: data.job_id, processing: admin ? 'started' : 'queued' },
        { status: 202 },
      );
    }
    case 'duplicate':
      return NextResponse.json({ status: 'duplicate', jobId: data.job_id }, { status: 200 });
    case 'invalid_payload':
      return jsonError(400, data.message ?? 'Invalid payload');
    case 'rate_limited':
      return jsonError(429, 'Rate limit exceeded for this webhook', {
        'Retry-After': String(data.retry_after ?? 60),
      });
    case 'inactive':
      return jsonError(409, 'This workflow is not active');
    default:
      return jsonError(401, UNAUTHORIZED);
  }
}

const notAllowed = () => methodNotAllowed('POST');
export { notAllowed as GET, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
