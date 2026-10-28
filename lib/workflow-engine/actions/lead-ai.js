// AI-assisted lead actions. Each delegates to the configured provider (rule-based by default)
// and records provider metadata so the UI can label simulated vs. model-generated output.
import { z } from 'zod';
import { leadContext } from '../lead-fields';
import { actionConfigSchemas } from '../schemas';
import { requireLead } from './helpers';

const aiMeta = z
  .object({ provider: z.string(), simulated: z.boolean(), label: z.string() })
  .passthrough();

export const leadScore = {
  type: 'lead.score',
  configSchema: actionConfigSchemas['lead.score'],
  outputSchema: z.object({
    score: z.number().int().min(0).max(100),
    grade: z.string(),
    label: z.string(),
    factors: z.array(z.object({ rule: z.string(), points: z.number(), reason: z.string() })),
    explanation: z.string(),
    ai: aiMeta,
  }),
  sideEffect: false,
  retryable: true,
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'Score lead');
    const { result, meta } = await services.ai.scoreLead(lead);
    let nextLead = { ...lead, score: result.score };
    if (config.persist) {
      const updated = await services.leads.update(
        lead.id,
        {
          score: result.score,
          score_details: { ...result, ai: meta, scored_at: new Date().toISOString() },
        },
        { executionId: execution.id },
      );
      nextLead = leadContext(updated);
    }
    return { output: { ...result, ai: meta }, lead: nextLead };
  },
};

export const leadClassify = {
  type: 'lead.classify',
  configSchema: actionConfigSchemas['lead.classify'],
  outputSchema: z.object({
    segment: z.string(),
    category: z.string(),
    intent: z.string(),
    confidence: z.number(),
    signals: z.array(z.string()),
    ai: aiMeta,
  }),
  sideEffect: false,
  retryable: true,
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'Classify lead');
    const { result, meta } = await services.ai.classifyLead(lead);
    let nextLead = { ...lead, classification: result.segment };
    if (config.persist) {
      const updated = await services.leads.update(
        lead.id,
        { classification: result.segment, classification_details: { ...result, ai: meta } },
        { executionId: execution.id },
      );
      nextLead = leadContext(updated);
    }
    return { output: { ...result, ai: meta }, lead: nextLead };
  },
};

export const leadSummarize = {
  type: 'lead.summarize',
  configSchema: actionConfigSchemas['lead.summarize'],
  outputSchema: z.object({ summary: z.string(), keyPoints: z.array(z.string()), ai: aiMeta }),
  sideEffect: false,
  retryable: true,
  async run({ context, config, services, execution }) {
    const lead = requireLead(context, 'Summarize lead');
    const scoreOutput = Object.values(context.steps).find(
      (o) => o && typeof o.score === 'number' && o.factors,
    );
    const { result, meta } = await services.ai.summarizeLead(
      lead,
      scoreOutput ? { score: scoreOutput } : undefined,
    );
    let nextLead = { ...lead, ai_summary: result.summary };
    if (config.persist) {
      const prefix = meta.simulated ? '[Rule-based summary] ' : `[${meta.label}] `;
      const updated = await services.leads.update(
        lead.id,
        { ai_summary: `${prefix}${result.summary}`.slice(0, 4000) },
        { executionId: execution.id },
      );
      nextLead = leadContext(updated);
    }
    return { output: { ...result, ai: meta }, lead: nextLead };
  },
};

export const aiDraftReply = {
  type: 'ai.draft_reply',
  configSchema: actionConfigSchemas['ai.draft_reply'],
  outputSchema: z.object({ subject: z.string(), body: z.string(), tone: z.string(), ai: aiMeta }),
  sideEffect: false,
  retryable: true,
  async run({ context, config, services }) {
    const lead = requireLead(context, 'Draft reply');
    const { result, meta } = await services.ai.draftReply(lead, {
      tone: config.tone,
      senderName: config.senderName,
    });
    return { output: { ...result, ai: meta } };
  },
};
