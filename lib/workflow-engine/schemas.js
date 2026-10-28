// Pure Zod schemas for triggers and action configs. Safe to import in client components.
import { z } from 'zod';
import { CONDITION_OPERATORS } from './conditions';
import { LEAD_PRIORITIES, LEAD_STATUSES } from './constants';
import { isValidPath } from './template';

const templateString = (max) => z.string().trim().max(max);
const path = z.string().refine(isValidPath, {
  message: 'Use a path like lead.score, steps.<id>.<field>, vars.<name> or trigger.payload.<field>',
});
const varPath = path.refine((p) => p.startsWith('vars.'), {
  message: 'Target must start with "vars."',
});

export const triggerConfigSchemas = {
  manual: z.object({}).strict(),
  'lead.created': z.object({}).strict(),
  'lead.status_changed': z.object({ toStatus: z.enum(LEAD_STATUSES).optional() }).strict(),
  webhook: z
    .object({
      requiredFields: z
        .array(
          z.string().regex(/^[A-Za-z0-9_]{1,64}$/, 'Field names may use letters, digits and _'),
        )
        .max(20)
        .default([]),
    })
    .strict(),
  schedule: z.object({ interval: z.enum(['hourly', 'daily']).default('daily') }).strict(),
};

export const conditionSchema = z
  .object({
    field: path,
    operator: z.enum(Object.keys(CONDITION_OPERATORS)),
    value: z
      .union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(100)).max(50)])
      .optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (
      !['exists', 'not_exists'].includes(c.operator) &&
      (c.value === undefined || c.value === '')
    ) {
      ctx.addIssue({ code: 'custom', message: 'A comparison value is required', path: ['value'] });
    }
  });

const transformOperation = z
  .object({
    op: z.enum(['set', 'copy', 'lowercase', 'uppercase', 'trim', 'template', 'default', 'number']),
    target: varPath,
    from: path.optional(),
    value: z.union([z.string().max(1000), z.number(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    const needsFrom = ['copy', 'lowercase', 'uppercase', 'trim', 'default', 'number'];
    const needsValue = ['set', 'template', 'default'];
    if (needsFrom.includes(o.op) && !o.from) {
      ctx.addIssue({ code: 'custom', message: `"${o.op}" needs a source path`, path: ['from'] });
    }
    if (needsValue.includes(o.op) && (o.value === undefined || o.value === '')) {
      ctx.addIssue({ code: 'custom', message: `"${o.op}" needs a value`, path: ['value'] });
    }
  });

const persist = z.boolean().default(true);

export const actionConfigSchemas = {
  'lead.validate': z
    .object({
      failOnInvalid: z.boolean().default(true),
      checkDuplicates: z.boolean().default(true),
      blockDuplicates: z.boolean().default(false),
      requireCompany: z.boolean().default(false),
    })
    .strict(),
  'lead.create': z
    .object({
      source: z.string().trim().min(1).max(40).default('webhook'),
      onDuplicate: z.enum(['reuse', 'fail']).default('reuse'),
      defaultStatus: z.enum(LEAD_STATUSES).default('new'),
    })
    .strict(),
  'lead.update': z
    .object({
      status: z.enum(LEAD_STATUSES).optional(),
      assignee: templateString(120).optional(),
      priority: z.enum(LEAD_PRIORITIES).optional(),
      appendNote: templateString(500).optional(),
    })
    .strict()
    .refine((c) => c.status || c.assignee || c.priority || c.appendNote, {
      message: 'Choose at least one field to update',
    }),
  'lead.score': z.object({ persist }).strict(),
  'lead.classify': z.object({ persist }).strict(),
  'lead.summarize': z.object({ persist }).strict(),
  'ai.draft_reply': z
    .object({
      tone: z.enum(['friendly', 'formal', 'concise']).default('friendly'),
      senderName: z.string().trim().min(1).max(80).default('The FlowPilot team'),
    })
    .strict(),
  'condition.evaluate': z
    .object({
      match: z.enum(['all', 'any']).default('all'),
      conditions: z.array(conditionSchema).min(1, 'Add at least one condition').max(10),
    })
    .strict(),
  'data.transform': z
    .object({
      operations: z.array(transformOperation).min(1, 'Add at least one operation').max(20),
    })
    .strict(),
  'notification.create': z
    .object({
      title: templateString(160).min(1, 'Title is required'),
      message: templateString(1000).default(''),
      severity: z.enum(['info', 'success', 'warning', 'error']).default('info'),
      audience: z.enum(['all', 'admins', 'actor']).default('admins'),
    })
    .strict(),
  'crm.demo_sync': z
    .object({
      object: z.enum(['contact', 'deal']).default('contact'),
      pipelineStage: z.string().trim().max(60).optional(),
    })
    .strict(),
  'email.demo_send': z
    .object({
      draftStepId: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]{0,47}$/)
        .optional(),
      subject: templateString(160).optional(),
      body: templateString(3000).optional(),
    })
    .strict()
    .refine((c) => c.draftStepId || (c.subject && c.body), {
      message: 'Select a draft step, or provide both subject and body',
    }),
  'execution.log': z
    .object({
      message: templateString(500).min(1, 'Message is required'),
      level: z.enum(['info', 'warning', 'error']).default('info'),
    })
    .strict(),
};

export const ACTION_TYPES = Object.keys(actionConfigSchemas);

// Fields accepted from webhook payloads / manual payloads when building a lead.
export const leadPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().max(254).email('A valid email address is required'),
  company: z.string().trim().max(120).optional().nullable(),
  job_title: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  company_size: z.number().int().min(0).max(10_000_000).optional().nullable(),
  budget: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  source: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable(),
});
