// Logic and utility actions: no external effects, fully deterministic.
import { z } from 'zod';
import { evaluateConditions } from '../conditions';
import { actionConfigSchemas } from '../schemas';
import { getPath, interpolate, setVar } from '../template';

export const conditionEvaluate = {
  type: 'condition.evaluate',
  configSchema: actionConfigSchemas['condition.evaluate'],
  outputSchema: z.object({
    result: z.boolean(),
    match: z.enum(['all', 'any']),
    branch: z.enum(['then', 'else']),
    evaluated: z.array(
      z.object({ field: z.string(), operator: z.string(), passed: z.boolean() }).passthrough(),
    ),
  }),
  sideEffect: false,
  retryable: false,
  async run({ context, config }) {
    const evaluation = evaluateConditions(config, context);
    return { output: { ...evaluation, branch: evaluation.result ? 'then' : 'else' } };
  },
};

function applyOperation(op, context) {
  const source = op.from ? getPath(context, op.from) : undefined;
  switch (op.op) {
    case 'set':
      return op.value;
    case 'copy':
      return source ?? null;
    case 'lowercase':
      return source == null ? null : String(source).toLowerCase();
    case 'uppercase':
      return source == null ? null : String(source).toUpperCase();
    case 'trim':
      return source == null ? null : String(source).trim();
    case 'template':
      return interpolate(String(op.value), context, { maxLength: 1000 });
    case 'default':
      return source === undefined || source === null || source === '' ? op.value : source;
    case 'number': {
      const n = Number(source);
      return Number.isFinite(n) ? n : null;
    }
    default:
      return null;
  }
}

export const dataTransform = {
  type: 'data.transform',
  configSchema: actionConfigSchemas['data.transform'],
  outputSchema: z.object({ assigned: z.record(z.string(), z.unknown()) }),
  sideEffect: false,
  retryable: false,
  async run({ context, config }) {
    let vars = context.vars;
    const assigned = {};
    for (const op of config.operations) {
      // Each operation sees the results of earlier ones.
      const value = applyOperation(op, { ...context, vars });
      vars = setVar(vars, op.target, value);
      assigned[op.target] = value;
    }
    return { output: { assigned }, vars };
  },
};

export const executionLog = {
  type: 'execution.log',
  configSchema: actionConfigSchemas['execution.log'],
  outputSchema: z.object({ message: z.string(), level: z.enum(['info', 'warning', 'error']) }),
  sideEffect: false,
  retryable: false,
  async run({ context, config }) {
    return {
      output: {
        message: interpolate(config.message, context, { maxLength: 500 }),
        level: config.level,
      },
    };
  },
};
