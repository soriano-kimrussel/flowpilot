import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv, getServerEnv } from '@/lib/env';

/**
 * Elevated Supabase client (bypasses RLS). Narrow scope only:
 * processing queued webhook / scheduled jobs when no user session exists (cron + webhook).
 * Every query made with this client MUST filter by workspace_id explicitly.
 * Returns null when SUPABASE_SECRET_KEY is not configured.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = getServerEnv();
  if (!SUPABASE_SECRET_KEY) return null;
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
