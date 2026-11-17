-- ============================================================
-- 0029_customer_rpcs.sql   (Batch 2a — customer pages through checked functions)
--
-- Customers (table QR, group ordering, pickup links) have no login. Today their
-- pages read and write tables directly with the public key, and the only thing
-- stopping abuse is the page's own JavaScript. This adds the functions those
-- pages will use instead. Each one is gated by the customer's OWN credential
-- (a table QR token, a guest-session token, or a pickup token) and does every
-- business check on the server:
--
--   guest_join(qr_token, session_token?)  → join the table's party, get a guest token
--   guest_state(session_token)            → table flags + this party's bill, for polling
--   guest_submit(session_token, items)    → add items (ordering on, items available…)
--   guest_call_waiter(session_token)
--   pickup_open(token)                    → is this pickup link usable, for which branch
--   pickup_submit(token, details, items)  → place the ONE order this link allows
--
-- Limits against abuse on a small free database: at most 30 guests per party
-- and 10 new guests per table per minute; at most 40 lines per guest per
-- minute; a waiter call is only written when one isn't already pending.
-- A party (and every guest token in it) closes automatically the moment its
-- bill stops being open — by any payment path — so an old guest can never
-- add to the next party's bill.
--
-- Item pricing/insertion moves into one internal function used by staff AND
-- customers, with checks the old code lacked: product available (not marked
-- finished / out of stock by the kitchen), quantity 1–99, at most 50 lines, and
-- every modifier option must belong to that product. `submit_order_items`
-- keeps its exact signature, so the staff app is unchanged.
--
-- SAFE TO APPLY: additive. RLS stays off; nothing existing stops working.
-- Apply BEFORE deploying the client that calls these. Run AFTER 0028.
-- ============================================================

-- Random 64-hex token without pgcrypto (two v4 UUIDs ≈ 244 random bits).
CREATE OR REPLACE FUNCTION public._random_token()
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- Same rule as BranchController.getAccess: unknown branch = open (single-tenant
-- installs), suspended or past contract_end = closed.
CREATE OR REPLACE FUNCTION public._branch_open(p_branch_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT b.status = 'active' AND (b.contract_end IS NULL OR b.contract_end >= CURRENT_DATE)
    FROM branches b WHERE b.id = p_branch_id), true);
$$;

