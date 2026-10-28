// Workflow execution engine.
//
// Runs a validated, versioned definition step by step in deterministic order. All state lives in
// the injected `store` (PostgreSQL in production, in-memory in unit tests); nothing depends on
// process memory surviving between requests.

import { redact } from '@/lib/security/redact';
import { LIMITS } from './constants';
import { validateDefinition, walkSteps } from './definition';
import { ActionError, toErrorRecord } from './errors';
import { rootExecutionIdOf, stepIdempotencyKey } from './idempotency';
import { getAction } from './registry';
import { assertExecutionTransition } from './status';

class StepFailure extends Error {
  constructor(step, record) {
    super(`Step "${step.name || step.id}" failed: ${record.message}`);
    this.code = record.code;
    this.stepId = step.id;
  }
}

class ExecutionLimitError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

class CancelledError extends Error {}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms} ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} args
 * @param {object} args.execution  Persisted execution row (status 'pending').
 * @param {object} args.definition Workflow definition JSON from the saved version.
 * @param {object} args.workflow   { id, name }
 * @param {object} args.trigger    { type, payload }
 * @param {object|null} args.lead  Lead context for lead-based triggers / manual runs.
 * @param {object} args.store      Persistence adapter (see supabase-store.js).
 * @param {object} args.services   { ai, leads, notifications, integrations, actorId }
 */
