-- ============================================================
-- Bodegas: arriendo mensual entre vecinos
--
-- Módulo propio, al lado del de estacionamientos y no dentro: el motor de
-- estacionamientos exige vehículo registrado, cotiza por hora/día y valida
-- ventanas horarias semanales. Una bodega se arrienda por meses, sin vehículo.
-- Meterla ahí obligaba a tocar las funciones que ya cobran estacionamientos en
-- producción.
--
-- Cobro: cada mes del arriendo es un cargo (unit_charges, kind 'service') en la
-- cuenta de gastos comunes de la unidad de quien arrienda, igual que el
-- estacionamiento cuando no hay Haulmer. storage_rental_charges guarda qué
-- cargo corresponde a qué mes, para poder anular los futuros al cancelar.
-- ============================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.storage_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  floor_level TEXT NOT NULL DEFAULT '',
  area_m2 NUMERIC(6,2),
  monthly_rate INTEGER NOT NULL,
  min_months INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storage_units_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  CONSTRAINT storage_units_description_check CHECK (char_length(description) <= 500),
  CONSTRAINT storage_units_floor_level_check CHECK (char_length(floor_level) <= 20),
  CONSTRAINT storage_units_area_check CHECK (area_m2 IS NULL OR (area_m2 > 0 AND area_m2 <= 200)),
  CONSTRAINT storage_units_monthly_rate_check CHECK (monthly_rate > 0 AND monthly_rate <= 2000000),
  CONSTRAINT storage_units_min_months_check CHECK (min_months BETWEEN 1 AND 24),
  CONSTRAINT storage_units_status_check CHECK (status IN ('pending_approval', 'published', 'paused', 'rejected'))
);

CREATE INDEX IF NOT EXISTS storage_units_community_status_idx ON public.storage_units (community_id, status);
CREATE INDEX IF NOT EXISTS storage_units_owner_idx ON public.storage_units (owner_id);

CREATE TABLE IF NOT EXISTS public.storage_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  storage_id UUID NOT NULL REFERENCES public.storage_units(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  tenant_unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  starts_on DATE NOT NULL,
  months INTEGER NOT NULL,
  ends_on DATE NOT NULL,
  monthly_rate INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storage_rentals_months_check CHECK (months BETWEEN 1 AND 24),
  CONSTRAINT storage_rentals_range_valid CHECK (ends_on > starts_on),
  CONSTRAINT storage_rentals_amount_check CHECK (monthly_rate > 0 AND total_amount = monthly_rate * months),
  CONSTRAINT storage_rentals_status_check CHECK (status IN ('active', 'cancelled', 'completed')),
  CONSTRAINT storage_rentals_cancel_reason_check CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 300),
  CONSTRAINT storage_rentals_no_overlap EXCLUDE USING gist (
    storage_id WITH =,
    daterange(starts_on, ends_on, '[)') WITH &&
  ) WHERE (status = 'active')
);

CREATE INDEX IF NOT EXISTS storage_rentals_community_idx ON public.storage_rentals (community_id, status);
CREATE INDEX IF NOT EXISTS storage_rentals_tenant_idx ON public.storage_rentals (tenant_id);
CREATE INDEX IF NOT EXISTS storage_rentals_owner_idx ON public.storage_rentals (owner_id);

CREATE TABLE IF NOT EXISTS public.storage_rental_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rental_id UUID NOT NULL REFERENCES public.storage_rentals(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  amount INTEGER NOT NULL,
  unit_charge_id UUID NOT NULL REFERENCES public.unit_charges(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT storage_rental_charges_period_check CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT storage_rental_charges_amount_check CHECK (amount > 0),
  CONSTRAINT storage_rental_charges_unique_period UNIQUE (rental_id, period)
);

-- ── Seguridad por fila ──────────────────────────────────────
ALTER TABLE public.storage_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_rental_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "storage_units_select" ON public.storage_units;
CREATE POLICY "storage_units_select" ON public.storage_units FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND (status = 'published' OR owner_id = auth.uid() OR public.get_my_role() = 'admin')
);

