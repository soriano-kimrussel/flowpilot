import { z } from 'zod';
import { TRIGGER_TYPES } from '@/lib/workflow-engine/constants';

export const workflowMetaSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const createWorkflowSchema = workflowMetaSchema.extend({
  triggerType: z.enum(TRIGGER_TYPES).default('manual'),
  templateId: z.string().uuid().optional().or(z.literal('')),
});

export const runRequestSchema = z
  .object({
    leadId: z.string().uuid().optional().nullable(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
