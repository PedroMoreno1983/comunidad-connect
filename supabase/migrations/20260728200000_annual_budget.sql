-- Presupuesto anual por categoría.
--
-- Es lo que el comité aprueba en asamblea y contra lo que se mide la
-- administración durante el año. Se guarda el monto ANUAL por categoría; la
-- comparación mensual se calcula dividiendo por 12, que es como se lee en la
-- práctica ("vamos gastando más luz de la presupuestada").

BEGIN;

CREATE TABLE IF NOT EXISTS public.annual_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  category TEXT NOT NULL
    CHECK (category IN ('water', 'electricity', 'salaries', 'maintenance', 'security', 'other')),
  annual_amount NUMERIC(14, 2) NOT NULL CHECK (annual_amount >= 0),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una sola línea por categoría y año: editar el presupuesto es actualizar,
  -- no acumular líneas nuevas que después nadie sabe cuál vale.
  UNIQUE (community_id, year, category)
);

CREATE INDEX IF NOT EXISTS idx_annual_budgets_community_year
  ON public.annual_budgets(community_id, year);

ALTER TABLE public.annual_budgets ENABLE ROW LEVEL SECURITY;

-- El presupuesto es información que la comunidad aprobó: cualquier miembro del
-- tenant puede leerlo; solo el backend escribe.
DROP POLICY IF EXISTS "annual_budgets_read" ON public.annual_budgets;
CREATE POLICY "annual_budgets_read" ON public.annual_budgets
  FOR SELECT TO authenticated
  USING (community_id = public.get_my_community_id());

DROP POLICY IF EXISTS "annual_budgets_service_role" ON public.annual_budgets;
CREATE POLICY "annual_budgets_service_role" ON public.annual_budgets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
