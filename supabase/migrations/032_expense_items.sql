-- 032_expense_items.sql
-- Desglose real de gastos comunes. Esta tabla existe en schema.sql pero faltaba
-- como migracion incremental en algunos entornos de produccion.

CREATE TABLE IF NOT EXISTS public.expense_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('water', 'electricity', 'salaries', 'maintenance', 'security', 'other')),
  label TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL
);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_items_select_by_visible_expense" ON public.expense_items;
CREATE POLICY "expense_items_select_by_visible_expense"
  ON public.expense_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.expenses e
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE e.id = expense_items.expense_id
        AND (
          e.unit_id = p.unit_id
          OR e.community_id = p.community_id
          OR p.role = 'superadmin'
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id ON public.expense_items(expense_id);
