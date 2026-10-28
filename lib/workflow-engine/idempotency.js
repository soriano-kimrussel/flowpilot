// Idempotency keys.
//
// Execution level: callers may pass an Idempotency-Key header; it's stored with a unique
// constraint (workspace_id, idempotency_key) so the same request never creates two executions.
//
// Step level: side-effect steps get the key `<rootExecutionId>:<stepPath>`. Retries of an
// execution share the root ID, so a step that already succeeded in a previous attempt is
// replayed from its stored output instead of being executed again. A partial unique index on
// workflow_execution_steps enforces that a side effect is recorded as completed only once.

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

export function normalizeIdempotencyKey(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const key = String(raw).trim();
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      'Idempotency-Key must be 8-200 characters of letters, digits, ".", "_", ":" or "-"',
    );
  }
  return key;
}

export function stepIdempotencyKey(rootExecutionId, stepPath) {
  return `${rootExecutionId}:${stepPath}`.slice(0, 300);
}

export function rootExecutionIdOf(execution) {
  return execution.root_execution_id ?? execution.id;
}
