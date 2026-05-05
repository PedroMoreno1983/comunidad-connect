-- =============================================
-- Migración CoCo IA - Memoria a Largo Plazo
-- =============================================

-- 1. Habilitar la extensión para vectores (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Crear la tabla de memorias del agente
CREATE TABLE IF NOT EXISTS public.agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condominio_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    
    content TEXT NOT NULL,
    
    -- vector(1024) es el tamaño de voyage-3 de Voyage AI.
    embedding vector(1024),
    
    importance FLOAT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Crear índices para búsquedas y filtros eficientes
-- Índice para búsqueda vectorial HNSW
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON public.agent_memories USING hnsw (embedding vector_cosine_ops);

-- Índice para filtrar por condominio y usuario rápidamente
CREATE INDEX IF NOT EXISTS idx_memories_user ON public.agent_memories(condominio_id, user_id);

-- 4. RLS (Row Level Security) - Protegiendo la tabla
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;

-- Solo los servicios backend (Service Role) o usuarios autenticados autorizados deberían acceder.
-- Por ahora, permitimos que el backend lo maneje.
DROP POLICY IF EXISTS "Backend has full access to agent_memories" ON public.agent_memories;
CREATE POLICY "Backend has full access to agent_memories" ON public.agent_memories FOR ALL USING (true);
