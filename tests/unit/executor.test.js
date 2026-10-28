import { describe, expect, it, vi } from 'vitest';
import { executeWorkflow } from '@/lib/workflow-engine/executor';
import { TransientActionError } from '@/lib/workflow-engine/errors';
import { createDemoProvider } from '@/lib/ai/demo-provider';
import { createMemoryServices, createMemoryStore, sampleLead } from '../helpers/memory';

const workflow = { id: 'wf-1', name: 'Qualification' };
const noSleep = async () => {};

const qualification = {
  version: 1,
  trigger: { type: 'lead.created', config: {} },
  steps: [
    { id: 'validate', type: 'lead.validate', config: {} },
    { id: 'score', type: 'lead.score', config: {} },
    { id: 'draft', type: 'ai.draft_reply', config: {} },
    {
      id: 'route',
      type: 'condition.evaluate',
      config: { conditions: [{ field: 'steps.score.score', operator: 'gte', value: 70 }] },
      then: [
        { id: 'hot', type: 'lead.update', config: { status: 'qualified', assignee: 'Senior AE' } },
      ],
      else: [{ id: 'cold', type: 'lead.update', config: { status: 'contacted' } }],
    },
    { id: 'crm', type: 'crm.demo_sync', config: {}, onError: 'continue' },
    { id: 'send', type: 'email.demo_send', config: { draftStepId: 'draft' } },
    { id: 'log', type: 'execution.log', config: { message: 'Done {{steps.score.score}}' } },
  ],
};

function setup({ definition = qualification, lead = sampleLead, services, store } = {}) {
  store ??= createMemoryStore();
  services ??= createMemoryServices({ leads: lead ? [lead] : [] });
  const execution = store.addExecution({ workflow_id: workflow.id });
  return { store, services, execution, definition, lead };
}

async function run({ store, services, execution, definition, lead }, extra = {}) {
  return executeWorkflow({
    execution,
    definition,
    workflow,
    trigger: { type: 'lead.created', payload: { lead_id: lead?.id } },
    lead: lead ? { ...lead } : null,
    store,
    services,
    sleep: noSleep,
    ...extra,
  });
}

