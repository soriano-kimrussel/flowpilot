import {
  CATEGORY_KEYWORDS,
  INTENT_KEYWORDS,
  isFreeEmail,
  matchedKeywords,
  textOf,
} from './signals';

export const SEGMENTS = ['enterprise', 'mid_market', 'small_business', 'individual'];
export const CATEGORIES = [
  'sales_inquiry',
  'support_request',
  'partnership',
  'job_application',
  'spam',
];
export const INTENTS = ['high', 'medium', 'low'];

export function classifyLead(lead) {
  const signals = [];
  const text = textOf(lead);
  const size = Number(lead.company_size) || 0;
  const budget = Number(lead.budget) || 0;
  const hasCompany = Boolean(lead.company && String(lead.company).trim());

  let segment;
  if (size >= 200 || budget >= 25000) {
    segment = 'enterprise';
    signals.push(size >= 200 ? `${size} employees` : `budget ${budget}`);
  } else if (size >= 50 || budget >= 8000) {
    segment = 'mid_market';
    signals.push(size >= 50 ? `${size} employees` : `budget ${budget}`);
  } else if (hasCompany || !isFreeEmail(lead.email)) {
    segment = 'small_business';
    signals.push(hasCompany ? 'company provided' : 'business email domain');
  } else {
    segment = 'individual';
    signals.push('personal email and no company');
  }

  let category = 'sales_inquiry';
  for (const [name, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = matchedKeywords(text, keywords);
    if (hits.length) {
      category = name;
      signals.push(`${name.replace('_', ' ')} keywords: ${hits.slice(0, 2).join(', ')}`);
      break;
    }
  }

  const high = matchedKeywords(text, INTENT_KEYWORDS.high);
  const medium = matchedKeywords(text, INTENT_KEYWORDS.medium);
  const low = matchedKeywords(text, INTENT_KEYWORDS.low);
  let intent = 'medium';
  if (high.length > low.length) intent = 'high';
  else if (low.length > 0 || (!medium.length && !high.length && text.trim().length < 10))
    intent = 'low';
  if (high.length) signals.push(`high-intent words: ${high.slice(0, 3).join(', ')}`);
  if (low.length) signals.push(`low-intent words: ${low.slice(0, 2).join(', ')}`);

  const evidence = signals.length + (hasCompany ? 1 : 0) + (lead.job_title ? 1 : 0);
  const confidence = Math.min(0.95, Math.round((0.45 + evidence * 0.1) * 100) / 100);

  return { segment, category, intent, confidence, signals };
}
