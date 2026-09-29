'use client';

import type { Document } from '@repo/shared';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  FileQuestionIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { getErrorMessage, isApiError } from '@/lib/api-client';
import { formatDate, formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import {
  isIngesting,
  useCreateDocument,
  useDocument,
  useReindexDocument,
  useUpdateDocument,
} from '../queries';
import { EMPTY_DRAFT, useDocumentDraft } from '../use-document-draft';
import { buildUpdate, validateDraft, type DocumentDraft } from '../validation';
import { ChunksPanel } from './chunks-panel';
import { DeleteDocumentButton } from './delete-document-button';
import { DocumentFields, type EditorTab } from './document-fields';
import { DocumentStatusBadge } from './document-status-badge';
import { EditorSkeleton } from './skeletons';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function toDraft(document: Document): DocumentDraft {
  return { title: document.title, content: document.content, tags: document.tags };
}

/** Ctrl+S / Cmd+S submits the form, when there is something to save. */
function useSaveShortcut(formRef: React.RefObject<HTMLFormElement | null>, enabled: boolean) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 's' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (enabled) formRef.current?.requestSubmit();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [formRef, enabled]);
}

function EditorToolbar({
  heading,
  status,
  meta,
  actions,
}: {
  heading: string;
  status?: React.ReactNode;
  /** A muted line under the heading. */
  meta?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 sm:px-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/documents" aria-label="Back to documents">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="grid min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold">{heading}</h1>
            {status}
          </div>
          {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">{actions}</div>
      </div>
    </div>
  );
}

/** "Created 26 Sep 2026 · Updated 5 minutes ago", with the exact times on hover. */
function DocumentDates({ document }: { document: Document }) {
  return (
    <>
      <time dateTime={document.createdAt} title={formatDateTime(document.createdAt)}>
        Created {formatDate(document.createdAt)}
      </time>
      {' · '}
      <time dateTime={document.updatedAt} title={formatDateTime(document.updatedAt)}>
        Updated {formatRelativeTime(document.updatedAt)}
      </time>
    </>
  );
}

function SaveButton({ dirty, saving, label }: { dirty: boolean; saving: boolean; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The span keeps the tooltip working while the button is disabled. */}
        <span
          tabIndex={dirty ? -1 : 0}
          className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Button type="submit" form="document-form" disabled={!dirty || saving}>
            {saving ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {saving ? 'Saving...' : label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {dirty ? `Save (${isMac() ? 'Cmd' : 'Ctrl'}+S)` : 'No changes to save'}
      </TooltipContent>
    </Tooltip>
  );
}

function NewDocumentEditor() {
  const router = useRouter();
  const idBase = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<EditorTab>('write');
  const form = useDocumentDraft(EMPTY_DRAFT, idBase);
  const createDocument = useCreateDocument();
  const saving = createDocument.isPending;

  useUnsavedChangesGuard(form.dirty);
  useSaveShortcut(formRef, form.dirty && !saving);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateDraft(form.draft);
    if (!result.success) {
      if (result.errors.content) setTab('write');
      form.reportErrors(result.errors);
      return;
    }
    const submitted = form.draft;
    createDocument.mutate(result.data, {
      onSuccess: (document) => {
        // Mark the draft as saved first, so the unsaved-changes guard lets the redirect through.
        form.markSaved(toDraft(document), submitted);
        toast.success('Document created', {
          description: 'Indexing has started. Open the Chunks tab to see how it was split.',
        });
        router.replace(`/documents/${document.id}`);
      },
      onError: (error) => {
        toast.error('Could not create the document', { description: getErrorMessage(error) });
      },
    });
  }

  return (
    <>
      <EditorToolbar
        heading="New document"
        actions={<SaveButton dirty={form.dirty} saving={saving} label="Create document" />}
      />
      <form
        id="document-form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="mx-auto max-w-4xl px-4 py-6 sm:px-6"
      >
        <DocumentFields
          idBase={idBase}
          draft={form.draft}
          errors={form.errors}
          onChange={form.setField}
          tab={tab}
          onTabChange={setTab}
        />
      </form>
    </>
  );
}

function EditDocumentEditor({
  document,
  onDeleted,
}: {
  document: Document;
  onDeleted: () => void;
}) {
  const idBase = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<EditorTab>('write');
  const form = useDocumentDraft(toDraft(document), idBase);
  const updateDocument = useUpdateDocument(document.id);
  const reindexDocument = useReindexDocument(document.id);
  const saving = updateDocument.isPending;
  const ingesting = isIngesting(document.ingestion.status);

  useUnsavedChangesGuard(form.dirty);
  useSaveShortcut(formRef, form.dirty && !saving);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildUpdate(form.draft, form.saved);
    if (!result.success) {
      if (result.errors.content) setTab('write');
      form.reportErrors(result.errors);
      return;
    }
    const submitted = form.draft;
    if (!result.data) {
      // Only whitespace changed: nothing to send, but accept the normalised values.
      form.markSaved(form.saved, submitted);
      return;
    }
    const reembeds = result.data.title !== undefined || result.data.content !== undefined;
    updateDocument.mutate(result.data, {
      onSuccess: (saved) => {
        form.markSaved(toDraft(saved), submitted);
        toast.success('Changes saved', {
          description: reembeds ? 'The document is being re-indexed.' : undefined,
        });
      },
      onError: (error) => {
        toast.error('Could not save your changes', { description: getErrorMessage(error) });
      },
    });
  }

  function reindex() {
    reindexDocument.mutate(undefined, {
      onSuccess: () => toast.success('Re-indexing started'),
      onError: (error) => {
        toast.error('Could not start re-indexing', { description: getErrorMessage(error) });
      },
    });
  }

  const { chunkCount, status, error } = document.ingestion;

  return (
    <>
      <EditorToolbar
        heading={form.saved.title || 'Untitled'}
        status={<DocumentStatusBadge ingestion={document.ingestion} className="shrink-0" />}
        meta={<DocumentDates document={document} />}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={ingesting ? 0 : -1} className="rounded-lg outline-none">
                  <Button
                    variant="ghost"
                    onClick={reindex}
                    disabled={ingesting || reindexDocument.isPending}
                    aria-label="Re-index document"
                  >
                    <RefreshCwIcon
                      className={reindexDocument.isPending ? 'motion-safe:animate-spin' : undefined}
                      aria-hidden
                    />
                    <span className="hidden sm:inline">Re-index</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {ingesting ? 'Indexing is already running' : 'Chunk and embed this document again'}
              </TooltipContent>
            </Tooltip>
            <DeleteDocumentButton document={document} onDeleted={onDeleted} />
            <SaveButton dirty={form.dirty} saving={saving} label="Save" />
          </>
        }
      />
      <form
        id="document-form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="mx-auto grid max-w-4xl gap-6 px-4 py-6 sm:px-6"
      >
        {status === 'failed' && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>Indexing failed</AlertTitle>
            <AlertDescription>
              <span className="block">{error ?? 'The last indexing run did not finish.'}</span>
              <span className="block">Chat cannot use this document until it is indexed.</span>
            </AlertDescription>
            <AlertAction>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={reindex}
                disabled={reindexDocument.isPending}
              >
                Try again
              </Button>
            </AlertAction>
          </Alert>
        )}
        <DocumentFields
          idBase={idBase}
          draft={form.draft}
          errors={form.errors}
          onChange={form.setField}
          tab={tab}
          onTabChange={setTab}
          chunksTab={{
            label: (
              <>
                Chunks
                {status === 'ready' ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatNumber(chunkCount)}
                  </span>
                ) : null}
              </>
            ),
            panel: <ChunksPanel document={document} hasUnsavedChanges={form.dirty} />,
          }}
        />
      </form>
    </>
  );
}

