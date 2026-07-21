-- ============================================================
-- 0022_server_side_pricing.sql   (Batch 2 — audit fix CR-5 / C4)
--
-- Moves ORDER-ITEM PRICING off the client. Until now order_items were inserted
-- with whatever `price` the browser sent, and the order total was the sum of
-- those client numbers — so a customer on the public QR/pickup page could post
-- an item at price 0.01 (or negative) straight through PostgREST. This closes
-- that: submit_order_items() looks every line's price up from `products`, every
-- modifier add-on up from `modifier_options`, rebuilds the modifier snapshot
-- from the DB, inserts the items with those authoritative values, and rewrites
-- the order subtotal/total itself. The client's price is never trusted.
--
-- Tax stays 0 on an OPEN order (it is finalised at the till in the payment
-- flow, unchanged) — this function only governs item prices + subtotal.
--
-- Input p_items: [{ "product_id": "...", "quantity": 2, "notes": "...",
--                    "option_ids": ["mo-1","mo-2"] }, ...]
--
-- Additive & safe. Run AFTER 0017 (needs order_items.paid) and 0009 (modifiers).
-- ============================================================

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
  v_addons  NUMERIC;
  v_mods    JSONB;
  v_price   NUMERIC;
  v_sub     NUMERIC;
  v_new_id  TEXT;
  v_subtotal NUMERIC;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'Cannot add items to a bill that is not open'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'No items to add'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid   := v_item->>'product_id';
    v_qty   := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_notes := NULLIF(v_item->>'notes', '');

    SELECT COALESCE(array_agg(val), '{}') INTO v_opts
      FROM jsonb_array_elements_text(COALESCE(v_item->'option_ids', '[]'::jsonb)) AS t(val);

    -- Authoritative product price / name / station (active products only).
    SELECT price, name, COALESCE(NULLIF(station, ''), 'kitchen')
      INTO v_base, v_pname, v_station
      FROM products WHERE id = v_pid AND branch_id = p_branch_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % is not available', v_pid; END IF;

    -- Authoritative modifier add-ons + snapshot. Unknown option ids simply
    -- contribute nothing (never trusted from the client).
    v_addons := 0;
    v_mods   := '[]'::jsonb;
    IF array_length(v_opts, 1) IS NOT NULL THEN
      SELECT COALESCE(SUM(mo.add_on_price), 0),
             COALESCE(jsonb_agg(jsonb_build_object(
               'groupId', mo.group_id, 'groupName', mg.name,
               'optionId', mo.id, 'optionName', mo.name, 'price', mo.add_on_price)), '[]'::jsonb)
        INTO v_addons, v_mods
        FROM modifier_options mo
        JOIN modifier_groups mg ON mg.id = mo.group_id
        WHERE mo.id = ANY(v_opts);
    END IF;

    v_price  := v_base + v_addons;
    v_sub    := v_price * v_qty;
    v_new_id := 'item-' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

    INSERT INTO order_items(
      id, order_id, product_id, product_name, quantity, price, subtotal,
      notes, modifiers, status, added_by, added_by_name, station, branch_id, paid)
    VALUES (
      v_new_id, p_order_id, v_pid, v_pname, v_qty, v_price, v_sub,
      v_notes, v_mods, 'pending', p_added_by, p_added_by_name, v_station, p_branch_id, false);

    RETURN QUERY SELECT v_new_id, v_pid, v_pname, v_qty, v_price, v_sub,
                        v_station, 'pending'::text, v_notes, v_mods, p_added_by_name;
  END LOOP;

  -- Rewrite the order subtotal/total from the server-priced items. Tax stays 0
  -- on the open order (applied at payment), matching existing behaviour.
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
    FROM order_items WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled';
  UPDATE orders SET subtotal = v_subtotal, tax = 0, total = v_subtotal WHERE id = p_order_id;
END; $$;

REVOKE ALL ON FUNCTION public.submit_order_items(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_order_items(TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
