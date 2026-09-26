import {
  createDocumentSchema,
  DOCUMENT_CONTENT_MAX,
  DOCUMENT_TAGS_MAX,
  DOCUMENT_TITLE_MAX,
  TAG_MAX,
  updateDocumentSchema,
  type CreateDocumentBody,
  type UpdateDocumentBody,
} from '@repo/shared';

/** What the editor form holds. Tags are already normalised by the tags input. */
export interface DocumentDraft {
  title: string;
  content: string;
  tags: string[];
}

export type DocumentField = keyof DocumentDraft;
export type DocumentFieldErrors = Partial<Record<DocumentField, string>>;

type Issue = NonNullable<
  ReturnType<typeof createDocumentSchema.safeParse>['error']
>['issues'][number];

const numberFormat = new Intl.NumberFormat('en-US');

/** The shared schema's messages are written for developers; these are for people. */
function messageFor(issue: Issue): string {
  const [field, index] = issue.path;
  if (field === 'title') {
    return issue.code === 'too_big'
      ? `Keep the title under ${DOCUMENT_TITLE_MAX} characters.`
      : 'Give the document a title.';
  }
  if (field === 'content') {
    return issue.code === 'too_big'
      ? `Content is over the ${numberFormat.format(DOCUMENT_CONTENT_MAX)} character limit.`
      : 'Write some content before saving.';
  }
  if (field === 'tags') {
    if (index === undefined) return `Use at most ${DOCUMENT_TAGS_MAX} tags.`;
    return issue.code === 'too_big'
      ? `Tags can be at most ${TAG_MAX} characters.`
      : 'Tags cannot be empty.';
  }
  return issue.message;
}

function toFieldErrors(issues: readonly Issue[]): DocumentFieldErrors {
  const errors: DocumentFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if ((field === 'title' || field === 'content' || field === 'tags') && !errors[field]) {
      errors[field] = messageFor(issue);
    }
  }
  return errors;
}

export type ValidationResult<T> =
  | { success: true; data: T; errors: DocumentFieldErrors }
  | { success: false; errors: DocumentFieldErrors };

/** Validates the whole draft with the same schema the API uses for creation. */
export function validateDraft(draft: DocumentDraft): ValidationResult<CreateDocumentBody> {
  const result = createDocumentSchema.safeParse(draft);
  return result.success
    ? { success: true, data: result.data, errors: {} }
    : { success: false, errors: toFieldErrors(result.error.issues) };
}

export function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

export function sameDraft(a: DocumentDraft, b: DocumentDraft): boolean {
  return a.title === b.title && a.content === b.content && sameTags(a.tags, b.tags);
}

/**
 * Builds a PATCH body with only the fields that differ from the saved version, so a tag-only
 * edit does not make the API re-embed the document. `data` is null when, once normalised
 * (trimmed), nothing differs.
 */
export function buildUpdate(
  draft: DocumentDraft,
  saved: DocumentDraft,
): ValidationResult<UpdateDocumentBody | null> {
  const full = validateDraft(draft);
  if (!full.success) return full;

  const changes: Partial<DocumentDraft> = {};
  if (full.data.title !== saved.title) changes.title = full.data.title;
  if (full.data.content !== saved.content) changes.content = full.data.content;
  if (!sameTags(full.data.tags, saved.tags)) changes.tags = full.data.tags;
  if (Object.keys(changes).length === 0) return { success: true, data: null, errors: {} };

  const result = updateDocumentSchema.safeParse(changes);
  return result.success
    ? { success: true, data: result.data, errors: {} }
    : { success: false, errors: toFieldErrors(result.error.issues) };
}
