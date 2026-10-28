// Runs once when the Next.js server starts: validates configuration and prints a clear message.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getPublicEnv, getServerEnv } = await import('./lib/env');
  try {
    getPublicEnv();
    const env = getServerEnv();
    console.info(
      `[flowpilot] config ok · AI provider: ${env.AI_PROVIDER} · background processing: ${env.SUPABASE_SECRET_KEY ? 'enabled' : 'dashboard-driven (no secret key)'}`,
    );
  } catch (error) {
    // Public pages still render; authenticated pages show a configuration error.
    console.error(`\n[flowpilot] ${error.message}\n`);
  }
}
