// Validates .env.local (or the current environment) without printing secret values.
// Usage: npm run check-env
import { existsSync, readFileSync } from 'node:fs';

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/g, ''),
        ];
      }),
  );
}

const env = { ...loadDotEnv('.env.local'), ...process.env };
const problems = [];
const notes = [];

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) problems.push('NEXT_PUBLIC_SUPABASE_URL is missing');
else if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) &&
  !url.startsWith('http://127.0.0.1') &&
  !url.startsWith('http://localhost')
) {
  notes.push(
    'NEXT_PUBLIC_SUPABASE_URL does not look like https://<ref>.supabase.co (fine if self-hosted)',
  );
}

const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!pub) problems.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing');
else if (pub.startsWith('sb_secret_'))
  problems.push(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a SECRET key. Never expose it publicly!',
  );
else if (!pub.startsWith('sb_publishable_'))
  notes.push('Publishable key does not start with sb_publishable_ (legacy anon keys also work)');

for (const [key, value] of Object.entries(env)) {
  if (
    key.startsWith('NEXT_PUBLIC_') &&
    /secret|service_role/i.test(`${key}${value ?? ''}`) &&
    key !== 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  ) {
    problems.push(`${key} looks like a secret exposed to the browser`);
  }
}

if (env.SUPABASE_SECRET_KEY) {
  if (!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_'))
    notes.push(
      'SUPABASE_SECRET_KEY does not start with sb_secret_ (legacy service_role JWTs also work)',
    );
  notes.push(
    'SUPABASE_SECRET_KEY set: webhook jobs are processed immediately and the cron endpoint can run.',
  );
} else {
  notes.push(
    'SUPABASE_SECRET_KEY not set: queued webhook/scheduled jobs are processed from the dashboard ("Process queue now").',
  );
}
if (env.SUPABASE_SECRET_KEY && !env.CRON_SECRET)
  notes.push('CRON_SECRET not set: /api/cron/process-jobs will reject all calls.');

const mode = env.AI_PROVIDER || 'demo';
if (!['demo', 'ollama', 'api'].includes(mode))
  problems.push(`AI_PROVIDER must be demo, ollama or api (got "${mode}")`);
if (mode === 'api' && !(env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_API_MODEL)) {
  notes.push(
    'AI_PROVIDER=api but AI_API_BASE_URL / AI_API_KEY / AI_API_MODEL are incomplete: rule-based mode will be used.',
  );
}

console.log(
  `FlowPilot environment check (${existsSync('.env.local') ? '.env.local found' : 'no .env.local; using process env'})`,
);
notes.forEach((n) => console.log(`  • ${n}`));
if (problems.length) {
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exit(1);
}
console.log('  ✓ Required configuration present. AI provider:', mode);
