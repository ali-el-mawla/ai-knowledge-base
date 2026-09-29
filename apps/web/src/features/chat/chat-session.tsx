'use client';

import { createContext, use } from 'react';
import { type ChatStream, useChatStream } from './use-chat-stream';

const ChatSessionContext = createContext<ChatStream | null>(null);

/**
 * Owns the chat stream. It lives in the chat layout, which stays mounted across /chat and
 * /chat/[id], so an answer keeps streaming while the URL changes or another conversation is
 * open. Leaving the chat section unmounts it and stops the stream.
 */
export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const stream = useChatStream();
  return <ChatSessionContext value={stream}>{children}</ChatSessionContext>;
}

export function useChatSession(): ChatStream {
  const stream = use(ChatSessionContext);
  if (!stream) throw new Error('useChatSession must be used inside <ChatSessionProvider>.');
  return stream;
}
