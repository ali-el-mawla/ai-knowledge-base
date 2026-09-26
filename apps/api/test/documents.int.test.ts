import { randomUUID } from 'node:crypto';
import type { ApiErrorBody, Document, DocumentChunk, DocumentList, TagCount } from '@repo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, startTestApp, type TestApp } from './support/app.js';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  type TestUser,
  writeChunksAsWorker,
} from './support/supabase.js';

let testApp: TestApp;
let alice: TestUser;
let bob: TestUser;
let asAlice: ApiClient;
let asBob: ApiClient;

beforeAll(async () => {
  [testApp, alice, bob] = await Promise.all([
    startTestApp(),
    createTestUser('alice'),
    createTestUser('bob'),
  ]);
  asAlice = new ApiClient(testApp.baseUrl, alice.token);
  asBob = new ApiClient(testApp.baseUrl, bob.token);
});

afterAll(async () => {
  await testApp?.close();
  await deleteTestUsers(alice, bob);
});

async function createDocument(input: {
  title: string;
  content?: string;
  tags?: string[];
}): Promise<Document> {
  const response = await asAlice.post<Document>('/documents', {
    content: `Content of ${input.title}`,
    ...input,
  });
  expect(response.status).toBe(201);
  return response.body;
}

describe('documents: the owner', () => {
  let doc: Document;

  beforeAll(async () => {
    doc = await createDocument({
      title: '  Refund policy ',
      content: '# Refunds\n\nRefunds are accepted within **30 days**.',
      tags: ['Policy', 'finance', 'policy'],
    });
  });

  it('creates a document (201), normalised and pending ingestion', () => {
    expect(doc).toMatchObject({
      id: expect.any(String),
      title: 'Refund policy',
      tags: ['policy', 'finance'],
      ingestion: { status: 'pending', error: null, chunkCount: 0, contentVersion: 1 },
    });
    expect(testApp.ingestion.countFor(doc.id)).toBe(1);
  });

  it('reads it back', async () => {
    const response = await asAlice.get<Document>(`/documents/${doc.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(doc);
  });

  it('lists it with an excerpt instead of the content', async () => {
    const response = await asAlice.get<DocumentList>('/documents');
    expect(response.status).toBe(200);
    const item = response.body.items.find((candidate) => candidate.id === doc.id);
    expect(item).toMatchObject({
      title: 'Refund policy',
      // The heading differs from the title, so it stays, ended with a period.
      excerpt: 'Refunds. Refunds are accepted within 30 days.',
    });
    expect(item).not.toHaveProperty('content');
  });

  it('edits tags without bumping the version or re-ingesting', async () => {
    const queuedBefore = testApp.ingestion.countFor(doc.id);
    const response = await asAlice.patch<Document>(`/documents/${doc.id}`, { tags: ['policy'] });
    expect(response.status).toBe(200);
    expect(response.body.tags).toEqual(['policy']);
    expect(response.body.ingestion.contentVersion).toBe(1);
    expect(response.body.updatedAt > doc.updatedAt).toBe(true);
    expect(testApp.ingestion.countFor(doc.id)).toBe(queuedBefore);
  });

  it('does not re-ingest when the text is saved unchanged', async () => {
    const queuedBefore = testApp.ingestion.countFor(doc.id);
    const response = await asAlice.patch<Document>(`/documents/${doc.id}`, {
      title: 'Refund policy',
    });
    expect(response.status).toBe(200);
    expect(response.body.ingestion.contentVersion).toBe(1);
    expect(testApp.ingestion.countFor(doc.id)).toBe(queuedBefore);
  });

  it('bumps the version and re-ingests when the content changes', async () => {
    const queuedBefore = testApp.ingestion.countFor(doc.id);
    const response = await asAlice.patch<Document>(`/documents/${doc.id}`, {
      content: '# Refunds\n\nRefunds are accepted within 60 days.',
    });
    expect(response.status).toBe(200);
    expect(response.body.ingestion).toMatchObject({ status: 'pending', contentVersion: 2 });
    expect(testApp.ingestion.countFor(doc.id)).toBe(queuedBefore + 1);
  });

  it('reindex (202) bumps the version and queues ingestion', async () => {
    const queuedBefore = testApp.ingestion.countFor(doc.id);
    const response = await asAlice.post<Document>(`/documents/${doc.id}/reindex`);
    expect(response.status).toBe(202);
    expect(response.body.ingestion).toMatchObject({ status: 'pending', contentVersion: 3 });
    expect(testApp.ingestion.countFor(doc.id)).toBe(queuedBefore + 1);
  });

  it('lists the current chunks in document order', async () => {
    const empty = await asAlice.get<{ items: DocumentChunk[] }>(`/documents/${doc.id}/chunks`);
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);

    await writeChunksAsWorker(doc.id, 3, [
      { chunkIndex: 1, content: 'Refunds are accepted within 60 days.', headingPath: 'Refunds' },
      { chunkIndex: 0, content: 'Refund policy overview.' },
    ]);
    const response = await asAlice.get<{ items: DocumentChunk[] }>(`/documents/${doc.id}/chunks`);
    expect(response.body.items.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
    expect(response.body.items[1]).toMatchObject({
      headingPath: 'Refunds',
      content: 'Refunds are accepted within 60 days.',
      tokenEstimate: expect.any(Number),
    });

    const ready = await asAlice.get<Document>(`/documents/${doc.id}`);
    expect(ready.body.ingestion).toMatchObject({ status: 'ready', chunkCount: 2 });
  });

  it('counts tags over its own documents', async () => {
    const response = await asAlice.get<{ items: TagCount[] }>('/tags');
    expect(response.status).toBe(200);
    expect(response.body.items).toContainEqual({ tag: 'policy', count: 1 });
  });
});

describe('documents: another user', () => {
  let alicesDoc: Document;

  beforeAll(async () => {
    alicesDoc = await createDocument({ title: 'Salary bands', tags: ['confidential'] });
  });

  it.each([
    ['GET', ''],
    ['PATCH', ''],
    ['DELETE', ''],
    ['POST', '/reindex'],
    ['GET', '/chunks'],
  ])('gets 404 for %s /documents/:id%s', async (method, suffix) => {
    const response = await asBob.request<ApiErrorBody>(
      method,
      `/documents/${alicesDoc.id}${suffix}`,
      method === 'PATCH' ? { body: { title: 'Mine now' } } : {},
    );
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
  });

  it('left the document untouched and did not queue anything', async () => {
    const response = await asAlice.get<Document>(`/documents/${alicesDoc.id}`);
    expect(response.body).toEqual(alicesDoc);
    expect(testApp.ingestion.countFor(alicesDoc.id)).toBe(1);
  });

  it('sees an empty list and no tags', async () => {
    const list = await asBob.get<DocumentList>('/documents');
    expect(list.body).toEqual({ items: [], total: 0 });
    const tags = await asBob.get<{ items: TagCount[] }>('/tags');
    expect(tags.body.items).toEqual([]);
  });
});

describe('documents: list filters and paging', () => {
  let user: TestUser;
  let asUser: ApiClient;

  beforeAll(async () => {
    user = await createTestUser('lists');
    asUser = new ApiClient(testApp.baseUrl, user.token);
    const inputs = [
      { title: '50% off sale', content: 'Spring promotion.', tags: ['sales'] },
      { title: '500 off voucher', content: 'Loyalty voucher.', tags: ['sales'] },
      { title: 'Refunds (EU), 2026', content: 'Rights exceed the minimum.', tags: ['policy'] },
      { title: 'Onboarding', content: 'Use the snake_case naming.', tags: ['hr'] },
    ];
    // Sequential, so updated_at gives a known order (newest first).
    for (const input of inputs) {
      const response = await asUser.post<Document>('/documents', input);
      expect(response.status).toBe(201);
    }
  });

  afterAll(async () => {
    await deleteTestUsers(user);
  });

  async function titles(query: string): Promise<{ titles: string[]; total: number }> {
    const response = await asUser.get<DocumentList>(`/documents?${query}`);
    expect(response.status).toBe(200);
    return { titles: response.body.items.map((item) => item.title), total: response.body.total };
  }

  it('orders by most recently updated', async () => {
    expect((await titles('')).titles).toEqual([
      'Onboarding',
      'Refunds (EU), 2026',
      '500 off voucher',
      '50% off sale',
    ]);
  });

  it('filters by tag', async () => {
    expect(await titles('tag=sales')).toEqual({
      titles: ['500 off voucher', '50% off sale'],
      total: 2,
    });
  });

  it('treats % and _ in q literally', async () => {
    // As wildcards, "50%" would also match "500 off" and "e_c" would match "exceed".
    expect((await titles(`q=${encodeURIComponent('50%')}`)).titles).toEqual(['50% off sale']);
    expect((await titles('q=e_c')).titles).toEqual(['Onboarding']);
  });

  it('survives PostgREST separators in q and matches case-insensitively', async () => {
    expect((await titles(`q=${encodeURIComponent('(eu), 2026')}`)).titles).toEqual([
      'Refunds (EU), 2026',
    ]);
    expect((await titles(`q=${encodeURIComponent('"),id.neq.(x')}`)).titles).toEqual([]);
  });

  it('searches content as well as title', async () => {
    expect((await titles('q=LOYALTY')).titles).toEqual(['500 off voucher']);
  });

  it('pages with limit and offset and reports the exact total', async () => {
    expect(await titles('limit=2&offset=1')).toEqual({
      titles: ['Refunds (EU), 2026', '500 off voucher'],
      total: 4,
    });
  });

  it('returns an empty page, with the total, past the end', async () => {
    expect(await titles('limit=10&offset=40')).toEqual({ titles: [], total: 4 });
  });
});

describe('documents: validation', () => {
  it('rejects an invalid body with VALIDATION_FAILED and field details', async () => {
    const response = await asAlice.post<ApiErrorBody>('/documents', { title: '', content: ' ' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fieldErrors: { title: [expect.any(String)], content: ['Content cannot be empty'] },
      },
      requestId: expect.any(String),
    });
  });

  it('rejects content over the 200k character limit', async () => {
    const response = await asAlice.post<ApiErrorBody>('/documents', {
      title: 'Too long',
      content: 'x'.repeat(200_001),
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an empty patch', async () => {
    const created = await createDocument({ title: 'Patch target' });
    const response = await asAlice.patch<ApiErrorBody>(`/documents/${created.id}`, {});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed id and out-of-range paging', async () => {
    const badId = await asAlice.get<ApiErrorBody>('/documents/not-a-uuid');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('VALIDATION_FAILED');

    const badLimit = await asAlice.get<ApiErrorBody>('/documents?limit=1000');
    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error.details).toMatchObject({
      fieldErrors: { limit: expect.any(Array) },
    });
  });

  it('answers 404 for an id that does not exist', async () => {
    const response = await asAlice.get<ApiErrorBody>(`/documents/${randomUUID()}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('documents: delete', () => {
  it('deletes (204) and cascades to the chunks', async () => {
    const doc = await createDocument({ title: 'Temporary' });
    await writeChunksAsWorker(doc.id, 1, [{ chunkIndex: 0, content: 'Short-lived.' }]);

    const response = await asAlice.delete<undefined>(`/documents/${doc.id}`);
    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();

    expect((await asAlice.get<ApiErrorBody>(`/documents/${doc.id}`)).status).toBe(404);
    const { count } = await adminClient()
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    expect(count).toBe(0);
  });
});
