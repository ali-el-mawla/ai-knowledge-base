'use client';

import type { MessageStatus, Source } from '@repo/shared';
import { Loader2Icon, SearchIcon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AnswerMarkdown } from './answer-markdown';
import { CopyButton } from './copy-button';
import { SourcesRow } from './sources-row';

/** A saved answer's status, or where a live answer is: retrieving, then writing. */
export type AnswerStatus = MessageStatus | 'searching' | 'writing';

export type OpenMessageSource = (messageId: string, source: Source, trigger: HTMLElement) => void;

export function UserMessage({ content, pending = false }: { content: string; pending?: boolean }) {
  return (
    <article aria-label="Your question" className="flex justify-end">
      <p
        className={cn(
          'max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm break-words whitespace-pre-wrap text-primary-foreground',
          pending && 'opacity-80',
        )}
      >
        {content}
      </p>
    </article>
  );
}

function Progress({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden />
      {label}
    </p>
  );
}

interface AssistantMessageProps {
  messageId: string;
  content: string;
  status: AnswerStatus;
  /** Everything retrieved for this turn (the snapshot saved with the message). */
  sources: Source[];
  /** Numbers the answer cites (validated by the server once saved). */
  citations: number[];
  rewrittenQuery: string | null;
  /** The citation number whose source is open in the panel, if it belongs to this message. */
  activeIndex: number | null;
  onOpenSource: OpenMessageSource;
}

/**
 * One answer: the rewritten search query when there was one, the markdown with citation
 * chips, a status badge for stopped or failed answers, the sources, and a copy button.
 * Memoised: while a new answer streams, the earlier ones do not re-render.
 */
export const AssistantMessage = memo(function AssistantMessage({
  messageId,
  content,
  status,
  sources,
  citations,
  rewrittenQuery,
  activeIndex,
  onOpenSource,
}: AssistantMessageProps) {
  const live = status === 'searching' || status === 'writing';

  // While writing, any retrieved source can be cited; once saved, only validated citations.
  const citable = useMemo(() => {
    if (live) return sources;
    const cited = new Set(citations);
    return sources.filter((source) => cited.has(source.index));
  }, [live, sources, citations]);

  const openSource = useCallback(
    (source: Source, trigger: HTMLElement) => onOpenSource(messageId, source, trigger),
    [messageId, onOpenSource],
  );

  return (
    <article aria-label="Answer" className="grid gap-2.5">
      {rewrittenQuery && (
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title="Your follow-up was rewritten into a standalone question before searching."
        >
          <SearchIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            Searched for: <q className="italic">{rewrittenQuery}</q>
          </span>
        </p>
      )}
      <div aria-live={live ? 'polite' : undefined} aria-busy={live || undefined}>
        {content ? (
          <AnswerMarkdown
            content={content}
            sources={citable}
            activeIndex={activeIndex}
            onOpenSource={openSource}
            streaming={status === 'writing'}
          />
        ) : status === 'searching' ? (
          <Progress label="Searching your documents" />
        ) : status === 'writing' ? (
          <Progress label="Writing the answer" />
        ) : (
          <p className="text-sm text-muted-foreground italic">No answer was written.</p>
        )}
      </div>
      {status !== 'searching' && (
        <div className="flex items-start gap-x-3">
          {status === 'aborted' && (
            <Badge variant="outline" className="mt-0.5">
              Stopped
            </Badge>
          )}
          {status === 'error' && (
            <Badge variant="destructive" className="mt-0.5">
              Error
            </Badge>
          )}
          <div className="min-w-0 flex-1">
            <SourcesRow
              sources={sources}
              cited={citations}
              activeIndex={activeIndex}
              onOpenSource={openSource}
            />
          </div>
          {!live && content && <CopyButton text={content} label="Copy answer" />}
        </div>
      )}
    </article>
  );
});
