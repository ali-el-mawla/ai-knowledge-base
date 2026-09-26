'use client';

import { ChatSessionProvider } from '../chat-session';
import { ConversationSidebar } from './conversation-sidebar';

/**
 * The frame of every chat page: the conversation list (docked from lg, a sheet below) and
 * the page. It also owns the chat stream, so an answer survives moving between chat URLs.
 */
export function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatSessionProvider>
      <div className="flex h-full min-h-0">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar/40 lg:flex">
          <ConversationSidebar />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </ChatSessionProvider>
  );
}
