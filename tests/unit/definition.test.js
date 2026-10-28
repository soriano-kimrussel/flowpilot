import { describe, expect, it } from 'vitest';
import { countSteps, validateDefinition } from '@/lib/workflow-engine/definition';
import { LIMITS } from '@/lib/workflow-engine/constants';

const valid = {
  version: 1,
  trigger: { type: 'lead.created', config: {} },
  steps: [
    { id: 'validate', type: 'lead.validate', config: {} },
    { id: 'score', type: 'lead.score', config: { persist: true } },
    { id: 'draft', type: 'ai.draft_reply', config: { tone: 'formal' } },
    {
      id: 'route',
      type: 'condition.evaluate',
      config: { conditions: [{ field: 'steps.score.score', operator: 'gte', value: 70 }] },
      then: [{ id: 'hot', type: 'lead.update', config: { status: 'qualified' } }],
      else: [{ id: 'cold', type: 'lead.update', config: { priority: 'low' } }],
    },
    { id: 'send', type: 'email.demo_send', config: { draftStepId: 'draft' } },
  ],
};

describe('workflow definition validation', () => {
  it('accepts a valid definition and applies config defaults', () => {
    const result = validateDefinition(valid);
    expect(result.success).toBe(true);
    expect(result.data.steps[0].config).toEqual({
      failOnInvalid: true,
      checkDuplicates: true,
      blockDuplicates: false,
      requireCompany: false,
    });
    expect(result.data.steps[2].config.senderName).toBe('The FlowPilot team');
    expect(result.data.steps[0].onError).toBe('stop');
    expect(countSteps(result.data)).toBe(7);
  });

  it('rejects unknown action types and triggers', () => {
    const r1 = validateDefinition({
      ...valid,
      steps: [{ id: 'x', type: 'shell.exec', config: {} }],
    });
    expect(r1.success).toBe(false);
    const r2 = validateDefinition({ ...valid, trigger: { type: 'cron.anything', config: {} } });
    expect(r2.success).toBe(false);
  });

  it('rejects unexpected keys such as inline code', () => {
    const result = validateDefinition({
      ...valid,
      steps: [
        { id: 'x', type: 'execution.log', config: { message: 'hi' }, code: 'process.exit()' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid action config', () => {
    const result = validateDefinition({
      ...valid,
      steps: [{ id: 'x', type: 'lead.update', config: {} }],
    });
    expect(result.success).toBe(false);
    expect(result.issues[0].message).toMatch(/at least one field/);
  });

  it('rejects duplicate step ids across branches', () => {
    const def = structuredClone(valid);
    def.steps[3].then[0].id = 'score';
    const result = validateDefinition(def);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Duplicate step ID'))).toBe(true);
  });

  it('only allows branches on condition steps', () => {
    const result = validateDefinition({
      ...valid,
      steps: [{ id: 'x', type: 'execution.log', config: { message: 'a' }, then: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects placeholders that escape the allowed context roots', () => {
    const result = validateDefinition({
      ...valid,
      steps: [{ id: 'x', type: 'execution.log', config: { message: 'hi {{process.env.SECRET}}' } }],
    });
    expect(result.success).toBe(false);
    expect(result.issues[0].message).toMatch(/Invalid placeholder/);
  });

  it('rejects prototype pollution paths in conditions', () => {
    const result = validateDefinition({
      ...valid,
      steps: [
        {
          id: 'c',
          type: 'condition.evaluate',
          config: { conditions: [{ field: 'lead.__proto__.x', operator: 'exists' }] },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('requires the email draft step to run earlier', () => {
    const def = structuredClone(valid);
    def.steps = [{ id: 'send', type: 'email.demo_send', config: { draftStepId: 'draft' } }];
    const result = validateDefinition(def);
    expect(result.success).toBe(false);
  });

  it('enforces the total step limit', () => {
    const many = Array.from({ length: LIMITS.MAX_TOP_LEVEL_STEPS }, (_, i) => ({
      id: `c${i}`,
      type: 'condition.evaluate',
      config: { conditions: [{ field: 'lead.score', operator: 'exists' }] },
      then: [{ id: `t${i}`, type: 'execution.log', config: { message: 'x' } }],
      else: [{ id: `e${i}`, type: 'execution.log', config: { message: 'y' } }],
    }));
    const result = validateDefinition({ ...valid, steps: many });
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.message.includes('at most'))).toBe(true);
  });

  it('enforces maximum branch depth', () => {
    const nest = (depth) =>
      depth === 0
        ? [{ id: 'leaf', type: 'execution.log', config: { message: 'x' } }]
        : [
            {
              id: `d${depth}`,
              type: 'condition.evaluate',
              config: { conditions: [{ field: 'lead.score', operator: 'exists' }] },
              then: nest(depth - 1),
            },
          ];
    const result = validateDefinition({ ...valid, steps: nest(LIMITS.MAX_BRANCH_DEPTH + 1) });
    expect(result.success).toBe(false);
  });

  it('validates trigger config', () => {
    expect(
      validateDefinition({
        ...valid,
        trigger: { type: 'schedule', config: { interval: 'weekly' } },
      }).success,
    ).toBe(false);
    const ok = validateDefinition({ ...valid, trigger: { type: 'schedule', config: {} } });
    expect(ok.success).toBe(true);
    expect(ok.data.trigger.config.interval).toBe('daily');
  });

  it('restricts lead.create to webhook and manual triggers', () => {
    const def = {
      version: 1,
      trigger: { type: 'lead.created', config: {} },
      steps: [{ id: 'c', type: 'lead.create', config: {} }],
    };
    expect(validateDefinition(def).success).toBe(false);
    expect(validateDefinition({ ...def, trigger: { type: 'webhook', config: {} } }).success).toBe(
      true,
    );
  });
});
