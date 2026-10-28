// Simulated external integrations. These NEVER perform network requests; they record what
// would have been sent so the demo is transparent and free.
import { z } from 'zod';
import { maskEmail } from '@/lib/security/redact';
import { stableHash } from '@/lib/utils/hash';
import { ActionError } from '../errors';
import { actionConfigSchemas } from '../schemas';
import { interpolate } from '../template';
import { requireIntegration, requireLead } from './helpers';

const SIMULATION_NOTE = 'Simulation only: no external request was made.';

export const crmDemoSync = {
  type: 'crm.demo_sync',
  configSchema: actionConfigSchemas['crm.demo_sync'],
  outputSchema: z.object({
    simulated: z.literal(true),
    externalId: z.string(),
    object: z.string(),
    operation: z.literal('upsert'),
    syncedFields: z.array(z.string()),
    note: z.string(),
  }),
  sideEffect: true,
  retryable: false,
  simulated: true,
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'CRM sync');
    await requireIntegration(services, 'demo_crm', 'Demo CRM');
    const syncedFields = ['name', 'email', 'company', 'status', 'score', 'classification'].filter(
      (f) => lead[f] !== null && lead[f] !== undefined && lead[f] !== '',
    );
    const externalId = `demo-crm-${config.object}-${stableHash(lead.id)}`;
    await services.leads.addActivity(lead.id, {
      type: 'crm_sync_simulated',
      description: `Simulated CRM ${config.object} upsert (${externalId})${config.pipelineStage ? ` in stage "${config.pipelineStage}"` : ''}`,
      metadata: { simulated: true, externalId, syncedFields },
      executionId: execution.id,
    });
    return {
      output: {
        simulated: true,
        externalId,
        object: config.object,
        operation: 'upsert',
        syncedFields,
        note: SIMULATION_NOTE,
      },
    };
  },
};

export const emailDemoSend = {
  type: 'email.demo_send',
  configSchema: actionConfigSchemas['email.demo_send'],
  outputSchema: z.object({
    simulated: z.literal(true),
    messageId: z.string(),
    to: z.string(),
    subject: z.string(),
    bodyPreview: z.string(),
    note: z.string(),
  }),
  sideEffect: true,
  retryable: false,
  simulated: true,
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'Send email');
    await requireIntegration(services, 'demo_email', 'Demo email outbox');

    let subject;
    let body;
    if (config.draftStepId) {
      const draft = context.steps[config.draftStepId];
      if (!draft?.subject || !draft?.body) {
        throw new ActionError(
          `Draft step "${config.draftStepId}" has no output. Make sure it ran successfully before this step.`,
          { code: 'MISSING_INPUT' },
        );
      }
      subject = draft.subject;
      body = draft.body;
    } else {
      subject = interpolate(config.subject, context, { maxLength: 160 });
      body = interpolate(config.body, context, { maxLength: 3000 });
    }

    const messageId = `demo-msg-${stableHash(`${execution.id}:${lead.id}:${subject}`)}`;
    await services.leads.addActivity(lead.id, {
      type: 'email_simulated',
      description: `Simulated email "${subject}" placed in the demo outbox (not delivered)`,
      metadata: { simulated: true, messageId, subject, body },
      executionId: execution.id,
    });
    return {
      output: {
        simulated: true,
        messageId,
        to: maskEmail(lead.email),
        subject,
        bodyPreview: body.slice(0, 200),
        note: 'Simulated send: no email left FlowPilot. The message is stored in the lead activity log.',
      },
    };
  },
};
