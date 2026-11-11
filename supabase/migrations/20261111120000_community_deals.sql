-- ============================================================
-- Convenios comunitarios
--
-- La comunidad junta demanda o pone un espacio y a cambio consigue precio:
--   vendor_visit  una feria o proveedor vende en el edificio ciertos días; no
--                 paga por el espacio y da precios preferenciales.
--   bulk_service  un servicio contratado para todo el edificio (internet,
--                 seguros, revisión de gas) más barato que por departamento.
--   space_income  un espacio común arrendado a un tercero (antena, publicidad)
--                 que baja el gasto común.
--
-- Ciclo: propuesto (si lo propone un residente) → sondeo de interés →
-- cotizando → activo → cerrado. Solo la administración avanza el ciclo,
-- registra cotizaciones y elige una. needs_assembly marca los convenios que
-- requieren acuerdo de asamblea (uso de bienes comunes, contratos a nombre de
-- la comunidad, Ley 21.442): la administración lo decide, CoCo lo advierte.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.community_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  interest_goal INTEGER,
  needs_assembly BOOLEAN NOT NULL DEFAULT FALSE,
  assembly_note TEXT NOT NULL DEFAULT '',
  reference_price INTEGER,
  deal_price INTEGER,
  price_unit TEXT NOT NULL DEFAULT 'unit_month',
  selected_quote_id UUID,
  terms TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  starts_on DATE,
  ends_on DATE,
  review_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_deals_title_check CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  CONSTRAINT community_deals_kind_check CHECK (kind IN ('vendor_visit', 'bulk_service', 'space_income')),
  CONSTRAINT community_deals_description_check CHECK (char_length(description) <= 2000),
  CONSTRAINT community_deals_status_check CHECK (status IN ('proposed', 'gauging', 'quoting', 'active', 'closed', 'rejected')),
  CONSTRAINT community_deals_interest_goal_check CHECK (interest_goal IS NULL OR interest_goal BETWEEN 1 AND 5000),
  CONSTRAINT community_deals_assembly_note_check CHECK (char_length(assembly_note) <= 1000),
  CONSTRAINT community_deals_prices_check CHECK (
    (reference_price IS NULL OR reference_price >= 0) AND (deal_price IS NULL OR deal_price >= 0)
  ),
  CONSTRAINT community_deals_price_unit_check CHECK (price_unit IN ('unit_month', 'unit_once', 'community_month', 'discount_percent')),
  CONSTRAINT community_deals_terms_check CHECK (char_length(terms) <= 3000 AND char_length(schedule) <= 300),
  CONSTRAINT community_deals_dates_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS community_deals_community_status_idx ON public.community_deals (community_id, status);

CREATE TABLE IF NOT EXISTS public.community_deal_interests (
  deal_id UUID NOT NULL REFERENCES public.community_deals(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (deal_id, user_id),
  CONSTRAINT community_deal_interests_note_check CHECK (char_length(note) <= 300)
);

CREATE TABLE IF NOT EXISTS public.community_deal_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.community_deals(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  price INTEGER,
  price_unit TEXT NOT NULL DEFAULT 'unit_month',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT community_deal_quotes_provider_check CHECK (char_length(btrim(provider_name)) BETWEEN 2 AND 120),
  CONSTRAINT community_deal_quotes_text_check CHECK (char_length(contact) <= 200 AND char_length(offer) <= 2000),
  CONSTRAINT community_deal_quotes_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT community_deal_quotes_price_unit_check CHECK (price_unit IN ('unit_month', 'unit_once', 'community_month', 'discount_percent'))
);

CREATE INDEX IF NOT EXISTS community_deal_quotes_deal_idx ON public.community_deal_quotes (deal_id);

ALTER TABLE public.community_deals
  DROP CONSTRAINT IF EXISTS community_deals_selected_quote_fk;
ALTER TABLE public.community_deals
  ADD CONSTRAINT community_deals_selected_quote_fk
  FOREIGN KEY (selected_quote_id) REFERENCES public.community_deal_quotes(id) ON DELETE SET NULL;

-- ── Seguridad por fila ──────────────────────────────────────
ALTER TABLE public.community_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_deal_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_deal_quotes ENABLE ROW LEVEL SECURITY;

-- Lo propuesto o rechazado lo ven quien lo propuso y la administración.
DROP POLICY IF EXISTS "community_deals_select" ON public.community_deals;
CREATE POLICY "community_deals_select" ON public.community_deals FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND (status NOT IN ('proposed', 'rejected') OR created_by = auth.uid() OR public.get_my_role() = 'admin')
);

-- Un residente propone; la administración puede crear directo en cualquier etapa.
DROP POLICY IF EXISTS "community_deals_insert" ON public.community_deals;
CREATE POLICY "community_deals_insert" ON public.community_deals FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND community_id = public.get_my_community_id()
  AND (status = 'proposed' OR public.get_my_role() = 'admin')
);

DROP POLICY IF EXISTS "community_deals_update_admin" ON public.community_deals;
CREATE POLICY "community_deals_update_admin" ON public.community_deals FOR UPDATE USING (
  community_id = public.get_my_community_id() AND public.get_my_role() = 'admin'
) WITH CHECK (
  community_id = public.get_my_community_id()
);

-- Quién se sumó lo ve cada persona (lo suyo) y la administración. Al resto le
-- llega solo el conteo, por list_community_deals.
DROP POLICY IF EXISTS "community_deal_interests_select" ON public.community_deal_interests;
CREATE POLICY "community_deal_interests_select" ON public.community_deal_interests FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND (user_id = auth.uid() OR public.get_my_role() = 'admin')
);