DROP POLICY IF EXISTS "storage_units_insert_own" ON public.storage_units;
CREATE POLICY "storage_units_insert_own" ON public.storage_units FOR INSERT WITH CHECK (
  owner_id = auth.uid()
  AND community_id = public.get_my_community_id()
  AND status = 'pending_approval'
  AND approved_by IS NULL
);

DROP POLICY IF EXISTS "storage_units_update_own_or_admin" ON public.storage_units;
CREATE POLICY "storage_units_update_own_or_admin" ON public.storage_units FOR UPDATE USING (
  community_id = public.get_my_community_id()
  AND (owner_id = auth.uid() OR public.get_my_role() = 'admin')
) WITH CHECK (
  community_id = public.get_my_community_id()
);

DROP POLICY IF EXISTS "storage_units_delete_own" ON public.storage_units;
CREATE POLICY "storage_units_delete_own" ON public.storage_units FOR DELETE USING (
  owner_id = auth.uid() AND community_id = public.get_my_community_id()
);

DROP POLICY IF EXISTS "storage_rentals_select" ON public.storage_rentals;
CREATE POLICY "storage_rentals_select" ON public.storage_rentals FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND (tenant_id = auth.uid() OR owner_id = auth.uid() OR public.get_my_role() = 'admin')
);

DROP POLICY IF EXISTS "storage_rental_charges_select" ON public.storage_rental_charges;
CREATE POLICY "storage_rental_charges_select" ON public.storage_rental_charges FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND EXISTS (
    SELECT 1 FROM public.storage_rentals r
    WHERE r.id = rental_id
      AND (r.tenant_id = auth.uid() OR r.owner_id = auth.uid() OR public.get_my_role() = 'admin')
  )
);
-- Arriendos y cargos solo se escriben por las funciones de abajo.

-- Quien publica no puede auto-aprobarse: publicar, aprobar o rechazar es de la
-- administración. El dueño sí puede pausar, retomar una ya aprobada y cambiar
-- precio o descripción.
CREATE OR REPLACE FUNCTION public.storage_units_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  IF auth.uid() IS NULL OR public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.owner_id <> OLD.owner_id OR NEW.community_id <> OLD.community_id THEN
    RAISE EXCEPTION 'No se puede traspasar una bodega' USING ERRCODE = '42501';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Solo la administración aprueba bodegas' USING ERRCODE = '42501';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'published' AND NEW.status = 'paused')
    OR (OLD.status = 'paused' AND NEW.status = 'published' AND OLD.approved_at IS NOT NULL)
    OR (OLD.status = 'rejected' AND NEW.status = 'pending_approval')
  ) THEN
    RAISE EXCEPTION 'Ese cambio de estado lo hace la administración' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_units_guard ON public.storage_units;
CREATE TRIGGER storage_units_guard
BEFORE UPDATE ON public.storage_units
FOR EACH ROW EXECUTE FUNCTION public.storage_units_guard();

