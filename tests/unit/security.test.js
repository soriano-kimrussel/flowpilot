import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/validation/auth';
import { escapeCsvCell, toCsv } from '@/lib/security/csv';
import { maskEmail, redact } from '@/lib/security/redact';
import { can, PERMISSIONS } from '@/lib/security/permissions';
import {
  extractSecret,
  generateWebhookCredentials,
  hashSecret,
  isValidPublicId,
  validateIdempotencyHeader,
  validateWebhookRequest,
  verifySecret,
} from '@/lib/security/webhook';
import { canonicalEmail, findDuplicateMatches } from '@/lib/leads/duplicates';
import {
  normalizeIdempotencyKey,
  rootExecutionIdOf,
  stepIdempotencyKey,
} from '@/lib/workflow-engine/idempotency';
import { canTransitionExecution, canTransitionStep } from '@/lib/workflow-engine/status';

describe('CSV export safety', () => {
  it('neutralizes formula injection', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell('+1234')).toBe("'+1234");
    expect(escapeCsvCell('-2')).toBe("'-2");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell('normal')).toBe('normal');
  });

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'say "hi"\nnow', c: null }],
      [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
        { key: 'c', header: 'C' },
      ],
    );
    expect(csv).toBe('A,B,C\r\n"x,y","say ""hi""\nnow",');
  });
});

describe('redaction', () => {
  it('redacts sensitive keys and bearer values recursively', () => {
    const out = redact({
      apiKey: 'abc',
      nested: {
        password: 'p',
        Authorization: 'Bearer xyz',
        ok: 'fine',
        list: [{ session_token: 't' }],
      },
      header: 'Bearer abc.def',
      key: 'sb_secret_123',
    });
    expect(out).toEqual({
      apiKey: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        Authorization: '[REDACTED]',
        ok: 'fine',
        list: [{ session_token: '[REDACTED]' }],
      },
      header: '[REDACTED]',
      key: '[REDACTED]',
    });
  });

  it('truncates oversized values', () => {
    expect(redact({ big: 'x'.repeat(50_000) }, { maxBytes: 1000 }).truncated).toBe(true);
    expect(maskEmail('maya@acme.example')).toBe('m***@acme.example');
  });
});

describe('webhook authentication', () => {
  it('generates unguessable credentials and stores only a hash', () => {
    const creds = generateWebhookCredentials();
    expect(isValidPublicId(creds.publicId)).toBe(true);
    expect(creds.secret).toMatch(/^whsec_/);
    expect(creds.secretHash).toBe(hashSecret(creds.secret));
    expect(creds.secretHash).not.toContain(creds.secret);
    expect(verifySecret(creds.secret, creds.secretHash)).toBe(true);
    expect(verifySecret('whsec_wrong', creds.secretHash)).toBe(false);
    expect(verifySecret('', creds.secretHash)).toBe(false);
    expect(generateWebhookCredentials().publicId).not.toBe(creds.publicId);
  });

  it('reads the secret from Authorization or X-FlowPilot-Secret', () => {
    expect(extractSecret(new Headers({ Authorization: 'Bearer whsec_a' }))).toBe('whsec_a');
    expect(extractSecret(new Headers({ 'X-FlowPilot-Secret': 'whsec_b' }))).toBe('whsec_b');
    expect(extractSecret(new Headers())).toBeNull();
  });

  it('rejects wrong methods, content types, oversized and malformed payloads', () => {
    const base = {
      method: 'POST',
      contentType: 'application/json',
      rawBody: '{"name":"A","email":"a@b.example"}',
    };
    expect(validateWebhookRequest(base)).toMatchObject({ ok: true, payload: { name: 'A' } });
    expect(validateWebhookRequest({ ...base, method: 'GET' }).status).toBe(405);
    expect(validateWebhookRequest({ ...base, contentType: 'text/plain' }).status).toBe(415);
    expect(
      validateWebhookRequest({ ...base, rawBody: `{"a":"${'x'.repeat(40_000)}"}` }).status,
    ).toBe(413);
    expect(validateWebhookRequest({ ...base, rawBody: '{oops' }).status).toBe(400);
    expect(validateWebhookRequest({ ...base, rawBody: '[1,2]' }).status).toBe(400);
    expect(validateWebhookRequest({ ...base, rawBody: '{"__proto__":{"x":1}}' }).status).toBe(400);
    const deep = '{"a":{"b":{"c":{"d":{"e":{"f":{"g":1}}}}}}}';
    expect(validateWebhookRequest({ ...base, rawBody: deep }).status).toBe(400);
  });

  it('validates idempotency headers', () => {
    expect(validateIdempotencyHeader('order-123').ok).toBe(true);
    expect(validateIdempotencyHeader('bad key with spaces').ok).toBe(false);
    expect(validateIdempotencyHeader(null)).toEqual({ ok: true, key: null });
  });
});

