import { describe, expect, it } from 'vitest';
import { evaluateConditions } from '@/lib/workflow-engine/conditions';
import { getPath, interpolate, isValidPath, setVar } from '@/lib/workflow-engine/template';

const context = {
  lead: { name: 'Maya', score: 82, company: 'Northwind', tags: ['vip'], email: '' },
  steps: { score: { score: 82, grade: 'A' } },
  trigger: { payload: { plan: 'pro' } },
  vars: {},
};

describe('conditions', () => {
  it('evaluates numeric comparisons including numeric strings', () => {
    expect(
      evaluateConditions(
        { conditions: [{ field: 'steps.score.score', operator: 'gte', value: 70 }] },
        context,
      ).result,
    ).toBe(true);
    expect(
      evaluateConditions(
        { conditions: [{ field: 'lead.score', operator: 'lt', value: '50' }] },
        context,
      ).result,
    ).toBe(false);
  });

  it('supports all / any matching with a trace', () => {
    const conditions = [
      { field: 'lead.score', operator: 'gt', value: 90 },
      { field: 'lead.company', operator: 'contains', value: 'north' },
    ];
    const all = evaluateConditions({ match: 'all', conditions }, context);
    const any = evaluateConditions({ match: 'any', conditions }, context);
    expect(all.result).toBe(false);
    expect(any.result).toBe(true);
    expect(all.evaluated.map((e) => e.passed)).toEqual([false, true]);
  });

  it('handles exists / not_exists / in / eq case-insensitively', () => {
    const r = (c) => evaluateConditions({ conditions: [c] }, context).result;
    expect(r({ field: 'lead.email', operator: 'not_exists' })).toBe(true);
    expect(r({ field: 'lead.missing', operator: 'exists' })).toBe(false);
    expect(r({ field: 'trigger.payload.plan', operator: 'in', value: 'free, PRO' })).toBe(true);
    expect(r({ field: 'lead.name', operator: 'eq', value: 'maya' })).toBe(true);
    expect(r({ field: 'lead.tags', operator: 'contains', value: 'VIP' })).toBe(true);
    expect(r({ field: 'lead.score', operator: 'gt', value: 'abc' })).toBe(false);
  });
});

describe('template paths', () => {
  it('only resolves own properties under allowed roots', () => {
    expect(getPath(context, 'lead.name')).toBe('Maya');
    expect(getPath(context, 'lead.constructor')).toBeUndefined();
    expect(getPath(context, 'lead.__proto__')).toBeUndefined();
    expect(getPath({ process: { env: 1 } }, 'process.env')).toBeUndefined();
    expect(isValidPath('steps.score.score')).toBe(true);
    expect(isValidPath('lead["x"]')).toBe(false);
  });

  it('interpolates placeholders without evaluating code', () => {
    expect(interpolate('Hi {{lead.name}} ({{steps.score.grade}})', context)).toBe('Hi Maya (A)');
    expect(interpolate('{{ lead.missing }}!', context)).toBe('!');
    expect(interpolate('{{constructor.constructor("return 1")()}}', context)).toBe(
      '{{constructor.constructor("return 1")()}}',
    );
  });

  it('writes variables only under vars.*', () => {
    expect(setVar({}, 'vars.a.b', 1)).toEqual({ a: { b: 1 } });
    expect(() => setVar({}, 'lead.name', 'x')).toThrow();
  });
});
