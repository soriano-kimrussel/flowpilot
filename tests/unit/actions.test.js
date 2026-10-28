import { beforeEach, describe, expect, it } from 'vitest';
import { getAction, listActionTypes } from '@/lib/workflow-engine/registry';
import { ACTION_TYPES } from '@/lib/workflow-engine/schemas';
import { ACTION_CATALOG } from '@/lib/workflow-engine/catalog';
import { createMemoryServices, sampleLead } from '../helpers/memory';

const execution = { id: 'exec-test', attempt: 1 };

function ctx(overrides = {}) {
  return {
    lead: { ...sampleLead },
    steps: {},
    vars: {},
    trigger: { type: 'manual', payload: {} },
    ...overrides,
  };
}

async function run(type, { context = ctx(), config = {}, services, idempotencyKey } = {}) {
  const action = getAction(type);
  const parsedConfig = action.configSchema.parse(config);
  const result = await action.run({
    context,
    config: parsedConfig,
    services,
    execution,
    idempotencyKey,
  });
  expect(action.outputSchema.safeParse(result.output).success).toBe(true);
  return result;
}

let services;
beforeEach(() => {
  services = createMemoryServices({ leads: [sampleLead] });
});

describe('action registry', () => {
  it('registers exactly the 13 supported actions, each with schemas and catalog metadata', () => {
    expect(listActionTypes().sort()).toEqual([...ACTION_TYPES].sort());
    expect(listActionTypes()).toHaveLength(13);
    for (const type of listActionTypes()) {
      const action = getAction(type);
      expect(action.configSchema).toBeDefined();
      expect(action.outputSchema).toBeDefined();
      expect(typeof action.run).toBe('function');
      expect(ACTION_CATALOG[type]?.label).toBeTruthy();
    }
  });

  it('throws for unknown actions', () => {
    expect(() => getAction('eval')).toThrow(/Unknown action/);
  });
});

