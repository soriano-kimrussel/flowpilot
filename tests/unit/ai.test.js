import { describe, expect, it, vi } from 'vitest';
import { createDemoProvider } from '@/lib/ai/demo-provider';
import { getAIProvider, describeProvider } from '@/lib/ai/provider';
import { minimizeLead, parseModelJson, outputSchemas, ProviderError } from '@/lib/ai/llm-common';
import { scoreLead } from '@/lib/ai/rules/scoring';
import { classifyLead } from '@/lib/ai/rules/classification';
import { extractLeadFields } from '@/lib/ai/rules/extraction';
import { suggestSteps } from '@/lib/ai/rules/suggestions';
import { sampleLead } from '../helpers/memory';

const quietLogger = { warn: () => {} };

describe('demo provider (rule-based)', () => {
  it('is deterministic and labeled as simulated', async () => {
    const demo = createDemoProvider();
    const a = await demo.scoreLead(sampleLead);
    const b = await demo.scoreLead(sampleLead);
    expect(a).toEqual(b);
    expect(a.meta).toMatchObject({
      provider: 'demo',
      simulated: true,
      label: 'Rule-based (simulated AI)',
    });
    const draft1 = await demo.draftReply(sampleLead, { tone: 'friendly' });
    const draft2 = await demo.draftReply(sampleLead, { tone: 'friendly' });
    expect(draft1.result.body).toBe(draft2.result.body);
  });

  it('explains every point of the score', () => {
    const result = scoreLead(sampleLead);
    const total = result.factors.reduce((s, f) => s + f.points, 0);
    expect(result.score).toBe(Math.min(100, Math.max(0, total)));
    expect(result.factors.map((f) => f.rule)).toEqual(
      expect.arrayContaining([
        'email.business',
        'company.present',
        'title.director',
        'size.enterprise',
        'budget.high',
        'source.referral',
      ]),
    );
    expect(result.grade).toBe('A');
    expect(result.explanation).toMatch(/Top signals/);
  });

  it('penalizes disposable emails and low intent', () => {
    const result = scoreLead({
      name: 'X',
      email: 'x@mailinator.com',
      message: 'just exploring, student',
    });
    expect(result.score).toBe(0);
    expect(result.factors.some((f) => f.rule === 'email.disposable')).toBe(true);
  });

  it('classifies segments and categories', () => {
    expect(classifyLead({ email: 'a@gmail.com', message: 'hi' }).segment).toBe('individual');
    expect(
      classifyLead({
        email: 'a@acme.example',
        company: 'Acme',
        message: 'We want a reseller partnership',
      }).category,
    ).toBe('partnership');
    expect(classifyLead(sampleLead)).toMatchObject({ segment: 'enterprise', intent: 'high' });
  });

  it('extracts structured fields from free text', () => {
    const text = `Hello, my name is Jordan Blake and I work at Acme Robotics as Head of Operations.
We are a team of 45 and have a budget of $12,500. Reach me at jordan.blake@acme-robotics.example or +1 415 555 0134.`;
    const { fields, found } = extractLeadFields(text);
    expect(fields).toMatchObject({
      name: 'Jordan Blake',
      email: 'jordan.blake@acme-robotics.example',
      company: 'Acme Robotics',
      company_size: 45,
      budget: 12500,
    });
    expect(fields.job_title).toMatch(/Head Of Operations/i);
    expect(found).toEqual(expect.arrayContaining(['name', 'email', 'company', 'phone', 'budget']));
  });

  it('suggests steps from goal keywords', () => {
    const { steps, matchedGoal } = suggestSteps('Qualify inbound leads and notify the team');
    expect(matchedGoal).toBe(true);
    expect(steps).toEqual(
      expect.arrayContaining([
        'lead.validate',
        'lead.score',
        'notification.create',
        'execution.log',
      ]),
    );
  });
});

describe('provider selection', () => {
  it('defaults to demo and never needs a key', async () => {
    const provider = getAIProvider({});
    expect(provider.name).toBe('demo');
    expect(describeProvider({}).mode).toBe('demo');
  });

  it('falls back to labeled rules when api mode is misconfigured', async () => {
    const provider = getAIProvider({ AI_PROVIDER: 'api' });
    const { meta } = await provider.classifyLead(sampleLead);
    expect(meta).toMatchObject({
      provider: 'demo',
      simulated: true,
      fallback: true,
      fallbackReason: 'not_configured',
    });
  });
});

