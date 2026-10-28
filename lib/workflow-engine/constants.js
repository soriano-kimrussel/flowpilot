export const DEFINITION_VERSION = 1;

export const LIMITS = Object.freeze({
  MAX_STEPS: 50, // total steps including nested branch steps
  MAX_TOP_LEVEL_STEPS: 25,
  MAX_BRANCH_DEPTH: 3,
  MAX_EXECUTION_MS: 25_000,
  STEP_TIMEOUT_MS: 10_000,
  MAX_STEP_ATTEMPTS: 3,
  MAX_EXECUTION_ATTEMPTS: 3,
  MAX_PAYLOAD_BYTES: 32_768,
  MAX_LOG_VALUE_BYTES: 16_384,
});

export const EXECUTION_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'cancelled'];
export const STEP_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped'];
export const WORKFLOW_STATUSES = ['draft', 'active', 'inactive', 'archived'];
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
export const LEAD_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const TRIGGERS = Object.freeze({
  manual: {
    label: 'Manual run',
    description:
      'Started by a workspace member from the workflow page, optionally for a selected lead.',
  },
  'lead.created': {
    label: 'New lead created',
    description:
      'Runs when a lead is created from the UI or CSV import. Leads created by workflows do not re-trigger workflows.',
  },
  'lead.status_changed': {
    label: 'Lead status changed',
    description:
      'Runs when a member changes a lead status. Optionally only for a specific target status. Changes made by workflows do not re-trigger.',
  },
  webhook: {
    label: 'Incoming webhook',
    description:
      'Runs when an authenticated POST arrives at the workflow webhook URL. Requests are queued, de-duplicated and rate limited.',
  },
  schedule: {
    label: 'Schedule',
    description:
      'Queued hourly or daily. Due runs are enqueued by the cron endpoint (daily on Vercel Hobby) or when a member processes the queue.',
  },
});

export const TRIGGER_TYPES = Object.keys(TRIGGERS);
