// Execution and step state machines. Every status write goes through these guards.

const EXECUTION_TRANSITIONS = {
  pending: ['running', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const STEP_TRANSITIONS = {
  pending: ['running', 'skipped'],
  running: ['succeeded', 'failed', 'skipped'],
  succeeded: [],
  failed: [],
  skipped: [],
};

export const TERMINAL_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function canTransitionExecution(from, to) {
  return EXECUTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertExecutionTransition(from, to) {
  if (!canTransitionExecution(from, to)) {
    throw new Error(`Invalid execution status transition: ${from} → ${to}`);
  }
}

export function canTransitionStep(from, to) {
  return STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStepTransition(from, to) {
  if (!canTransitionStep(from, to)) {
    throw new Error(`Invalid step status transition: ${from} → ${to}`);
  }
}
