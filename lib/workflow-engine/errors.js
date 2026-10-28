/**
 * Errors thrown by actions. `retryable` marks transient failures that may succeed on a retry
 * (timeouts, provider rate limits). Validation and configuration errors are never retryable.
 */
export class ActionError extends Error {
  constructor(message, { code = 'ACTION_FAILED', retryable = false, details } = {}) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export class TransientActionError extends ActionError {
  constructor(message, options = {}) {
    super(message, { code: 'TRANSIENT_ERROR', ...options, retryable: true });
    this.name = 'TransientActionError';
  }
}

export class WorkflowValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'WorkflowValidationError';
    this.code = 'INVALID_DEFINITION';
    this.issues = issues;
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'You do not have permission to perform this action') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = 'FORBIDDEN';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
  }
}

/** Converts any thrown value into a safe, user-presentable error record. */
export function toErrorRecord(error) {
  if (error instanceof ActionError || error instanceof WorkflowValidationError) {
    return {
      message: truncate(error.message),
      code: error.code,
      retryable: Boolean(error.retryable),
    };
  }
  if (error?.name === 'TimeoutError') {
    return { message: truncate(error.message), code: 'TIMEOUT', retryable: true };
  }
  // Unknown errors: keep the message (no stack traces) but mark as internal.
  return {
    message: truncate(error?.message || 'Unexpected error while running this step'),
    code: 'INTERNAL_ERROR',
    retryable: false,
  };
}

function truncate(text, max = 1500) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