-- Bill-number counter body (from 0021), kept internal so customer functions can
-- number pickup bills; the public next_bill_number() gets a branch check in 0031.
CREATE OR REPLACE FUNCTION public._next_bill_number(p_branch_id TEXT, p_order_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num INT;
BEGIN
  INSERT INTO bill_counters (branch_id, order_type, last_number)
    VALUES (p_branch_id, COALESCE(p_order_type, 'dine-in'), 1)
  ON CONFLICT (branch_id, order_type)
    DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN lpad(v_num::text, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION public._next_bill_number(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_bill_number(p_branch_id TEXT, p_order_type TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._next_bill_number(p_branch_id, p_order_type);
$$;

-- ── Internal: validate, price and insert order lines ─────────
-- Never granted to anyone: only callable from the functions below.
CREATE OR REPLACE FUNCTION public._add_order_items(
  p_order_id      TEXT,
  p_branch_id     TEXT,
  p_added_by      TEXT,
  p_added_by_name TEXT,
  p_items         JSONB
) RETURNS TABLE (
  id TEXT, product_id TEXT, product_name TEXT, quantity INT,
  price NUMERIC, subtotal NUMERIC, station TEXT, status TEXT,
  notes TEXT, modifiers JSONB, added_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order   orders%ROWTYPE;
  v_item    JSONB;
  v_pid     TEXT;
  v_qty     INT;
  v_notes   TEXT;
  v_opts    TEXT[];
  v_base    NUMERIC;
  v_pname   TEXT;
  v_station TEXT;
  v_avail   BOOLEAN;
  v_addons  NUMERIC;
  v_mods    JSONB;
  v_found   INT;
  v_price   NUMERIC;
  v_sub     NUMERIC;
  v_new_id  TEXT;
  v_subtotal NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders o WHERE o.id = p_order_id AND o.branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'Cannot add items to a bill that is not open'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to add';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN RAISE EXCEPTION 'Too many lines in one order (max 50)'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid   := v_item->>'product_id';
    v_qty   := COALESCE((v_item->>'quantity')::int, 1);
    IF v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'Quantity must be between 1 and 99'; END IF;
    v_notes := NULLIF(left(v_item->>'notes', 300), '');

    SELECT COALESCE(array_agg(val), '{}') INTO v_opts
      FROM jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)) AS t(val);

    SELECT p.price, p.name, COALESCE(NULLIF(p.station, ''), 'kitchen'),
           COALESCE(p.kitchen_status, 'available') = 'available'
             AND COALESCE(p.availability_status, 'available') = 'available'
      INTO v_base, v_pname, v_station, v_avail
      FROM products p WHERE p.id = v_pid AND p.branch_id = p_branch_id AND p.is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % is not on the menu', v_pid; END IF;
    IF NOT v_avail THEN RAISE EXCEPTION '% is not available right now', v_pname; END IF;

    v_addons := 0;
    v_mods   := '[]'::jsonb;
    IF array_length(v_opts, 1) IS NOT NULL THEN
      SELECT COUNT(*), COALESCE(SUM(mo.add_on_price), 0),
             COALESCE(jsonb_agg(jsonb_build_object(
               'groupId', mo.group_id, 'groupName', mg.name,
               'optionId', mo.id, 'optionName', mo.name, 'price', mo.add_on_price)), '[]'::jsonb)
        INTO v_found, v_addons, v_mods
        FROM modifier_options mo
        JOIN modifier_groups mg ON mg.id = mo.group_id
        JOIN product_modifier_groups pmg ON pmg.group_id = mo.group_id AND pmg.product_id = v_pid
        WHERE mo.id = ANY(v_opts);
      IF v_found <> (SELECT COUNT(DISTINCT x) FROM unnest(v_opts) x) THEN
        RAISE EXCEPTION 'An option chosen for % is not offered for it', v_pname;
      END IF;
    END IF;

    v_price  := v_base + v_addons;
    v_sub    := v_price * v_qty;
    v_new_id := 'item-' || substr(public._random_token(), 1, 24);

    INSERT INTO order_items(
      id, order_id, product_id, product_name, quantity, price, subtotal,
      notes, modifiers, status, added_by, added_by_name, station, branch_id, paid)
    VALUES (
      v_new_id, p_order_id, v_pid, v_pname, v_qty, v_price, v_sub,
      v_notes, v_mods, 'pending', p_added_by, p_added_by_name, v_station, p_branch_id, false);

    RETURN QUERY SELECT v_new_id, v_pid, v_pname, v_qty, v_price, v_sub,
                        v_station, 'pending'::text, v_notes, v_mods, p_added_by_name;
  END LOOP;

  -- Tax stays 0 on an open order (applied at payment), as before.
  SELECT COALESCE(SUM(oi.subtotal), 0) INTO v_subtotal
    FROM order_items oi WHERE oi.order_id = p_order_id AND oi.branch_id = p_branch_id
      AND oi.status IS DISTINCT FROM 'cancelled';
  UPDATE orders SET subtotal = v_subtotal, tax = 0, total = v_subtotal WHERE orders.id = p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public._add_order_items(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Staff path: same signature as 0022, now with the checks above.
CREATE OR REPLACE FUNCTION public.submit_order_items(
  p_order_id      TEXT,
  p_branch_id     TEXT,
  p_added_by      TEXT,
  p_added_by_name TEXT,
  p_items         JSONB
) RETURNS TABLE (
  id TEXT, product_id TEXT, product_name TEXT, quantity INT,
  price NUMERIC, subtotal NUMERIC, station TEXT, status TEXT,
  notes TEXT, modifiers JSONB, added_by_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public._add_order_items(p_order_id, p_branch_id, p_added_by, p_added_by_name, p_items);
$$;

-- ── Internal: resolve a guest session to its party ───────────
CREATE OR REPLACE FUNCTION public._guest(p_session_token TEXT)
RETURNS TABLE (session_id TEXT, guest_label TEXT, group_id TEXT, order_id TEXT,
               table_id TEXT, table_number INT, branch_id TEXT,
               ordering_enabled BOOLEAN, needs_waiter BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gs.id, gs.guest_label, og.id, og.order_id, t.id, t.number, t.branch_id,
         COALESCE(t.ordering_enabled, false), COALESCE(t.needs_waiter, false)
  FROM guest_sessions gs
  JOIN order_groups og ON og.id = gs.group_id
  JOIN tables t ON t.id = og.table_id          -- follows the party if the order was moved
  WHERE gs.token = p_session_token AND length(p_session_token) = 64
    AND gs.status = 'active' AND og.status = 'active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._guest(TEXT) FROM PUBLIC, anon, authenticated;

-- ── guest_join ───────────────────────────────────────────────
-- p_qr_token: the printed table token (tables.qr_token) or an active legacy
-- qr_sessions token. p_session_token: a token this phone saved earlier — reused
-- when it still belongs to the same table's open party.
CREATE OR REPLACE FUNCTION public.guest_join(p_qr_token TEXT, p_session_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table  tables%ROWTYPE;
  v_group  TEXT;
  v_count  INT;
  v_token  TEXT;
  v_label  TEXT;
  v_g      RECORD;
BEGIN
  IF p_qr_token IS NULL OR length(p_qr_token) <> 64 THEN RETURN NULL; END IF;

  SELECT * INTO v_table FROM tables t WHERE t.qr_token = p_qr_token;
  IF NOT FOUND THEN
    SELECT t.* INTO v_table FROM qr_sessions q JOIN tables t ON t.id = q.table_id
      WHERE q.token = p_qr_token AND q.active AND (q.expires_at IS NULL OR q.expires_at > NOW());
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  IF NOT public._branch_open(v_table.branch_id) THEN
    RETURN jsonb_build_object('closed', true);
  END IF;

  -- Resume this phone's session if it is still the same table's open party.
  IF p_session_token IS NOT NULL THEN
    SELECT * INTO v_g FROM public._guest(p_session_token);
    IF FOUND AND v_g.table_id = v_table.id THEN
      UPDATE guest_sessions SET last_seen = NOW() WHERE token = p_session_token;
      RETURN jsonb_build_object('session_token', p_session_token, 'guest_label', v_g.guest_label);
    END IF;
  END IF;

  -- One active party per table (partial unique index serialises first scans).
  SELECT og.id INTO v_group FROM order_groups og WHERE og.table_id = v_table.id AND og.status = 'active';
  IF v_group IS NULL THEN
    v_group := gen_random_uuid()::text;
    BEGIN
      INSERT INTO order_groups(id, table_id, branch_id, order_id, status)
        VALUES (v_group, v_table.id, v_table.branch_id, NULL, 'active');
    EXCEPTION WHEN unique_violation THEN
      SELECT og.id INTO v_group FROM order_groups og WHERE og.table_id = v_table.id AND og.status = 'active';
    END;
  END IF;

  SELECT COUNT(*) INTO v_count FROM guest_sessions gs WHERE gs.group_id = v_group;
  IF v_count >= 30 THEN RETURN jsonb_build_object('full', true); END IF;
  IF (SELECT COUNT(*) FROM guest_sessions gs WHERE gs.table_id = v_table.id
        AND gs.created_at > NOW() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'Too many people joined this table just now. Please try again in a minute.';
  END IF;
  v_label := 'Guest ' || (v_count + 1);
  v_token := public._random_token();
  INSERT INTO guest_sessions(id, group_id, table_id, branch_id, token, guest_label, status)
    VALUES (gen_random_uuid()::text, v_group, v_table.id, v_table.branch_id, v_token, v_label, 'active');

  RETURN jsonb_build_object('session_token', v_token, 'guest_label', v_label);
END; $$;

-- ── guest_state (polled every few seconds by the customer page) ──
CREATE OR REPLACE FUNCTION public.guest_state(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_g RECORD;
BEGIN
  SELECT * INTO v_g FROM public._guest(p_session_token);
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'guest_label', v_g.guest_label,
    'table_id', v_g.table_id,
    'table_number', v_g.table_number,
    'branch_id', v_g.branch_id,
    'ordering_enabled', v_g.ordering_enabled AND public._branch_open(v_g.branch_id),
    'needs_waiter', v_g.needs_waiter,
    'order_id', v_g.order_id,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name,
        'quantity', oi.quantity, 'price', oi.price, 'status', oi.status,
        'added_by_name', oi.added_by_name, 'modifiers', oi.modifiers) ORDER BY oi.created_at)
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.order_id = v_g.order_id AND oi.branch_id = v_g.branch_id AND o.status = 'open'
        AND oi.status IS DISTINCT FROM 'cancelled'), '[]'::jsonb),
    -- lets the menu grey out dishes the kitchen just marked finished
    'unavailable_product_ids', COALESCE((
      SELECT jsonb_agg(p.id) FROM products p
      WHERE p.branch_id = v_g.branch_id AND p.is_active
        AND (COALESCE(p.kitchen_status, 'available') <> 'available'
             OR COALESCE(p.availability_status, 'available') <> 'available')), '[]'::jsonb)
  );
END; $$;

-- ── guest_submit ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_submit(p_session_token TEXT, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_g      RECORD;
  v_order  TEXT;
  v_open   BOOLEAN;
BEGIN
  SELECT * INTO v_g FROM public._guest(p_session_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'This table session has ended. Please scan the table QR again.'; END IF;
  IF NOT public._branch_open(v_g.branch_id) THEN RAISE EXCEPTION 'Ordering is not available right now.'; END IF;
  IF NOT v_g.ordering_enabled THEN RAISE EXCEPTION 'Ordering is not switched on for this table yet. Please ask your waiter.'; END IF;
  IF (SELECT COUNT(*) FROM order_items oi WHERE oi.added_by = v_g.session_id
        AND oi.created_at > NOW() - interval '1 minute') >= 40 THEN
    RAISE EXCEPTION 'Please wait a moment before ordering more.';
  END IF;

  -- Serialise the party's first order so two phones can't open two bills.
  PERFORM 1 FROM order_groups WHERE id = v_g.group_id FOR UPDATE;
  SELECT og.order_id INTO v_order FROM order_groups og WHERE og.id = v_g.group_id;
  SELECT o.status = 'open' INTO v_open FROM orders o WHERE o.id = v_order;

  IF v_order IS NULL OR NOT COALESCE(v_open, false) THEN
    -- Join the bill staff already opened at this table, else start one.
    SELECT o.id INTO v_order FROM tables t JOIN orders o ON o.id = t.current_order_id
      WHERE t.id = v_g.table_id AND o.status = 'open';
    IF v_order IS NULL THEN
      v_order := 'order-' || substr(public._random_token(), 1, 24);
      INSERT INTO orders(id, table_id, table_number, status, order_type, branch_id, waiters, subtotal, tax, total)
        VALUES (v_order, v_g.table_id, v_g.table_number, 'open', 'dine-in', v_g.branch_id, '[]'::jsonb, 0, 0, 0);
    END IF;
    UPDATE order_groups SET order_id = v_order WHERE id = v_g.group_id;
  END IF;

  PERFORM public._add_order_items(v_order, v_g.branch_id, v_g.session_id, v_g.guest_label, p_items);
  UPDATE tables SET status = 'occupied', current_order_id = v_order WHERE id = v_g.table_id;
  UPDATE guest_sessions SET last_seen = NOW() WHERE token = p_session_token;

  RETURN public.guest_state(p_session_token);
END; $$;

-- ── guest_call_waiter ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guest_call_waiter(p_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_g RECORD;
BEGIN
  SELECT * INTO v_g FROM public._guest(p_session_token);
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE tables SET needs_waiter = true WHERE id = v_g.table_id AND needs_waiter IS NOT TRUE;
  RETURN true;
END; $$;

-- ── pickup_open ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pickup_open(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t pickup_tokens%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO v_t FROM pickup_tokens WHERE token = p_token AND active;
  IF NOT FOUND OR v_t.status IN ('completed', 'expired') THEN RETURN NULL; END IF;
  IF v_t.expires_at IS NOT NULL AND v_t.expires_at < NOW() THEN
    UPDATE pickup_tokens SET active = false, status = 'expired' WHERE token = p_token;
    RETURN NULL;
  END IF;
  IF NOT public._branch_open(v_t.branch_id) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('branch_id', v_t.branch_id, 'status', v_t.status, 'order_id', v_t.order_id,
    'tax', (SELECT jsonb_build_object('enabled', s.tax_enabled, 'rate', s.tax_rate,
                                      'inclusive', s.tax_inclusive, 'label', s.tax_label)
            FROM branch_settings s WHERE s.branch_id = v_t.branch_id));
END; $$;

-- ── pickup_submit ────────────────────────────────────────────
-- p_details: {customerName, customerPhone, customerEmail, method, payType, receiptUrl}
CREATE OR REPLACE FUNCTION public.pickup_submit(p_token TEXT, p_details JSONB, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t      pickup_tokens%ROWTYPE;
  v_name   TEXT := btrim(p_details->>'customerName');
  v_phone  TEXT := btrim(p_details->>'customerPhone');
  v_email  TEXT := NULLIF(btrim(p_details->>'customerEmail'), '');
  v_method TEXT := p_details->>'method';
  v_pay    TEXT := p_details->>'payType';
  v_rcpt   TEXT := NULLIF(btrim(p_details->>'receiptUrl'), '');
  v_order  TEXT;
  v_bill   TEXT;
  v_total  NUMERIC;
  v_rname  TEXT;
BEGIN
  SELECT * INTO v_t FROM pickup_tokens WHERE token = p_token AND active FOR UPDATE;
  IF NOT FOUND OR (v_t.expires_at IS NOT NULL AND v_t.expires_at < NOW()) THEN
    RAISE EXCEPTION 'This pickup link is no longer valid.';
  END IF;
  IF v_t.status <> 'new' THEN RAISE EXCEPTION 'An order has already been placed with this link.'; END IF;
  IF NOT public._branch_open(v_t.branch_id) THEN RAISE EXCEPTION 'Ordering is not available right now.'; END IF;

  IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Please enter your name.'; END IF;
  IF v_phone IS NULL OR v_phone !~ '^\+?[0-9 ()-]{6,20}$' THEN RAISE EXCEPTION 'Please enter a valid phone number.'; END IF;
  IF v_email IS NOT NULL AND (length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Please enter a valid email address.';
  END IF;
  IF v_method IS NULL OR v_method NOT IN ('grab', 'lalamove', 'self') THEN RAISE EXCEPTION 'Please choose a pickup method.'; END IF;
  IF v_pay IS NULL OR v_pay NOT IN ('cash', 'online') THEN RAISE EXCEPTION 'Please choose a payment option.'; END IF;
  -- Receipts must be a file uploaded to THIS project's receipts bucket, not any URL.
  IF v_rcpt IS NOT NULL THEN
    v_rname := substring(v_rcpt FROM '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/pickup-receipts/([A-Za-z0-9._-]{1,200})$');
    IF v_rname IS NULL OR NOT EXISTS (
         SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'pickup-receipts' AND o.name = v_rname) THEN
      RAISE EXCEPTION 'Invalid receipt file.';
    END IF;
  END IF;
  IF v_pay = 'online' AND v_rcpt IS NULL THEN RAISE EXCEPTION 'Please upload your payment receipt.'; END IF;

  v_order := 'order-' || substr(public._random_token(), 1, 24);
  v_bill  := public._next_bill_number(v_t.branch_id, 'pickup');
  INSERT INTO orders(
    id, table_id, table_number, status, order_type, branch_id, waiters, bill_number,
    subtotal, tax, total, pickup_method, pickup_status, pickup_pay_type,
    customer_name, customer_phone, customer_email, payment_status, payment_receipt_url)
  VALUES (
    v_order, NULL, 0, 'open', 'pickup', v_t.branch_id, '[]'::jsonb, v_bill,
    0, 0, 0, v_method, 'preparing', v_pay,
    v_name, v_phone, v_email,
    CASE WHEN v_pay = 'online' THEN 'pending_verification' ELSE 'unpaid' END, v_rcpt);

  PERFORM public._add_order_items(v_order, v_t.branch_id, 'pickup-customer', v_name, p_items);

  UPDATE pickup_tokens SET order_id = v_order, status = 'ordered' WHERE id = v_t.id;
  INSERT INTO audit_logs(id, action, entity, entity_id, user_id, user_name, branch_id, details)
    VALUES ('aud-' || substr(public._random_token(), 1, 20), 'pickup.order_submitted', 'order', v_order,
            NULL, NULL, v_t.branch_id, jsonb_build_object('method', v_method, 'payType', v_pay, 'customer', v_name));

  SELECT o.total INTO v_total FROM orders o WHERE o.id = v_order;
  RETURN jsonb_build_object('order_id', v_order, 'bill_number', v_bill, 'total', v_total);
END; $$;

-- ── A party closes the moment its bill stops being open ─────
-- Whole-bill payment, split payment, pickup collection, cancellation: whichever
-- path closes the bill, the table's party and all its guest tokens close too.
CREATE OR REPLACE FUNCTION public._close_party_on_bill_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_groups TEXT[];
BEGIN
  IF OLD.status = 'open' AND NEW.status <> 'open' THEN
    SELECT array_agg(og.id) INTO v_groups FROM order_groups og
      WHERE og.status = 'active'
        AND (og.order_id = NEW.id OR (NEW.table_id IS NOT NULL AND og.table_id = NEW.table_id));
    IF v_groups IS NOT NULL THEN
      UPDATE guest_sessions SET status = 'closed' WHERE group_id = ANY(v_groups);
      UPDATE order_groups SET status = 'closed', closed_at = NOW() WHERE id = ANY(v_groups);
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public._close_party_on_bill_close() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_close_party_on_bill_close ON orders;
CREATE TRIGGER trg_close_party_on_bill_close
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION public._close_party_on_bill_close();

-- ── Grants: customer functions are public; internals are not ──
REVOKE ALL ON FUNCTION public._random_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._branch_open(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guest_join(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_state(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_submit(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_call_waiter(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickup_open(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pickup_submit(TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_join(TEXT, TEXT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_state(TEXT)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_submit(TEXT, JSONB)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_call_waiter(TEXT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickup_open(TEXT)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pickup_submit(TEXT, JSONB, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual). Restores 0022's submit_order_items body first.
--   Re-run 0022_server_side_pricing.sql, then:
--   DROP TRIGGER IF EXISTS trg_close_party_on_bill_close ON orders;
--   DROP FUNCTION IF EXISTS public._close_party_on_bill_close();
--   DROP FUNCTION IF EXISTS public.guest_join(TEXT, TEXT), public.guest_state(TEXT),
--     public.guest_submit(TEXT, JSONB), public.guest_call_waiter(TEXT),
--     public.pickup_open(TEXT), public.pickup_submit(TEXT, JSONB, JSONB),
--     public._guest(TEXT), public._add_order_items(TEXT, TEXT, TEXT, TEXT, JSONB),
--     public._branch_open(TEXT), public._random_token();
--   then re-run 0021 for next_bill_number, and DROP FUNCTION public._next_bill_number(TEXT, TEXT);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================
