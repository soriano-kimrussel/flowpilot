// Workflow definition schema (version 1) and semantic validation. Client-safe.
import { z } from 'zod';
import { DEFINITION_VERSION, LIMITS, TRIGGER_TYPES } from './constants';
import { ACTION_TYPES, actionConfigSchemas, triggerConfigSchemas } from './schemas';
import { extractPlaceholders, isValidPath } from './template';

const STEP_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;

const baseStep = z
  .object({
    id: z.string().regex(STEP_ID, 'Step IDs use lowercase letters, digits, "-" or "_" (max 48)'),
    type: z.enum(ACTION_TYPES, { error: 'Unknown action type' }),
    name: z.string().trim().max(80).optional(),
    config: z.record(z.string(), z.unknown()).default({}),
    onError: z.enum(['stop', 'continue']).default('stop'),
    retry: z
      .object({ maxAttempts: z.number().int().min(1).max(LIMITS.MAX_STEP_ATTEMPTS) })
      .strict()
      .optional(),
  })
  .strict();

const stepSchema = baseStep
  .extend({
    then: z.lazy(() => z.array(stepSchema).max(LIMITS.MAX_TOP_LEVEL_STEPS)).optional(),
    else: z.lazy(() => z.array(stepSchema).max(LIMITS.MAX_TOP_LEVEL_STEPS)).optional(),
  })
  .strict();

export const definitionSchema = z
  .object({
    version: z.literal(DEFINITION_VERSION),
    trigger: z
      .object({
        type: z.enum(TRIGGER_TYPES, { error: 'Unknown trigger type' }),
        config: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
    steps: z.array(stepSchema).min(1, 'Add at least one step').max(LIMITS.MAX_TOP_LEVEL_STEPS),
  })
  .strict();

function zodIssues(error, prefix = []) {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path].join('.'),
    message: issue.message,
  }));
}

/** Walks all steps depth-first in execution order. */
export function walkSteps(steps, visit, depth = 1, parentPath = '') {
  steps.forEach((step, index) => {
    const path = parentPath ? `${parentPath}.${step.id}` : step.id;
    visit(step, { depth, index, path });
    if (step.then) walkSteps(step.then, visit, depth + 1, `${path}.then`);
    if (step.else) walkSteps(step.else, visit, depth + 1, `${path}.else`);
  });
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

/**
 * Validates structure (Zod), each action's config, and semantic rules:
 * unique IDs, total step and depth limits, branches only on conditions, valid placeholders,
 * and references to earlier steps.
 * Returns { success: true, data } with defaults applied, or { success: false, issues }.
 */
export function validateDefinition(input) {
  const parsed = definitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, issues: zodIssues(parsed.error) };

  const definition = parsed.data;
  const issues = [];

  const triggerSchema = triggerConfigSchemas[definition.trigger.type];
  const triggerResult = triggerSchema.safeParse(definition.trigger.config ?? {});
  if (triggerResult.success) definition.trigger.config = triggerResult.data;
  else issues.push(...zodIssues(triggerResult.error, ['trigger', 'config']));

  const seen = new Set();
  let total = 0;

  walkSteps(definition.steps, (step, { depth, path }) => {
    total += 1;
    const where = `steps.${path}`;

    if (seen.has(step.id)) issues.push({ path: where, message: `Duplicate step ID "${step.id}"` });
    if (depth > LIMITS.MAX_BRANCH_DEPTH) {
      issues.push({
        path: where,
        message: `Branches can be nested at most ${LIMITS.MAX_BRANCH_DEPTH} levels deep`,
      });
    }

    if (step.type !== 'condition.evaluate' && (step.then || step.else)) {
      issues.push({
        path: where,
        message: 'Only condition steps can have "then" / "else" branches',
      });
    }

    const configResult = actionConfigSchemas[step.type].safeParse(step.config ?? {});
    if (configResult.success) step.config = configResult.data;
    else issues.push(...zodIssues(configResult.error, [where, 'config']));

    for (const text of collectStrings(step.config)) {
      for (const placeholder of extractPlaceholders(text)) {
        if (!isValidPath(placeholder)) {
          issues.push({
            path: `${where}.config`,
            message: `Invalid placeholder {{${placeholder}}}`,
          });
        }
      }
    }

    if (
      step.type === 'email.demo_send' &&
      step.config?.draftStepId &&
      !seen.has(step.config.draftStepId)
    ) {
      issues.push({
        path: `${where}.config.draftStepId`,
        message: `Draft step "${step.config.draftStepId}" must exist and run before this step`,
      });
    }

    seen.add(step.id);
  });

  if (total > LIMITS.MAX_STEPS) {
    issues.push({
      path: 'steps',
      message: `A workflow can contain at most ${LIMITS.MAX_STEPS} steps (found ${total})`,
    });
  }

  const hasLeadCreate = (() => {
    let found = false;
    walkSteps(definition.steps, (s) => {
      if (s.type === 'lead.create') found = true;
    });
    return found;
  })();
  if (
    hasLeadCreate &&
    definition.trigger.type !== 'webhook' &&
    definition.trigger.type !== 'manual'
  ) {
    issues.push({
      path: 'steps',
      message: '"Create lead" is only available for webhook or manual triggers',
    });
  }

  return issues.length ? { success: false, issues } : { success: true, data: definition };
}

export function countSteps(definition) {
  let total = 0;
  walkSteps(definition?.steps ?? [], () => {
    total += 1;
  });
  return total;
}

export function emptyDefinition(triggerType = 'manual') {
  return {
    version: DEFINITION_VERSION,
    trigger: { type: triggerType, config: triggerType === 'schedule' ? { interval: 'daily' } : {} },
    steps: [],
  };
}
