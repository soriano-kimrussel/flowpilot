// Explicit local/demo setup command: creates (or reuses) a demo user and loads demo data into
// that user's workspace. Requires SUPABASE_SECRET_KEY. Never run against production data.
//
// Usage:
//   DEMO_EMAIL=demo@example.com DEMO_PASSWORD='Demo-pass-123' npm run db:seed
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [
        l.slice(0, l.indexOf('=')).trim(),
        l
          .slice(l.indexOf('=') + 1)
          .trim()
          .replace(/^["']|["']$/g, ''),
      ]),
  );
}

const env = { ...loadDotEnv('.env.local'), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = env.SUPABASE_SECRET_KEY;
const email = env.DEMO_EMAIL;
const password = env.DEMO_PASSWORD;

if (!url || !publishable || !secret) {
  console.error(
    'Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (in .env.local).',
  );
  console.error(
    'Alternative without a secret key: register in the app and use Settings → Demo data → Load demo data.',
  );
  process.exit(1);
}
if (!email || !password || password.length < 8) {
  console.error('Set DEMO_EMAIL and DEMO_PASSWORD (8+ characters) for the demo account.');
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);

const { error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Demo User', workspace_name: 'FlowPilot Demo' },
});
if (createError && !/already|registered|exists/i.test(createError.message)) {
  console.error('Could not create demo user:', createError.message);
  process.exit(1);
}
console.log(createError ? `Reusing existing user ${email}` : `Created demo user ${email}`);

// Sign in as the demo user so seeding runs through RLS exactly like the in-app button.
const client = createClient(url, publishable, opts);
const { error: signInError } = await client.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error(
    'Could not sign in as the demo user (wrong password for an existing account?):',
    signInError.message,
  );
  process.exit(1);
}
const { data: membership, error: memberError } = await client
  .from('workspace_members')
  .select('workspace_id, workspaces(name)')
  .eq('role', 'owner')
  .limit(1)
  .single();
if (memberError) {
  console.error('Demo user has no workspace:', memberError.message);
  process.exit(1);
}
const { data, error } = await client.rpc('seed_demo_data', {
  p_workspace_id: membership.workspace_id,
});
if (error) {
  console.error('Seeding failed:', error.message);
  process.exit(1);
}
console.log(`Workspace "${membership.workspaces.name}":`, data);
console.log('Done. Sign in with the demo credentials to explore.');
