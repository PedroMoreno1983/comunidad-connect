-- Migration 030: Semantic search support for Profiles (Directorio) using Voyage AI 1024-d embeddings.
-- Adds pgvector integration, hnsw index, and community-aware lexical and semantic search functions.

-- 1. Enable pgvector if not done
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS embedding_voyage vector(1024);

-- 3. Create HNSW index for high performance vector similarity search
CREATE INDEX IF NOT EXISTS profiles_embedding_voyage_idx
  ON public.profiles USING hnsw (embedding_voyage vector_cosine_ops);

-- 4. Drop legacy search profiles lexical function to avoid overload conflicts
DROP FUNCTION IF EXISTS search_profiles_lexical(text);
DROP FUNCTION IF EXISTS search_profiles_lexical(text, uuid);

-- 5. Recreate lexical search with community-aware tenant isolation
CREATE OR REPLACE FUNCTION search_profiles_lexical(
  query text,
  community_filter_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  rank real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_community_id uuid;
BEGIN
  -- Resolve community filter: input param -> auth user profile community -> NULL (fallback)
  IF community_filter_id IS NOT NULL THEN
    user_community_id := community_filter_id;
  ELSE
    SELECT community_id INTO user_community_id FROM public.profiles WHERE profiles.id = auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.email,
    p.role,
    p.avatar_url,
    ts_rank(p.search_vector, websearch_to_tsquery('spanish', query)) AS rank
  FROM public.profiles p
  WHERE
    p.search_vector @@ websearch_to_tsquery('spanish', query)
    AND (user_community_id IS NULL OR p.community_id = user_community_id)
  ORDER BY rank DESC
  LIMIT 20;
END;
$$;

-- 6. Create semantic search function using pgvector and cosine distance
DROP FUNCTION IF EXISTS search_profiles_semantic(vector, int, uuid);
DROP FUNCTION IF EXISTS search_profiles_semantic(vector, int);

CREATE OR REPLACE FUNCTION search_profiles_semantic(
  query_embedding vector(1024),
  match_count int DEFAULT 10,
  community_filter_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  similarity real
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  user_community_id uuid;
BEGIN
  -- Resolve community filter: input param -> auth user profile community -> NULL (fallback)
  IF community_filter_id IS NOT NULL THEN
    user_community_id := community_filter_id;
  ELSE
    SELECT community_id INTO user_community_id FROM public.profiles WHERE profiles.id = auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.email,
    p.role,
    p.avatar_url,
    (1 - (p.embedding_voyage <=> query_embedding))::real AS similarity
  FROM public.profiles p
  WHERE
    p.embedding_voyage IS NOT NULL
    AND (user_community_id IS NULL OR p.community_id = user_community_id)
  ORDER BY p.embedding_voyage <=> query_embedding
  LIMIT match_count;
END;
$$;
