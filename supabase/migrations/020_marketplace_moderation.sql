-- Add a moderation state for marketplace listings.

ALTER TABLE marketplace_items
  DROP CONSTRAINT IF EXISTS marketplace_items_status_check;

ALTER TABLE marketplace_items
  ADD CONSTRAINT marketplace_items_status_check
  CHECK (status IN ('available', 'reserved', 'sold', 'hidden'));

DROP FUNCTION IF EXISTS search_marketplace_lexical(text);

CREATE OR REPLACE FUNCTION search_marketplace_lexical(query text)
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
  rank real
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
    ts_rank(search_vector, websearch_to_tsquery('spanish', query)) AS rank
  FROM marketplace_items
  WHERE
    status = 'available'
    AND search_vector @@ websearch_to_tsquery('spanish', query)
  ORDER BY rank DESC
  LIMIT 20;
$$;

DROP FUNCTION IF EXISTS search_marketplace_semantic(vector, int);

CREATE OR REPLACE FUNCTION search_marketplace_semantic(
  query_embedding vector(1536),
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
    1 - (embedding <=> query_embedding) AS similarity
  FROM marketplace_items
  WHERE
    status = 'available'
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
