import { z } from 'zod';
import { LEAD_PRIORITIES, LEAD_STATUSES } from '@/lib/workflow-engine/constants';

const optionalText = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalInt = (max) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ error: 'Enter a whole number' })
      .int('Enter a whole number')
      .min(0, 'Must be 0 or more')
      .max(max)
      .optional(),
  );

export const LEAD_SOURCES = [
  'manual',
  'website',
  'referral',
  'event',
  'webinar',
  'social',
  'cold_outreach',
  'partner',
  'import',
  'webhook',
];

export const leadFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address'),
  company: optionalText(120),
  job_title: optionalText(120),
  phone: optionalText(40),
  company_size: optionalInt(10_000_000),
  budget: optionalInt(1_000_000_000),
  source: z.string().trim().min(1).max(40).default('manual'),
  status: z.enum(LEAD_STATUSES).default('new'),
  priority: z.enum(LEAD_PRIORITIES).default('normal'),
  assignee: optionalText(120),
  message: optionalText(5000),
  notes: optionalText(5000),
});

export const leadFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  source: z.string().trim().max(40).optional().catch(undefined),
  // Empty form fields arrive as "" and must mean "no filter", not 0.
  minScore: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(0).max(100).optional())
    .catch(undefined),
  archived: z.enum(['1']).optional().catch(undefined),
  sort: z
    .enum(['created_desc', 'created_asc', 'score_desc', 'activity_desc'])
    .default('created_desc')
    .catch('created_desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export const bulkLeadActionSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'Select at least one lead')
    .max(100, 'Select at most 100 leads'),
  action: z.enum(['set_status', 'archive', 'unarchive', 'delete']),
  status: z.enum(LEAD_STATUSES).optional(),
});

export const extractTextSchema = z.object({
  text: z.string().trim().min(10, 'Paste at least a sentence').max(5000),
});
