import { z } from 'zod';
import { actionConfigSchemas } from '../schemas';
import { interpolate } from '../template';

export const notificationCreate = {
  type: 'notification.create',
  configSchema: actionConfigSchemas['notification.create'],
  outputSchema: z.object({
    recipients: z.number().int().min(0),
    title: z.string(),
    audience: z.string(),
  }),
  sideEffect: true,
  retryable: true, // notifications carry a unique idempotency key per recipient
  async run({ context, config, services, execution, idempotencyKey }) {
    const title = interpolate(config.title, context, { maxLength: 160 }) || 'Workflow notification';
    const body = interpolate(config.message, context, { maxLength: 1000 });
    const { recipients } = await services.notifications.create({
      audience: config.audience,
      title,
      body,
      severity: config.severity,
      link: context.lead?.id
        ? `/dashboard/leads/${context.lead.id}`
        : `/dashboard/executions/${execution.id}`,
      executionId: execution.id,
      idempotencyKey,
    });
    return { output: { recipients, title, audience: config.audience } };
  },
};
