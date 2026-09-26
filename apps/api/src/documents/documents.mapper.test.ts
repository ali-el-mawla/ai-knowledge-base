import { describe, expect, it } from 'vitest';
import {
  type DocumentRow,
  EXCERPT_LENGTH,
  toDocument,
  toDocumentChunk,
  toDocumentSummary,
  toExcerpt,
  toTagCount,
} from './documents.mapper.js';

const row: DocumentRow = {
  id: '5b0f3c0e-8f59-4b43-9d51-0d1f2f1f6a11',
  title: 'Leave policy',
  content: '# Leave policy\n\nEmployees get **25 days** of paid leave.',
  tags: ['hr', 'policy'],
  content_version: 3,
  ingestion_status: 'ready',
  ingestion_error: null,
  chunk_count: 4,
  ingested_at: '2026-09-26T08:00:05.000Z',
  created_at: '2026-09-25T10:00:00.000Z',
  updated_at: '2026-09-26T08:00:00.000Z',
};

describe('toDocument', () => {
  it('maps a row to the camelCase DTO with an ingestion object', () => {
    expect(toDocument(row)).toEqual({
      id: row.id,
      title: 'Leave policy',
      content: row.content,
      tags: ['hr', 'policy'],
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-26T08:00:00.000Z',
      ingestion: {
        status: 'ready',
        error: null,
        chunkCount: 4,
        contentVersion: 3,
        ingestedAt: '2026-09-26T08:00:05.000Z',
      },
    });
  });

  it('carries a failed ingestion with its error', () => {
    const failed = toDocument({ ...row, ingestion_status: 'failed', ingestion_error: 'timeout' });
    expect(failed.ingestion).toMatchObject({ status: 'failed', error: 'timeout' });
  });
});

describe('toDocumentSummary', () => {
  it('replaces the content with a plain-text excerpt', () => {
    const summary = toDocumentSummary(row);
    expect(summary).not.toHaveProperty('content');
    expect(summary.excerpt).toBe('Leave policy Employees get 25 days of paid leave.');
    expect(summary.ingestion.contentVersion).toBe(3);
  });
});

describe('toDocumentChunk', () => {
  it('maps a chunk row', () => {
    expect(
      toDocumentChunk({
        id: 'c1',
        chunk_index: 2,
        heading_path: 'Leave policy > Parental leave',
        content: 'Sixteen weeks.',
        token_estimate: 4,
      }),
    ).toEqual({
      id: 'c1',
      chunkIndex: 2,
      headingPath: 'Leave policy > Parental leave',
      content: 'Sixteen weeks.',
      tokenEstimate: 4,
    });
  });
});

describe('toTagCount', () => {
  it('maps a facet row', () => {
    expect(toTagCount({ tag: 'hr', count: 3 })).toEqual({ tag: 'hr', count: 3 });
  });
});

describe('toExcerpt', () => {
  it('strips headings, emphasis, inline code, quotes and list markers', () => {
    const markdown = [
      '## Setup',
      '> Read this *first*.',
      '- Run `npm run setup`',
      '1. Then __start__ it',
    ].join('\n');
    expect(toExcerpt(markdown)).toBe('Setup Read this first. Run npm run setup Then start it');
  });

  it('keeps link and image text but drops their URLs', () => {
    expect(toExcerpt('See [the handbook](https://x.test/h) and ![a chart](c.png).')).toBe(
      'See the handbook and a chart.',
    );
  });

  it('drops code fence lines but keeps the code', () => {
    expect(toExcerpt('Run:\n```bash\nnpm test\n```\nDone.')).toBe('Run: npm test Done.');
  });

  it('removes table borders and separator rows', () => {
    expect(toExcerpt('| Plan | Price |\n|---|---:|\n| Pro | 10 |')).toBe('Plan Price Pro 10');
  });

  it('keeps underscores inside identifiers', () => {
    expect(toExcerpt('The content_version column')).toBe('The content_version column');
  });

  it('collapses whitespace', () => {
    expect(toExcerpt('  one\n\n\ttwo   three  ')).toBe('one two three');
  });

  it('cuts long text on a word boundary and marks the cut', () => {
    const excerpt = toExcerpt('word '.repeat(100));
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
    expect(excerpt.endsWith('word…')).toBe(true);
  });

  it('hard-cuts text without spaces', () => {
    const excerpt = toExcerpt('x'.repeat(500));
    expect(excerpt).toBe(`${'x'.repeat(EXCERPT_LENGTH)}…`);
  });

  it('returns short text unchanged', () => {
    expect(toExcerpt('Short note.')).toBe('Short note.');
  });
});
