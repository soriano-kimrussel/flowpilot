import { z } from 'zod';
import { isDisposableEmail } from '@/lib/ai/rules/signals';
import { ActionError } from '../errors';
import { leadFromPayload } from '../lead-fields';
import { actionConfigSchemas } from '../schemas';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export const leadValidate = {
  type: 'lead.validate',
  configSchema: actionConfigSchemas['lead.validate'],
  outputSchema: z.object({
    valid: z.boolean(),
    subject: z.enum(['lead', 'payload']),
    issues: z.array(z.string()),
    warnings: z.array(z.string()),
    duplicate: z.object({
      checked: z.boolean(),
      isDuplicate: z.boolean(),
      matches: z.array(z.object({ id: z.string(), name: z.string(), reason: z.string() })),
    }),
  }),
  sideEffect: false,
  retryable: true,
  async run({ context, config, services }) {
    const subject = context.lead ? 'lead' : 'payload';
    const candidate = context.lead ?? leadFromPayload(context.trigger?.payload);
    const issues = [];
    const warnings = [];

    const name = String(candidate.name ?? '').trim();
    const email = String(candidate.email ?? '').trim();
    if (!name) issues.push('Name is missing');
    else if (name.length > 120) issues.push('Name is longer than 120 characters');
    if (!email) issues.push('Email is missing');
    else if (!EMAIL.test(email) || email.length > 254)
      issues.push(`Email "${email.slice(0, 80)}" is not a valid address`);
    else if (isDisposableEmail(email)) issues.push('Email uses a disposable domain');
    if (config.requireCompany && !String(candidate.company ?? '').trim())
      issues.push('Company is required');
    if (!String(candidate.message ?? '').trim()) warnings.push('No message provided');

    let duplicate = { checked: false, isDuplicate: false, matches: [] };
    if (config.checkDuplicates && email && EMAIL.test(email)) {
      const matches = await services.leads.findPotentialDuplicates({ ...candidate, email });
      duplicate = { checked: true, isDuplicate: matches.length > 0, matches: matches.slice(0, 5) };
      if (matches.length) warnings.push(`Possible duplicate of ${matches.length} existing lead(s)`);
    }

    const valid = issues.length === 0;
    if (!valid && config.failOnInvalid) {
      throw new ActionError(`Lead failed validation: ${issues.join('; ')}`, {
        code: 'VALIDATION_FAILED',
      });
    }
    if (duplicate.isDuplicate && config.blockDuplicates) {
      throw new ActionError(
        `Duplicate lead blocked: matches ${duplicate.matches.map((m) => `${m.name} (${m.reason})`).join(', ')}`,
        { code: 'DUPLICATE_LEAD' },
      );
    }

    return { output: { valid, subject, issues, warnings, duplicate } };
  },
};
