// Hosted Supabase integration test: exercises RLS through the real PostgREST API and Auth.
// Skipped unless a DEDICATED TEST project is configured (never point this at production):
//   TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY, TEST_SUPABASE_SECRET_KEY
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL;
const publishable = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.TEST_SUPABASE_SECRET_KEY;
const configured = Boolean(url && publishable && secret);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configured)('hosted Supabase: RLS through the API', () => {
  let admin;
  const users = [];

  async function makeUser(label) {
    const email = `fp-test-${label}-${randomUUID().slice(0, 8)}@example.com`;
    const password = `Test-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: label },
    });
    if (error) throw error;
    const client = createClient(url, publishable, opts);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const { data: membership } = await client
      .from('workspace_members')
      .select('workspace_id')
      .single();
    const user = { id: data.user.id, client, workspaceId: membership.workspace_id };
    users.push(user);
    return user;
  }

  let a;
  let b;
  beforeAll(async () => {
    admin = createClient(url, secret, opts);
    a = await makeUser('a');
    b = await makeUser('b');
    const { error } = await a.client
      .from('leads')
      .insert({
        workspace_id: a.workspaceId,
        name: 'Private lead',
        email: `p-${randomUUID().slice(0, 6)}@a.example`,
      });
    if (error) throw error;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    for (const u of users) {
      await admin.from('workspaces').delete().eq('id', u.workspaceId);
      await admin.auth.admin.deleteUser(u.id);
    }
  });

  it('a user cannot read another workspace’s leads', async () => {
    const { data } = await b.client.from('leads').select('id').eq('workspace_id', a.workspaceId);
    expect(data).toEqual([]);
  });

  it('a user cannot write into another workspace', async () => {
    const { error } = await b.client
      .from('leads')
      .insert({ workspace_id: a.workspaceId, name: 'x', email: 'x@x.example' });
    expect(error?.code).toBe('42501');
  });

  it('anonymous clients cannot read tenant tables', async () => {
    const anon = createClient(url, publishable, opts);
    const { data, error } = await anon.from('leads').select('id');
    expect(data ?? []).toEqual([]);
    expect(error).toBeTruthy();
  });

  it('dashboard metrics are scoped by RLS', async () => {
    const { data } = await b.client.rpc('get_dashboard_metrics', {
      p_workspace_id: a.workspaceId,
      p_days: 14,
      p_include_demo: true,
    });
    expect(data.leads.total).toBe(0);
  });
});
