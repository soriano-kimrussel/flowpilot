/**
 * Safe path lookup and {{placeholder}} interpolation for workflow configs.
 * No code is evaluated: placeholders are dotted paths resolved against the execution context.
 */

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const PATH_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,8}$/;
const ALLOWED_ROOTS = new Set(['lead', 'trigger', 'steps', 'vars', 'workflow', 'execution']);
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]{1,200})\s*\}\}/g;

export function isValidPath(path) {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return false;
  const segments = path.split('.');
  if (!ALLOWED_ROOTS.has(segments[0])) return false;
  return segments.every((s) => !FORBIDDEN_SEGMENTS.has(s));
}

export function getPath(context, path) {
  if (!isValidPath(path)) return undefined;
  let current = context;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Writes into context.vars only. Returns a new vars object. */
export function setVar(vars, path, value) {
  if (!isValidPath(path) || !path.startsWith('vars.')) {
    throw new Error(`Transform targets must be paths under "vars." (got "${path}")`);
  }
  const segments = path.split('.').slice(1);
  const next = structuredClone(vars ?? {});
  let current = next;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
    } else {
      if (typeof current[segment] !== 'object' || current[segment] === null) current[segment] = {};
      current = current[segment];
    }
  });
  return next;
}

function stringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 500);
  return String(value);
}

export function interpolate(template, context, { maxLength = 2000 } = {}) {
  if (typeof template !== 'string') return template;
  const result = template.replace(PLACEHOLDER, (_, path) => stringify(getPath(context, path)));
  return result.length > maxLength ? result.slice(0, maxLength) : result;
}

/** Lists placeholder paths in a template so the validator can reject unknown roots. */
export function extractPlaceholders(template) {
  if (typeof template !== 'string') return [];
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]);
}
