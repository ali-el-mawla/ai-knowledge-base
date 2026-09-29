'use client';

import type { Message, Source } from '@repo/shared';
import { useMemo } from 'react';
import { parseCitations } from '../citations';
import type { ChatStreamState } from '../stream-state';
import { AssistantMessage, type OpenMessageSource, UserMessage } from './messages';

/** Selection id of the answer being written (it has no saved id yet). */
export const LIVE_ANSWER_ID = 'live-answer';

export interface SourceSelection {
  messageId: string;
  source: Source;
}

function activeIndexFor(messageId: string, selection: SourceSelection | null): number | null {
  return selection?.messageId === messageId ? selection.source.index : null;
}

function LiveAnswer({
  turn,
  selection,
  onOpenSource,
}: {
  turn: ChatStreamState;
  selection: SourceSelection | null;
  onOpenSource: OpenMessageSource;
}) {
  const citations = useMemo(
    () => parseCitations(turn.text, turn.sources.length),
    [turn.text, turn.sources],
  );
  return (
    <AssistantMessage
      messageId={LIVE_ANSWER_ID}
      content={turn.text}
      status={turn.status === 'sending' ? 'searching' : 'writing'}
      sources={turn.sources}
      citations={citations}
      rewrittenQuery={turn.rewrittenQuery}
      activeIndex={activeIndexFor(LIVE_ANSWER_ID, selection)}
      onOpenSource={onOpenSource}
    />
  );
}

/**
 * The saved history, then the turn in progress. The live question shows as soon as it is sent
 * (the server's copy replaces it on `start`); once the turn settles it is in the history, so
 * it is not rendered twice.
 */
export function MessageThread({
  messages,
  liveTurn,
  selection,
  onOpenSource,
}: {
  messages: Message[];
  /** The stream state while this conversation is sending or streaming, else null. */
  liveTurn: ChatStreamState | null;
  selection: SourceSelection | null;
  onOpenSource: OpenMessageSource;
}) {
  const liveQuestionSaved =
    liveTurn?.userMessage != null &&
    messages.some((message) => message.id === liveTurn.userMessage?.id);

  return (
    <ol className="grid gap-6" aria-label="Messages">
      {messages.map((message) => (
        <li key={message.id}>
          {message.role === 'user' ? (
            <UserMessage content={message.content} />
          ) : (
            <AssistantMessage
              messageId={message.id}
              content={message.content}
              status={message.status}
              sources={message.sources}
              citations={message.citations}
              rewrittenQuery={message.rewrittenQuery}
              activeIndex={activeIndexFor(message.id, selection)}
              onOpenSource={onOpenSource}
              usage={message.usage}
              model={message.model}
            />
          )}
        </li>
      ))}
      {liveTurn && !liveQuestionSaved && (
        <li key="live-question">
          <UserMessage
            content={liveTurn.userMessage?.content ?? liveTurn.question}
            pending={!liveTurn.userMessage}
          />
        </li>
      )}
      {liveTurn && (
        <li key="live-answer">
          <LiveAnswer turn={liveTurn} selection={selection} onOpenSource={onOpenSource} />
        </li>
      )}
    </ol>
  );
}
