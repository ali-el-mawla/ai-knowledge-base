'use client';

import type { Source } from '@repo/shared';
import { ExternalLinkIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { HeadingPath } from '@/components/heading-path';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { sectionPath } from './citation-chip';

function formatRank(rank: number | null, missing: string): string {
  return rank === null ? missing : `#${rank}`;
}

/** Why this passage was retrieved: its place in each search arm and the fused score. */
function RetrievalRanks({ score }: { score: Source['score'] }) {
  const items = [
    { label: 'Semantic', value: formatRank(score.semanticRank, 'Not ranked') },
    { label: 'Keyword', value: formatRank(score.keywordRank, 'No match') },
    { label: 'Fused', value: score.fused.toFixed(4) },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border px-2.5 py-2">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every grid item here is `min-w-0`: by default a grid item is at least as wide as its
 * content, so wide content in the passage (a table) would widen the whole panel and cut off
 * the text around it, instead of scrolling inside its own box.
 */
function SourceBody({ source }: { source: Source }) {
  return (
    <div className="grid gap-5">
      <div className="grid min-w-0 gap-2.5 text-xs">
        {/* The document title is the panel's title: the trail starts below it when it can. */}
        <HeadingPath path={sectionPath(source) || source.headingPath} wrap />
        <Button asChild variant="outline" size="sm" className="justify-self-start">
          <Link href={`/documents/${source.documentId}`}>
            <ExternalLinkIcon aria-hidden />
            Open document
          </Link>
        </Button>
      </div>
      <section className="grid min-w-0 gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Retrieval ranks</h3>
        <RetrievalRanks score={source.score} />
      </section>
      <section className="grid min-w-0 gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">
          Passage, as it was when the answer was written
        </h3>
        <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
          <Markdown>{source.content}</Markdown>
        </div>
      </section>
    </div>
  );
}

function SourceTitle({ source }: { source: Source }) {
  return (
    <>
      <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-primary px-1 align-[0.1em] text-xs font-semibold text-primary-foreground tabular-nums">
        {source.index}
      </span>
      {source.documentTitle}
    </>
  );
}

/** Wide screens: a column next to the thread. Focus moves in on open; Escape closes it. */
function SourceColumn({ source, onClose }: { source: Source; onClose: () => void }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [source.chunkId]);

  return (
    <section
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      className="flex w-[22rem] shrink-0 flex-col border-l bg-background"
    >
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 text-sm leading-6 font-semibold outline-none"
        >
          <SourceTitle source={source} />
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close source">
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <SourceBody source={source} />
      </div>
    </section>
  );
}

/**
 * The passage behind a citation: document, heading trail, retrieval ranks and the exact
 * chunk text. A right column on wide screens, a sheet on small ones.
 */
export function SourcePanel({
  source,
  docked,
  onClose,
}: {
  source: Source | null;
  /** Wide screen: render as a column instead of a sheet. */
  docked: boolean;
  onClose: () => void;
}) {
  if (docked) return source ? <SourceColumn source={source} onClose={onClose} /> : null;
  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && onClose()}>
      {/* The sheet sets its width with data-[side] variants; plain w-* classes lose to them. */}
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {source && (
          <>
            <SheetHeader className="border-b pr-12">
              <SheetTitle className="leading-6">
                <SourceTitle source={source} />
              </SheetTitle>
              <SheetDescription className="sr-only">
                The passage this citation points to.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <SourceBody source={source} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
