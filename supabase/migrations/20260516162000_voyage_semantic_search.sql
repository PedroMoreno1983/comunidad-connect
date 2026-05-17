-- Production semantic search for marketplace listings with current Voyage models.
-- Keeps the legacy 1536-dimension embedding column untouched and adds a
-- 1024-dimension column aligned with voyage-3.5-lite / voyage-3.5 defaults.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS embedding_voyage vector(1024);

DROP INDEX IF EXISTS marketplace_embedding_voyage_idx;

CREATE INDEX marketplace_embedding_voyage_idx
  ON marketplace_items USING hnsw (embedding_voyage vector_cosine_ops);

DROP FUNCTION IF EXISTS search_marketplace_semantic(vector, int);

CREATE OR REPLACE FUNCTION search_marketplace_semantic(
  query_embedding vector(1024),
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  price numeric,
  category text,
  image_url text,
  images text[],
  seller_id uuid,
  status text,
  allow_sale boolean,
  allow_swap boolean,
  swap_details text,
  allow_barter boolean,
  barter_details text,
  payment_status text,
  created_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    title,
    description,
    price,
    category,
    image_url,
    images,
    seller_id,
    status,
    allow_sale,
    allow_swap,
    swap_details,
    allow_barter,
    barter_details,
    payment_status,
    created_at,
    1 - (embedding_voyage <=> query_embedding) AS similarity
  FROM marketplace_items
  WHERE
    status = 'available'
    AND embedding_voyage IS NOT NULL
  ORDER BY embedding_voyage <=> query_embedding
  LIMIT match_count;
$$;
