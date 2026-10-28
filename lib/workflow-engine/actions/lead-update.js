import { z } from 'zod';
import { leadContext } from '../lead-fields';
import { actionConfigSchemas } from '../schemas';
import { interpolate } from '../template';
import { requireLead } from './helpers';

export const leadUpdate = {
  type: 'lead.update',
  configSchema: actionConfigSchemas['lead.update'],
  outputSchema: z.object({ leadId: z.string(), changes: z.record(z.string(), z.unknown()) }),
  sideEffect: true,
  retryable: true, // setting the same values again is harmless
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'Update lead');
    const changes = {};
    if (config.status) changes.status = config.status;
    if (config.priority) changes.priority = config.priority;
    if (config.assignee)
      changes.assignee = interpolate(config.assignee, context, { maxLength: 120 });
    if (config.appendNote) {
      const note = interpolate(config.appendNote, context, { maxLength: 500 });
      const existing = String(lead.notes ?? '');
      changes.notes = `${existing}${existing ? '\n' : ''}${note}`.slice(-5000);
    }

    const updated = await services.leads.update(lead.id, changes, { executionId: execution.id });
    const summary = Object.entries(changes)
      .filter(([k]) => k !== 'notes')
      .map(([k, v]) => `${k} → ${v}`)
      .join(', ');
    await services.leads.addActivity(lead.id, {
      type: 'workflow_update',
      description: `Workflow updated lead${summary ? `: ${summary}` : ''}${changes.notes ? ' (note appended)' : ''}`,
      metadata: { changes: Object.keys(changes) },
      executionId: execution.id,
    });
    return { output: { leadId: lead.id, changes }, lead: leadContext(updated) };
  },
  async onReplay({ output, services }) {
    return { lead: leadContext(await services.leads.getById(output.leadId)) };
  },
};
