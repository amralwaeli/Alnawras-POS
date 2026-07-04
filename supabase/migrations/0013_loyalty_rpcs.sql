-- ============================================================
-- 0013_loyalty_rpcs.sql   (Phase 1 — server-authoritative loyalty)
--
-- Replaces the client-side read-modify-write loyalty logic (which double-awards
-- on retry and can double-spend / go negative under concurrency) with atomic,
-- transactional SECURITY DEFINER functions:
--
--   earn_loyalty_points   — adds points + accumulates spend/visits atomically,
--                           idempotent per order (one 'earn' per order+customer).
--   redeem_loyalty_points — guarded atomic deduction; returns FALSE if the
--                           balance is insufficient (never goes negative).
--   adjust_loyalty_points — manual +/- with a 0 floor; the ledger records the
--                           ACTUAL applied delta so balance and ledger reconcile.
--
-- SAFE TO APPLY: additive only (creates functions; no table/RLS/data changes),
-- so it cannot break login or the running app. It works today under the open-anon
-- setup and remains correct once RLS is enabled later in Phase 1 (SECURITY
-- DEFINER). EXECUTE is granted to anon now (the app is anon); Phase 1 RLS will
-- narrow this to authenticated staff.
--
-- Reference schema: customers(id UUID, points_balance INT, total_spent NUMERIC,
-- total_visits INT), loyalty_transactions(type IN earn|redeem|adjust,...).
-- ============================================================

-- ── Earn ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.earn_loyalty_points(
  p_customer_id UUID,
  p_order_id    TEXT,
  p_points      INT,
  p_amount      NUMERIC,
  p_branch_id   TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN RETURN; END IF;

  -- Idempotency: never award twice for the same order (guards the retry path).
  IF EXISTS (
    SELECT 1 FROM loyalty_transactions
    WHERE order_id = p_order_id AND customer_id = p_customer_id AND type = 'earn'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO loyalty_transactions (id, customer_id, order_id, type, points, description, branch_id)
  VALUES (gen_random_uuid(), p_customer_id, p_order_id, 'earn', p_points,
          'Earned ' || p_points || ' points on order', p_branch_id);

  UPDATE customers
    SET points_balance = points_balance + p_points,
        total_spent    = total_spent + COALESCE(p_amount, 0),
        total_visits   = total_visits + 1
    WHERE id = p_customer_id;
END; $$;

-- ── Redeem ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_customer_id UUID,
  p_order_id    TEXT,
  p_points      INT,
  p_branch_id   TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INT;
BEGIN
  IF p_points IS NULL OR p_points <= 0 THEN RETURN FALSE; END IF;

  -- Atomic guarded deduction: only succeeds if the balance is sufficient, so two
  -- concurrent redemptions can never both pass or drive the balance negative.
  UPDATE customers SET points_balance = points_balance - p_points
    WHERE id = p_customer_id AND points_balance >= p_points;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN FALSE; END IF;

  INSERT INTO loyalty_transactions (id, customer_id, order_id, type, points, description, branch_id)
  VALUES (gen_random_uuid(), p_customer_id, p_order_id, 'redeem', -p_points,
          'Redeemed ' || p_points || ' points for discount', p_branch_id);
  RETURN TRUE;
END; $$;

-- ── Adjust (manual) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_loyalty_points(
  p_customer_id UUID,
  p_points      INT,
  p_description TEXT,
  p_branch_id   TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old INT; v_new INT; v_delta INT;
BEGIN
  SELECT points_balance INTO v_old FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Customer % not found', p_customer_id; END IF;

  v_new   := GREATEST(0, v_old + COALESCE(p_points, 0));
  v_delta := v_new - v_old;  -- the ACTUAL applied change (ledger must match balance)

  UPDATE customers SET points_balance = v_new WHERE id = p_customer_id;

  INSERT INTO loyalty_transactions (id, customer_id, order_id, type, points, description, branch_id)
  VALUES (gen_random_uuid(), p_customer_id, NULL, 'adjust', v_delta,
          COALESCE(p_description, 'Manual adjustment'), p_branch_id);
  RETURN v_new;
END; $$;

-- Least privilege: no implicit PUBLIC execute; grant explicitly (narrow to
-- authenticated once Supabase Auth + RLS land).
REVOKE ALL ON FUNCTION public.earn_loyalty_points(UUID, TEXT, INT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_loyalty_points(UUID, TEXT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_loyalty_points(UUID, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.earn_loyalty_points(UUID, TEXT, INT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(UUID, TEXT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_loyalty_points(UUID, INT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
