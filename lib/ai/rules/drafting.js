import { classifyLead } from './classification';
import { firstName } from './signals';

const OPENERS = {
  friendly: (name) => `Hi ${name},`,
  formal: (name) => `Dear ${name},`,
  concise: (name) => `Hi ${name},`,
};

const CLOSERS = {
  friendly: 'Looking forward to hearing from you!',
  formal: 'Kind regards,',
  concise: 'Thanks,',
};

function bodyFor(lead, classification, tone) {
  const company = lead.company ? ` at ${lead.company}` : '';
  const topic = /pric|quote|cost/i.test(lead.message ?? '')
    ? 'pricing'
    : /demo/i.test(lead.message ?? '')
      ? 'a demo'
      : 'how FlowPilot can help';

  if (classification.category === 'partnership') {
    return `Thanks for reaching out about a partnership. I'd be glad to set up a short call to learn more about your clients and see whether a referral or reseller arrangement makes sense.`;
  }
  if (classification.category === 'support_request') {
    return `Thanks for letting us know. I've passed your note to our support team, and someone will follow up with next steps shortly.`;
  }
  if (tone === 'concise') {
    return `Thanks for your interest in ${topic}. Are you free for a 20-minute call this week?`;
  }
  if (classification.intent === 'high') {
    return `Thank you for your interest in ${topic}. Based on what you shared about the team${company}, I've put together a few options that fit your goals. Would you have 30 minutes this week for a walkthrough? I can tailor it to the workflows you mentioned.`;
  }
  return `Thanks for getting in touch. I'd be happy to share more about ${topic} and how teams like yours${company} automate lead intake and follow-up. Is there a good time for a short call, or would you prefer a few resources by email first?`;
}

export function draftReply(
  lead,
  { tone = 'friendly', senderName = 'The FlowPilot team', classification } = {},
) {
  const c = classification ?? classifyLead(lead);
  const safeTone = OPENERS[tone] ? tone : 'friendly';
  const name = firstName(lead.name);
  const subject =
    c.category === 'partnership'
      ? `Partnership with ${lead.company ?? 'FlowPilot'}`
      : lead.company
        ? `Next steps for ${lead.company}`
        : 'Thanks for reaching out';

  const body = [
    OPENERS[safeTone](name),
    '',
    bodyFor(lead, c, safeTone),
    '',
    CLOSERS[safeTone],
    String(senderName).slice(0, 80),
  ].join('\n');

  return { subject: subject.slice(0, 160), body, tone: safeTone };
}
