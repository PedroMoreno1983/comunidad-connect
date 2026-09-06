-- Saber quien ya pago en un pedido comunitario.
--
-- La liquidacion ya se calculaba y se mostraba: cada vecino ve cuanto debe y a
-- quien. Lo que faltaba era el paso siguiente, que es donde el sistema dejaba
-- de servir: nadie podia registrar que el pago ocurrio. El organizador
-- terminaba persiguiendo gente por WhatsApp y llevando la cuenta de memoria,
-- que es exactamente el trabajo que la herramienta deberia ahorrarle.
--
-- Mientras no exista pasarela de pagos, el dinero se mueve fuera de Convive
-- -transferencia, efectivo, lo que acuerden- y lo unico que corresponde es
-- llevar la cuenta clara. Por eso se guarda cuando se dio por pagado y quien lo
-- dio por pagado, no un cobro.
--
-- Marca el organizador, no quien paga. El que recibe el dinero es el unico que
-- sabe si llego; dejar que cada quien se declare pagado inventa un limbo de
-- "declarado pero no confirmado" que genera mas discusiones de las que evita.

ALTER TABLE public.supermarket_group_order_members
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  -- Queda registrado quien lo marco: si despues hay desacuerdo, importa
  -- distinguir un cobro dado por recibido por el organizador de uno anotado
  -- por un administrador del condominio.
  ADD COLUMN IF NOT EXISTS paid_marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.supermarket_group_order_members.paid_at IS
  'Cuando el organizador dio por recibido el pago de este vecino. NULL = pendiente.';
COMMENT ON COLUMN public.supermarket_group_order_members.paid_marked_by IS
  'Quien lo marco. Normalmente el organizador; un admin tambien puede.';

-- El acceso natural es "quienes de este pedido siguen debiendo".
CREATE INDEX IF NOT EXISTS supermarket_group_order_members_pending_idx
  ON public.supermarket_group_order_members (order_id)
  WHERE paid_at IS NULL;
