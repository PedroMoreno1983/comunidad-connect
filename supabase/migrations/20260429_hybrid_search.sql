-- ============================================================
-- ComunidadConnect: Búsqueda Híbrida (Léxica + Semántica)
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

-- 1. Activar extensión pgvector (semántica)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. MARKETPLACE ITEMS — Búsqueda léxica + semántica
-- ============================================================

-- Columna de vector semántico (Claude text-embedding-3-small = 1536 dims)
ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Columna de búsqueda de texto completo en español
ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(category, '')
    )
  ) STORED;

-- Índice GIN para full-text search (rápido)
CREATE INDEX IF NOT EXISTS marketplace_fts_idx
  ON marketplace_items USING gin(search_vector);

-- Índice HNSW para búsqueda semántica vectorial (rápido y escalable)
CREATE INDEX IF NOT EXISTS marketplace_embedding_idx
  ON marketplace_items USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- 3. PROFILES / DIRECTORIO — Búsqueda léxica
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(role, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS profiles_fts_idx
  ON profiles USING gin(search_vector);

-- ============================================================
-- 4. Función RPC: búsqueda léxica marketplace
-- ============================================================
CREATE OR REPLACE FUNCTION search_marketplace_lexical(query text)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  price numeric,
  category text,
  image_url text,
  seller_id uuid,
  status text,
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
    seller_id,
    status,
    created_at,
    ts_rank(search_vector, websearch_to_tsquery('spanish', query)) AS rank
  FROM marketplace_items
  WHERE
    status = 'available'
    AND search_vector @@ websearch_to_tsquery('spanish', query)
  ORDER BY rank DESC
  LIMIT 20;
$$;

-- ============================================================
-- 5. Función RPC: búsqueda semántica marketplace (por vector)
-- ============================================================
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
  seller_id uuid,
  status text,
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
    seller_id,
    status,
    created_at,
    1 - (embedding <=> query_embedding) AS similarity
  FROM marketplace_items
  WHERE
    status = 'available'
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 6. Función RPC: búsqueda léxica directorio (profiles)
-- ============================================================
CREATE OR REPLACE FUNCTION search_profiles_lexical(query text)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  rank real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    name,
    email,
    role,
    avatar_url,
    ts_rank(search_vector, websearch_to_tsquery('spanish', query)) AS rank
  FROM profiles
  WHERE search_vector @@ websearch_to_tsquery('spanish', query)
  ORDER BY rank DESC
  LIMIT 20;
$$;
