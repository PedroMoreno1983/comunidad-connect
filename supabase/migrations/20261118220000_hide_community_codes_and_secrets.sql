-- Los residentes podían leer el código de administración (18-11-2026).
--
-- Las políticas de communities dejan a cada miembro leer la fila de su
-- comunidad, y la fila completa incluía admin_code y concierge_code: un
-- residente podía sacarlos desde su sesión y registrar otra cuenta como
-- administrador o conserje. También quedaban a la vista los secretos de los
-- webhooks de IoT y de accesos, y el id de cliente de Stripe.
--
-- RLS filtra filas, no columnas: se quita el SELECT de la tabla al navegador
-- y se devuelve solo por columnas, sin esas siete. Los códigos los entrega
-- /api/admin/invite-codes (servidor) solo a la administración.

REVOKE SELECT ON public.communities FROM anon, authenticated;

GRANT SELECT (
    id, name, address, tier_id, subscription_status, created_at,
    address_latitude, address_longitude, address_place_id, address_geocoding_source,
    cover_photo_url, iot_autonomous_actions_enabled, iot_autonomy_enabled_at, iot_autonomy_enabled_by,
    late_interest_monthly_rate, reserve_fund_rate, parking_external_enabled, parking_commission_percent,
    payroll_accident_rate, payroll_ccaf_code, payroll_mutual_code, access_webhook_url,
    parking_billing_method, parking_free_cancellation_hours, coco_autonomy, managed, claimed_at, created_by_resident
) ON public.communities TO authenticated;
