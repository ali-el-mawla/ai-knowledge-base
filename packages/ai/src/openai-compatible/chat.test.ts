import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatModelConfig } from '../config.js';
import { AiProviderError } from '../errors.js';
import { createChatModel, isAbortError } from '../index.js';
import { type ChatCapabilities, PROVIDER_PRESETS, type ProviderPreset } from '../presets.js';
import { collect, fakeFetch, json, noAnswer, openSse, sse } from '../testing/fake-fetch.js';
import type { ChatRequest } from '../types.js';

const CAPABILITIES: ChatCapabilities = {
  maxTokensParam: 'max_tokens',
  temperatureRange: [0, 1],
  streamUsage: true,
};

function preset(chat: Partial<ChatCapabilities> = {}): ProviderPreset {
  return {
    name: 'test',
    baseUrl: 'https://llm.test/v1',
    requiresApiKey: true,
    chat: { ...CAPABILITIES, ...chat },
    embeddings: null,
    docs: '',
  };
}

function config(from: ProviderPreset = preset()): ChatModelConfig {
  return {
    preset: from,
    baseUrl: from.baseUrl,
    apiKey: 'test-key',
    model: 'test-model',
    temperature: null,
  };
}

const REQUEST: ChatRequest = {
  messages: [
    { role: 'system', content: 'Answer from the sources.' },
    { role: 'user', content: 'What is the refund window?' },
  ],
  maxTokens: 200,
};

function completion(content: string | null, finishReason = 'stop', usage?: object) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    ...(usage && { usage }),
  };
}

