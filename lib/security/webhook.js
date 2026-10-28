// Webhook credential generation and request validation (server only).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { LIMITS } from '@/lib/workflow-engine/constants';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MAX_DEPTH = 5;
const MAX_KEYS = 100;

function base62(bytes) {
  return [...randomBytes(bytes)].map((b) => BASE62[b % 62]).join('');
}

export function hashSecret(secret) {
  return createHash('sha256').update(String(secret), 'utf8').digest('hex');
}

/** The secret is shown to the admin once; only its SHA-256 hash is stored. */
export function generateWebhookCredentials() {
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;
  return {
    publicId: `wh_${base62(24)}`,
    secret,
    secretHash: hashSecret(secret),
    secretHint: `…${secret.slice(-4)}`,
  };
}

export function isValidPublicId(value) {
  return typeof value === 'string' && /^wh_[A-Za-z0-9]{20,64}$/.test(value);
}

/** Reads the presented secret from `Authorization: Bearer` or `X-FlowPilot-Secret`. */
export function extractSecret(headers) {
  const auth = headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null;
  return headers.get('x-flowpilot-secret')?.trim() || null;
}

/** Constant-time comparison of a presented secret against a stored hash (used in tests/tools). */
export function verifySecret(secret, expectedHash) {
  if (!secret || !expectedHash) return false;
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(String(expectedHash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function measure(value, depth = 0, counter = { keys: 0 }) {
  if (depth > MAX_DEPTH) throw new Error(`Payload nesting exceeds ${MAX_DEPTH} levels`);
  if (Array.isArray(value)) value.forEach((v) => measure(v, depth + 1, counter));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      counter.keys += 1;
      if (counter.keys > MAX_KEYS) throw new Error(`Payload has more than ${MAX_KEYS} keys`);
      if (key === '__proto__' || key === 'constructor' || key === 'prototype')
        throw new Error('Payload contains a forbidden key');
      measure(v, depth + 1, counter);
    }
  }
}

/**
 * Validates method, content type, size and JSON shape before any database work happens.
 * Returns { ok: true, payload } or { ok: false, status, error }.
 */
export function validateWebhookRequest({ method, contentType, rawBody }) {
  if (method !== 'POST') return { ok: false, status: 405, error: 'Method not allowed. Use POST.' };
  if (
    !String(contentType ?? '')
      .toLowerCase()
      .startsWith('application/json')
  ) {
    return { ok: false, status: 415, error: 'Content-Type must be application/json' };
  }
  if (Buffer.byteLength(rawBody ?? '', 'utf8') > LIMITS.MAX_PAYLOAD_BYTES) {
    return { ok: false, status: 413, error: `Payload exceeds ${LIMITS.MAX_PAYLOAD_BYTES} bytes` };
  }
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: 'Body is not valid JSON' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, status: 400, error: 'Payload must be a JSON object' };
  }
  try {
    measure(payload);
  } catch (error) {
    return { ok: false, status: 400, error: error.message };
  }
  return { ok: true, payload };
}

export function validateIdempotencyHeader(value) {
  if (value === null || value === undefined || value === '') return { ok: true, key: null };
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value)) {
    return {
      ok: false,
      error: 'Idempotency-Key must be 1-200 characters of letters, digits, ".", "_", ":" or "-"',
    };
  }
  return { ok: true, key: value };
}
