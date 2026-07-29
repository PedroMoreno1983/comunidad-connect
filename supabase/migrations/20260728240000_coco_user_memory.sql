-- Memoria de CoCo entre sesiones.
--
-- coco_sessions guarda el hilo reciente pero expira a las 24h. Esto es distinto:
-- hechos DURABLES que el residente le contó a CoCo y conviene recordar en futuras
-- conversaciones (preferencias, contexto personal), no el chat completo. Una fila
-- por usuario, con los hechos como arreglo de textos cortos. La lógica de la app
-- mantiene el arreglo acotado (los más nuevos), fiel a "que no se apile infinito".

BEGIN;

CREATE TABLE IF NOT EXISTS public.coco_user_memory (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  -- Hechos cortos en lenguaje natural, del más viejo al más nuevo.
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coco_user_memory ENABLE ROW LEVEL SECURITY;

-- Cada quien ve solo su propia memoria; el servidor (service role) la gestiona.
DROP POLICY IF EXISTS "coco_user_memory_own_read" ON public.coco_user_memory;
CREATE POLICY "coco_user_memory_own_read" ON public.coco_user_memory
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "coco_user_memory_service_role" ON public.coco_user_memory;
CREATE POLICY "coco_user_memory_service_role" ON public.coco_user_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
