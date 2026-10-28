import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();

vi.mock('@/lib/supabase/anon', () => ({ createAnonClient: () => ({ rpc }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => null }));
vi.mock('@/features/ai', () => ({ getAI: () => ({}) }));
vi.mock('@/features/auth/session', () => ({ getSession: () => getSession() }));

const { POST: webhookPost, GET: webhookGet } =
  await import('@/app/api/webhooks/[endpointId]/route');
const { POST: runPost } = await import('@/app/api/workflows/[id]/run/route');

const PUBLIC_ID = 'wh_ABCDEFGHIJKLMNOPQRSTuv12';
const params = (value) => ({ params: Promise.resolve(value) });

function webhookRequest({
  secret = 'whsec_abc',
  body = '{"email":"a@b.example"}',
  contentType = 'application/json',
  headers = {},
} = {}) {
  return new Request(`http://localhost/api/webhooks/${PUBLIC_ID}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      ...headers,
    },
    body,
  });
}

beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset();
});

describe('webhook route authentication and validation', () => {
  it('rejects malformed endpoint ids and missing secrets with 401 before touching the database', async () => {
    expect((await webhookPost(webhookRequest(), params({ endpointId: '1234' }))).status).toBe(401);
    expect(
      (await webhookPost(webhookRequest({ secret: null }), params({ endpointId: PUBLIC_ID })))
        .status,
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects wrong content types, malformed JSON and bad idempotency keys', async () => {
    expect(
      (
        await webhookPost(
          webhookRequest({ contentType: 'text/plain' }),
          params({ endpointId: PUBLIC_ID }),
        )
      ).status,
    ).toBe(415);
    expect(
      (await webhookPost(webhookRequest({ body: '{nope' }), params({ endpointId: PUBLIC_ID })))
        .status,
    ).toBe(400);
    expect(
      (
        await webhookPost(
          webhookRequest({ headers: { 'idempotency-key': 'has spaces' } }),
          params({ endpointId: PUBLIC_ID }),
        )
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends only the secret hash to the database and returns 202 when accepted', async () => {
    rpc.mockResolvedValue({
      data: { status: 'accepted', job_id: 'job-1', workspace_id: 'ws-internal' },
      error: null,
    });
    const res = await webhookPost(
      webhookRequest({ headers: { 'idempotency-key': 'order-42' } }),
      params({ endpointId: PUBLIC_ID }),
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ status: 'accepted', jobId: 'job-1', processing: 'queued' });
    expect(JSON.stringify(body)).not.toContain('ws-internal');
    expect(rpc).toHaveBeenCalledWith('ingest_webhook', {
      p_public_id: PUBLIC_ID,
      p_secret_hash: createHash('sha256').update('whsec_abc').digest('hex'),
      p_payload: { email: 'a@b.example' },
      p_idempotency_key: 'order-42',
    });
  });

  it.each([
    [{ status: 'unauthorized' }, 401],
    [{ status: 'duplicate', job_id: 'j' }, 200],
    [{ status: 'invalid_payload', message: 'Missing required field: email' }, 400],
    [{ status: 'inactive' }, 409],
  ])('maps %o to HTTP %i', async (data, status) => {
    rpc.mockResolvedValue({ data, error: null });
    expect((await webhookPost(webhookRequest(), params({ endpointId: PUBLIC_ID }))).status).toBe(
      status,
    );
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    rpc.mockResolvedValue({ data: { status: 'rate_limited', retry_after: 60 }, error: null });
    const res = await webhookPost(webhookRequest(), params({ endpointId: PUBLIC_ID }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('rejects non-POST methods', async () => {
    expect((await webhookGet()).status).toBe(405);
  });
});

/** Minimal chainable stand-in for the Supabase query builder, scoped by workspace. */
function fakeSupabase({ workflows = [], executionsCount = 0 }) {
  return {
    from(table) {
      const filters = {};
      const builder = {
        select: () => builder,
        eq: (col, value) => ((filters[col] = value), builder),
        gte: () => builder,
        maybeSingle: async () => ({
          data:
            workflows.find((w) => w.id === filters.id && w.workspace_id === filters.workspace_id) ??
            null,
          error: null,
        }),
        then: (resolve) =>
          resolve({ count: table === 'workflow_executions' ? executionsCount : 0, error: null }),
      };
      return builder;
    },
  };
}

describe('manual run route authorization', () => {
  const workflowId = '11111111-1111-4111-8111-111111111111';
  const runRequest = (body = {}) =>
    new Request(`http://localhost/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('requires authentication', async () => {
    getSession.mockResolvedValue(null);
    expect((await runPost(runRequest(), params({ id: workflowId }))).status).toBe(401);
  });

  it('returns 404 for invalid ids', async () => {
    getSession.mockResolvedValue({
      workspaceId: 'ws-a',
      role: 'member',
      user: { id: 'u' },
      supabase: fakeSupabase({}),
    });
    expect((await runPost(runRequest(), params({ id: 'not-a-uuid' }))).status).toBe(404);
  });

  it('denies users without a role in the workspace', async () => {
    getSession.mockResolvedValue({
      workspaceId: 'ws-a',
      role: null,
      user: { id: 'u' },
      supabase: fakeSupabase({}),
    });
    expect((await runPost(runRequest(), params({ id: workflowId }))).status).toBe(403);
  });

  it('cannot run a workflow that belongs to another workspace', async () => {
    const supabase = fakeSupabase({
      workflows: [
        {
          id: workflowId,
          workspace_id: 'ws-b',
          name: 'B only',
          status: 'active',
          current_version_id: 'v',
        },
      ],
    });
    getSession.mockResolvedValue({
      workspaceId: 'ws-a',
      role: 'owner',
      user: { id: 'u' },
      supabase,
    });
    const res = await runPost(runRequest(), params({ id: workflowId }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Workflow not found');
  });

  it('rejects unexpected body fields and rate limits bursts', async () => {
    getSession.mockResolvedValue({
      workspaceId: 'ws-a',
      role: 'member',
      user: { id: 'u' },
      supabase: fakeSupabase({}),
    });
    expect(
      (await runPost(runRequest({ workspaceId: 'ws-b' }), params({ id: workflowId }))).status,
    ).toBe(400);
    getSession.mockResolvedValue({
      workspaceId: 'ws-a',
      role: 'member',
      user: { id: 'u' },
      supabase: fakeSupabase({ executionsCount: 20 }),
    });
    expect((await runPost(runRequest(), params({ id: workflowId }))).status).toBe(429);
  });
});
