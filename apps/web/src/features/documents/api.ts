import type {
  CreateDocumentInput,
  Document,
  DocumentChunk,
  DocumentList,
  TagCount,
  UpdateDocumentInput,
} from '@repo/shared';
import { apiClient } from '@/lib/api-client';

/** Query parameters of `GET /documents`. */
export type DocumentListParams = {
  q?: string;
  tag?: string;
  limit: number;
  offset: number;
};

const documentPath = (id: string) => `/documents/${encodeURIComponent(id)}`;

export function listDocuments(params: DocumentListParams, signal?: AbortSignal) {
  return apiClient.get<DocumentList>('/documents', { query: params, signal });
}

export function getDocument(id: string, signal?: AbortSignal) {
  return apiClient.get<Document>(documentPath(id), { signal });
}

export function createDocument(input: CreateDocumentInput) {
  return apiClient.post<Document>('/documents', input);
}

export function updateDocument(id: string, input: UpdateDocumentInput) {
  return apiClient.patch<Document>(documentPath(id), input);
}

export function deleteDocument(id: string) {
  return apiClient.delete(documentPath(id));
}

/** Forces a full re-embedding of the document (answers 202 with the document). */
export function reindexDocument(id: string) {
  return apiClient.post<Document>(`${documentPath(id)}/reindex`);
}

export async function listDocumentChunks(id: string, signal?: AbortSignal) {
  const { items } = await apiClient.get<{ items: DocumentChunk[] }>(`${documentPath(id)}/chunks`, {
    signal,
  });
  return items;
}

export async function listTags(signal?: AbortSignal) {
  const { items } = await apiClient.get<{ items: TagCount[] }>('/tags', { signal });
  return items;
}