-- Las cotizaciones son de toda la comunidad: transparencia sobre qué se ofreció.
DROP POLICY IF EXISTS "community_deal_quotes_select" ON public.community_deal_quotes;
CREATE POLICY "community_deal_quotes_select" ON public.community_deal_quotes FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND EXISTS (
    SELECT 1 FROM public.community_deals d
    WHERE d.id = deal_id
      AND (d.status NOT IN ('proposed', 'rejected') OR public.get_my_role() = 'admin')
  )
);

DROP POLICY IF EXISTS "community_deal_quotes_insert_admin" ON public.community_deal_quotes;
CREATE POLICY "community_deal_quotes_insert_admin" ON public.community_deal_quotes FOR INSERT WITH CHECK (
  community_id = public.get_my_community_id() AND public.get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "community_deal_quotes_delete_admin" ON public.community_deal_quotes;
CREATE POLICY "community_deal_quotes_delete_admin" ON public.community_deal_quotes FOR DELETE USING (
  community_id = public.get_my_community_id() AND public.get_my_role() = 'admin'
);

-- La cotización elegida tiene que ser del mismo convenio, y la comunidad de
-- interesados y cotizaciones, la del convenio.
CREATE OR REPLACE FUNCTION public.community_deals_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  IF NEW.selected_quote_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_deal_quotes q WHERE q.id = NEW.selected_quote_id AND q.deal_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'La cotización elegida no es de este convenio' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_deals_guard ON public.community_deals;
CREATE TRIGGER community_deals_guard
BEFORE UPDATE ON public.community_deals
FOR EACH ROW EXECUTE FUNCTION public.community_deals_guard();

CREATE OR REPLACE FUNCTION public.community_deal_child_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.community_deals d WHERE d.id = NEW.deal_id AND d.community_id = NEW.community_id
  ) THEN
    RAISE EXCEPTION 'El convenio no es de esta comunidad' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_deal_quotes_guard ON public.community_deal_quotes;
CREATE TRIGGER community_deal_quotes_guard
BEFORE INSERT OR UPDATE ON public.community_deal_quotes
FOR EACH ROW EXECUTE FUNCTION public.community_deal_child_guard();

-- ── Sumarse o salirse ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_deal_interest_as(
  p_user_id UUID,
  p_deal_id UUID,
  p_interested BOOLEAN,
  p_note TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal public.community_deals%ROWTYPE;
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_deal FROM public.community_deals WHERE id = p_deal_id;
  IF v_deal.id IS NULL OR v_deal.community_id IS DISTINCT FROM (SELECT community_id FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Convenio no encontrado' USING ERRCODE = '42501';
  END IF;
  IF v_deal.status NOT IN ('gauging', 'quoting', 'active') THEN
    RAISE EXCEPTION 'Este convenio no está recibiendo interesados' USING ERRCODE = '22023';
  END IF;

  IF p_interested THEN
    INSERT INTO public.community_deal_interests (deal_id, community_id, user_id, note)
    VALUES (p_deal_id, v_deal.community_id, p_user_id, left(btrim(COALESCE(p_note, '')), 300))
    ON CONFLICT (deal_id, user_id) DO UPDATE SET note = EXCLUDED.note;
  ELSE
    DELETE FROM public.community_deal_interests WHERE deal_id = p_deal_id AND user_id = p_user_id;
  END IF;

  SELECT count(*) INTO v_count FROM public.community_deal_interests WHERE deal_id = p_deal_id;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.community_deal_interest_as(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_deal_interest_as(UUID, UUID, BOOLEAN, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.set_community_deal_interest(
  p_deal_id UUID,
  p_interested BOOLEAN,
  p_note TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.community_deal_interest_as(auth.uid(), p_deal_id, p_interested, p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.set_community_deal_interest(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_community_deal_interest(UUID, BOOLEAN, TEXT) TO authenticated;

-- ── Listado con conteo de interesados ───────────────────────
CREATE OR REPLACE FUNCTION public.list_community_deals()
RETURNS TABLE (
  id UUID,
  title TEXT,
  kind TEXT,
  description TEXT,
  status TEXT,
  interest_goal INTEGER,
  needs_assembly BOOLEAN,
  assembly_note TEXT,
  reference_price INTEGER,
  deal_price INTEGER,
  price_unit TEXT,
  selected_quote_id UUID,
  terms TEXT,
  schedule TEXT,
  starts_on DATE,
  ends_on DATE,
  review_note TEXT,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ,
  interested_count INTEGER,
  i_am_interested BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, d.kind, d.description, d.status, d.interest_goal, d.needs_assembly, d.assembly_note,
         d.reference_price, d.deal_price, d.price_unit, d.selected_quote_id, d.terms, d.schedule,
         d.starts_on, d.ends_on, d.review_note, d.created_by,
         COALESCE(p.full_name, p.name, 'Vecino'), d.created_at,
         (SELECT count(*)::int FROM public.community_deal_interests i WHERE i.deal_id = d.id),
         EXISTS (SELECT 1 FROM public.community_deal_interests i WHERE i.deal_id = d.id AND i.user_id = auth.uid())
  FROM public.community_deals d
  LEFT JOIN public.profiles p ON p.id = d.created_by
  WHERE d.community_id = public.get_my_community_id()
    AND (d.status NOT IN ('proposed', 'rejected') OR d.created_by = auth.uid() OR public.get_my_role() = 'admin')
  ORDER BY CASE d.status WHEN 'active' THEN 0 WHEN 'quoting' THEN 1 WHEN 'gauging' THEN 2 WHEN 'proposed' THEN 3 ELSE 4 END,
           d.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_community_deals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_community_deals() TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.community_deals TO authenticated;
GRANT SELECT ON public.community_deal_interests TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_deal_quotes TO authenticated;

COMMIT;
