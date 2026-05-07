-- Persist marketplace transaction modes and multi-image listings.

ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allow_sale BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_swap BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS swap_details TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS allow_barter BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS barter_details TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE marketplace_items
  DROP CONSTRAINT IF EXISTS marketplace_items_status_check;

ALTER TABLE marketplace_items
  ADD CONSTRAINT marketplace_items_status_check
  CHECK (status IN ('available', 'reserved', 'sold'));

ALTER TABLE marketplace_items
  DROP CONSTRAINT IF EXISTS marketplace_items_payment_status_check;

ALTER TABLE marketplace_items
  ADD CONSTRAINT marketplace_items_payment_status_check
  CHECK (payment_status IN ('none', 'pending', 'completed'));

UPDATE marketplace_items
SET
  images = CASE
    WHEN image_url IS NOT NULL AND (images IS NULL OR array_length(images, 1) IS NULL) THEN ARRAY[image_url]
    ELSE COALESCE(images, '{}')
  END,
  allow_sale = COALESCE(allow_sale, TRUE),
  allow_swap = COALESCE(allow_swap, FALSE),
  allow_barter = COALESCE(allow_barter, FALSE),
  swap_details = COALESCE(swap_details, ''),
  barter_details = COALESCE(barter_details, ''),
  payment_status = COALESCE(payment_status, 'none');

CREATE INDEX IF NOT EXISTS idx_marketplace_items_modes
  ON marketplace_items (allow_sale, allow_swap, allow_barter);

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
