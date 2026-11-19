-- Topes de CoCo por persona más altos (19-11-2026).
--
-- Medido: un mensaje en Sonnet 5 cuesta ~20 centavos de dólar con la caché
-- fría y ~1,5 con la caché tibia. Con 15 centavos al día un residente tenía
-- un mensaje, a veces dos; no alcanzaba para una compra de supermercado.
-- Lo que evita perder plata es el tope mensual de cada comunidad, que no cambia.
--
-- Administración y conserjería: US$2 al día, US$6 a la semana.
-- Residentes: US$0,50 al día, US$1,50 a la semana.

ALTER TABLE public.ai_budgets
    ALTER COLUMN staff_daily_cost_cents SET DEFAULT 200,
    ALTER COLUMN staff_weekly_cost_cents SET DEFAULT 600,
    ALTER COLUMN resident_daily_cost_cents SET DEFAULT 50,
    ALTER COLUMN resident_weekly_cost_cents SET DEFAULT 150;

-- Solo las comunidades que seguían con los topes anteriores por defecto.
UPDATE public.ai_budgets
SET staff_daily_cost_cents = 200, staff_weekly_cost_cents = 600,
    resident_daily_cost_cents = 50, resident_weekly_cost_cents = 150
WHERE staff_daily_cost_cents = 100 AND staff_weekly_cost_cents = 400
  AND resident_daily_cost_cents = 15 AND resident_weekly_cost_cents = 50;