describe('executor: happy path and branching', () => {
  it('runs all steps in order, takes the right branch and records skipped steps', async () => {
    const env = setup();
    const result = await run(env);
    expect(result.status).toBe('succeeded');

    const steps = env.store.stepsFor(env.execution.id);
    expect(steps.map((s) => `${s.step_path}:${s.status}`)).toEqual([
      'validate:succeeded',
      'score:succeeded',
      'draft:succeeded',
      'route:succeeded',
      'route.else.cold:skipped',
      'route.then.hot:succeeded',
      'crm:succeeded',
      'send:succeeded',
      'log:succeeded',
    ]);
    expect(env.services.data.leadRows.get(sampleLead.id)).toMatchObject({
      status: 'qualified',
      assignee: 'Senior AE',
    });
    expect(env.store.executions.get(env.execution.id)).toMatchObject({
      status: 'succeeded',
      lead_id: sampleLead.id,
    });
    expect(steps.at(-1).output.message).toMatch(/^Done \d+$/);
  });

  it('takes the else branch for low scores', async () => {
    const cold = {
      id: 'lead-cold',
      name: 'Tom',
      email: 'tom@gmail.com',
      message: 'student research assignment',
    };
    const env = setup({ lead: cold });
    await run(env);
    const paths = env.store.stepsFor(env.execution.id).map((s) => `${s.step_path}:${s.status}`);
    expect(paths).toContain('route.else.cold:succeeded');
    expect(paths).toContain('route.then.hot:skipped');
  });

  it('records state transitions pending → running → succeeded with timing', async () => {
    const env = setup();
    const spy = vi.spyOn(env.store, 'transitionExecution');
    await run(env);
    expect(spy.mock.calls.map((c) => `${c[1]}->${c[2]}`)).toEqual([
      'pending->running',
      'running->succeeded',
    ]);
    const exec = env.store.executions.get(env.execution.id);
    expect(exec.started_at).toBeTruthy();
    expect(exec.finished_at).toBeTruthy();
    expect(exec.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('executor: failures', () => {
  it('fails the execution with the failing step and an actionable message', async () => {
    const bad = { id: 'lead-bad', name: '', email: 'nope' };
    const env = setup({ lead: bad });
    const result = await run(env);
    expect(result.status).toBe('failed');
    const exec = env.store.executions.get(env.execution.id);
    expect(exec).toMatchObject({
      status: 'failed',
      error_code: 'VALIDATION_FAILED',
      error_step_id: 'validate',
    });
    expect(exec.error_message).toMatch(/Step "validate" failed: Lead failed validation/);
    expect(env.store.stepsFor(env.execution.id)).toHaveLength(1);
  });

  it('continues past a failing step when onError=continue', async () => {
    const services = createMemoryServices({
      leads: [sampleLead],
      integrations: { demo_crm: false, demo_email: true },
    });
    const env = setup({ services });
    const result = await run(env);
    expect(result.status).toBe('succeeded');
    const crm = env.store.stepsFor(env.execution.id).find((s) => s.step_id === 'crm');
    expect(crm).toMatchObject({ status: 'failed', error_code: 'INTEGRATION_DISABLED' });
  });

  it('fails invalid definitions before running anything', async () => {
    const env = setup({
      definition: {
        version: 1,
        trigger: { type: 'manual', config: {} },
        steps: [{ id: 'x', type: 'nope' }],
      },
    });
    const result = await run(env);
    expect(result.status).toBe('failed');
    expect(env.store.executions.get(env.execution.id).error_code).toBe('INVALID_DEFINITION');
    expect(env.store.steps).toHaveLength(0);
  });

  it('enforces the execution time limit', async () => {
    let t = 0;
    const env = setup();
    const result = await run(env, {
      now: () => {
        t += 5000;
        return t;
      },
      limits: {
        MAX_EXECUTION_MS: 12000,
        MAX_STEPS: 50,
        STEP_TIMEOUT_MS: 10000,
        MAX_STEP_ATTEMPTS: 3,
      },
    });
    expect(result.status).toBe('failed');
    expect(env.store.executions.get(env.execution.id).error_code).toBe('EXECUTION_TIMEOUT');
  });

  it('enforces the step limit at runtime', async () => {
    const env = setup();
    const result = await run(env, {
      limits: {
        MAX_EXECUTION_MS: 25000,
        MAX_STEPS: 3,
        STEP_TIMEOUT_MS: 10000,
        MAX_STEP_ATTEMPTS: 3,
      },
    });
    expect(result.status).toBe('failed');
    expect(env.store.executions.get(env.execution.id).error_code).toBe('STEP_LIMIT');
  });

  it('stops when the execution is cancelled externally', async () => {
    const env = setup();
    const original = env.store.insertStep.bind(env.store);
    let n = 0;
    env.store.insertStep = async (row) => {
      n += 1;
      if (n === 2) env.store.executions.get(env.execution.id).status = 'cancelled';
      return original(row);
    };
    const result = await run(env);
    expect(result.status).toBe('cancelled');
    expect(env.store.executions.get(env.execution.id).status).toBe('cancelled');
  });
});

describe('executor: retries', () => {
  it('retries transient failures for retryable actions', async () => {
    const demo = createDemoProvider();
    let calls = 0;
    const ai = {
      ...demo,
      async scoreLead(lead) {
        calls += 1;
        if (calls === 1) throw new TransientActionError('Provider busy');
        return demo.scoreLead(lead);
      },
    };
    const services = createMemoryServices({ leads: [sampleLead], ai });
    const env = setup({
      services,
      definition: { ...qualification, steps: [{ id: 'score', type: 'lead.score', config: {} }] },
    });
    const result = await run(env);
    expect(result.status).toBe('succeeded');
    expect(env.store.stepsFor(env.execution.id)[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2,
    });
  });

  it('does not retry non-transient errors', async () => {
    const ai = {
      ...createDemoProvider(),
      scoreLead: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const services = createMemoryServices({ leads: [sampleLead], ai });
    const env = setup({
      services,
      definition: {
        ...qualification,
        steps: [{ id: 'score', type: 'lead.score', config: {}, retry: { maxAttempts: 3 } }],
      },
    });
    await run(env);
    expect(ai.scoreLead).toHaveBeenCalledTimes(1);
    expect(env.store.stepsFor(env.execution.id)[0]).toMatchObject({
      status: 'failed',
      error_code: 'INTERNAL_ERROR',
    });
  });
});

describe('executor: idempotent replay of side effects on execution retry', () => {
  it('does not repeat completed side effects when a failed execution is retried', async () => {
    const store = createMemoryStore();
    const services = createMemoryServices({
      leads: [sampleLead],
      integrations: { demo_crm: true, demo_email: false },
    });
    const definition = {
      version: 1,
      trigger: { type: 'lead.created', config: {} },
      steps: [
        { id: 'notify', type: 'notification.create', config: { title: 'Hi {{lead.name}}' } },
        { id: 'crm', type: 'crm.demo_sync', config: {} },
        { id: 'draft', type: 'ai.draft_reply', config: {} },
        { id: 'send', type: 'email.demo_send', config: { draftStepId: 'draft' } },
      ],
    };

    const first = store.addExecution({ workflow_id: workflow.id });
    const r1 = await run({ store, services, execution: first, definition, lead: sampleLead });
    expect(r1.status).toBe('failed'); // email integration disabled
    expect(services.data.notifications).toHaveLength(1);
    const crmActivities = () =>
      services.data.activities.filter((a) => a.type === 'crm_sync_simulated').length;
    expect(crmActivities()).toBe(1);

    // Fix the cause, then retry as a new attempt sharing the root execution id.
    services.integrations.isEnabled = async () => true;
    const retry = store.addExecution({
      workflow_id: workflow.id,
      root_execution_id: first.id,
      retry_of_id: first.id,
      attempt: 2,
    });
    const r2 = await run({ store, services, execution: retry, definition, lead: sampleLead });
    expect(r2.status).toBe('succeeded');

    const retrySteps = store.stepsFor(retry.id);
    expect(retrySteps.map((s) => `${s.step_id}:${s.status}`)).toEqual([
      'notify:skipped',
      'crm:skipped',
      'draft:succeeded',
      'send:succeeded',
    ]);
    expect(retrySteps[0].replayed_from_step_id).toBeTruthy();
    expect(services.data.notifications).toHaveLength(1);
    expect(crmActivities()).toBe(1);
  });
});
