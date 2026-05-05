-- =============================================
-- Función RPC para Búsqueda Vectorial de Memorias
-- =============================================
-- Esta función combina:
-- 1. Similitud semántica (vectorial)
-- 2. Decaimiento por tiempo (recencia)
-- 3. Importancia del recuerdo

CREATE OR REPLACE FUNCTION match_agent_memories (
  query_embedding vector(1024),
  match_condominio_id uuid,
  match_user_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  importance float,
  created_at timestamp with time zone,
  similarity float,
  recency_score float,
  final_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_matches AS (
    SELECT
      am.id,
      am.content,
      am.importance,
      am.created_at,
      -- Usamos el operador de distancia del coseno (<=>)
      -- La similitud es 1 - distancia
      1 - (am.embedding <=> query_embedding) AS similarity,
      
      -- Calculamos la recencia con un decaimiento exponencial
      -- Pierde la mitad de su valor cada 30 días
      EXP(-EXTRACT(EPOCH FROM (NOW() - am.created_at)) / (30 * 24 * 60 * 60)) AS recency_score
      
    FROM
      public.agent_memories am
    WHERE
      am.condominio_id = match_condominio_id
      AND am.user_id = match_user_id
    
    -- Usamos el índice HNSW para limitar rápidamente a los 50 más cercanos semánticamente
    -- Esto hace que la query sea extremadamente rápida incluso con millones de registros
    ORDER BY
      am.embedding <=> query_embedding
    LIMIT 50
  )
  SELECT
    vm.id,
    vm.content,
    vm.importance,
    vm.created_at,
    vm.similarity,
    vm.recency_score,
    -- LA FÓRMULA DE SCORING FINAL
    -- Puedes ajustar los multiplicadores según veas cómo se comporta
    (
      (0.5 * vm.similarity) +                  -- Peso de similitud (50%)
      (0.3 * (vm.importance / 10.0)) +         -- Peso de importancia (30%)
      (0.2 * vm.recency_score)                 -- Peso de recencia (20%)
    ) AS final_score
  FROM
    vector_matches vm
  WHERE
    1 - (vm.similarity) > match_threshold -- Filtro mínimo de similitud si es necesario (ej: 0.5)
  ORDER BY
    final_score DESC
  LIMIT match_count;
END;
$$;
