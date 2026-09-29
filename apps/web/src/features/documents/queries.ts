import type {
  CreateDocumentInput,
  Document,
  IngestionStatus,
  UpdateDocumentInput,
} from '@repo/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocumentChunks,
  listDocuments,
  listTags,
  reindexDocument,
  updateDocument,
  type DocumentListParams,
} from './api';

export const INGESTION_POLL_MS = 1500;

export function isIngesting(status: IngestionStatus): boolean {
  return status === 'pending' || status === 'processing';
}

/** Query keys, from broad to narrow, so one invalidation can target a whole family. */
export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (params: DocumentListParams) => [...documentKeys.lists(), params] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: string) => [...documentKeys.details(), id] as const,
  /** Keyed by `ingestedAt`, so the chunks view refetches by itself when a new run finishes. */
  chunks: (id: string, ingestedAt: string | null) =>
    [...documentKeys.detail(id), 'chunks', ingestedAt] as const,
};

export const tagKeys = {
  all: ['tags'] as const,
};

export function useDocuments(params: DocumentListParams) {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: ({ signal }) => listDocuments(params, signal),
    // Keep the current page on screen while the next one loads (no skeleton flash).
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((doc) => isIngesting(doc.ingestion.status))
        ? INGESTION_POLL_MS
        : false,
  });
}

export function useDocument(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: ({ signal }) => getDocument(id, signal),
    enabled: options.enabled ?? true,
    refetchInterval: (query) => {
      const status = query.state.data?.ingestion.status;
      return status && isIngesting(status) ? INGESTION_POLL_MS : false;
    },
  });
}

export function useDocumentChunks(
  id: string,
  ingestedAt: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: documentKeys.chunks(id, ingestedAt),
    queryFn: ({ signal }) => listDocumentChunks(id, signal),
    enabled: options.enabled ?? true,
    // Show the previous run's chunks until the new run's list arrives.
    placeholderData: keepPreviousData,
  });
}

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: ({ signal }) => listTags(signal),
  });
}

/** Everything that shows document summaries or tag counts must refetch after a write. */
function useInvalidateCollections() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: tagKeys.all }),
    ]);
}

function useSetDocument() {
  const queryClient = useQueryClient();
  return (document: Document) =>
    queryClient.setQueryData(documentKeys.detail(document.id), document);
}

/** Cancels an in-flight poll, so its older answer cannot overwrite the mutation's result. */
function useCancelDocumentPoll() {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.cancelQueries({ queryKey: documentKeys.detail(id), exact: true });
}

export function useCreateDocument() {
  const setDocument = useSetDocument();
  const invalidateCollections = useInvalidateCollections();
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => createDocument(input),
    onSuccess: (document) => {
      setDocument(document);
      void invalidateCollections();
    },
  });
}

export function useUpdateDocument(id: string) {
  const setDocument = useSetDocument();
  const cancelPoll = useCancelDocumentPoll();
  const invalidateCollections = useInvalidateCollections();
  return useMutation({
    mutationFn: (input: UpdateDocumentInput) => updateDocument(id, input),
    onMutate: () => cancelPoll(id),
    onSuccess: (document) => {
      setDocument(document);
      void invalidateCollections();
    },
  });
}

export function useReindexDocument(id: string) {
  const setDocument = useSetDocument();
  const cancelPoll = useCancelDocumentPoll();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reindexDocument(id),
    onMutate: () => cancelPoll(id),
    onSuccess: (document) => {
      setDocument(document);
      void queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
    },
  });
}

/**
 * The page showing the document should stop observing it first (`enabled` on `useDocument`),
 * or removing it from the cache triggers a refetch that answers 404.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const invalidateCollections = useInvalidateCollections();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: documentKeys.detail(id) });
      void invalidateCollections();
    },
  });
}
