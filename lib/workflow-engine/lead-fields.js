// Maps untrusted payloads (webhooks, manual runs) to known lead fields only.

const ALIASES = {
  name: ['name', 'full_name', 'fullName'],
  email: ['email', 'email_address', 'emailAddress'],
  company: ['company', 'company_name', 'companyName', 'organization'],
  job_title: ['job_title', 'jobTitle', 'title', 'role'],
  phone: ['phone', 'phone_number', 'phoneNumber'],
  company_size: ['company_size', 'companySize', 'employees', 'team_size'],
  budget: ['budget'],
  source: ['source', 'utm_source'],
  message: ['message', 'comments', 'inquiry', 'notes'],
};
const NUMERIC = new Set(['company_size', 'budget']);
const MAX = {
  name: 120,
  email: 254,
  company: 120,
  job_title: 120,
  phone: 40,
  source: 40,
  message: 5000,
};

function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && value.trim() !== '' ? Math.max(0, Math.round(n)) : undefined;
  }
  return undefined;
}

export function leadFromPayload(payload) {
  const lead = {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return lead;
  for (const [field, keys] of Object.entries(ALIASES)) {
    const key = keys.find((k) => Object.prototype.hasOwnProperty.call(payload, k));
    if (key === undefined) continue;
    const raw = payload[key];
    if (raw === null || raw === undefined) continue;
    if (NUMERIC.has(field)) {
      const n = toInt(raw);
      if (n !== undefined) lead[field] = n;
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      const text = String(raw).trim().slice(0, MAX[field]);
      if (text) lead[field] = field === 'email' ? text.toLowerCase() : text;
    }
  }
  return lead;
}

/** Public lead fields placed in the execution context (no internal bookkeeping columns). */
export function leadContext(row) {
  if (!row) return null;
  const {
    id,
    name,
    email,
    company,
    job_title,
    phone,
    company_size,
    budget,
    source,
    message,
    notes,
    status,
    score,
    classification,
    assignee,
    priority,
    ai_summary,
  } = row;
  return {
    id,
    name,
    email,
    company,
    job_title,
    phone,
    company_size,
    budget,
    source,
    message,
    notes,
    status,
    score,
    classification,
    assignee,
    priority,
    ai_summary,
  };
}
