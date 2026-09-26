-- The documents list only shows a short plain-text preview. Selecting `content` for it
-- would move up to 200k characters per row to the API just to throw almost all of it
-- away, so the database keeps the first 400 characters in a stored generated column.
-- The API strips the markdown and cuts the preview to its final length (~180 characters).
alter table public.documents
  add column excerpt text generated always as (left(content, 400)) stored;

comment on column public.documents.excerpt is 'First 400 characters of content, for list views (generated; never written).';