describe('lead.validate', () => {
  it('passes a valid lead and reports duplicates', async () => {
    services = createMemoryServices({
      leads: [
        sampleLead,
        { id: 'dupe', name: 'M. Chen', email: 'MAYA.CHEN@northwind.example', company: 'x' },
      ],
    });
    const { output } = await run('lead.validate', { services });
    expect(output.valid).toBe(true);
    expect(output.duplicate.isDuplicate).toBe(true);
    expect(output.duplicate.matches[0].id).toBe('dupe');
  });

  it('fails invalid leads with an actionable message', async () => {
    const context = ctx({ lead: { id: 'l2', name: '', email: 'not-an-email' } });
    await expect(run('lead.validate', { context, services })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringMatching(
        /Name is missing; Email "not-an-email" is not a valid address/,
      ),
    });
  });

  it('rejects disposable domains and can return invalid without failing', async () => {
    const context = ctx({ lead: { id: 'l3', name: 'Bob', email: 'bob@mailinator.com' } });
    const { output } = await run('lead.validate', {
      context,
      services,
      config: { failOnInvalid: false },
    });
    expect(output.valid).toBe(false);
    expect(output.issues).toContain('Email uses a disposable domain');
  });

  it('validates the trigger payload when no lead exists yet', async () => {
    const context = ctx({
      lead: null,
      trigger: {
        type: 'webhook',
        payload: { fullName: 'Ann Lee', emailAddress: 'ann@acme.example' },
      },
    });
    const { output } = await run('lead.validate', { context, services });
    expect(output.subject).toBe('payload');
    expect(output.valid).toBe(true);
  });

  it('blocks duplicates when configured', async () => {
    services = createMemoryServices({
      leads: [
        sampleLead,
        {
          id: 'd',
          name: 'Maya Chen',
          email: 'maya.chen+x@northwind.example',
          company: 'Northwind Logistics',
        },
      ],
    });
    await expect(
      run('lead.validate', { services, config: { blockDuplicates: true } }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_LEAD' });
  });
});

describe('lead.create', () => {
  it('creates a lead from a webhook payload and reuses existing emails', async () => {
    const context = ctx({
      lead: null,
      trigger: {
        type: 'webhook',
        payload: { name: 'Ann Lee', email: 'ANN@acme.example', company_size: '40' },
      },
    });
    const first = await run('lead.create', { context, services });
    expect(first.output.created).toBe(true);
    expect(first.lead.email).toBe('ann@acme.example');
    expect(first.lead.company_size).toBe(40);

    const second = await run('lead.create', { context: { ...context, lead: null }, services });
    expect(second.output.created).toBe(false);
    expect(second.output.leadId).toBe(first.output.leadId);
  });

  it('fails on duplicates when onDuplicate=fail and on invalid payloads', async () => {
    const dupe = ctx({
      lead: null,
      trigger: { type: 'webhook', payload: { name: 'Maya', email: sampleLead.email } },
    });
    await expect(
      run('lead.create', { context: dupe, services, config: { onDuplicate: 'fail' } }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_LEAD' });
    const bad = ctx({ lead: null, trigger: { type: 'webhook', payload: { name: 'X' } } });
    await expect(run('lead.create', { context: bad, services })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('lead.update', () => {
  it('updates allowed fields, interpolates templates and logs activity', async () => {
    const context = ctx({ steps: { score: { score: 91 } } });
    const { output, lead } = await run('lead.update', {
      context,
      services,
      config: {
        status: 'qualified',
        assignee: 'AE for {{lead.company}}',
        appendNote: 'Scored {{steps.score.score}}',
      },
    });
    expect(output.changes).toMatchObject({
      status: 'qualified',
      assignee: 'AE for Northwind Logistics',
    });
    expect(lead.notes).toContain('Scored 91');
    expect(services.data.activities[0].type).toBe('workflow_update');
  });

  it('requires a lead', async () => {
    await expect(
      run('lead.update', { context: ctx({ lead: null }), services, config: { status: 'won' } }),
    ).rejects.toMatchObject({ code: 'LEAD_REQUIRED' });
  });
});

describe('AI lead actions (demo provider)', () => {
  it('lead.score returns an explainable, persisted score', async () => {
    const { output, lead } = await run('lead.score', { services });
    expect(output.score).toBeGreaterThanOrEqual(75);
    expect(output.factors.length).toBeGreaterThan(3);
    expect(output.explanation).toMatch(/Score \d+\/100/);
    expect(output.ai).toMatchObject({ provider: 'demo', simulated: true });
    expect(lead.score).toBe(output.score);
    expect(services.data.leadRows.get(sampleLead.id).score_details.factors).toBeDefined();
  });

  it('lead.score with persist=false does not write', async () => {
    await run('lead.score', { services, config: { persist: false } });
    expect(services.data.calls.update).toBe(0);
  });

  it('lead.classify returns segment, category and intent', async () => {
    const { output } = await run('lead.classify', { services });
    expect(output).toMatchObject({
      segment: 'enterprise',
      category: 'sales_inquiry',
      intent: 'high',
    });
  });

  it('lead.summarize labels the persisted summary as rule-based', async () => {
    const { output } = await run('lead.summarize', { services });
    expect(output.summary).toContain('Maya Chen');
    expect(services.data.leadRows.get(sampleLead.id).ai_summary).toMatch(/^\[Rule-based summary\]/);
  });

  it('ai.draft_reply drafts a personalized email', async () => {
    const { output } = await run('ai.draft_reply', {
      services,
      config: { tone: 'formal', senderName: 'Ana' },
    });
    expect(output.body).toMatch(/^Dear Maya,/);
    expect(output.body).toContain('Ana');
    expect(output.subject).toContain('Northwind Logistics');
  });
});

describe('logic and utility actions', () => {
  it('condition.evaluate picks a branch', async () => {
    const { output } = await run('condition.evaluate', {
      services,
      config: { conditions: [{ field: 'lead.budget', operator: 'gte', value: 10000 }] },
    });
    expect(output).toMatchObject({ result: true, branch: 'then' });
  });

  it('data.transform applies safe operations in order', async () => {
    const context = ctx({ lead: { ...sampleLead, company: '  Northwind  ' } });
    const { vars, output } = await run('data.transform', {
      context,
      services,
      config: {
        operations: [
          { op: 'trim', target: 'vars.company', from: 'lead.company' },
          { op: 'template', target: 'vars.greeting', value: 'Hello {{vars.company}}' },
          { op: 'default', target: 'vars.phone', from: 'lead.phone', value: 'n/a' },
          { op: 'number', target: 'vars.size', from: 'lead.company_size' },
        ],
      },
    });
    expect(vars).toEqual({
      company: 'Northwind',
      greeting: 'Hello Northwind',
      phone: 'n/a',
      size: 420,
    });
    expect(Object.keys(output.assigned)).toHaveLength(4);
  });

  it('execution.log interpolates the message', async () => {
    const { output } = await run('execution.log', {
      services,
      config: { message: 'Lead {{lead.name}}' },
    });
    expect(output).toEqual({ message: 'Lead Maya Chen', level: 'info' });
  });

  it('notification.create uses the idempotency key', async () => {
    const config = { title: 'Hot lead {{lead.name}}', audience: 'admins' };
    await run('notification.create', { services, config, idempotencyKey: 'root:notify' });
    await run('notification.create', { services, config, idempotencyKey: 'root:notify' });
    expect(services.data.notifications).toHaveLength(1);
    expect(services.data.notifications[0].title).toBe('Hot lead Maya Chen');
  });
});

describe('simulated integrations', () => {
  it('crm.demo_sync is clearly simulated and makes no request', async () => {
    const { output } = await run('crm.demo_sync', { services });
    expect(output.simulated).toBe(true);
    expect(output.note).toMatch(/no external request/i);
    expect(output.externalId).toMatch(/^demo-crm-contact-/);
    expect(services.data.activities[0].type).toBe('crm_sync_simulated');
  });

  it('crm.demo_sync fails with an actionable error when the integration is disabled', async () => {
    services = createMemoryServices({ leads: [sampleLead], integrations: { demo_crm: false } });
    await expect(run('crm.demo_sync', { services })).rejects.toMatchObject({
      code: 'INTEGRATION_DISABLED',
      message: expect.stringMatching(/Enable it under Integrations/),
    });
  });

  it('email.demo_send uses a draft step and masks the recipient', async () => {
    const context = ctx({ steps: { draft: { subject: 'Hello', body: 'Body text here' } } });
    const { output } = await run('email.demo_send', {
      context,
      services,
      config: { draftStepId: 'draft' },
    });
    expect(output.simulated).toBe(true);
    expect(output.to).toBe('m***@northwind.example');
    expect(services.data.activities[0]).toMatchObject({ type: 'email_simulated' });
  });

  it('email.demo_send fails when the draft is missing', async () => {
    await expect(
      run('email.demo_send', { services, config: { draftStepId: 'draft' } }),
    ).rejects.toMatchObject({ code: 'MISSING_INPUT' });
  });
});
