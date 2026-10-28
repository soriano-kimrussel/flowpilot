// Shared, deterministic lead signals used by the rule-based ("demo") AI provider.

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'temp-mail.org',
  'trashmail.com',
  'yopmail.com',
  'getnada.com',
  'sharklasers.com',
  'throwawaymail.com',
]);

export const INTENT_KEYWORDS = {
  high: [
    'demo',
    'pricing',
    'price',
    'quote',
    'purchase',
    'buy',
    'contract',
    'asap',
    'urgent',
    'budget approved',
    'proposal',
    'security review',
  ],
  medium: [
    'interested',
    'evaluate',
    'evaluating',
    'compare',
    'options',
    'trial',
    'learn more',
    'information',
    'info',
  ],
  low: ['just exploring', 'research', 'maybe later', 'student', 'assignment', 'curious'],
};

export const CATEGORY_KEYWORDS = {
  support_request: [
    'bug',
    'error',
    'broken',
    'not working',
    'help with my account',
    'support',
    'issue',
  ],
  partnership: ['partnership', 'partner', 'resell', 'reseller', 'affiliate', 'integration partner'],
  job_application: ['resume', 'cv', 'job opening', 'hiring', 'internship', 'apply for'],
  spam: ['crypto giveaway', 'seo services', 'backlinks', 'casino', 'make money fast', 'loan offer'],
};

export const SENIORITY = [
  {
    pattern: /\b(ceo|cto|coo|cfo|cmo|chief|founder|co-founder|owner|president|partner)\b/i,
    level: 'executive',
    points: 20,
  },
  { pattern: /\b(vp|vice president|director|head of)\b/i, level: 'director', points: 16 },
  { pattern: /\b(manager|lead|principal)\b/i, level: 'manager', points: 10 },
];

export function emailDomain(email) {
  const at = String(email ?? '').lastIndexOf('@');
  return at === -1
    ? ''
    : String(email)
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

export function isFreeEmail(email) {
  return FREE_EMAIL_DOMAINS.has(emailDomain(email));
}

export function isDisposableEmail(email) {
  return DISPOSABLE_EMAIL_DOMAINS.has(emailDomain(email));
}

export function textOf(lead) {
  return `${lead?.message ?? ''} ${lead?.notes ?? ''}`.toLowerCase();
}

export function matchedKeywords(text, keywords) {
  return keywords.filter((k) => text.includes(k));
}

export function seniorityOf(jobTitle) {
  if (!jobTitle) return null;
  return SENIORITY.find((s) => s.pattern.test(jobTitle)) ?? null;
}

export function firstName(name) {
  const first = String(name ?? '')
    .trim()
    .split(/\s+/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}
