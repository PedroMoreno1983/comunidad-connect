-- Ya aplicada en producción (2026-09-22). El índice acelera el conteo, pero el
-- UPDATE que marca fuera de stock todavía supera los 8 s por defecto. El límite
-- más amplio queda solo en esta función interna: no cambia permisos ni la
-- cobertura mínima que impide conciliar un catálogo incompleto.

ALTER FUNCTION public.finalize_supermarket_catalog_refresh(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  SET statement_timeout = '60s';
