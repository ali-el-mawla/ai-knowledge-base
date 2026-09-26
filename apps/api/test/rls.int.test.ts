/**
 * Row Level Security, tested at the database itself with supabase-js and real user
 * JWTs, without the API in between: whatever client connects, a user only ever sees
 * and writes their own rows, and the worker-only paths stay closed to users.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  createTestUser,
  deleteTestUsers,
  type TestUser,
  unitVector,
  userClient,
  writeChunksAsWorker,
} from './support/supabase.js';

const PERMISSION_DENIED = '42501'; // missing privilege and RLS WITH CHECK violations alike
const EMBEDDING_MODEL = 'rls-test-model';

let alice: TestUser;
let bob: TestUser;
let documentId: string;
let conversationId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser('alice'), createTestUser('bob')]);
  const asAlice = userClient(alice.token);

  const { data: doc, error: docError } = await asAlice
    .from('documents')
    .insert({
      title: 'Refund policy',
      content: 'Refunds within 30 days. Code RF-2291.',
      tags: ['policy'],
    })
    .select('id, user_id, content_version')
    .single();
  if (docError) throw docError;
  expect(doc.user_id).toBe(alice.id); // user_id defaults to auth.uid()
  documentId = doc.id;
  await writeChunksAsWorker(
    documentId,
    doc.content_version,
    [{ chunkIndex: 0, content: 'Refunds within 30 days. Code RF-2291.' }],
    EMBEDDING_MODEL,
  );

  const { data: conversation, error: conversationError } = await asAlice
    .from('conversations')
    .insert({ title: 'Refund questions' })
    .select('id')
    .single();
  if (conversationError) throw conversationError;
  conversationId = conversation.id;
  const { error: messageError } = await asAlice
    .from('messages')
    .insert({ conversation_id: conversationId, role: 'user', content: 'What is the refund code?' });
  if (messageError) throw messageError;
});

afterAll(async () => {
  await deleteTestUsers(alice, bob);
});

describe('reads: each user sees only their own rows', () => {
  it.each(['documents', 'document_chunks', 'conversations', 'messages'] as const)(
    '%s: the owner sees 1 row, another user 0',
    async (table) => {
      const column = table === 'documents' || table === 'conversations' ? 'id' : 'user_id';
      const value =
        table === 'documents' ? documentId : table === 'conversations' ? conversationId : alice.id;

      const own = await userClient(alice.token).from(table).select('id').eq(column, value);
      const foreign = await userClient(bob.token).from(table).select('id').eq(column, value);

      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    },
  );

  it("hybrid_search only returns the caller's chunks", async () => {
    const query = {
      query_text: 'what is the refund code?',
      query_embedding: JSON.stringify(unitVector(0)),
      query_embedding_model: EMBEDDING_MODEL,
    };
    const own = await userClient(alice.token).rpc('hybrid_search', query);
    const foreign = await userClient(bob.token).rpc('hybrid_search', query);
    expect(own.data?.map((row) => row.document_id)).toEqual([documentId]);
    expect(foreign.data).toEqual([]);
  });

  it("tag counts only cover the caller's documents", async () => {
    const own = await userClient(alice.token).rpc('document_tag_counts');
    const foreign = await userClient(bob.token).rpc('document_tag_counts');
    expect(own.data).toEqual([{ tag: 'policy', count: 1 }]);
    expect(foreign.data).toEqual([]);
  });
});

describe('writes: another user cannot touch the rows', () => {
  it("cannot update or delete another user's document (0 rows affected)", async () => {
    const asBob = userClient(bob.token);
    const updated = await asBob
      .from('documents')
      .update({ title: 'Hacked' })
      .eq('id', documentId)
      .select('id');
    const deleted = await asBob.from('documents').delete().eq('id', documentId).select('id');
    expect(updated.data).toEqual([]);
    expect(deleted.data).toEqual([]);

    const { data } = await adminClient()
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single();
    expect(data?.title).toBe('Refund policy');
  });

  it("cannot post a message into another user's conversation", async () => {
    const { error } = await userClient(bob.token)
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content: 'Injected' });
    expect(error).not.toBeNull();
  });
});

describe('writes: the owner is limited to the fields a user should control', () => {
  it.each([
    ['ingestion_status', { ingestion_status: 'ready' as const }],
    ['content_version', { content_version: 99 }],
    ['chunk_count', { chunk_count: 99 }],
  ])('cannot set %s on their own document', async (_column, change) => {
    const { error } = await userClient(alice.token)
      .from('documents')
      .update(change)
      .eq('id', documentId);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('cannot create a document on behalf of someone else', async () => {
    const { error } = await userClient(alice.token)
      .from('documents')
      .insert({ title: 'Planted', content: 'x', user_id: bob.id });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('cannot write chunks directly', async () => {
    const { error } = await userClient(alice.token)
      .from('document_chunks')
      .insert({
        document_id: documentId,
        user_id: alice.id,
        document_version: 1,
        document_title: 'Refund policy',
        chunk_index: 5,
        content: 'Forged chunk',
        token_estimate: 2,
        content_hash: 'forged',
        embedding: JSON.stringify(unitVector(1)),
        embedding_model: EMBEDDING_MODEL,
      });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it('cannot call replace_document_chunks (worker only)', async () => {
    const { error } = await userClient(alice.token).rpc('replace_document_chunks', {
      p_document_id: documentId,
      p_content_version: 1,
      p_embedding_model: EMBEDDING_MODEL,
      p_chunks: [],
    });
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toMatch(/permission denied for function replace_document_chunks/);
  });

  it('cannot insert an assistant message (only the API writes answers)', async () => {
    const { error } = await userClient(alice.token)
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: 'Forged answer' });
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toMatch(/row-level security/);
  });
});

describe('cascades', () => {
  it('deleting a document removes its chunks', async () => {
    const { error } = await userClient(alice.token).from('documents').delete().eq('id', documentId);
    expect(error).toBeNull();
    const { count } = await adminClient()
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId);
    expect(count).toBe(0);
  });
});
