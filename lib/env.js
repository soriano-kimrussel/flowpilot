import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: 'NEXT_PUBLIC_SUPABASE_URL is missing' })
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL (https://<ref>.supabase.co)'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing' })
    .min(20, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks too short'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(['demo', 'ollama', 'api']).default('demo'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2'),
  AI_API_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_API_MODEL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
});

function emptyToUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === '' ? undefined : v]));
}

function formatIssues(error) {
  return error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
}

function readPublic() {
  // Literal process.env.NEXT_PUBLIC_* accesses so Next.js can inline them into client bundles.
  return emptyToUndefined({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export function getPublicEnv() {
  const parsed = publicSchema.safeParse(readPublic());
  if (!parsed.success) {
    throw new Error(
      `FlowPilot configuration error. Copy .env.example to .env.local and set:\n${formatIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function isSupabaseConfigured() {
  return publicSchema.safeParse(readPublic()).success;
}

/** Server-only configuration. Never pass the result to client components. */
export function getServerEnv(source = process.env) {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() must not be called in the browser');
  }
  const parsed = serverSchema.safeParse(emptyToUndefined({ ...source }));
  if (!parsed.success) {
    throw new Error(`FlowPilot server configuration error:\n${formatIssues(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.SUPABASE_SECRET_KEY?.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SECRET_KEY contains a publishable key. Use the sb_secret_ key.');
  }
  return env;
}

export function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
