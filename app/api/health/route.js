import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/env';
import { describeProvider } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

/** Health check: configuration and Supabase reachability. Exposes no secrets or IDs. */
export async function GET() {
  const configured = isSupabaseConfigured();
  let database = 'not_configured';
  if (configured) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      });
      database = res.ok ? 'reachable' : `unhealthy (${res.status})`;
    } catch {
      database = 'unreachable (the free project may be paused)';
    }
  }
  const ai = describeProvider({
    AI_PROVIDER: process.env.AI_PROVIDER || 'demo',
    AI_API_MODEL: process.env.AI_API_MODEL,
    AI_API_BASE_URL: process.env.AI_API_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY ? 'set' : '',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  });
  const ok = database === 'reachable';
  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      supabase: database,
      aiProvider: ai.mode,
      backgroundProcessing: process.env.SUPABASE_SECRET_KEY ? 'enabled' : 'dashboard-driven',
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
