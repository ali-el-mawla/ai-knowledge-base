'use client';

import { createContext, use, useId, useMemo } from 'react';
import { useStoredBoolean } from '@/hooks/use-stored-boolean';
import { cn } from '@/lib/utils';
import { ChatSessionProvider } from '../chat-session';
import { ConversationSidebar } from './conversation-sidebar';

/** Remembers whether the user hid the docked conversation list. */
const LIST_OPEN_STORAGE_KEY = 'chat.conversation-list.open';

interface DockedConversationList {
  /** DOM id of the docked list, for the toggle's aria-controls. */
  id: string;
  /** Whether the docked list (lg and up) is shown. Below lg the list is a sheet instead. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DockedListContext = createContext<DockedConversationList | null>(null);

/** State of the docked conversation list, for the toggle in the chat header. */
export function useDockedConversationList(): DockedConversationList {
  const list = use(DockedListContext);
  if (!list) throw new Error('useDockedConversationList must be used inside <ChatLayout>.');
  return list;
}

/**
 * The frame of every chat page: the conversation list and the page. From lg the list is
 * docked and shown unless the user hid it (remembered per browser); below lg it opens as a
 * sheet from the chat header. The layout also owns the chat stream, so an answer survives
 * moving between chat URLs.
 */
export function ChatLayout({ children }: { children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useStoredBoolean(LIST_OPEN_STORAGE_KEY, true);
  const list = useMemo(() => ({ id, open, setOpen }), [id, open, setOpen]);

  return (
    <ChatSessionProvider>
      <DockedListContext value={list}>
        <div className="flex h-full min-h-0">
          <div
            id={id}
            className={cn(
              'hidden w-64 shrink-0 flex-col border-r bg-sidebar/40',
              open && 'lg:flex',
            )}
          >
            <ConversationSidebar />
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </DockedListContext>
    </ChatSessionProvider>
  );
}
