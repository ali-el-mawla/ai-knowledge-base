import type {
  CallOptions,
  ChatCompletion,
  ChatModel,
  ChatRequest,
  ChatStreamPart,
  EmbeddingDescriptor,
  EmbeddingModel,
  EmbeddingPurpose,
  ModelDescriptor,
  TokenUsage,
} from '@repo/ai';

/** Test doubles for `ChatModel` and `EmbeddingModel`: no network, no key, no cost. */

/** What a fake chat model does on its next calls. */
export interface FakeChatScript {
  /** Streamed as deltas in this order; joined into the text of `complete()`. */
  deltas?: string[];
  usage?: TokenUsage;
  finishReason?: ChatCompletion['finishReason'];
  /** Thrown after the deltas by `stream()`, and instead of answering by `complete()`. */
  error?: Error;
  /** After the deltas, wait until the call is aborted (a slow answer the user stops). */
  hangUntilAborted?: boolean;
}

export class FakeChatModel implements ChatModel {
  readonly requests: ChatRequest[] = [];

  constructor(
    public script: FakeChatScript = {},
    readonly info: ModelDescriptor = { provider: 'fake', model: 'fake-chat' },
  ) {}

  async complete(request: ChatRequest, options: CallOptions = {}): Promise<ChatCompletion> {
    this.requests.push(request);
    if (this.script.hangUntilAborted) await untilAborted(options.signal);
    if (this.script.error) throw this.script.error;
    return {
      text: (this.script.deltas ?? []).join(''),
      usage: this.script.usage ?? null,
      finishReason: this.script.finishReason ?? 'stop',
    };
  }

  async *stream(request: ChatRequest, options: CallOptions = {}): AsyncGenerator<ChatStreamPart> {
    this.requests.push(request);
    for (const text of this.script.deltas ?? []) {
      // A real stream yields between network reads; this keeps deltas separate writes.
      await new Promise((resolve) => setImmediate(resolve));
      yield { type: 'delta', text };
    }
    if (this.script.hangUntilAborted) await untilAborted(options.signal);
    if (this.script.error) throw this.script.error;
    if (this.script.usage) yield { type: 'usage', usage: this.script.usage };
    yield { type: 'finish', reason: this.script.finishReason ?? 'stop' };
  }

  lastMessages(): ChatRequest['messages'] {
    const last = this.requests.at(-1);
    if (!last) throw new Error('the fake chat model was never called');
    return last.messages;
  }
}

/** The error a cancelled fetch raises; `isAbortError` recognises it by name. */
export function abortError(): Error {
  return Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
}

function untilAborted(signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

export const FAKE_EMBEDDING_DIMENSIONS = 768;

/** A unit vector along one axis: cheap, valid and distinct per axis. */
export function axisVector(axis: number): number[] {
  const vector = new Array<number>(FAKE_EMBEDDING_DIMENSIONS).fill(0);
  vector[axis] = 1;
  return vector;
}

export interface EmbeddingCall {
  texts: string[];
  purpose: EmbeddingPurpose;
}

export class FakeEmbeddingModel implements EmbeddingModel {
  readonly calls: EmbeddingCall[] = [];
  /** Set to make the next calls fail, e.g. with an AiProviderError. */
  error: Error | null = null;

  constructor(
    private readonly vectorFor: (text: string) => number[] = () => axisVector(0),
    readonly info: EmbeddingDescriptor = {
      provider: 'fake',
      model: 'fake-embedding',
      dimensions: FAKE_EMBEDDING_DIMENSIONS,
      documentPrefix: '',
      queryPrefix: '',
    },
  ) {}

  async embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
    this.calls.push({ texts, purpose });
    if (this.error) throw this.error;
    return texts.map((text) => this.vectorFor(text));
  }
}
