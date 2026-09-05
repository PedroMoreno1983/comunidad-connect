-- Memoria de compras del hogar, para dejar de teclear la misma lista.
--
-- Hoy el vecino arma su lista desde cero cada semana. Guardar lo que pidio
-- permite proponerle la recompra en vez de obligarlo a recordar.
--
-- Se guarda el TERMINO pedido ("leche"), no el producto que gano la
-- comparacion. El producto cambia entre semanas -distinta marca, distinto
-- formato, distinta tienda- pero lo que la persona quiere es el mismo. Guardar
-- el SKU ganador ataria la memoria a un catalogo que se mueve todos los dias.
--
-- Lo que se busca no es historial sino RECURRENCIA. "Aca estan tus 40 listas
-- anteriores" obliga a buscar; "compraste leche hace 12 dias, va de nuevo?"
-- resuelve. Por eso se guarda una fila por producto pedido y no un blob de
-- lista: el intervalo entre compras de un mismo termino es la señal util, y
-- eso se calcula sobre filas, no sobre listas.
--
-- Es dato personal: que compra una familia dice bastante de ella. La tabla
-- queda bajo RLS estricta -cada quien ve solo lo suyo, sin excepcion para
-- admin ni conserje, a diferencia de otras tablas del proyecto- porque nadie
-- del condominio tiene por que ver el supermercado del vecino.

-- Nace apagado. Nadie queda con su supermercado registrado sin haberlo pedido,
-- y el precio de esa decision es que la funcion no sirve el primer dia: hacen
-- falta dos compras del mismo producto para estimar un ritmo. Se sigue la
-- convencion de whatsapp_enabled, que ya vive en profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supermarket_history_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.supermarket_history_enabled IS
  'Opt-in explicito para guardar que compra el hogar. Apagado por defecto.';

CREATE TABLE IF NOT EXISTS public.supermarket_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Termino normalizado tal como se pidio: minusculas, sin espacios extra.
  term TEXT NOT NULL CHECK (char_length(term) BETWEEN 1 AND 120),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT CHECK (unit IS NULL OR char_length(unit) <= 16),
  -- Tienda elegida esa vez, si alcanzo a elegir una. Sirve para notar que
  -- alguien compra siempre en la misma y ahorrarle el paso.
  store TEXT CHECK (store IS NULL OR char_length(store) <= 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supermarket_purchase_history IS
  'Una fila por producto pedido en una comparacion. Alimenta la propuesta de recompra.';

-- El acceso natural es "que pidio esta persona, de este termino, y cuando".
CREATE INDEX IF NOT EXISTS supermarket_purchase_history_user_term_idx
  ON public.supermarket_purchase_history (user_id, term, created_at DESC);

-- Y "que pidio ultimamente", para la vista general.
CREATE INDEX IF NOT EXISTS supermarket_purchase_history_user_recent_idx
  ON public.supermarket_purchase_history (user_id, created_at DESC);

ALTER TABLE public.supermarket_purchase_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supermarket_purchase_history_self_select ON public.supermarket_purchase_history;
CREATE POLICY supermarket_purchase_history_self_select
ON public.supermarket_purchase_history
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS supermarket_purchase_history_self_insert ON public.supermarket_purchase_history;
CREATE POLICY supermarket_purchase_history_self_insert
ON public.supermarket_purchase_history
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- Poder borrar lo propio no es un extra: es lo que hace que guardar esto sea
-- aceptable. Si alguien quiere que Convive olvide lo que compra, debe poder.
DROP POLICY IF EXISTS supermarket_purchase_history_self_delete ON public.supermarket_purchase_history;
CREATE POLICY supermarket_purchase_history_self_delete
ON public.supermarket_purchase_history
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));
