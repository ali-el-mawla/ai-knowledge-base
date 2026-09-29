'use client';

import { ArrowDownIcon, MessageSquareXIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/hooks/use-media-query';
import { isApiError } from '@/lib/api-client';
import { useChatSession } from '../chat-session';
import { useConversation, useConversationTitle, useIsConversationDeleted } from '../queries';
import { type ChatStreamStatus, isStreamActive } from '../stream-state';
import { useStickToBottom } from '../use-stick-to-bottom';
import { ChatHeader } from './chat-header';
import { ChatIntro } from './chat-intro';
import { Composer, type ComposerHandle } from './composer';
import { ComposerBar, useSendBlockedReason } from './composer-bar';
import { MessageThread, type SourceSelection } from './message-thread';
import type { OpenMessageSource } from './messages';
import { SourcePanel } from './source-panel';
import { StreamErrorAlert } from './stream-error-alert';

/** From this width the source panel is a column next to the thread instead of a sheet. */
const DOCKED_PANEL_QUERY = '(min-width: 80rem)';

/** Short screen-reader updates as a turn moves on; errors announce themselves (role=alert). */
const ANNOUNCEMENTS: Partial<Record<ChatStreamStatus, string>> = {
  sending: 'Searching your documents',
  streaming: 'Writing the answer',
  done: 'Answer ready',
  aborted: 'Answer stopped',
};

function MessagesSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading messages">
      <Skeleton className="h-10 w-2/3 justify-self-end rounded-2xl" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <Skeleton className="h-10 w-1/2 justify-self-end rounded-2xl" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const conversation = useConversation(conversationId);
  const deleted = useIsConversationDeleted(conversationId);
  const listTitle = useConversationTitle(conversationId);
  const stream = useChatSession();
  const { state } = stream;
  const blockedReason = useSendBlockedReason(conversationId);
  const docked = useMediaQuery(DOCKED_PANEL_QUERY);
  const { scrollRef, contentRef, pinned, scrollToBottom } = useStickToBottom();
  const composerRef = useRef<ComposerHandle>(null);
  const sourceTriggerRef = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState<SourceSelection | null>(null);

  const ownsStream = state.conversationId === conversationId;
  const liveTurn = ownsStream && isStreamActive(state.status) ? state : null;
  const turnError = ownsStream && state.status === 'error' ? state.error : null;

  // Selecting the open source again closes the panel.
  const openSource = useCallback<OpenMessageSource>((messageId, source, trigger) => {
    sourceTriggerRef.current = trigger;
    setSelection((current) =>
      current?.messageId === messageId && current.source.index === source.index
        ? null
        : { messageId, source },
    );
  }, []);

  const closeSource = useCallback(() => {
    setSelection(null);
    sourceTriggerRef.current?.focus();
  }, []);

  function send(question: string) {
    scrollToBottom('auto');
    void stream.send(conversationId, question);
  }

  function retry() {
    scrollToBottom('auto');
    void stream.retry();
  }

  const data = conversation.data;
  const error = conversation.error;
  const notFound =
    deleted || (!data && isApiError(error) && (error.status === 404 || error.status === 400));
  const title =
    listTitle ?? data?.conversation.title ?? (notFound ? 'Conversation not found' : 'Chat');

  let body: React.ReactNode;
  if (data && !deleted) {
    const empty = data.messages.length === 0 && !liveTurn && !turnError;
    body = empty ? (
      <ChatIntro
        onAsk={(question) => {
          send(question);
          composerRef.current?.focus();
        }}
        disabled={Boolean(blockedReason)}
      />
    ) : (
      <>
        <MessageThread
          messages={data.messages}
          liveTurn={liveTurn}
          selection={selection}
          onOpenSource={openSource}
        />
        {turnError && (
          <StreamErrorAlert
            error={turnError}
            question={state.question}
            onRetry={retry}
            onDismiss={stream.reset}
          />
        )}
      </>
    );
  } else if (notFound) {
    body = (
      <EmptyState
        icon={MessageSquareXIcon}
        title="Conversation not found"
        description="It may have been deleted, or the link is not complete."
        action={
          <Button asChild>
            <Link href="/chat">Start a new conversation</Link>
          </Button>
        }
      />
    );
  } else if (conversation.isPending) {
    body = <MessagesSkeleton />;
  } else {
    body = (
      <ErrorState
        error={error}
        title="Could not load this conversation"
        onRetry={() => void conversation.refetch()}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader title={title} />
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
            <div ref={contentRef} className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
              {body}
            </div>
          </div>
          {!pinned && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background shadow-md dark:bg-background dark:hover:bg-muted"
            >
              <ArrowDownIcon aria-hidden />
              Jump to latest
            </Button>
          )}
        </div>
        {!notFound && (
          <ComposerBar>
            <Composer
              ref={composerRef}
              onSend={send}
              onStop={stream.stop}
              streaming={liveTurn !== null}
              blockedReason={blockedReason}
              autoFocus
            />
          </ComposerBar>
        )}
      </div>
      <SourcePanel source={selection?.source ?? null} docked={docked} onClose={closeSource} />
      <p role="status" className="sr-only">
        {ownsStream ? (ANNOUNCEMENTS[state.status] ?? '') : ''}
      </p>
    </div>
  );
}
