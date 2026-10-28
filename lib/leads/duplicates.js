// Duplicate lead detection (pure functions; DB access happens in the services layer).

const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Canonical form of an email for duplicate detection:
 * lowercase, strip "+tag", and for Gmail also ignore dots in the local part.
 */
export function canonicalEmail(email) {
  const value = String(email ?? '')
    .trim()
    .toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  local = local.split('+')[0];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|corp|co)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Returns potential duplicates of `candidate` among `rows` (excluding the candidate itself).
 * Reasons: exact email, equivalent email (+tags / Gmail dots), or same name at the same company.
 */
export function findDuplicateMatches(candidate, rows) {
  const email = String(candidate.email ?? '')
    .trim()
    .toLowerCase();
  const canonical = canonicalEmail(email);
  const name = normalizeText(candidate.name);
  const company = normalizeText(candidate.company);
  const matches = [];

  for (const row of rows) {
    if (candidate.id && row.id === candidate.id) continue;
    const rowEmail = String(row.email ?? '')
      .trim()
      .toLowerCase();
    let reason = null;
    if (email && rowEmail === email) reason = 'same email';
    else if (canonical && canonicalEmail(rowEmail) === canonical)
      reason = 'equivalent email address';
    else if (
      name &&
      company &&
      normalizeText(row.name) === name &&
      normalizeText(row.company) === company
    ) {
      reason = 'same name and company';
    }
    if (reason) matches.push({ id: row.id, name: row.name, reason });
  }
  return matches;
}

export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}
