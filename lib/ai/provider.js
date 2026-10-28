import { createApiProvider } from './api-provider';
import { createDemoProvider } from './demo-provider';
import { createOllamaProvider } from './ollama-provider';

/**
 * Provider interface (all methods async, all return { result, meta }):
 *   classifyLead(lead), scoreLead(lead), summarizeLead(lead, ctx), draftReply(lead, opts),
 *   extractLeadFields(text), suggestSteps(goal)
 * meta = { provider, model, simulated, label, fallback?, fallbackReason? }
 *
 * `env` is the validated server env (see lib/env.js getServerEnv). Defaults to demo mode.
 */
export function getAIProvider(env = {}, { fetchImpl, logger } = {}) {
  const mode = env.AI_PROVIDER ?? 'demo';

  if (mode === 'ollama') {
    return createOllamaProvider({
      baseUrl: env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      model: env.OLLAMA_MODEL ?? 'llama3.2',
      timeoutMs: env.AI_TIMEOUT_MS ?? 15000,
      fetchImpl,
      logger,
    });
  }

  if (mode === 'api') {
    if (!env.AI_API_BASE_URL || !env.AI_API_KEY || !env.AI_API_MODEL) {
      // Misconfiguration never blocks the app: run rule-based and say so.
      return createDemoProvider({
        label: 'Rule-based (AI_PROVIDER=api is not fully configured)',
        fallback: true,
        fallbackReason: 'not_configured',
      });
    }
    return createApiProvider({
      baseUrl: env.AI_API_BASE_URL,
      apiKey: env.AI_API_KEY,
      model: env.AI_API_MODEL,
      timeoutMs: env.AI_TIMEOUT_MS ?? 15000,
      fetchImpl,
      logger,
    });
  }

  return createDemoProvider();
}

export function describeProvider(env = {}) {
  const mode = env.AI_PROVIDER ?? 'demo';
  if (mode === 'ollama')
    return { mode, label: `Ollama (${env.OLLAMA_MODEL ?? 'llama3.2'}), local development only` };
  if (mode === 'api') {
    const configured = Boolean(env.AI_API_BASE_URL && env.AI_API_KEY && env.AI_API_MODEL);
    return {
      mode,
      label: configured
        ? `OpenAI-compatible API (${env.AI_API_MODEL})`
        : 'API mode selected but not configured; using rules',
    };
  }
  return { mode: 'demo', label: 'Rule-based demo mode (no external AI calls)' };
}