-- ── Buscar bodegas libres en un período ─────────────────────
-- SECURITY DEFINER para ver la ocupación sin exponer quién arrienda.
CREATE OR REPLACE FUNCTION public.search_storage_units(
  p_starts_on DATE,
  p_months INTEGER
)
RETURNS TABLE (
  id UUID,
  label TEXT,
  description TEXT,
  floor_level TEXT,
  area_m2 NUMERIC,
  monthly_rate INTEGER,
  min_months INTEGER,
  owner_id UUID,
  owner_name TEXT,
  total_amount INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.label, s.description, s.floor_level, s.area_m2, s.monthly_rate, s.min_months,
         s.owner_id, COALESCE(p.full_name, p.name, 'Vecino'), s.monthly_rate * p_months
  FROM public.storage_units s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  WHERE s.community_id = public.get_my_community_id()
    AND s.status = 'published'
    AND s.owner_id <> auth.uid()
    AND p_months BETWEEN 1 AND 24
    AND s.min_months <= p_months
    AND NOT EXISTS (
      SELECT 1 FROM public.storage_rentals r
      WHERE r.storage_id = s.id
        AND r.status = 'active'
        AND daterange(r.starts_on, r.ends_on, '[)')
            && daterange(p_starts_on, (p_starts_on + make_interval(months => p_months))::date, '[)')
    )
  ORDER BY s.monthly_rate, s.label;
$$;
REVOKE ALL ON FUNCTION public.search_storage_units(DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_storage_units(DATE, INTEGER) TO authenticated;

-- ── Arrendar ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_rent_as(
  p_user_id UUID,
  p_storage_id UUID,
  p_starts_on DATE,
  p_months INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage public.storage_units%ROWTYPE;
  v_my_community UUID;
  v_unit UUID;
  v_rental UUID;
  v_charge UUID;
  v_period DATE;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
  i INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'El arriendo va de 1 a 24 meses' USING ERRCODE = '22023';
  END IF;
  IF p_starts_on IS NULL OR p_starts_on < v_today THEN
    RAISE EXCEPTION 'El arriendo no puede empezar en el pasado' USING ERRCODE = '22023';
  END IF;
  IF p_starts_on > v_today + 180 THEN
    RAISE EXCEPTION 'Se puede arrendar con hasta 6 meses de anticipación' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_storage FROM public.storage_units WHERE id = p_storage_id FOR UPDATE;
  IF v_storage.id IS NULL OR v_storage.status <> 'published' THEN
    RAISE EXCEPTION 'La bodega no está disponible' USING ERRCODE = '22023';
  END IF;
  IF v_storage.owner_id = p_user_id THEN
    RAISE EXCEPTION 'No puedes arrendar tu propia bodega' USING ERRCODE = '22023';
  END IF;
  IF p_months < v_storage.min_months THEN
    RAISE EXCEPTION 'Esta bodega se arrienda por al menos % meses', v_storage.min_months USING ERRCODE = '22023';
  END IF;

  SELECT community_id INTO v_my_community FROM public.profiles WHERE id = p_user_id;
  IF v_my_community IS DISTINCT FROM v_storage.community_id THEN
    RAISE EXCEPTION 'Las bodegas se arriendan solo entre residentes de la comunidad' USING ERRCODE = '42501';
  END IF;

  v_unit := public.parking_resolve_billed_unit(p_user_id, v_storage.community_id);
  IF v_unit IS NULL THEN
    RAISE EXCEPTION 'No encontramos tu unidad para cargar el arriendo. Pide a la administración que la asocie a tu perfil.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.storage_rentals (
      community_id, storage_id, owner_id, tenant_id, tenant_unit_id,
      starts_on, months, ends_on, monthly_rate, total_amount
    ) VALUES (
      v_storage.community_id, v_storage.id, v_storage.owner_id, p_user_id, v_unit,
      p_starts_on, p_months, (p_starts_on + make_interval(months => p_months))::date,
      v_storage.monthly_rate, v_storage.monthly_rate * p_months
    )
    RETURNING id INTO v_rental;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Esa bodega ya está arrendada en parte de ese período' USING ERRCODE = '23505';
  END;

  FOR i IN 0 .. p_months - 1 LOOP
    v_period := (p_starts_on + make_interval(months => i))::date;
    INSERT INTO public.unit_charges (
      community_id, unit_id, month, kind, label, amount, status, due_date, notes
    ) VALUES (
      v_storage.community_id, v_unit, to_char(v_period, 'YYYY-MM'), 'service',
      left('Arriendo bodega ' || v_storage.label || ' (' || to_char(v_period, 'MM/YYYY') || ')', 120),
      v_storage.monthly_rate, 'pending', v_period, 'storage_rental:' || v_rental::text
    )
    RETURNING id INTO v_charge;

    INSERT INTO public.storage_rental_charges (community_id, rental_id, period, amount, unit_charge_id)
    VALUES (v_storage.community_id, v_rental, to_char(v_period, 'YYYY-MM'), v_storage.monthly_rate, v_charge);
  END LOOP;

  RETURN v_rental;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_rent_as(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rent_storage_unit(
  p_storage_id UUID,
  p_starts_on DATE,
  p_months INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.storage_rent_as(auth.uid(), p_storage_id, p_starts_on, p_months);
END;
$$;
REVOKE ALL ON FUNCTION public.rent_storage_unit(UUID, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rent_storage_unit(UUID, DATE, INTEGER) TO authenticated;

-- CoCo corre con la service role y pasa al residente verificado. Cerrada a
-- usuarios normales: si no, cualquiera podría arrendar en nombre de otro.
CREATE OR REPLACE FUNCTION public.coco_rent_storage_unit(
  p_user_id UUID,
  p_storage_id UUID,
  p_starts_on DATE,
  p_months INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.storage_rent_as(p_user_id, p_storage_id, p_starts_on, p_months);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_rent_storage_unit(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_rent_storage_unit(UUID, UUID, DATE, INTEGER) TO service_role;

-- ── Cancelar ────────────────────────────────────────────────
-- Anula los cargos de los meses que aún no empiezan y que siguen pendientes. El
-- mes en curso y los ya pagados no se tocan: devolver plata es una decisión de
-- la administración, fuera de esta función.
CREATE OR REPLACE FUNCTION public.cancel_storage_rental(
  p_rental_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.storage_rentals%ROWTYPE;
  v_current TEXT := to_char((NOW() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM');
  v_cancelled INTEGER;
BEGIN
  SELECT * INTO v_rental FROM public.storage_rentals WHERE id = p_rental_id FOR UPDATE;
  IF v_rental.id IS NULL
     OR v_rental.community_id IS DISTINCT FROM public.get_my_community_id()
     OR NOT (v_rental.tenant_id = auth.uid() OR public.get_my_role() = 'admin') THEN
    RAISE EXCEPTION 'Arriendo no encontrado' USING ERRCODE = '42501';
  END IF;
  IF v_rental.status <> 'active' THEN
    RAISE EXCEPTION 'El arriendo ya no está activo' USING ERRCODE = '22023';
  END IF;

  UPDATE public.storage_rentals
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = auth.uid(),
      cancel_reason = NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '')
  WHERE id = p_rental_id;

  UPDATE public.unit_charges uc
  SET status = 'cancelled'
  FROM public.storage_rental_charges src
  WHERE src.rental_id = p_rental_id
    AND src.unit_charge_id = uc.id
    AND src.period > v_current
    AND uc.status = 'pending';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_storage_rental(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_storage_rental(UUID, TEXT) TO authenticated;

-- ── Aprobar o rechazar (administración) ─────────────────────
CREATE OR REPLACE FUNCTION public.review_storage_unit(
  p_storage_id UUID,
  p_approved BOOLEAN,
  p_reason TEXT DEFAULT ''
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage public.storage_units%ROWTYPE;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo la administración aprueba bodegas' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_storage FROM public.storage_units
  WHERE id = p_storage_id AND community_id = public.get_my_community_id();
  IF v_storage.id IS NULL THEN
    RAISE EXCEPTION 'Bodega no encontrada' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approved AND char_length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Indica por qué se rechaza' USING ERRCODE = '22023';
  END IF;

  UPDATE public.storage_units
  SET status = CASE WHEN p_approved THEN 'published' ELSE 'rejected' END,
      approved_by = CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN p_approved THEN NOW() ELSE NULL END,
      rejection_reason = CASE WHEN p_approved THEN NULL ELSE left(btrim(p_reason), 300) END
  WHERE id = p_storage_id;

  RETURN CASE WHEN p_approved THEN 'published' ELSE 'rejected' END;
END;
$$;
REVOKE ALL ON FUNCTION public.review_storage_unit(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_storage_unit(UUID, BOOLEAN, TEXT) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_units TO authenticated;
GRANT SELECT ON public.storage_rentals TO authenticated;
GRANT SELECT ON public.storage_rental_charges TO authenticated;

COMMIT;
