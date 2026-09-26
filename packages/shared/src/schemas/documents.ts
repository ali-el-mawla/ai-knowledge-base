import { z } from 'zod';

export const DOCUMENT_TITLE_MAX = 200;
export const DOCUMENT_CONTENT_MAX = 200_000;
export const DOCUMENT_TAGS_MAX = 10;
export const TAG_MAX = 32;

/** Tags are normalised to lowercase so "Policy" and "policy" are the same tag. */
export const tagSchema = z.string().trim().toLowerCase().min(1).max(TAG_MAX);

const tagsSchema = z
  .array(tagSchema)
  .max(DOCUMENT_TAGS_MAX)
  .transform((tags) => [...new Set(tags)]);

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX),
  content: z
    .string()
    .max(DOCUMENT_CONTENT_MAX)
    .refine((value) => value.trim().length > 0, 'Content cannot be empty'),
  tags: tagsSchema.default([]),
});
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;
export type CreateDocumentBody = z.output<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    title: createDocumentSchema.shape.title,
    content: createDocumentSchema.shape.content,
    tags: tagsSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;
export type UpdateDocumentBody = z.output<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  tag: tagSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListDocumentsQuery = z.output<typeof listDocumentsQuerySchema>;

export const ingestionStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;

export interface DocumentIngestion {
  status: IngestionStatus;
  error: string | null;
  chunkCount: number;
  /** Increases on every title or content change; tags do not bump it. */
  contentVersion: number;
  ingestedAt: string | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  tags: string[];
  /** First characters of the content, for list views. */
  excerpt: string;
  createdAt: string;
  updatedAt: string;
  ingestion: DocumentIngestion;
}

export interface Document extends Omit<DocumentSummary, 'excerpt'> {
  content: string;
}

export interface DocumentList {
  items: DocumentSummary[];
  total: number;
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  /** Heading trail inside the document, e.g. "Leave policy > Parental leave". Empty for text before the first heading. */
  headingPath: string;
  content: string;
  tokenEstimate: number;
}

export interface TagCount {
  tag: string;
  count: number;
}
