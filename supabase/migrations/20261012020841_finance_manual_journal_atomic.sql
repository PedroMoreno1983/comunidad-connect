-- Un asiento manual solo existe si todas sus líneas quedan guardadas y cuadradas.
BEGIN;

CREATE OR REPLACE FUNCTION public.post_manual_journal_atomic(
  p_community_id uuid, p_entry_date date, p_memo text,
  p_actor_id uuid, p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_entry record;
  v_line jsonb;
  v_account_id uuid;
  v_debit integer;
  v_credit integer;
  v_debits bigint := 0;
  v_credits bigint := 0;
BEGIN
  IF p_entry_date IS NULL OR nullif(trim(p_memo), '') IS NULL THEN
    RAISE EXCEPTION 'El asiento necesita fecha y glosa.';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 8 THEN
    RAISE EXCEPTION 'El asiento necesita entre 2 y 8 líneas.';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_account_id := (v_line ->> 'account_id')::uuid;
    v_debit := (v_line ->> 'debit')::integer;
    v_credit := (v_line ->> 'credit')::integer;
    IF v_account_id IS NULL OR v_debit IS NULL OR v_credit IS NULL
       OR v_debit < 0 OR v_credit < 0
       OR (v_debit = 0 AND v_credit = 0)
       OR (v_debit > 0 AND v_credit > 0)
       OR NOT EXISTS (SELECT 1 FROM public.ledger_accounts
                      WHERE id = v_account_id AND community_id = p_community_id) THEN
      RAISE EXCEPTION 'Hay una línea inválida o una cuenta ajena a la comunidad.';
    END IF;
    v_debits := v_debits + v_debit;
    v_credits := v_credits + v_credit;
  END LOOP;
  IF v_debits <= 0 OR v_debits <> v_credits THEN
    RAISE EXCEPTION 'El asiento no está cuadrado.';
  END IF;

  INSERT INTO public.journal_entries
    (community_id, entry_date, memo, source, created_by)
  VALUES (p_community_id, p_entry_date, left(trim(p_memo), 240), 'manual', p_actor_id)
  RETURNING id, entry_date, memo, source, created_at INTO v_entry;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
    VALUES (v_entry.id, (v_line ->> 'account_id')::uuid,
            (v_line ->> 'debit')::integer, (v_line ->> 'credit')::integer);
  END LOOP;
  RETURN jsonb_build_object('id', v_entry.id, 'entry_date', v_entry.entry_date,
    'memo', v_entry.memo, 'source', v_entry.source,
    'created_at', v_entry.created_at, 'total', v_debits);
END;
$$;
REVOKE ALL ON FUNCTION public.post_manual_journal_atomic(uuid, date, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_manual_journal_atomic(uuid, date, text, uuid, jsonb)
  TO service_role;

COMMIT;
