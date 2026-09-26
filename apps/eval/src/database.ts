/**
 * The part of the database schema the evaluation touches, in the shape `supabase gen types`
 * produces. The full generated file lives in apps/api and an app cannot import from another
 * app, so the two tables and two functions used here are restated. Aliases (not interfaces)
 * on purpose: supabase-js checks them against index-signature types.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type IngestionStatus = 'pending' | 'processing' | 'ready' | 'failed';

type DocumentRow = {
  chunk_count: number;
  content: string;
  content_version: number;
  created_at: string;
  id: string;
  ingested_at: string | null;
  ingestion_error: string | null;
  ingestion_status: IngestionStatus;
  tags: string[];
  title: string;
  updated_at: string;
  user_id: string;
};

type ChunkRow = {
  chunk_index: number;
  content: string;
  content_hash: string;
  created_at: string;
  document_id: string;
  document_title: string;
  document_version: number;
  embedding: string;
  embedding_model: string;
  heading_path: string;
  id: string;
  token_estimate: number;
  user_id: string;
};

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: DocumentRow;
        Insert: Partial<DocumentRow> & Pick<DocumentRow, 'title' | 'content'>;
        Update: Partial<DocumentRow>;
        Relationships: [];
      };
      document_chunks: {
        Row: ChunkRow;
        // Chunks are only ever written through replace_document_chunks.
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      hybrid_search: {
        Args: {
          query_text: string;
          query_embedding: string;
          query_embedding_model: string;
          match_count?: number;
          full_text_weight?: number;
          semantic_weight?: number;
          rrf_k?: number;
          candidate_count?: number;
        };
        Returns: {
          chunk_id: string;
          document_id: string;
          document_title: string;
          heading_path: string;
          content: string;
          semantic_rank: number | null;
          keyword_rank: number | null;
          fused_score: number;
        }[];
      };
      replace_document_chunks: {
        Args: {
          p_document_id: string;
          p_content_version: number;
          p_embedding_model: string;
          p_chunks: Json;
        };
        Returns: { applied: boolean; inserted: number; reused: number }[];
      };
    };
    Enums: { ingestion_status: IngestionStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
