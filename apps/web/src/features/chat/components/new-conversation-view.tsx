'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';
import { useChatSession } from '../chat-session';
import { useCreateConversation } from '../queries';
import { ChatHeader } from './chat-header';
import { ChatIntro } from './chat-intro';
import { Composer } from './composer';
import { ComposerBar, useSendBlockedReason } from './composer-bar';
import { ConversationView } from './conversation-view';

/**
 * /chat. The conversation is created on the first send and the URL moves to /chat/[id];
 * until the router has switched pages, this view already shows it, so nothing flickers.
 */
export function NewConversationView() {
  const router = useRouter();
  const stream = useChatSession();
  const createConversation = useCreateConversation();
  const blockedReason = useSendBlockedReason(null);
  const [startedId, setStartedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ question: string; error: unknown } | null>(null);

  if (startedId) return <ConversationView conversationId={startedId} />;

  function start(question: string) {
    setFailure(null);
    createConversation.mutate(undefined, {
      onSuccess: (conversation) => {
        void stream.send(conversation.id, question);
        setStartedId(conversation.id);
        // Replace: the empty /chat page is not a step worth going back to.
        router.replace(`/chat/${conversation.id}`);
      },
      onError: (error) => setFailure({ question, error }),
    });
  }

  const pending = createConversation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader title="New conversation" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
          <ChatIntro onAsk={start} disabled={pending || Boolean(blockedReason)} />
          {failure && (
            <Alert variant="destructive" className="mx-auto max-w-xl">
              <TriangleAlertIcon aria-hidden />
              <AlertTitle>Could not start the conversation</AlertTitle>
              <AlertDescription className="grid gap-2 [&_p:not(:last-child)]:mb-0">
                <p>{getErrorMessage(failure.error)}</p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => start(failure.question)}
                  >
                    Try again
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <ComposerBar>
        <Composer onSend={start} pending={pending} blockedReason={blockedReason} autoFocus />
      </ComposerBar>
    </div>
  );
}
