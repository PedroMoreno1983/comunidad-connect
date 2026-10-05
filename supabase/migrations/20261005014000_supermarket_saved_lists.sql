-- Listas de compras que la persona vuelve a usar.
--
-- El historial de recompra guarda terminos sueltos y nace apagado. Esto es
-- otra cosa: el texto de la lista, tal como se escribio, para no rehacerla
-- cada vez que se entra al supermercado.
--
-- Sigue siendo dato del hogar. RLS estricta: cada quien ve y borra solo lo suyo.

CREATE TABLE IF NOT EXISTS public.supermarket_saved_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 12000),
  body_key TEXT NOT NULL CHECK (char_length(body_key) BETWEEN 1 AND 12000),
  store TEXT CHECK (store IS NULL OR store IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supermarket_saved_lists IS
  'Texto de una lista de supermercado guardada por quien la escribio.';

CREATE INDEX IF NOT EXISTS supermarket_saved_lists_user_recent_idx
  ON public.supermarket_saved_lists (user_id, updated_at DESC);

ALTER TABLE public.supermarket_saved_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supermarket_saved_lists_self_select ON public.supermarket_saved_lists;
CREATE POLICY supermarket_saved_lists_self_select
ON public.supermarket_saved_lists
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS supermarket_saved_lists_self_insert ON public.supermarket_saved_lists;
CREATE POLICY supermarket_saved_lists_self_insert
ON public.supermarket_saved_lists
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS supermarket_saved_lists_self_update ON public.supermarket_saved_lists;
CREATE POLICY supermarket_saved_lists_self_update
ON public.supermarket_saved_lists
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS supermarket_saved_lists_self_delete ON public.supermarket_saved_lists;
CREATE POLICY supermarket_saved_lists_self_delete
ON public.supermarket_saved_lists
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));
