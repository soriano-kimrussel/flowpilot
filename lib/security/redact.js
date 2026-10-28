// Redacts sensitive values before anything is persisted to execution logs.

const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|credential|private[-_]?key|ssn|card[-_]?number|cvv|signature/i;
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_STRING = 2000;

export function maskEmail(email) {
  const value = String(email ?? '');
  const at = value.indexOf('@');
  if (at < 1) return value ? '***' : '';
  return `${value[0]}***${value.slice(at)}`;
}

function redactValue(value, depth) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^(bearer|basic)\s+\S+/i.test(value) || /^sb_(secret|publishable)_/i.test(value))
      return '[REDACTED]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[max depth]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => redactValue(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`…${value.length - MAX_ARRAY} more`);
    return items;
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactValue(v, depth + 1);
  }
  return out;
}

/** Deep-copies and redacts; also caps total serialized size. */
export function redact(value, { maxBytes = 16_384 } = {}) {
  const cleaned = redactValue(value, 0);
  const json = JSON.stringify(cleaned ?? null);
  if (json && json.length > maxBytes) {
    return { truncated: true, preview: json.slice(0, Math.min(2000, maxBytes)) };
  }
  return cleaned ?? null;
}
