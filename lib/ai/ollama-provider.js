import { createLLMProvider, fetchWithTimeout } from './llm-common';

/**
 * Optional local development adapter for an Ollama server (https://ollama.com).
 * Not available on Vercel; when unreachable every call falls back to rule-based results.
 */
export function createOllamaProvider({ baseUrl, model, timeoutMs, fetchImpl = fetch, logger }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  return createLLMProvider({
    name: 'ollama',
    model,
    logger,
    async complete(messages) {
      const data = await fetchWithTimeout(
        fetchImpl,
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            format: 'json',
            options: { num_predict: 500, temperature: 0.2 },
          }),
        },
        timeoutMs,
      );
      return data?.message?.content;
    },
  });
}
