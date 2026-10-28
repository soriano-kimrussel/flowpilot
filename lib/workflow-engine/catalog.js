// UI metadata for actions (labels, help text, config form fields). Client-safe, no logic.
import { LEAD_PRIORITIES, LEAD_STATUSES } from './constants';

export const ACTION_CATEGORIES = {
  lead: 'Leads',
  ai: 'AI assist',
  logic: 'Logic',
  integration: 'Integrations (simulated)',
  utility: 'Utilities',
};

export const ACTION_CATALOG = {
  'lead.validate': {
    label: 'Validate lead',
    category: 'lead',
    description:
      'Checks required fields, email format and disposable domains, and detects duplicates.',
    defaults: { failOnInvalid: true, checkDuplicates: true },
    fields: [
      { name: 'failOnInvalid', label: 'Stop the workflow when invalid', kind: 'boolean' },
      { name: 'checkDuplicates', label: 'Detect duplicates', kind: 'boolean' },
      { name: 'blockDuplicates', label: 'Fail when a duplicate is found', kind: 'boolean' },
      { name: 'requireCompany', label: 'Require company name', kind: 'boolean' },
    ],
  },
  'lead.create': {
    label: 'Create lead',
    category: 'lead',
    description:
      'Creates a lead from the trigger payload. Re-uses an existing lead with the same email.',
    sideEffect: true,
    defaults: { source: 'webhook', onDuplicate: 'reuse', defaultStatus: 'new' },
    fields: [
      { name: 'source', label: 'Source label', kind: 'text', placeholder: 'webhook' },
      {
        name: 'onDuplicate',
        label: 'If the email already exists',
        kind: 'select',
        options: [
          { value: 'reuse', label: 'Use the existing lead' },
          { value: 'fail', label: 'Fail the step' },
        ],
      },
      { name: 'defaultStatus', label: 'Initial status', kind: 'select', options: LEAD_STATUSES },
    ],
  },
  'lead.update': {
    label: 'Update lead',
    category: 'lead',
    description:
      'Sets status, assignee or priority, or appends a note. Text fields support {{placeholders}}.',
    sideEffect: true,
    defaults: { status: 'qualified' },
    fields: [
      { name: 'status', label: 'Status', kind: 'select', options: LEAD_STATUSES, optional: true },
      { name: 'assignee', label: 'Assignee', kind: 'text', placeholder: 'Sales team A' },
      {
        name: 'priority',
        label: 'Priority',
        kind: 'select',
        options: LEAD_PRIORITIES,
        optional: true,
      },
      {
        name: 'appendNote',
        label: 'Append note',
        kind: 'textarea',
        placeholder: 'Scored {{steps.score.score}}',
      },
    ],
  },
  'lead.score': {
    label: 'Score lead',
    category: 'ai',
    description:
      'Explainable 0-100 score from transparent rules (email domain, title, size, budget, intent, source).',
    defaults: { persist: true },
    fields: [{ name: 'persist', label: 'Save score on the lead', kind: 'boolean' }],
  },
  'lead.classify': {
    label: 'Classify lead',
    category: 'ai',
    description: 'Determines segment, inquiry category and buying intent.',
    defaults: { persist: true },
    fields: [{ name: 'persist', label: 'Save classification on the lead', kind: 'boolean' }],
  },
  'lead.summarize': {
    label: 'Summarize lead',
    category: 'ai',
    description: 'Writes a short summary with key points and a recommended next step.',
    defaults: { persist: true },
    fields: [{ name: 'persist', label: 'Save summary on the lead', kind: 'boolean' }],
  },
  'ai.draft_reply': {
    label: 'Draft follow-up',
    category: 'ai',
    description: 'Drafts a personalized reply. Nothing is sent by this step.',
    defaults: { tone: 'friendly', senderName: 'The FlowPilot team' },
    fields: [
      { name: 'tone', label: 'Tone', kind: 'select', options: ['friendly', 'formal', 'concise'] },
      { name: 'senderName', label: 'Signature', kind: 'text' },
    ],
  },
  'condition.evaluate': {
    label: 'Condition (branch)',
    category: 'logic',
    description: 'Evaluates conditions and runs the "then" or "else" branch.',
    defaults: { match: 'all', conditions: [{ field: 'lead.score', operator: 'gte', value: 70 }] },
    fields: [
      {
        name: 'match',
        label: 'Match',
        kind: 'select',
        options: [
          { value: 'all', label: 'All conditions' },
          { value: 'any', label: 'Any condition' },
        ],
      },
      { name: 'conditions', label: 'Conditions', kind: 'conditions' },
    ],
  },
  'data.transform': {
    label: 'Transform data',
    category: 'utility',
    description:
      'Safe operations (copy, trim, case, template, default, number) that write to vars.*',
    defaults: {
      operations: [{ op: 'template', target: 'vars.greeting', value: 'Hi {{lead.name}}' }],
    },
    fields: [{ name: 'operations', label: 'Operations', kind: 'operations' }],
  },
  'notification.create': {
    label: 'In-app notification',
    category: 'utility',
    description: 'Creates notifications in the FlowPilot notification center (no email or SMS).',
    sideEffect: true,
    defaults: {
      title: 'Workflow update for {{lead.name}}',
      message: '',
      severity: 'info',
      audience: 'admins',
    },
    fields: [
      { name: 'title', label: 'Title', kind: 'text' },
      { name: 'message', label: 'Message', kind: 'textarea' },
      {
        name: 'severity',
        label: 'Severity',
        kind: 'select',
        options: ['info', 'success', 'warning', 'error'],
      },
      {
        name: 'audience',
        label: 'Recipients',
        kind: 'select',
        options: [
          { value: 'admins', label: 'Owners and admins' },
          { value: 'all', label: 'All workspace members' },
          { value: 'actor', label: 'Person who ran the workflow' },
        ],
      },
    ],
  },
  'crm.demo_sync': {
    label: 'Sync to CRM',
    category: 'integration',
    simulated: true,
    sideEffect: true,
    description: 'Simulated CRM upsert. Records what would be synced; makes no external request.',
    defaults: { object: 'contact' },
    fields: [
      { name: 'object', label: 'CRM object', kind: 'select', options: ['contact', 'deal'] },
      { name: 'pipelineStage', label: 'Pipeline stage (optional)', kind: 'text' },
    ],
  },
  'email.demo_send': {
    label: 'Send email',
    category: 'integration',
    simulated: true,
    sideEffect: true,
    description: 'Simulated send into the demo outbox (lead activity log). No email is delivered.',
    defaults: { draftStepId: '' },
    fields: [
      {
        name: 'draftStepId',
        label: 'Use draft from step',
        kind: 'step-ref',
        stepType: 'ai.draft_reply',
        optional: true,
      },
      { name: 'subject', label: 'Subject (if no draft step)', kind: 'text' },
      { name: 'body', label: 'Body (if no draft step)', kind: 'textarea' },
    ],
  },
  'execution.log': {
    label: 'Log message',
    category: 'utility',
    description: 'Adds a message to the execution log. Supports {{placeholders}}.',
    defaults: { message: 'Processed {{lead.email}}', level: 'info' },
    fields: [
      { name: 'message', label: 'Message', kind: 'textarea' },
      { name: 'level', label: 'Level', kind: 'select', options: ['info', 'warning', 'error'] },
    ],
  },
};

export function actionLabel(type) {
  return ACTION_CATALOG[type]?.label ?? type;
}

export const PLACEHOLDER_HELP = [
  'lead.name, lead.email, lead.company, lead.score, lead.status',
  'steps.<step-id>.<field>, e.g. steps.score.score',
  'trigger.payload.<field> for webhook data',
  'vars.<name> from Transform data steps',
];
