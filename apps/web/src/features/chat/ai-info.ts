import type { AiInfo } from '@repo/shared';

/**
 * One plain line for the chat header, for example
 * "claude-haiku-4-5 via anthropic · embeddings: nomic-embed-text (ollama)".
 */
export function formatAiInfo(info: AiInfo): string {
  const chat = info.chat ? `${info.chat.model} via ${info.chat.provider}` : 'No chat model';
  return `${chat} · embeddings: ${info.embedding.model} (${info.embedding.provider})`;
}

/** The longer version, for the tooltip: every model and the stale chunk count. */
export function describeAiInfo(info: AiInfo): string[] {
  const lines = [
    info.chat
      ? `Answers: ${info.chat.model} (${info.chat.provider})`
      : 'Answers: no chat model is configured',
  ];
  if (info.rewrite) {
    lines.push(`Follow-up rewriting: ${info.rewrite.model} (${info.rewrite.provider})`);
  }
  lines.push(
    `Embeddings: ${info.embedding.model} (${info.embedding.provider}), ${info.embedding.dimensions} dimensions`,
  );
  if (info.staleChunks > 0) {
    lines.push(`${info.staleChunks} chunks were embedded with another model; run npm run reembed.`);
  }
  return lines;
}
