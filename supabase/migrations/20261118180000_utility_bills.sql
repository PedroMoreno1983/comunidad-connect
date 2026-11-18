-- Servicios básicos: boletas de luz, agua y gas (18-11-2026).
--
-- Dos mundos que no se tocan:
--
-- 1. Administración: las boletas de los medidores COMPARTIDOS (luz de pasillos,
--    agua de riego, gas de la caldera central). El admin sube la boleta, la IA
--    la lee y queda un borrador de egreso que el admin aprueba. Cada n° de
--    cliente queda recordado (community_utility_accounts), así la segunda
--    boleta llega con categoría y nombre puestos, se detecta la duplicada (mismo
--    n° de cliente y período) y se avisa si el monto se aleja del mes anterior.
--
-- 2. Residente: sus cuentas PERSONALES (resident_utility_accounts). Las ve y
--    edita solo él: ni la administración ni CoCo de la administración las leen.
--    Sirven para recordarle el vencimiento y llevarlo al portal oficial de pago.

-- ── 1. Gas como categoría de egreso y datos de la boleta ────────────────────
ALTER TABLE public.community_expenses DROP CONSTRAINT IF EXISTS community_expenses_category_check;
ALTER TABLE public.community_expenses ADD CONSTRAINT community_expenses_category_check
    CHECK (category IN ('water', 'electricity', 'gas', 'salaries', 'maintenance', 'security', 'other'));

-- El presupuesto anual usa las mismas categorías: sin esto, presupuestar gas fallaría.
ALTER TABLE public.annual_budgets DROP CONSTRAINT IF EXISTS annual_budgets_category_check;
ALTER TABLE public.annual_budgets ADD CONSTRAINT annual_budgets_category_check
    CHECK (category IN ('water', 'electricity', 'gas', 'salaries', 'maintenance', 'security', 'other'));

ALTER TABLE public.community_expenses
    ADD COLUMN IF NOT EXISTS utility_customer_number TEXT,
    ADD COLUMN IF NOT EXISTS service_period TEXT CHECK (service_period IS NULL OR service_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    ADD COLUMN IF NOT EXISTS bill_due_date DATE,
    ADD COLUMN IF NOT EXISTS consumption_value NUMERIC(14, 3),
    ADD COLUMN IF NOT EXISTS consumption_unit TEXT;

-- La misma boleta (n° de cliente + período) no entra dos veces aunque el PDF
-- sea otro archivo (el reenvío por correo y la descarga del portal no tienen el
-- mismo hash).
CREATE UNIQUE INDEX IF NOT EXISTS community_expenses_utility_bill_uidx
    ON public.community_expenses (community_id, utility_customer_number, service_period)
    WHERE utility_customer_number IS NOT NULL AND service_period IS NOT NULL;

-- ── 2. Cuentas compartidas recordadas por condominio ────────────────────────
CREATE TABLE IF NOT EXISTS public.community_utility_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    service TEXT NOT NULL CHECK (service IN ('electricity', 'water', 'gas')),
    provider TEXT NOT NULL DEFAULT '',
    customer_number TEXT NOT NULL CHECK (length(customer_number) BETWEEN 1 AND 40),
    label TEXT NOT NULL DEFAULT '',
    prorate_method TEXT NOT NULL DEFAULT 'share' CHECK (prorate_method IN ('share', 'equal')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (community_id, customer_number)
);

ALTER TABLE public.community_utility_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_utility_accounts_admin_read" ON public.community_utility_accounts;
CREATE POLICY "community_utility_accounts_admin_read" ON public.community_utility_accounts
    FOR SELECT TO authenticated
    USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
DROP POLICY IF EXISTS "community_utility_accounts_service_role" ON public.community_utility_accounts;
CREATE POLICY "community_utility_accounts_service_role" ON public.community_utility_accounts
    TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON public.community_utility_accounts FROM anon, authenticated;
GRANT SELECT ON public.community_utility_accounts TO authenticated;
GRANT ALL ON public.community_utility_accounts TO service_role;

-- ── 3. Cuentas personales del residente (privadas) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.resident_utility_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    service TEXT NOT NULL CHECK (service IN ('electricity', 'water', 'gas')),
    provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 40),
    customer_number TEXT NOT NULL CHECK (length(customer_number) BETWEEN 1 AND 40),
    alias TEXT NOT NULL DEFAULT '' CHECK (length(alias) <= 60),
    -- Día del mes en que suele vencer. NULL: sin recordatorio de fecha.
    due_day SMALLINT CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
    reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- Último mes (AAAA-MM) que el residente marcó como pagado: apaga el aviso de ese mes.
    last_paid_period TEXT CHECK (last_paid_period IS NULL OR last_paid_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, provider, customer_number)
);
CREATE INDEX IF NOT EXISTS resident_utility_accounts_reminder_idx
    ON public.resident_utility_accounts (due_day) WHERE reminders_enabled AND due_day IS NOT NULL;

ALTER TABLE public.resident_utility_accounts ENABLE ROW LEVEL SECURITY;
-- Solo el dueño. A propósito no hay política para la administración.
DROP POLICY IF EXISTS "resident_utility_accounts_owner" ON public.resident_utility_accounts;
CREATE POLICY "resident_utility_accounts_owner" ON public.resident_utility_accounts
    FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "resident_utility_accounts_service_role" ON public.resident_utility_accounts;
CREATE POLICY "resident_utility_accounts_service_role" ON public.resident_utility_accounts
    TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resident_utility_accounts TO authenticated;
GRANT ALL ON public.resident_utility_accounts TO service_role;
