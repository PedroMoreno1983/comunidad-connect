-- Cupo de CoCo por persona, diario y semanal, en centavos de dólar (18-11-2026).
--
-- El plan Essential de un condominio de 79 unidades paga ~CLP 58.700 al mes
-- (~US$62). Para no perder plata, la IA no debería pasar del ~15 % del
-- ingreso: US$10 al mes por comunidad. Dentro de eso, cada persona tiene un
-- tope diario y semanal, para que una sola cuenta no se lleve el mes:
--   administración y conserjería: US$1 al día, US$4 a la semana;
--   residentes: US$0,15 al día (~5–10 mensajes), US$0,50 a la semana.
-- Costo medido en noviembre: un mensaje normal US$0,02–0,10; leer un
-- reglamento escaneado US$0,25–1,30.

ALTER TABLE public.ai_budgets
    ADD COLUMN IF NOT EXISTS staff_daily_cost_cents INTEGER NOT NULL DEFAULT 100 CHECK (staff_daily_cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS staff_weekly_cost_cents INTEGER NOT NULL DEFAULT 400 CHECK (staff_weekly_cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS resident_daily_cost_cents INTEGER NOT NULL DEFAULT 15 CHECK (resident_daily_cost_cents >= 0),
    ADD COLUMN IF NOT EXISTS resident_weekly_cost_cents INTEGER NOT NULL DEFAULT 50 CHECK (resident_weekly_cost_cents >= 0);

ALTER TABLE public.ai_budgets ALTER COLUMN monthly_cost_limit_cents SET DEFAULT 1000;

-- Bahía Las Palmas no tenía fila: usaba el tope del código (US$100 al mes).
INSERT INTO public.ai_budgets (community_id, plan, monthly_cost_limit_cents)
SELECT id, 'essential', 1000 FROM public.communities WHERE id = '07212377-00de-4153-aa98-ab036661b662'
ON CONFLICT (community_id) DO UPDATE SET plan = 'essential', monthly_cost_limit_cents = 1000, updated_at = NOW();
