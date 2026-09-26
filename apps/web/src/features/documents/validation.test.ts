import { DOCUMENT_CONTENT_MAX } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import { buildUpdate, validateDraft } from './validation';

const saved = { title: 'Leave policy', content: '# Leave\n\nDays off.', tags: ['hr'] };

describe('validateDraft', () => {
  it('turns schema issues into plain-English field errors', () => {
    const result = validateDraft({ title: '   ', content: '', tags: [] });
    expect(result.success).toBe(false);
    expect(result.errors).toEqual({
      title: 'Give the document a title.',
      content: 'Write some content before saving.',
    });
  });

  it('reports content over the limit', () => {
    const result = validateDraft({ ...saved, content: 'x'.repeat(DOCUMENT_CONTENT_MAX + 1) });
    expect(result.errors.content).toBe('Content is over the 200,000 character limit.');
  });
});

describe('buildUpdate', () => {
  it('sends only the fields that changed', () => {
    const result = buildUpdate({ ...saved, tags: ['hr', 'policy'] }, saved);
    expect(result).toEqual({ success: true, data: { tags: ['hr', 'policy'] }, errors: {} });
  });

  it('sends the trimmed title', () => {
    const result = buildUpdate({ ...saved, title: '  Holiday policy  ' }, saved);
    expect(result.success && result.data).toEqual({ title: 'Holiday policy' });
  });

  it('has nothing to send when only surrounding whitespace changed', () => {
    const result = buildUpdate({ ...saved, title: 'Leave policy ' }, saved);
    expect(result).toEqual({ success: true, data: null, errors: {} });
  });
});
