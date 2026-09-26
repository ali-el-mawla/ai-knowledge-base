import { describe, expect, it } from 'vitest';
import { loadAiConfig } from './config.js';
import { AiConfigError } from './errors.js';
import { PRESET_NAMES } from './presets.js';

const BASE_ENV = {
  CHAT_PROVIDER: 'anthropic',
  CHAT_MODEL: 'claude-haiku-4-5',
  CHAT_API_KEY: 'test-key',
  EMBEDDING_PROVIDER: 'ollama',
  EMBEDDING_MODEL: 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: '768',
  EMBEDDING_DOCUMENT_PREFIX: 'search_document: ',
  EMBEDDING_QUERY_PREFIX: 'search_query: ',
};

function load(overrides: Record<string, string | undefined>) {
  return loadAiConfig({ ...BASE_ENV, ...overrides });
}

describe('loadAiConfig: chat', () => {
  it('builds the chat config from the preset', () => {
    const { chat, chatDisabledReason } = load({});
    expect(chatDisabledReason).toBeNull();
    expect(chat).toMatchObject({
      baseUrl: 'https://api.anthropic.com/v1/',
      apiKey: 'test-key',
      model: 'claude-haiku-4-5',
    });
    expect(chat?.preset.name).toBe('anthropic');
  });

  it.each([undefined, '', '   '])('disables chat when CHAT_PROVIDER is %j', (value) => {
    const config = load({ CHAT_PROVIDER: value });
    expect(config.chat).toBeNull();
    expect(config.rewrite).toBeNull();
    expect(config.chatDisabledReason).toBe('CHAT_PROVIDER is not set');
    expect(config.embedding.model).toBe('nomic-embed-text');
  });

  it('disables chat, with the reason, when a key-requiring provider has no key', () => {
    const config = load({ CHAT_API_KEY: '' });
    expect(config.chat).toBeNull();
    expect(config.chatDisabledReason).toBe('CHAT_API_KEY is not set for "anthropic"');
  });

  it('accepts ollama without a key', () => {
    const { chat } = load({
      CHAT_PROVIDER: 'ollama',
      CHAT_MODEL: 'qwen2.5:1.5b',
      CHAT_API_KEY: '',
    });
    expect(chat?.baseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(chat?.apiKey).toBeTruthy();
  });

  it('rejects an unknown provider and lists the valid names', () => {
    const attempt = () => load({ CHAT_PROVIDER: 'anthropicc' });
    expect(attempt).toThrow(AiConfigError);
    for (const name of PRESET_NAMES) expect(attempt).toThrow(name);
  });

  it('requires CHAT_MODEL once a provider is chosen', () => {
    expect(() => load({ CHAT_MODEL: '' })).toThrow('CHAT_MODEL is not set.');
  });

  it('lets CHAT_BASE_URL override the preset', () => {
    const { chat } = load({ CHAT_BASE_URL: 'https://proxy.example/v1' });
    expect(chat?.baseUrl).toBe('https://proxy.example/v1');
  });

  it('requires CHAT_BASE_URL for the custom provider', () => {
    expect(() => load({ CHAT_PROVIDER: 'custom' })).toThrow(
      'CHAT_BASE_URL is required when the provider is "custom".',
    );
    const { chat } = load({ CHAT_PROVIDER: 'custom', CHAT_BASE_URL: 'http://10.0.0.5:8000/v1' });
    expect(chat?.baseUrl).toBe('http://10.0.0.5:8000/v1');
  });

  it('uses REWRITE_MODEL for rewriting, on the same provider and key', () => {
    const { chat, rewrite } = load({ REWRITE_MODEL: 'small-rewrite-model' });
    expect(rewrite).toEqual({ ...chat, model: 'small-rewrite-model' });
  });

  it('rewrites with the chat model when REWRITE_MODEL is empty', () => {
    const { chat, rewrite } = load({ REWRITE_MODEL: '' });
    expect(rewrite).toEqual(chat);
  });
});

describe('loadAiConfig: embeddings', () => {
  it('builds the embedding config and keeps the prefixes byte for byte', () => {
    const { embedding } = load({});
    expect(embedding).toMatchObject({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 768,
      documentPrefix: 'search_document: ',
      queryPrefix: 'search_query: ',
    });
  });

  it('defaults missing prefixes to empty strings', () => {
    const { embedding } = load({
      EMBEDDING_DOCUMENT_PREFIX: undefined,
      EMBEDDING_QUERY_PREFIX: '',
    });
    expect(embedding.documentPrefix).toBe('');
    expect(embedding.queryPrefix).toBe('');
  });

  it('rejects a provider without embeddings and names the ones that have them', () => {
    const attempt = () => load({ EMBEDDING_PROVIDER: 'anthropic' });
    expect(attempt).toThrow(AiConfigError);
    expect(attempt).toThrow('Provider "anthropic" has no embeddings endpoint');
    expect(attempt).toThrow(/ollama/);
  });

  it('requires EMBEDDING_PROVIDER', () => {
    expect(() => load({ EMBEDDING_PROVIDER: '' })).toThrow('EMBEDDING_PROVIDER is not set');
  });

  it.each([undefined, '', 'abc', '0', '-768', '76.8'])(
    'rejects EMBEDDING_DIMENSIONS=%j',
    (value) => {
      expect(() => load({ EMBEDDING_DIMENSIONS: value })).toThrow(
        'EMBEDDING_DIMENSIONS must be a positive integer',
      );
    },
  );

  it('requires EMBEDDING_API_KEY for a hosted provider', () => {
    expect(() =>
      load({ EMBEDDING_PROVIDER: 'openai', EMBEDDING_MODEL: 'text-embedding-3-small' }),
    ).toThrow('EMBEDDING_API_KEY is not set for "openai".');
  });

  it('requires EMBEDDING_BASE_URL for the custom provider', () => {
    expect(() => load({ EMBEDDING_PROVIDER: 'custom' })).toThrow(
      'EMBEDDING_BASE_URL is required when the provider is "custom".',
    );
  });
});
