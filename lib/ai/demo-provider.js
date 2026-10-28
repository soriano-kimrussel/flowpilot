import { classifyLead } from './rules/classification';
import { draftReply } from './rules/drafting';
import { extractLeadFields } from './rules/extraction';
import { scoreLead, SCORING_RULES_VERSION } from './rules/scoring';
import { suggestSteps } from './rules/suggestions';
import { summarizeLead } from './rules/summary';

export const DEMO_META = Object.freeze({
  provider: 'demo',
  model: SCORING_RULES_VERSION,
  simulated: true,
  label: 'Rule-based (simulated AI)',
});

function meta(extra) {
  return { ...DEMO_META, ...extra };
}

/**
 * Deterministic provider: same input, same output. No network access, no API key.
 * Every result is labeled `simulated: true` so the UI never presents it as LLM output.
 */
export function createDemoProvider(extraMeta) {
  return {
    name: 'demo',
    async classifyLead(lead) {
      return { result: classifyLead(lead), meta: meta(extraMeta) };
    },
    async scoreLead(lead) {
      return { result: scoreLead(lead), meta: meta(extraMeta) };
    },
    async summarizeLead(lead, context) {
      return { result: summarizeLead(lead, context), meta: meta(extraMeta) };
    },
    async draftReply(lead, options) {
      return { result: draftReply(lead, options), meta: meta(extraMeta) };
    },
    async extractLeadFields(text) {
      return { result: extractLeadFields(text), meta: meta(extraMeta) };
    },
    async suggestSteps(goal) {
      return { result: suggestSteps(goal), meta: meta(extraMeta) };
    },
  };
}
