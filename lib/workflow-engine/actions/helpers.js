import { ActionError } from '../errors';

export function requireLead(context, actionLabel) {
  if (!context.lead?.id) {
    throw new ActionError(
      `${actionLabel} needs a lead. Run the workflow for a lead, use a lead trigger, or add a "Create lead" step first.`,
      { code: 'LEAD_REQUIRED' },
    );
  }
  return context.lead;
}

export async function requireIntegration(services, provider, label) {
  const enabled = await services.integrations.isEnabled(provider);
  if (!enabled) {
    throw new ActionError(
      `${label} integration is disabled. Enable it under Integrations, then retry.`,
      {
        code: 'INTEGRATION_DISABLED',
      },
    );
  }
}