function ExistingDocumentEditor({ id }: { id: string }) {
  const router = useRouter();
  // Once deleted, stop observing the document so its removal from the cache does not refetch it.
  const [deleted, setDeleted] = useState(false);
  const query = useDocument(id, { enabled: !deleted });

  if (deleted) {
    return (
      <EmptyState
        icon={CircleCheckIcon}
        title="Document deleted"
        description="Taking you back to your documents."
      />
    );
  }
  if (query.isPending) {
    return <EditorSkeleton />;
  }
  if (!query.data) {
    // A malformed id is rejected by validation; to the user it is the same as a missing document.
    const missing =
      isApiError(query.error) &&
      ['NOT_FOUND', 'VALIDATION_FAILED', 'BAD_REQUEST'].includes(query.error.code);
    if (missing) {
      return (
        <EmptyState
          icon={FileQuestionIcon}
          title="Document not found"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link href="/documents">Back to documents</Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        error={query.error}
        title="Could not load the document"
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <EditDocumentEditor
      document={query.data}
      onDeleted={() => {
        setDeleted(true);
        router.replace('/documents');
      }}
    />
  );
}

export function DocumentEditor({ documentId }: { documentId?: string }) {
  return documentId ? <ExistingDocumentEditor id={documentId} /> : <NewDocumentEditor />;
}
