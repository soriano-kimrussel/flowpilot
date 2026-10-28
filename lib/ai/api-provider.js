import { createLLMProvider, fetchWithTimeout } from './llm-common';

/**
 * Optional adapter for an OpenAI-compatible `/chat/completions` endpoint that the user has
 * configured themselves (for example a free tier). Only used when AI_PROVIDER=api is set
 * explicitly; never used as an automatic fallback. The key stays in server env vars.
 */
export function createApiProvider({
  baseUrl,
  apiKey,
  model,
  timeoutMs,
  fetchImpl = fetch,
  logger,
}) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return createLLMProvider({
    name: 'api',
    model,
    logger,
    async complete(messages) {
      const data = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.2 }),
        },
        timeoutMs,
      );
      return data?.choices?.[0]?.message?.content;
    },
  });
}