describe('real provider adapters (mocked fetch)', () => {
  const apiEnv = {
    AI_PROVIDER: 'api',
    AI_API_BASE_URL: 'https://llm.example/v1',
    AI_API_KEY: 'k',
    AI_API_MODEL: 'm',
    AI_TIMEOUT_MS: 1000,
  };
  const jsonResponse = (body, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const chat = (content) => jsonResponse({ choices: [{ message: { content } }] });

  it('accepts valid model output and labels it as not simulated', async () => {
    const fetchImpl = vi.fn(async () =>
      chat(
        '{"segment":"enterprise","category":"sales_inquiry","intent":"high","confidence":0.9,"signals":["budget"]}',
      ),
    );
    const provider = getAIProvider(apiEnv, { fetchImpl, logger: quietLogger });
    const { result, meta } = await provider.classifyLead(sampleLead);
    expect(result.segment).toBe('enterprise');
    expect(meta).toMatchObject({ provider: 'api', simulated: false });
  });

  it('never sends email, phone or notes to the model', async () => {
    const fetchImpl = vi.fn(async () =>
      chat('{"summary":"A detailed summary text","keyPoints":[]}'),
    );
    const provider = getAIProvider(apiEnv, { fetchImpl, logger: quietLogger });
    await provider.summarizeLead({
      ...sampleLead,
      phone: '+1 415 555 0134',
      notes: 'internal secret note',
      message: 'call me at +1 415 555 0134 or a@b.example',
    });
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body).not.toContain(sampleLead.email);
    expect(body).not.toContain('555 0134');
    expect(body).not.toContain('internal secret note');
    expect(body).toContain('[phone]');
    expect(body).toContain('[email]');
  });

  it.each([
    ['malformed JSON', async () => chat('not json at all'), 'malformed_output'],
    [
      'schema violation',
      async () => chat('{"segment":"galactic","category":"x","intent":"y","confidence":7}'),
      'malformed_output',
    ],
    ['rate limit', async () => jsonResponse({}, 429), 'rate_limited'],
    ['server error', async () => jsonResponse({}, 503), 'provider_error'],
    [
      'network error',
      async () => {
        throw new TypeError('fetch failed');
      },
      'provider_error',
    ],
  ])('falls back to rules on %s', async (_, impl, reason) => {
    const provider = getAIProvider(apiEnv, { fetchImpl: vi.fn(impl), logger: quietLogger });
    const { result, meta } = await provider.classifyLead(sampleLead);
    expect(meta).toMatchObject({
      provider: 'demo',
      fallback: true,
      fallbackReason: reason,
      simulated: true,
    });
    expect(result).toEqual(classifyLead(sampleLead));
  });

  it('falls back on timeout', async () => {
    const fetchImpl = vi.fn(
      (url, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const provider = getAIProvider(
      { ...apiEnv, AI_TIMEOUT_MS: 20 },
      { fetchImpl, logger: quietLogger },
    );
    const { meta } = await provider.draftReply(sampleLead, {});
    expect(meta.fallbackReason).toBe('timeout');
  });

  it('keeps scoring rule-based for explainability even with a real provider', async () => {
    const fetchImpl = vi.fn();
    const provider = getAIProvider(apiEnv, { fetchImpl, logger: quietLogger });
    const { meta } = await provider.scoreLead(sampleLead);
    expect(meta.provider).toBe('demo');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ollama adapter parses the chat response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: {
          content: '{"subject":"Hello there","body":"Thanks for reaching out to us today."}',
        },
      }),
    );
    const provider = getAIProvider(
      {
        AI_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_MODEL: 'llama3.2',
        AI_TIMEOUT_MS: 1000,
      },
      { fetchImpl, logger: quietLogger },
    );
    const { result, meta } = await provider.draftReply(sampleLead, { tone: 'formal' });
    expect(result.subject).toBe('Hello there');
    expect(meta.provider).toBe('ollama');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });
});

describe('model output parsing', () => {
  it('extracts JSON wrapped in prose or code fences, and rejects oversized garbage', () => {
    expect(
      parseModelJson(
        '```json\n{"subject":"Hi there","body":"This is a long enough body."}\n```',
        outputSchemas.draft,
      ).subject,
    ).toBe('Hi there');
    expect(() => parseModelJson('', outputSchemas.draft)).toThrow(ProviderError);
  });

  it('minimizes lead data', () => {
    const m = minimizeLead({ ...sampleLead, id: 'secret-id', notes: 'n' });
    expect(m).not.toHaveProperty('email');
    expect(m).not.toHaveProperty('id');
    expect(m).not.toHaveProperty('notes');
    expect(m.first_name).toBe('Maya');
  });
});
