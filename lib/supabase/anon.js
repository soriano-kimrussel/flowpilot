import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';

/** Stateless client with the publishable key and no user session (anon role). */
export function createAnonClient() {
  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
