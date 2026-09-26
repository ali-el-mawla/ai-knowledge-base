'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api-client';
import { useChatSession } from '../chat-session';
import { useConversations } from '../queries';
import { isStreamActive } from '../stream-state';
import { ConversationItem } from './conversation-item';

function ListSkeleton() {
  return (
    <div className="grid gap-1 px-1" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid gap-1.5 px-2.5 py-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** "New conversation" and the list of conversations, most recently active first. */
export function ConversationSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const conversations = useConversations();
  const { id: activeId } = useParams<{ id?: string }>();
  const { state } = useChatSession();
  const answeringId = isStreamActive(state.status) ? state.conversationId : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <Button asChild variant="outline" className="w-full justify-start">
          <Link href="/chat" onClick={onNavigate}>
            <PlusIcon aria-hidden />
            New conversation
          </Link>
        </Button>
      </div>
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.isPending ? (
          <ListSkeleton />
        ) : !conversations.data ? (
          <div className="grid gap-2 px-2.5 py-2 text-sm">
            <p className="text-muted-foreground">
              Could not load conversations. {getErrorMessage(conversations.error)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => void conversations.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : conversations.data.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            No conversations yet. Your questions and answers will be listed here.
          </p>
        ) : (
          <ul className="grid gap-0.5">
            {conversations.data.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                answering={conversation.id === answeringId}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