function chunk(delta: object, finishReason: string | null = null) {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

const USAGE = { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 };
const USAGE_CHUNK = { ...chunk({}), choices: [], usage: USAGE };
const EVENTS = [
  chunk({ role: 'assistant', content: '' }),
  chunk({ content: 'Refunds ' }),
  chunk({ content: 'within 14 days.' }),
  chunk({}, 'stop'),
];

describe('OpenAI-compatible chat: request mapping', () => {
  it('posts the model, the messages and the key to the configured base URL', async () => {
    const http = fakeFetch(() => json(completion('14 days.')));
    const model = createChatModel(config(), { fetch: http.fetch });
    await model.complete(REQUEST);

    const [request] = http.requests;
    expect(request?.url).toBe('https://llm.test/v1/chat/completions');
    expect(request?.headers.get('authorization')).toBe('Bearer test-key');
    expect(request?.body).toMatchObject({ model: 'test-model', messages: REQUEST.messages });
  });

  it.each(['max_tokens', 'max_completion_tokens'] as const)(
    'puts the output cap in %s when the preset says so',
    async (field) => {
      const http = fakeFetch(() => json(completion('ok')));
      await createChatModel(config(preset({ maxTokensParam: field })), {
        fetch: http.fetch,
      }).complete(REQUEST);

      const body = http.requests[0]?.body;
      expect(body?.[field]).toBe(200);
      const other = field === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
      expect(body).not.toHaveProperty(other);
    },
  );

  it.each([
    { range: [0, 1] as const, requested: 1.7, sent: 1 },
    { range: [0, 1] as const, requested: -0.5, sent: 0 },
    { range: [0, 2] as const, requested: 1.7, sent: 1.7 },
    { range: [0, 2] as const, requested: 0.2, sent: 0.2 },
  ])('clamps temperature $requested into $range', async ({ range, requested, sent }) => {
    const http = fakeFetch(() => json(completion('ok')));
    await createChatModel(config(preset({ temperatureRange: range })), {
      fetch: http.fetch,
    }).complete({ ...REQUEST, temperature: requested });
    expect(http.requests[0]?.body.temperature).toBe(sent);
  });

  it('uses the configured temperature when the request has none', async () => {
    const http = fakeFetch(() => json(completion('ok')));
    await createChatModel({ ...config(), temperature: 0.3 }, { fetch: http.fetch }).complete(
      REQUEST,
    );
    expect(http.requests[0]?.body.temperature).toBe(0.3);
  });

  it('omits temperature when the caller does not set one', async () => {
    const http = fakeFetch(() => json(completion('ok')));
    await createChatModel(config(), { fetch: http.fetch }).complete(REQUEST);
    expect(http.requests[0]?.body).not.toHaveProperty('temperature');
  });

  it('uses the verified field for the Anthropic preset', async () => {
    const http = fakeFetch(() => json(completion('ok')));
    await createChatModel(config(PROVIDER_PRESETS.anthropic), { fetch: http.fetch }).complete({
      ...REQUEST,
      temperature: 1.5,
    });
    expect(http.requests[0]?.body).toMatchObject({ max_tokens: 200, temperature: 1 });
  });

  it('ignores OPENAI_ORG_ID and OPENAI_PROJECT_ID from the environment', async () => {
    vi.stubEnv('OPENAI_ORG_ID', 'org-leak');
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj-leak');
    const http = fakeFetch(() => json(completion('ok')));
    await createChatModel(config(), { fetch: http.fetch }).complete(REQUEST);
    expect(http.requests[0]?.headers.has('openai-organization')).toBe(false);
    expect(http.requests[0]?.headers.has('openai-project')).toBe(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe('OpenAI-compatible chat: complete()', () => {
  it('returns the text, the usage and the finish reason', async () => {
    const http = fakeFetch(() => json(completion('Refunds within 14 days.', 'stop', USAGE)));
    const model = createChatModel(config(), { fetch: http.fetch });

    await expect(model.complete(REQUEST)).resolves.toEqual({
      text: 'Refunds within 14 days.',
      usage: { promptTokens: 42, completionTokens: 7 },
      finishReason: 'stop',
    });
    expect(model.info).toEqual({ provider: 'test', model: 'test-model' });
  });

  it.each([
    ['length', 'length'],
    ['tool_calls', 'other'],
    ['content_filter', 'other'],
  ])('maps finish reason %s to %s, with null usage when absent', async (reason, expected) => {
    const http = fakeFetch(() => json(completion('partial', reason)));
    const result = await createChatModel(config(), { fetch: http.fetch }).complete(REQUEST);
    expect(result.finishReason).toBe(expected);
    expect(result.usage).toBeNull();
  });
});

describe('OpenAI-compatible chat: stream()', () => {
  it('yields deltas, then usage, then finish', async () => {
    const http = fakeFetch(() => sse([...EVENTS, USAGE_CHUNK]));
    const parts = await collect(createChatModel(config(), { fetch: http.fetch }).stream(REQUEST));

    expect(parts).toEqual([
      { type: 'delta', text: 'Refunds ' },
      { type: 'delta', text: 'within 14 days.' },
      { type: 'usage', usage: { promptTokens: 42, completionTokens: 7 } },
      { type: 'finish', reason: 'stop' },
    ]);
    expect(http.requests[0]?.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it('does not ask for usage when the preset does not support it, and skips the part', async () => {
    const http = fakeFetch(() => sse(EVENTS));
    const parts = await collect(
      createChatModel(config(preset({ streamUsage: false })), { fetch: http.fetch }).stream(
        REQUEST,
      ),
    );

    expect(http.requests[0]?.body).not.toHaveProperty('stream_options');
    expect(parts.map((part) => part.type)).toEqual(['delta', 'delta', 'finish']);
  });

  it('still reports usage a provider sends without being asked', async () => {
    const http = fakeFetch(() =>
      sse([...EVENTS.slice(0, -1), { ...chunk({}, 'length'), usage: USAGE }]),
    );
    const parts = await collect(
      createChatModel(config(preset({ streamUsage: false })), { fetch: http.fetch }).stream(
        REQUEST,
      ),
    );
    expect(parts.slice(-2)).toEqual([
      { type: 'usage', usage: { promptTokens: 42, completionTokens: 7 } },
      { type: 'finish', reason: 'length' },
    ]);
  });

  it('fails as invalid_response when the stream ends without a finish reason', async () => {
    const http = fakeFetch(() => sse(EVENTS.slice(0, 2)));
    const parts: string[] = [];
    const run = async () => {
      for await (const part of createChatModel(config(), { fetch: http.fetch }).stream(REQUEST)) {
        parts.push(part.type);
      }
    };
    await expect(run()).rejects.toMatchObject({ kind: 'invalid_response' });
    expect(parts).toEqual(['delta']);
  });
});

describe('OpenAI-compatible chat: aborts', () => {
  it('rejects with the abort error, not AiProviderError, when the signal fired first', async () => {
    const http = fakeFetch(() => json(completion('never used')));
    const controller = new AbortController();
    controller.abort();

    const error = await createChatModel(config(), { fetch: http.fetch })
      .complete(REQUEST, { signal: controller.signal })
      .catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(AiProviderError);
  });

  it('rejects with the abort error when aborted while waiting for the response', async () => {
    const http = fakeFetch((_request, init) => noAnswer(init));
    const controller = new AbortController();
    const pending = createChatModel(config(), { fetch: http.fetch }).complete(REQUEST, {
      signal: controller.signal,
    });
    controller.abort();
    const error = await pending.catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
  });

  it('stops a stream mid-answer with the abort error and no finish part', async () => {
    const http = fakeFetch(() => openSse(EVENTS.slice(0, 2)));
    const controller = new AbortController();
    const parts: string[] = [];
    const run = async () => {
      const stream = createChatModel(config(), { fetch: http.fetch }).stream(REQUEST, {
        signal: controller.signal,
      });
      for await (const part of stream) {
        parts.push(part.type);
        controller.abort();
      }
    };

    const error = await run().catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(AiProviderError);
    expect(parts).toEqual(['delta']);
  });
});

describe('OpenAI-compatible chat: errors', () => {
  function failWith(status: number, error: object) {
    const http = fakeFetch(() => json({ error }, status));
    return createChatModel(config(), { fetch: http.fetch, maxRetries: 0 }).complete(REQUEST);
  }

  it.each([
    { status: 401, error: { message: 'invalid x-api-key' }, kind: 'auth' },
    { status: 403, error: { message: 'forbidden' }, kind: 'auth' },
    { status: 429, error: { message: 'rate limited' }, kind: 'rate_limit' },
    {
      status: 400,
      error: { message: 'prompt is too long: 210000 tokens > 200000 maximum' },
      kind: 'context_length',
    },
    {
      status: 400,
      error: { message: "This model's maximum context length is 8192 tokens." },
      kind: 'context_length',
    },
    {
      status: 400,
      error: { message: 'Too long', code: 'context_length_exceeded' },
      kind: 'context_length',
    },
    { status: 400, error: { message: 'messages: field required' }, kind: 'bad_request' },
    { status: 404, error: { message: 'model "x" not found' }, kind: 'bad_request' },
    { status: 500, error: { message: 'internal error' }, kind: 'unavailable' },
    { status: 529, error: { message: 'overloaded' }, kind: 'unavailable' },
  ])('maps HTTP $status to $kind', async ({ status, error, kind }) => {
    const caught = await failWith(status, error).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AiProviderError);
    expect(caught).toMatchObject({ kind, status, provider: 'test' });
    expect((caught as AiProviderError).message).toContain(error.message);
  });

  it('marks rate limits and outages as retryable, auth and bad requests as not', async () => {
    const retryable = async (status: number) =>
      ((await failWith(status, { message: 'x' }).catch((e: unknown) => e)) as AiProviderError)
        .retryable;
    expect(await retryable(429)).toBe(true);
    expect(await retryable(503)).toBe(true);
    expect(await retryable(401)).toBe(false);
    expect(await retryable(400)).toBe(false);
  });

  it('maps a refused connection to unavailable', async () => {
    const http = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    const model = createChatModel(config(), { fetch: http.fetch, maxRetries: 0 });
    await expect(model.complete(REQUEST)).rejects.toMatchObject({
      kind: 'unavailable',
      status: null,
    });
  });

  it('maps an unanswered request to timeout', async () => {
    const http = fakeFetch((_request, init) => noAnswer(init));
    const model = createChatModel(config(), { fetch: http.fetch, maxRetries: 0, timeoutMs: 20 });
    await expect(model.complete(REQUEST)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('retries a 503 and succeeds on the next attempt', async () => {
    const http = fakeFetch(() =>
      // retry-after-ms: 0 skips the SDK's backoff delay.
      http.requests.length === 1
        ? json({ error: { message: 'busy' } }, 503, { 'retry-after-ms': '0' })
        : json(completion('ok')),
    );
    const model = createChatModel(config(), { fetch: http.fetch, maxRetries: 1 });
    await expect(model.complete(REQUEST)).resolves.toMatchObject({ text: 'ok' });
    expect(http.requests).toHaveLength(2);
  });

  it.each([
    ['no choices', { ...completion('x'), choices: [] }],
    ['null content', completion(null)],
  ])('maps a completion with %s to invalid_response', async (_label, body) => {
    const http = fakeFetch(() => json(body));
    await expect(
      createChatModel(config(), { fetch: http.fetch }).complete(REQUEST),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('maps a body that is not JSON to invalid_response', async () => {
    const http = fakeFetch(
      () => new Response('<html>502</html>', { headers: { 'content-type': 'application/json' } }),
    );
    await expect(
      createChatModel(config(), { fetch: http.fetch }).complete(REQUEST),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('maps an error event inside a stream to unavailable', async () => {
    const http = fakeFetch(() =>
      sse([
        chunk({ content: 'Refunds ' }),
        { error: { message: 'Overloaded', type: 'overloaded_error' } },
      ]),
    );
    await expect(
      collect(createChatModel(config(), { fetch: http.fetch }).stream(REQUEST)),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
