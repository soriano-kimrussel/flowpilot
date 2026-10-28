import { z } from 'zod';
import { ActionError } from '../errors';
import { leadContext, leadFromPayload } from '../lead-fields';
import { actionConfigSchemas, leadPayloadSchema } from '../schemas';

export const leadCreate = {
  type: 'lead.create',
  configSchema: actionConfigSchemas['lead.create'],
  outputSchema: z.object({ leadId: z.string(), created: z.boolean(), duplicate: z.boolean() }),
  sideEffect: true,
  retryable: true, // the unique (workspace, email) constraint makes creation idempotent
  async run({ context, config, services, execution }) {
    if (context.lead?.id) {
      return {
        output: {
          leadId: context.lead.id,
          created: false,
          duplicate: false,
          note: 'Execution already has a lead',
        },
      };
    }
    const fields = leadFromPayload(context.trigger?.payload);
    const parsed = leadPayloadSchema.safeParse(fields);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`)
        .join('; ');
      throw new ActionError(`Cannot create lead from payload: ${message}`, {
        code: 'VALIDATION_FAILED',
      });
    }

    const { lead, created } = await services.leads.create(
      { ...parsed.data, source: parsed.data.source || config.source, status: config.defaultStatus },
      { executionId: execution.id },
    );
    if (!created && config.onDuplicate === 'fail') {
      throw new ActionError(`A lead with email ${parsed.data.email} already exists`, {
        code: 'DUPLICATE_LEAD',
      });
    }
    return { output: { leadId: lead.id, created, duplicate: !created }, lead: leadContext(lead) };
  },
  async onReplay({ output, services }) {
    const lead = await services.leads.getById(output.leadId);
    return { lead: leadContext(lead) };
  },
};
