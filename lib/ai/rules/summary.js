import { classifyLead } from './classification';
import { scoreLead } from './scoring';

const SEGMENT_LABEL = {
  enterprise: 'an enterprise',
  mid_market: 'a mid-market',
  small_business: 'a small-business',
  individual: 'an individual',
};

function sentence(text) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const first = clean.split(/(?<=[.!?])\s/)[0];
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

export function summarizeLead(lead, { score, classification } = {}) {
  const c = classification ?? classifyLead(lead);
  const s = score ?? scoreLead(lead);
  const who = [lead.name, lead.job_title ? `(${lead.job_title})` : null].filter(Boolean).join(' ');
  const org = lead.company ? ` at ${lead.company}` : '';
  const ask = sentence(lead.message);

  const keyPoints = [
    `Segment: ${c.segment.replace('_', ' ')}`,
    `Intent: ${c.intent}`,
    `Score: ${s.score}/100 (${s.label})`,
    lead.company_size ? `Company size: ${lead.company_size}` : null,
    lead.budget ? `Stated budget: ${Number(lead.budget).toLocaleString('en-US')}` : null,
    `Source: ${lead.source ?? 'manual'}`,
  ].filter(Boolean);

  const summary = [
    `${who}${org} is ${SEGMENT_LABEL[c.segment] ?? 'a'} ${c.category.replace('_', ' ')} with ${c.intent} intent.`,
    ask ? `They wrote: "${ask}"` : 'No message was provided.',
    s.score >= 70
      ? 'Recommended next step: respond within one business day and offer a demo.'
      : s.score >= 40
        ? 'Recommended next step: send tailored information and follow up in a few days.'
        : 'Recommended next step: add to a nurture sequence.',
  ].join(' ');

  return { summary, keyPoints };
}
