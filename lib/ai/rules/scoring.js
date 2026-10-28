import {
  INTENT_KEYWORDS,
  isDisposableEmail,
  isFreeEmail,
  matchedKeywords,
  seniorityOf,
  textOf,
} from './signals';

export const SCORING_RULES_VERSION = 'rules-v1';

const SOURCE_POINTS = {
  referral: 12,
  demo_request: 10,
  website: 8,
  event: 6,
  webinar: 6,
  webhook: 6,
  partner: 6,
  social: 2,
  cold_outreach: 0,
  import: 0,
  manual: 2,
};

export function gradeFor(score) {
  if (score >= 75) return { grade: 'A', label: 'Hot' };
  if (score >= 50) return { grade: 'B', label: 'Warm' };
  if (score >= 25) return { grade: 'C', label: 'Cool' };
  return { grade: 'D', label: 'Cold' };
}

/**
 * Explainable, deterministic lead score (0-100). Every point awarded or removed is listed as a
 * factor so the UI can show exactly why a lead received its score.
 */
export function scoreLead(lead) {
  const factors = [];
  const add = (rule, points, reason) => factors.push({ rule, points, reason });

  if (isDisposableEmail(lead.email)) {
    add('email.disposable', -30, 'Disposable email domain');
  } else if (isFreeEmail(lead.email)) {
    add('email.free', 0, 'Personal email address (no company domain)');
  } else if (lead.email) {
    add('email.business', 15, 'Business email domain');
  }

  if (lead.company && String(lead.company).trim())
    add('company.present', 10, 'Company name provided');

  const seniority = seniorityOf(lead.job_title);
  if (seniority) {
    add(`title.${seniority.level}`, seniority.points, `Decision-maker title (${lead.job_title})`);
  } else if (lead.job_title) {
    add('title.other', 3, `Job title provided (${lead.job_title})`);
  }

  const size = Number(lead.company_size);
  if (Number.isFinite(size) && size > 0) {
    if (size >= 200) add('size.enterprise', 15, `Company size ${size}+ employees`);
    else if (size >= 50) add('size.mid', 10, `Company size ${size} employees`);
    else if (size >= 11) add('size.small', 6, `Company size ${size} employees`);
    else add('size.micro', 2, `Company size ${size} employees`);
  }

  const budget = Number(lead.budget);
  if (Number.isFinite(budget) && budget > 0) {
    if (budget >= 10000) add('budget.high', 20, `Budget ${budget.toLocaleString('en-US')}`);
    else if (budget >= 2000) add('budget.medium', 10, `Budget ${budget.toLocaleString('en-US')}`);
    else add('budget.low', 4, `Budget ${budget.toLocaleString('en-US')}`);
  }

  const text = textOf(lead);
  const highIntent = matchedKeywords(text, INTENT_KEYWORDS.high);
  if (highIntent.length) {
    add(
      'intent.high',
      Math.min(highIntent.length * 4, 16),
      `Buying-intent keywords: ${highIntent.slice(0, 4).join(', ')}`,
    );
  }
  const lowIntent = matchedKeywords(text, INTENT_KEYWORDS.low);
  if (lowIntent.length)
    add('intent.low', -10, `Low-intent language: ${lowIntent.slice(0, 3).join(', ')}`);

  const message = String(lead.message ?? '').trim();
  if (message.length >= 40) add('message.detailed', 4, 'Detailed inquiry message');
  else if (message.length > 0 && message.length < 10)
    add('message.minimal', -5, 'Very short message');

  const sourceKey = String(lead.source ?? 'manual').toLowerCase();
  const sourcePoints = SOURCE_POINTS[sourceKey] ?? 2;
  if (sourcePoints) add(`source.${sourceKey}`, sourcePoints, `Lead source: ${sourceKey}`);

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const { grade, label } = gradeFor(score);

  const positives = factors.filter((f) => f.points > 0).sort((a, b) => b.points - a.points);
  const negatives = factors.filter((f) => f.points < 0);
  const explanation = [
    `Score ${score}/100 (grade ${grade}, ${label.toLowerCase()}).`,
    positives.length
      ? `Top signals: ${positives
          .slice(0, 3)
          .map((f) => `${f.reason} (+${f.points})`)
          .join('; ')}.`
      : 'No positive signals found.',
    negatives.length
      ? `Penalties: ${negatives.map((f) => `${f.reason} (${f.points})`).join('; ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { score, grade, label, factors, explanation, rulesVersion: SCORING_RULES_VERSION };
}
