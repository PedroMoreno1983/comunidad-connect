-- El conserje no debe ver la situación financiera de los residentes.
--
-- La migración 20260728160000 dio acceso a unit_charges y unit_payments a
-- 'admin' y 'concierge' por igual, copiando el patrón de otras tablas
-- operativas (visitas, encomiendas). Pero el dinero no es una tabla operativa:
-- el sistema ya excluye deliberadamente al conserje de `expenses`, y la API
-- /api/finance/statement solo trata como staff al admin.
--
-- Quedaba entonces una incoherencia con consecuencia real: el conserje no podía
-- ver el gasto común de un residente, pero sí sus multas y sus pagos. Un
-- portero que sabe quién debe plata y quién no es exactamente lo que la regla
-- "nunca compartas datos de un residente con otro" busca evitar.
--
-- Verificado antes del cambio: el conserje leía unit_charges sin problema, y
-- ninguna pantalla ni herramienta suya consume estas tablas.

BEGIN;

DROP POLICY IF EXISTS "unit_charges_read" ON public.unit_charges;
CREATE POLICY "unit_charges_read" ON public.unit_charges
  FOR SELECT TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (
      public.get_my_role() = 'admin'
      OR unit_id IN (SELECT id FROM public.units WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "unit_payments_read" ON public.unit_payments;
CREATE POLICY "unit_payments_read" ON public.unit_payments
  FOR SELECT TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (
      public.get_my_role() = 'admin'
      OR unit_id IN (SELECT id FROM public.units WHERE owner_id = auth.uid())
    )
  );

COMMIT;
