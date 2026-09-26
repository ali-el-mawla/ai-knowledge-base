'use client';

import { DOCUMENT_CONTENT_MAX, DOCUMENT_TAGS_MAX } from '@repo/shared';
import { useId } from 'react';
import { Markdown } from '@/components/markdown';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DocumentDraft, DocumentField, DocumentFieldErrors } from '../validation';
import { TagsInput } from './tags-input';

export type EditorTab = 'write' | 'preview' | 'chunks';

/** Stable DOM ids, so the editor can move focus to the first invalid field. */
export function fieldId(base: string, field: DocumentField): string {
  return `${base}-${field}`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function ContentCounter({ id, length }: { id: string; length: number }) {
  const ratio = length / DOCUMENT_CONTENT_MAX;
  return (
    <span
      id={id}
      className={cn(
        'text-xs text-muted-foreground tabular-nums',
        ratio > 0.9 && 'text-warning',
        ratio > 1 && 'font-medium text-destructive',
      )}
    >
      {formatNumber(length)} / {formatNumber(DOCUMENT_CONTENT_MAX)}
      <span className="sr-only"> characters</span>
    </span>
  );
}

interface DocumentFieldsProps {
  idBase: string;
  draft: DocumentDraft;
  errors: DocumentFieldErrors;
  onChange: <F extends DocumentField>(field: F, value: DocumentDraft[F]) => void;
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  disabled?: boolean;
  /** Extra tab (the chunks view of a saved document): its trigger label and its panel. */
  chunksTab?: { label: React.ReactNode; panel: React.ReactNode };
}

/** Title, tags and the markdown content with Write / Preview tabs. Shared by new and edit. */
export function DocumentFields({
  idBase,
  draft,
  errors,
  onChange,
  tab,
  onTabChange,
  disabled,
  chunksTab,
}: DocumentFieldsProps) {
  const ids = {
    title: fieldId(idBase, 'title'),
    tags: fieldId(idBase, 'tags'),
    content: fieldId(idBase, 'content'),
    tagsHelp: useId(),
    counter: useId(),
    contentHelp: useId(),
  };
  const describedBy = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor={ids.title}>Title</Label>
        <Input
          id={ids.title}
          value={draft.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder="For example: Parental leave policy"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={describedBy(errors.title && `${ids.title}-error`)}
          disabled={disabled}
          className="h-10 text-base md:text-base"
        />
        <FieldError id={`${ids.title}-error`} message={errors.title} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.tags}>Tags</Label>
        <TagsInput
          id={ids.tags}
          value={draft.tags}
          onChange={(tags) => onChange('tags', tags)}
          invalid={Boolean(errors.tags)}
          disabled={disabled}
          aria-describedby={describedBy(ids.tagsHelp, errors.tags && `${ids.tags}-error`)}
        />
        <p id={ids.tagsHelp} className="-mt-1 text-xs text-muted-foreground">
          Press Enter or comma to add a tag. Up to {DOCUMENT_TAGS_MAX} tags.
        </p>
        <FieldError id={`${ids.tags}-error`} message={errors.tags} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as EditorTab)}
        className="gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList aria-label="Content views">
            <TabsTrigger value="write" className="px-3">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-3">
              Preview
            </TabsTrigger>
            {chunksTab && (
              <TabsTrigger value="chunks" className="px-3">
                {chunksTab.label}
              </TabsTrigger>
            )}
          </TabsList>
          {tab !== 'chunks' && <ContentCounter id={ids.counter} length={draft.content.length} />}
        </div>
        {/* Above the editor rather than below it, so it is visible without scrolling. */}
        {tab !== 'chunks' && <FieldError id={`${ids.content}-error`} message={errors.content} />}

        <TabsContent value="write" className="grid gap-2">
          <Label htmlFor={ids.content} className="sr-only">
            Content
          </Label>
          <Textarea
            id={ids.content}
            value={draft.content}
            onChange={(event) => onChange('content', event.target.value)}
            placeholder={
              '# A heading\n\nWrite in Markdown. Each heading starts a section, and long sections are split into chunks that chat can cite.'
            }
            aria-invalid={Boolean(errors.content)}
            aria-describedby={describedBy(
              ids.counter,
              ids.contentHelp,
              errors.content && `${ids.content}-error`,
            )}
            disabled={disabled}
            spellCheck
            className="min-h-[28rem] resize-y px-3 py-2.5 font-mono text-sm leading-relaxed md:text-sm"
          />
          <p id={ids.contentHelp} className="sr-only">
            Markdown is supported. Use the Preview tab to see the formatted result.
          </p>
        </TabsContent>

        <TabsContent value="preview">
          <div className="min-h-[28rem] rounded-lg border px-4 py-3">
            {draft.content.trim() ? (
              <Markdown>{draft.content}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
            )}
          </div>
        </TabsContent>

        {chunksTab && <TabsContent value="chunks">{chunksTab.panel}</TabsContent>}
      </Tabs>
    </div>
  );
}
