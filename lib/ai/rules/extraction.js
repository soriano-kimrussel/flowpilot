// Deterministic field extraction from free-form lead text (emails, signatures, form dumps).
// Regexes are linear-time (no nested quantifiers) to avoid ReDoS on user input.

const MAX_TEXT = 5000;

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}/;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?/;
const NAME_PATTERNS = [
  /\b(?:my name is|i am|i'm|this is)\s+([A-Z][a-z'-]{1,30}(?:\s[A-Z][a-z'-]{1,30}){0,2})/,
  /\bname\s*:\s*([A-Z][a-z'-]{1,30}(?:\s[A-Z][a-z'-]{1,30}){0,2})/i,
  /^\s*(?:regards|thanks|best|cheers|sincerely),?\s*\n\s*([A-Z][a-z'-]{1,30}(?:\s[A-Z][a-z'-]{1,30}){0,2})\s*$/im,
];
const COMPANY_PATTERNS = [
  /\bcompany\s*:\s*([^\n,]{2,80})/i,
  /\b(?:work at|working at|from|at|with)\s+([A-Z][A-Za-z0-9&.'-]{1,40}(?:\s[A-Z][A-Za-z0-9&.'-]{1,40}){0,3})/,
];
const TITLE_PATTERN =
  /\b((?:chief [a-z]+ officer|ceo|cto|coo|cfo|founder|co-founder|owner|vp of [a-z]+|vice president of [a-z]+|director of [a-z]+|head of [a-z]+|[a-z]+ manager|[a-z]+ lead))\b/i;
const BUDGET_PATTERN =
  /(?:budget|spend|around|about|up to)?\s*\$\s?(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?/i;
const SIZE_PATTERN =
  /\b(\d{1,6})\s*(?:\+\s*)?(?:employees|people|staff|team members|person team|-person team)\b|\bteam of\s+(\d{1,6})\b/i;

function clean(value) {
  return value
    ? value
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.,;]$/, '')
    : undefined;
}

function parseBudget(match) {
  if (!match) return undefined;
  let amount = Number(match[1].replace(/[,\s]/g, ''));
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'k') amount *= 1000;
  if (unit === 'm') amount *= 1_000_000;
  return Math.round(amount);
}

export function extractLeadFields(rawText) {
  const text = String(rawText ?? '').slice(0, MAX_TEXT);
  const fields = {};
  const found = [];

  const email = text.match(EMAIL)?.[0];
  if (email) {
    fields.email = email.toLowerCase();
    found.push('email');
  }

  const textWithoutEmail = email ? text.replace(email, ' ') : text;
  const phone = textWithoutEmail.match(PHONE)?.[0];
  if (phone && phone.replace(/\D/g, '').length >= 7) {
    fields.phone = clean(phone);
    found.push('phone');
  }

  for (const pattern of NAME_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      fields.name = clean(m[1]);
      found.push('name');
      break;
    }
  }

  for (const pattern of COMPANY_PATTERNS) {
    const m = text.match(pattern);
    if (m && !/^(the|a|an)$/i.test(m[1])) {
      fields.company = clean(m[1]);
      found.push('company');
      break;
    }
  }

  const title = text.match(TITLE_PATTERN)?.[1];
  if (title) {
    fields.job_title = clean(title).replace(/\b\w/g, (c) => c.toUpperCase());
    found.push('job_title');
  }

  const budget = parseBudget(text.match(BUDGET_PATTERN));
  if (budget) {
    fields.budget = budget;
    found.push('budget');
  }

  const size = text.match(SIZE_PATTERN);
  if (size) {
    fields.company_size = Number(size[1] || size[2]);
    found.push('company_size');
  }

  fields.message = text.trim().slice(0, 2000);
  return { fields, found };
}
