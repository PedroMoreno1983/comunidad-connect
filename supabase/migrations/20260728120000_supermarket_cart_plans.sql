-- Planes de carga de carro para el cargador de CoCo (bookmarklet).
--
-- El bookmarklet corre en el dominio del supermercado (jumbo.cl, lider.cl…),
-- así que no puede leer la sesión de Convive: las cookies de auth son
-- SameSite y no viajan cross-site. En vez de eso, Convive genera un código
-- corto de un solo uso y la persona lo pega en el cargador.
--
-- El contenido es solo una lista de compras (nombres y cantidades), sin datos
-- personales ni de pago. Aun así se limita: expira en 30 minutos, admite un
-- máximo de lecturas y el código tiene entropía suficiente para no ser
-- adivinable por fuerza bruta dentro de esa ventana.

BEGIN;

CREATE TABLE IF NOT EXISTS public.supermarket_cart_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  items JSONB NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  fetch_count INTEGER NOT NULL DEFAULT 0,
  max_fetches INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supermarket_cart_plans_code
  ON public.supermarket_cart_plans(code);
CREATE INDEX IF NOT EXISTS idx_supermarket_cart_plans_expiry
  ON public.supermarket_cart_plans(expires_at);

ALTER TABLE public.supermarket_cart_plans ENABLE ROW LEVEL SECURITY;

-- Solo el backend toca esta tabla. La lectura por código ocurre en el route
-- handler con service_role, que valida expiración y tope de lecturas -- nunca
-- se expone vía PostgREST a la anon key (si no, el código sería innecesario:
-- cualquiera podría listar todos los planes).
CREATE POLICY "supermarket_cart_plans_service_role"
  ON public.supermarket_cart_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Limpieza de planes vencidos: los deja de arrastrar indefinidamente. Se
-- invoca de forma oportunista desde el propio endpoint al crear un plan.
CREATE OR REPLACE FUNCTION public.purge_expired_supermarket_cart_plans()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.supermarket_cart_plans
  WHERE expires_at < NOW() - INTERVAL '1 day';
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_supermarket_cart_plans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_supermarket_cart_plans() TO service_role;

COMMIT;
