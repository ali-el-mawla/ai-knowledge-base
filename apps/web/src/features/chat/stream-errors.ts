import type { ChatStreamError } from './stream-state';

export interface StreamErrorCopy {
  title: string;
  description: string;
  /** Sending the same question again can succeed (possibly after `retryAfter`). */
  retryable: boolean;
}

export function describeStreamError(error: ChatStreamError): StreamErrorCopy {
  switch (error.code) {
    case 'CHAT_NOT_CONFIGURED':
      return {
        title: 'Chat is not configured',
        description: `The server has no chat model, so questions cannot be answered. Documents and search still work. (${error.message})`,
        retryable: false,
      };
    case 'RATE_LIMITED':
      return {
        title: 'Too many messages',
        description:
          error.retryAfter === null
            ? 'You are sending messages faster than the server allows. Wait a moment, then try again.'
            : 'You are sending messages faster than the server allows. You can try again when the countdown ends.',
        retryable: true,
      };
    case 'VALIDATION_FAILED':
    case 'BAD_REQUEST':
    case 'PAYLOAD_TOO_LARGE':
      return {
        title: 'The message was not accepted',
        description: error.message,
        retryable: false,
      };
    case 'NOT_FOUND':
      return {
        title: 'This conversation no longer exists',
        description: 'It may have been deleted in another tab. Start a new conversation instead.',
        retryable: false,
      };
    case 'UNAUTHORIZED':
      return {
        title: 'Your session has expired',
        description: 'Sign in again, then send your question again.',
        retryable: false,
      };
    case 'NETWORK_ERROR':
      return {
        title: error.phase === 'request' ? 'Could not reach the server' : 'The connection was lost',
        description: error.message,
        retryable: true,
      };
    case 'AI_PROVIDER_ERROR':
      return {
        title: 'The AI provider failed to answer',
        description: error.message,
        retryable: true,
      };
    case 'EMBEDDING_UNAVAILABLE':
      return {
        title: 'Search is unavailable',
        description: error.message,
        retryable: true,
      };
    default:
      return {
        title:
          error.phase === 'request'
            ? 'The message could not be sent'
            : 'The answer could not be finished',
        description: error.message,
        retryable: true,
      };
  }
}