describe('lead list filters', () => {
  it('treats empty form fields as no filter and rejects junk', async () => {
    const { leadFilterSchema } = await import('@/lib/validation/lead');
    expect(leadFilterSchema.parse({ minScore: '', status: '', page: '' })).toMatchObject({
      minScore: undefined,
      status: undefined,
      page: 1,
    });
    expect(leadFilterSchema.parse({ minScore: '70', sort: 'score_desc' })).toMatchObject({
      minScore: 70,
      sort: 'score_desc',
    });
    expect(leadFilterSchema.parse({ minScore: '999', sort: 'drop table' })).toMatchObject({
      minScore: undefined,
      sort: 'created_desc',
    });
  });
});

describe('role permissions', () => {
  it('lets members run workflows but not edit them or integrations', () => {
    expect(can('member', 'workflow.run')).toBe(true);
    expect(can('member', 'workflow.edit')).toBe(false);
    expect(can('member', 'integration.edit')).toBe(false);
    expect(can('admin', 'workflow.edit')).toBe(true);
    expect(can('admin', 'workspace.delete')).toBe(false);
    expect(can('owner', 'workspace.delete')).toBe(true);
    expect(can(undefined, 'workflow.run')).toBe(false);
    expect(can('owner', 'unknown.permission')).toBe(false);
    for (const roles of Object.values(PERMISSIONS)) expect(roles).toContain('owner');
  });
});

describe('duplicate lead detection', () => {
  it('normalizes plus-tags and gmail dots', () => {
    expect(canonicalEmail('Jane.Doe+promo@GoogleMail.com')).toBe('janedoe@gmail.com');
    expect(canonicalEmail('jane.doe+x@acme.example')).toBe('jane.doe@acme.example');
  });

  it('finds exact, equivalent and name+company matches but not the lead itself', () => {
    const rows = [
      { id: '1', name: 'Jane Doe', email: 'jane@acme.example', company: 'Acme' },
      { id: '2', name: 'J', email: 'j.ane+news@gmail.com', company: '' },
      { id: '3', name: 'Bob Stone', email: 'bob@stone.example', company: 'Stone LLC' },
      { id: 'self', name: 'Jane Doe', email: 'jane@acme.example', company: 'Acme' },
    ];
    expect(
      findDuplicateMatches(
        { id: 'self', email: 'JANE@acme.example', name: 'x', company: 'y' },
        rows,
      ),
    ).toEqual([{ id: '1', name: 'Jane Doe', reason: 'same email' }]);
    expect(findDuplicateMatches({ email: 'jane@gmail.com' }, rows)[0]).toMatchObject({
      id: '2',
      reason: 'equivalent email address',
    });
    expect(
      findDuplicateMatches(
        { email: 'other@x.example', name: 'bob stone', company: 'Stone' },
        rows,
      )[0],
    ).toMatchObject({
      id: '3',
      reason: 'same name and company',
    });
    expect(
      findDuplicateMatches({ email: 'new@new.example', name: 'New', company: 'New' }, rows),
    ).toEqual([]);
  });
});

describe('idempotency and state machine helpers', () => {
  it('builds step keys from the root execution id', () => {
    expect(rootExecutionIdOf({ id: 'b', root_execution_id: 'a' })).toBe('a');
    expect(rootExecutionIdOf({ id: 'b', root_execution_id: null })).toBe('b');
    expect(stepIdempotencyKey('a', 'route.then.notify')).toBe('a:route.then.notify');
    expect(normalizeIdempotencyKey(undefined)).toBeNull();
    expect(() => normalizeIdempotencyKey('x')).toThrow();
    expect(normalizeIdempotencyKey('  request-12345 ')).toBe('request-12345');
  });

  it('allows only valid transitions', () => {
    expect(canTransitionExecution('pending', 'running')).toBe(true);
    expect(canTransitionExecution('running', 'succeeded')).toBe(true);
    expect(canTransitionExecution('succeeded', 'running')).toBe(false);
    expect(canTransitionExecution('failed', 'succeeded')).toBe(false);
    expect(canTransitionExecution('pending', 'succeeded')).toBe(false);
    expect(canTransitionStep('running', 'skipped')).toBe(true);
    expect(canTransitionStep('succeeded', 'failed')).toBe(false);
  });
});

describe('safeRedirectPath', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeRedirectPath('/dashboard/leads?page=2#top')).toBe('/dashboard/leads?page=2#top');
  });

  it('rejects absolute, protocol-relative and browser-normalised redirects', () => {
    for (const value of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r\n/evil.com',
      'dashboard',
      undefined,
    ]) {
      expect(safeRedirectPath(value)).toBe('/dashboard');
    }
  });
});
