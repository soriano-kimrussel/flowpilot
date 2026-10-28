// Runs the real migrations inside PGlite (Postgres compiled to WASM) with a minimal Supabase
// shim: auth schema, auth.uid() from JWT claims, anon/authenticated/service_role roles and
// Supabase's default grants. This lets RLS and database functions be tested locally with no
// external credentials. It does not emulate PostgREST or GoTrue.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create schema extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createTestDatabase() {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SHIM);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return db;
}

/** Creates an auth user (fires the signup trigger) and returns its id. */
export async function createUser(db, { email, fullName, workspaceName } = {}) {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    email ?? `${id.slice(0, 8)}@test.example`,
    JSON.stringify({ full_name: fullName ?? 'Test User', workspace_name: workspaceName }),
  ]);
  const { rows } = await db.query(
    'select workspace_id from public.workspace_members where user_id = $1',
    [id],
  );
  return { id, workspaceId: rows[0].workspace_id };
}

/**
 * Runs `fn(tx)` as an authenticated user inside a transaction that is always rolled back,
 * mirroring how PostgREST sets the role and JWT claims per request.
 */
export async function asUser(db, userId, fn, { role = 'authenticated', commit = false } = {}) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId ? JSON.stringify({ sub: userId, role }) : '',
    ]);
    await tx.exec(`set local role ${role}`);
    try {
      return await fn(tx);
    } finally {
      if (!commit) await tx.rollback();
    }
  });
}

/** Runs as `role` and commits (for setup steps that must persist). */
export function asUserCommit(db, userId, fn, role = 'authenticated') {
  return asUser(db, userId, fn, { role, commit: true });
}

export async function expectDenied(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the database to deny this operation, but it succeeded');
}
