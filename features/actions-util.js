import 'server-only';
import {
  AuthorizationError,
  NotFoundError,
  WorkflowValidationError,
} from '@/lib/workflow-engine/errors';

/** Flattens Zod issues into { field: message } for forms. */
export function fieldErrorsFrom(zodError) {
  const out = {};
  for (const issue of zodError.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const PG_MESSAGES = {
  23505: 'A record with these details already exists.',
  42501: 'You do not have permission to perform this action.',
  23514: 'Some values are outside the allowed range.',
  PGRST116: 'The requested record was not found.',
};

/** Converts thrown errors into a safe result object; never leaks stack traces or SQL. */
export function toActionError(error) {
  if (error instanceof AuthorizationError || error instanceof NotFoundError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof WorkflowValidationError) {
    return { ok: false, error: error.message, issues: error.issues };
  }
  if (error?.code && PG_MESSAGES[error.code]) return { ok: false, error: PG_MESSAGES[error.code] };
  if (error?.digest?.startsWith?.('NEXT_')) throw error; // let redirect()/notFound() propagate
  if (error?.name === 'ZodError') return { ok: false, error: 'Invalid input.' };
  console.error('[action] unexpected error:', error?.message ?? error);
  return {
    ok: false,
    error: error?.message?.slice(0, 300) || 'Something went wrong. Please try again.',
  };
}

// Codes our own SQL functions raise with user-facing messages (see supabase/migrations).
const USER_FACING_CODES = new Set(['22023', '54000', 'P0002']);

/** Wraps a Supabase { data, error } result, mapping known Postgres codes to friendly messages. */
export function unwrap({ data, error }, fallback = 'Database request failed') {
  if (error) {
    let message = PG_MESSAGES[error.code];
    if (!message && USER_FACING_CODES.has(error.code)) message = error.message;
    if (!message) {
      console.error(`[db] ${fallback}:`, error.code, error.message);
      message = `${fallback}. Please try again.`;
    }
    const err = new Error(message);
    err.code = error.code;
    throw err;
  }
  return data;
}