export async function executeWorkflow({
  execution,
  definition,
  workflow,
  trigger,
  lead = null,
  store,
  services,
  limits = LIMITS,
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  const startedAt = now();
  const rootId = rootExecutionIdOf(execution);
  let status = execution.status;
  let position = 0;

  async function transition(to, patch = {}) {
    assertExecutionTransition(status, to);
    const ok = await store.transitionExecution(execution.id, status, to, patch);
    if (!ok) throw new CancelledError('Execution status changed externally');
    status = to;
  }

  async function finish(to, patch = {}) {
    const finishedAt = now();
    await transition(to, {
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: Math.max(0, finishedAt - startedAt),
      ...patch,
    });
    return { executionId: execution.id, status: to, durationMs: finishedAt - startedAt, ...patch };
  }

  // 1. Validate before doing anything.
  const validation = validateDefinition(definition);
  if (!validation.success) {
    const message = `Invalid workflow definition: ${validation.issues
      .slice(0, 3)
      .map((i) => `${i.path} ${i.message}`)
      .join('; ')}`;
    return finish('failed', {
      error_message: message.slice(0, 2000),
      error_code: 'INVALID_DEFINITION',
    });
  }
  const steps = validation.data.steps;

  const context = {
    workflow: { id: workflow.id, name: workflow.name },
    execution: { id: execution.id, attempt: execution.attempt ?? 1 },
    trigger: { type: trigger.type, payload: trigger.payload ?? {} },
    lead,
    steps: {},
    vars: {},
  };

  try {
    await transition('running', { started_at: new Date(startedAt).toISOString() });
  } catch (error) {
    if (error instanceof CancelledError) return { executionId: execution.id, status: 'cancelled' };
    throw error;
  }

  function checkLimits() {
    if (now() - startedAt > limits.MAX_EXECUTION_MS) {
      throw new ExecutionLimitError(
        `Execution exceeded the ${limits.MAX_EXECUTION_MS / 1000}s time limit`,
        'EXECUTION_TIMEOUT',
      );
    }
    if (position >= limits.MAX_STEPS) {
      throw new ExecutionLimitError(
        `Execution exceeded the ${limits.MAX_STEPS} step limit`,
        'STEP_LIMIT',
      );
    }
  }

  async function recordSkippedBranch(branchSteps, parentPath, reason) {
    const rows = [];
    walkSteps(branchSteps, (s, { path }) => {
      rows.push({ step: s, path: `${parentPath}.${path}` });
    });
    for (const { step, path } of rows) {
      await store.insertStep({
        execution_id: execution.id,
        step_id: step.id,
        step_type: step.type,
        step_path: path,
        position: position++,
        status: 'skipped',
        output: { reason },
        attempts: 0,
      });
    }
  }

  async function runStep(step, path) {
    checkLimits();
    if (await store.isExecutionCancelled(execution.id))
      throw new CancelledError('Execution was cancelled');

    const action = getAction(step.type);
    const idempotencyKey = action.sideEffect ? stepIdempotencyKey(rootId, path) : null;
    const stepStarted = now();
    const row = await store.insertStep({
      execution_id: execution.id,
      step_id: step.id,
      step_type: step.type,
      step_path: path,
      position: position++,
      status: 'running',
      input: redact({ config: step.config, leadId: context.lead?.id ?? null }),
      idempotency_key: idempotencyKey,
      started_at: new Date(stepStarted).toISOString(),
      attempts: 0,
    });

    // Idempotent replay: a side effect that already succeeded in an earlier attempt is not repeated.
    if (idempotencyKey) {
      const prior = await store.findSucceededSideEffect(idempotencyKey);
      if (prior && prior.execution_id !== execution.id) {
        let replay = {};
        try {
          if (action.onReplay) replay = await action.onReplay({ output: prior.output, services });
        } catch (error) {
          // e.g. the lead created by the earlier attempt was deleted; don't leave the row running.
          const record = {
            ...toErrorRecord(error),
            code: 'REPLAY_FAILED',
            message: `Could not reuse the result of the earlier attempt: ${toErrorRecord(error).message}`,
          };
          await store.transitionStep(row.id, 'running', 'failed', {
            error_message: record.message,
            error_code: record.code,
            finished_at: new Date(now()).toISOString(),
            duration_ms: Math.max(0, now() - stepStarted),
          });
          throw new StepFailure(step, record);
        }
        if (replay?.lead) context.lead = replay.lead;
        context.steps[step.id] = prior.output;
        await store.transitionStep(row.id, 'running', 'skipped', {
          output: prior.output,
          replayed_from_step_id: prior.id,
          error_message: null,
          finished_at: new Date(now()).toISOString(),
          duration_ms: Math.max(0, now() - stepStarted),
        });
        return { branch: null };
      }
    }

    const maxAttempts = Math.min(
      step.retry?.maxAttempts ?? (action.retryable ? 2 : 1),
      action.retryable ? limits.MAX_STEP_ATTEMPTS : 1,
    );

    let attempt = 0;
    let lastError;
    let result;
    let output;
    while (attempt < maxAttempts) {
      attempt += 1;
      // Each attempt only gets what is left of the execution budget, so retries can't overrun it.
      const budget = Math.min(
        limits.STEP_TIMEOUT_MS,
        limits.MAX_EXECUTION_MS - (now() - startedAt),
      );
      try {
        if (budget < 500) {
          throw new ExecutionLimitError(
            `Execution exceeded the ${limits.MAX_EXECUTION_MS / 1000}s time limit`,
            'EXECUTION_TIMEOUT',
          );
        }
        result = await withTimeout(
          action.run({ context, config: step.config, services, execution, step, idempotencyKey }),
          budget,
          `Step "${step.id}"`,
        );
        output = result?.output ?? {};
        const check = action.outputSchema.safeParse(output);
        if (!check.success) {
          throw new ActionError(`Action "${step.type}" produced output that failed validation`, {
            code: 'INVALID_OUTPUT',
          });
        }
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const record = toErrorRecord(error);
        const timeLeft = limits.MAX_EXECUTION_MS - (now() - startedAt);
        if (!record.retryable || attempt >= maxAttempts || timeLeft < 1000) break;
        await sleep(Math.min(250 * attempt, timeLeft - 750));
      }
    }

    if (!lastError) {
      // Persisting the result is outside the retry loop: a store error must not re-run the action.
      context.steps[step.id] = output;
      if (result?.lead) context.lead = result.lead;
      if (result?.vars) context.vars = result.vars;

      const finished = now();
      await store.transitionStep(row.id, 'running', 'succeeded', {
        output: redact(output),
        attempts: attempt,
        finished_at: new Date(finished).toISOString(),
        duration_ms: Math.max(0, finished - stepStarted),
      });
      return { branch: step.type === 'condition.evaluate' ? output.branch : null };
    }

    const record =
      lastError instanceof ExecutionLimitError
        ? { message: lastError.message, code: lastError.code, retryable: false }
        : toErrorRecord(lastError);
    const finished = now();
    await store.transitionStep(row.id, 'running', 'failed', {
      error_message: record.message,
      error_code: record.code,
      attempts: attempt,
      finished_at: new Date(finished).toISOString(),
      duration_ms: Math.max(0, finished - stepStarted),
    });

    if (step.onError === 'continue') {
      context.steps[step.id] = { error: { message: record.message, code: record.code } };
      return { branch: null };
    }
    throw new StepFailure(step, record);
  }

  async function runSteps(list, parentPath) {
    for (const step of list) {
      const path = parentPath ? `${parentPath}.${step.id}` : step.id;
      const { branch } = await runStep(step, path);
      if (step.type === 'condition.evaluate') {
        const taken = branch === 'then' ? (step.then ?? []) : (step.else ?? []);
        const skipped = branch === 'then' ? (step.else ?? []) : (step.then ?? []);
        const skippedName = branch === 'then' ? 'else' : 'then';
        if (skipped.length) {
          await recordSkippedBranch(
            skipped,
            `${path}.${skippedName}`,
            `Condition was ${branch === 'then'}; "${skippedName}" branch not taken`,
          );
        }
        await runSteps(taken, `${path}.${branch}`);
      }
    }
  }

  try {
    await runSteps(steps, '');
    return await finish('succeeded', { lead_id: context.lead?.id ?? execution.lead_id ?? null });
  } catch (error) {
    if (error instanceof CancelledError) {
      return { executionId: execution.id, status: 'cancelled' };
    }
    const record =
      error instanceof StepFailure || error instanceof ExecutionLimitError
        ? { message: error.message, code: error.code }
        : {
            message: `Unexpected engine error: ${toErrorRecord(error).message}`,
            code: 'INTERNAL_ERROR',
          };
    try {
      return await finish('failed', {
        error_message: record.message.slice(0, 2000),
        error_code: record.code,
        error_step_id: error.stepId ?? null,
        lead_id: context.lead?.id ?? execution.lead_id ?? null,
      });
    } catch (finishError) {
      if (finishError instanceof CancelledError)
        return { executionId: execution.id, status: 'cancelled' };
      throw finishError;
    }
  }
}
