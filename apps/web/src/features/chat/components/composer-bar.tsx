'use client';

import Link from 'next/link';
import { useChatSession } from '../chat-session';
import { useAiInfo } from '../queries';
import { isStreamActive } from '../stream-state';

/** The strip under the thread that holds the composer, aligned with the messages. */
export function ComposerBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-2 sm:px-6">{children}</div>
    </div>
  );
}

/**
 * Why a message cannot be sent from this conversation right now (null when it can): no chat
 * model on the server, or an answer still streaming in another conversation (one at a time).
 */
export function useSendBlockedReason(conversationId: string | null): React.ReactNode {
  const { state } = useChatSession();
  const aiInfo = useAiInfo();

  if (aiInfo.data && aiInfo.data.chat === null) {
    return 'No chat model is configured on the server, so questions cannot be answered. Documents and search still work.';
  }
  if (isStreamActive(state.status) && state.conversationId !== conversationId) {
    return (
      <>
        An answer is still being written in another conversation.{' '}
        <Link
          href={`/chat/${state.conversationId}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Go to it
        </Link>{' '}
        or wait until it finishes.
      </>
    );
  }
  return null;
}
