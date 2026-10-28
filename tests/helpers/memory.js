// In-memory implementations of the executor store and services for unit tests.
import { createDemoProvider } from '@/lib/ai/demo-provider';
import { findDuplicateMatches } from '@/lib/leads/duplicates';

let counter = 0;
const id = (prefix) => `${prefix}-${++counter}`;

export function createMemoryStore() {
  const executions = new Map();
  const steps = [];
  return {
    executions,
    steps,
    addExecution(row) {
      const execution = {
        id: id('exec'),
        status: 'pending',
        attempt: 1,
        root_execution_id: null,
        ...row,
      };
      executions.set(execution.id, execution);
      return execution;
    },
    async transitionExecution(execId, from, to, patch) {
      const e = executions.get(execId);
      if (!e || e.status !== from) return false;
      Object.assign(e, patch, { status: to });
      return true;
    },
    async isExecutionCancelled(execId) {
      return executions.get(execId)?.status === 'cancelled';
    },
    async insertStep(row) {
      const step = { id: id('step'), ...row };
      steps.push(step);
      return { id: step.id };
    },
    async transitionStep(stepId, from, to, patch) {
      const s = steps.find((x) => x.id === stepId);
      if (!s || s.status !== from) return false;
      Object.assign(s, patch, { status: to });
      return true;
    },
    async findSucceededSideEffect(key) {
      return (
        steps.find(
          (s) => s.idempotency_key === key && s.status === 'succeeded' && !s.replayed_from_step_id,
        ) ?? null
      );
    },
    stepsFor(execId) {
      return steps.filter((s) => s.execution_id === execId).sort((a, b) => a.position - b.position);
    },
  };
}

export function createMemoryServices({
  leads = [],
  integrations = { demo_crm: true, demo_email: true },
  actorId = 'user-1',
  ai,
} = {}) {
  const leadRows = new Map(leads.map((l) => [l.id, { status: 'new', priority: 'normal', ...l }]));
  const activities = [];
  const notifications = [];
  const calls = { create: 0, update: 0 };

  return {
    actorId,
    ai: ai ?? createDemoProvider(),
    data: { leadRows, activities, notifications, calls },
    leads: {
      async getById(leadId) {
        const lead = leadRows.get(leadId);
        if (!lead) throw new Error('Lead not found');
        return { ...lead };
      },
      async findPotentialDuplicates(candidate) {
        return findDuplicateMatches(candidate, [...leadRows.values()]);
      },
      async create(fields, { executionId }) {
        calls.create += 1;
        const existing = [...leadRows.values()].find(
          (l) => l.email.toLowerCase() === fields.email.toLowerCase(),
        );
        if (existing) return { lead: { ...existing }, created: false };
        const lead = {
          id: id('lead'),
          status: 'new',
          priority: 'normal',
          ...fields,
          created_by_execution_id: executionId,
        };
        leadRows.set(lead.id, lead);
        return { lead: { ...lead }, created: true };
      },
      async update(leadId, patch) {
        calls.update += 1;
        const lead = leadRows.get(leadId);
        if (!lead) throw new Error('Lead not found');
        Object.assign(lead, patch);
        return { ...lead };
      },
      async addActivity(leadId, activity) {
        activities.push({ leadId, ...activity });
      },
    },
    notifications: {
      async create(n) {
        const key = n.idempotencyKey;
        if (key && notifications.some((x) => x.idempotencyKey === key)) return { recipients: 1 };
        notifications.push(n);
        return { recipients: 1 };
      },
    },
    integrations: {
      async isEnabled(provider) {
        return Boolean(integrations[provider]);
      },
    },
  };
}

export const sampleLead = {
  id: 'lead-maya',
  name: 'Maya Chen',
  email: 'maya.chen@northwind.example',
  company: 'Northwind Logistics',
  job_title: 'VP of Operations',
  company_size: 420,
  budget: 45000,
  source: 'referral',
  message:
    'We need a demo next week. Looking to automate intake for our 12 regional depots, budget approved.',
  status: 'new',
};
