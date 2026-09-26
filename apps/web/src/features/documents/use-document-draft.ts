import { useCallback, useMemo, useState } from 'react';
import { fieldId } from './components/document-fields';
import {
  sameDraft,
  validateDraft,
  type DocumentDraft,
  type DocumentField,
  type DocumentFieldErrors,
} from './validation';

export const EMPTY_DRAFT: DocumentDraft = { title: '', content: '', tags: [] };

const FIELD_ORDER: DocumentField[] = ['title', 'tags', 'content'];

/**
 * Form state for the document editor: the draft being edited, the last saved version (to know
 * whether anything changed) and field errors, which appear after the first save attempt and
 * then update as the user types.
 */
export function useDocumentDraft(initial: DocumentDraft, idBase: string) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);

  const dirty = !sameDraft(draft, saved);
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const errors: DocumentFieldErrors = showErrors ? validation.errors : {};

  const setField = useCallback(<F extends DocumentField>(field: F, value: DocumentDraft[F]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  }, []);

  /** Shows field errors from now on and moves focus to the first invalid field. */
  const reportErrors = useCallback(
    (fieldErrors: DocumentFieldErrors) => {
      setShowErrors(true);
      const first = FIELD_ORDER.find((field) => fieldErrors[field]);
      if (!first) return;
      // Wait a frame so a tab switch (back to Write, for content) has rendered the field.
      requestAnimationFrame(() => document.getElementById(fieldId(idBase, first))?.focus());
    },
    [idBase],
  );

  /**
   * Records a successful save. The draft takes the server's normalised values, unless the user
   * kept typing while the request was in flight (then their newer text wins).
   */
  const markSaved = useCallback((next: DocumentDraft, submitted: DocumentDraft) => {
    setSaved(next);
    setDraft((current) => (sameDraft(current, submitted) ? next : current));
    setShowErrors(false);
  }, []);

  return { draft, saved, dirty, errors, setField, setDraft, reportErrors, markSaved };
}
