'use client';

import type { Source } from '@repo/shared';
import { createContext, use, useMemo } from 'react';
import type { Components, ExtraProps } from 'react-markdown';
import { Markdown } from '@/components/markdown';
import { cn } from '@/lib/utils';
import { markerNumbers } from '../citations';
import { CITATION_ATTRIBUTE, remarkCitations } from '../remark-citations';
import { CitationChip, type OpenSource } from './citation-chip';

interface CitationContextValue {
  /** Sources a marker may point at, by citation number. */
  sources: ReadonlyMap<number, Source>;
  maxIndex: number;
  activeIndex: number | null;
  onOpen: OpenSource;
}

const CitationContext = createContext<CitationContextValue | null>(null);

/**
 * Renders the `<sup data-citation="[1, 2]">` elements made by `remarkCitations`: one chip
 * per number that has a source. A marker with no usable number stays as plain text.
 */
function CitationMarker(props: React.ComponentProps<'sup'> & ExtraProps) {
  const context = use(CitationContext);
  const marker = (props as Record<string, unknown>)[CITATION_ATTRIBUTE];
  // Any other superscript (a GFM footnote reference, for one) renders as usual.
  if (typeof marker !== 'string') return <sup className={props.className}>{props.children}</sup>;
  const numbers = context
    ? markerNumbers(marker, context.maxIndex).filter((number) => context.sources.has(number))
    : [];
  if (!context || numbers.length === 0) return <>{marker}</>;
  return (
    <sup className="leading-none whitespace-nowrap">
      {numbers.map((number) => (
        <CitationChip
          key={number}
          source={context.sources.get(number)!}
          active={context.activeIndex === number}
          onOpen={context.onOpen}
        />
      ))}
    </sup>
  );
}

// Module-level so the markdown renderer does not see new plugins on every render.
const REMARK_PLUGINS = [remarkCitations];
const COMPONENTS: Components = { sup: CitationMarker };

interface AnswerMarkdownProps {
  content: string;
  /** Sources the answer may cite; markers pointing elsewhere render as plain text. */
  sources: readonly Source[];
  activeIndex?: number | null;
  onOpenSource: OpenSource;
  /** Shows a blinking caret after the last word. */
  streaming?: boolean;
  className?: string;
}

export function AnswerMarkdown({
  content,
  sources,
  activeIndex = null,
  onOpenSource,
  streaming = false,
  className,
}: AnswerMarkdownProps) {
  const value = useMemo<CitationContextValue>(() => {
    const byIndex = new Map(sources.map((source) => [source.index, source]));
    return {
      sources: byIndex,
      maxIndex: Math.max(0, ...byIndex.keys()),
      activeIndex,
      onOpen: onOpenSource,
    };
  }, [sources, activeIndex, onOpenSource]);

  return (
    <CitationContext value={value}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        components={COMPONENTS}
        className={cn(streaming && 'streaming-caret', className)}
      >
        {content}
      </Markdown>
    </CitationContext>
  );
}
