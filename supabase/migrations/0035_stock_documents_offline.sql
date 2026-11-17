-- ============================================================
-- 0035_stock_documents_offline.sql   (Batch 6 — owner decisions of 2026-11-17)
--
-- 1. Stock goes down when an item is sent, for products marked "track stock"
--    (products.track_stock, default off so untracked menus are unaffected).
--    Not enough stock = the line is refused ("Only 2 Mandi left"). A line that took
--    stock gives it back when it is voided, deleted or its bill is cancelled, however
--    that happens (triggers). guest_state reports tracked items at 0 as sold out.
-- 2. Invoices and quotations are saved with sequential numbers per branch
--    (INV-0001…, QUO-0001…) and can be listed and reprinted (documents table).
-- 3. Offline ordering: a line may carry the device's own id (client_id), so a
--    replay after the connection returns never adds the same line twice.
--
-- Additive (new column, new table, functions replaced with supersets).
-- Apply BEFORE deploying the matching client.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT false;
-- Did this line take stock? (Only those give it back — tracking may be switched on later.)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stock_taken BOOLEAN NOT NULL DEFAULT false;

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
  v_track   BOOLEAN;
  v_stock   INT;
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

    -- A line the device already sent (offline replay) is not added twice.
    v_new_id := NULLIF(v_item->>'client_id', '');
    IF v_new_id IS NOT NULL THEN
      IF v_new_id !~ '^item-[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Invalid line id'; END IF;
      IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = v_new_id) THEN
        IF EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = v_new_id AND oi.order_id = p_order_id) THEN CONTINUE; END IF;
        RAISE EXCEPTION 'This line is already on another bill';
      END IF;
    END IF;

    SELECT p.price, p.name, COALESCE(NULLIF(p.station, ''), 'kitchen'),
           COALESCE(p.kitchen_status, 'available') = 'available'
             AND COALESCE(p.availability_status, 'available') = 'available',
           COALESCE(p.track_stock, false), COALESCE(p.stock, 0)
      INTO v_base, v_pname, v_station, v_avail, v_track, v_stock
      FROM products p WHERE p.id = v_pid AND p.branch_id = p_branch_id AND p.is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % is not on the menu', v_pid; END IF;
    IF NOT v_avail THEN RAISE EXCEPTION '% is not available right now', v_pname; END IF;
    IF v_track THEN
      -- One guarded update (no row lock held for the whole order: two tills can't deadlock).
      UPDATE products p SET stock = p.stock - v_qty
       WHERE p.id = v_pid AND p.branch_id = p_branch_id AND p.stock >= v_qty;
      IF NOT FOUND THEN
        SELECT p.stock INTO v_stock FROM products p WHERE p.id = v_pid;
        RAISE EXCEPTION 'Only % % left', GREATEST(COALESCE(v_stock, 0), 0), v_pname;
      END IF;
    END IF;

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
    v_new_id := COALESCE(v_new_id, 'item-' || substr(public._random_token(), 1, 24));

    INSERT INTO order_items(
      id, order_id, product_id, product_name, quantity, price, subtotal,
      notes, modifiers, status, added_by, added_by_name, station, branch_id, paid, stock_taken)
    VALUES (
      v_new_id, p_order_id, v_pid, v_pname, v_qty, v_price, v_sub,
      v_notes, v_mods, 'pending', p_added_by, p_added_by_name, v_station, p_branch_id, false, v_track);

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

-- Stock comes back however a line goes away: voided (void_order_item or a direct
-- status change), deleted, its quantity lowered, or its whole bill cancelled/deleted.
CREATE OR REPLACE FUNCTION public._line_returns_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.stock_taken THEN
      UPDATE products SET stock = stock + OLD.quantity WHERE id = OLD.product_id AND branch_id = OLD.branch_id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.stock_taken THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE products SET stock = stock + OLD.quantity WHERE id = OLD.product_id AND branch_id = OLD.branch_id;
      NEW.stock_taken := false;
    ELSIF NEW.quantity <> OLD.quantity THEN
      UPDATE products SET stock = stock + OLD.quantity - NEW.quantity WHERE id = OLD.product_id AND branch_id = OLD.branch_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._line_returns_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_return_stock ON order_items;
CREATE TRIGGER order_items_return_stock BEFORE UPDATE OF status, quantity OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION public._line_returns_stock();

CREATE OR REPLACE FUNCTION public._bill_cancel_returns_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH back AS (
    UPDATE order_items SET stock_taken = false
     WHERE order_id = NEW.id AND stock_taken AND status IS DISTINCT FROM 'cancelled'
    RETURNING product_id, quantity)
  UPDATE products p SET stock = p.stock + b.qty
    FROM (SELECT product_id, SUM(quantity) AS qty FROM back GROUP BY product_id) b
   WHERE p.id = b.product_id AND p.branch_id = NEW.branch_id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._bill_cancel_returns_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_cancel_returns_stock ON orders;
CREATE TRIGGER orders_cancel_returns_stock AFTER UPDATE OF status ON orders
  FOR EACH ROW WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public._bill_cancel_returns_stock();

-- The document counters share bill_counters; the public bill-number call must not move them.
CREATE OR REPLACE FUNCTION public.next_bill_number(p_branch_id TEXT, p_order_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_order_type LIKE 'doc-%' THEN RAISE EXCEPTION 'Unknown order type'; END IF;
  RETURN public._next_bill_number(p_branch_id, p_order_type);
END; $$;
REVOKE ALL ON FUNCTION public.next_bill_number(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_bill_number(TEXT, TEXT) TO authenticated;

-- Tracked dishes at 0 show as sold out on customer phones.
CREATE OR REPLACE FUNCTION public._sold_out_ids(p_branch_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(p.id), '[]'::jsonb) FROM products p
  WHERE p.branch_id = p_branch_id AND p.is_active
    AND (COALESCE(p.kitchen_status, 'available') <> 'available'
         OR COALESCE(p.availability_status, 'available') <> 'available'
         OR (p.track_stock AND p.stock <= 0));
$$;
REVOKE ALL ON FUNCTION public._sold_out_ids(TEXT) FROM PUBLIC, anon, authenticated;

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
    'unavailable_product_ids', public._sold_out_ids(v_g.branch_id)
  );
END; $$;

-- ── Saved invoices and quotations ────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY DEFAULT ('doc-' || gen_random_uuid()),
  branch_id      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('invoice', 'quotation')),
  number         TEXT NOT NULL,
  customer_name  TEXT,
  customer_phone TEXT,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  data           JSONB NOT NULL,          -- the full printed document (items, notes, discount…)
  created_by     TEXT,
  created_by_name TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, kind, number)
);
CREATE INDEX IF NOT EXISTS idx_documents_branch_kind_time ON documents (branch_id, kind, created_at DESC);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_read ON documents;
CREATE POLICY branch_read ON documents FOR SELECT TO authenticated
  USING (branch_id = (SELECT public.current_device_branch()));
REVOKE ALL ON documents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON documents FROM authenticated;   -- saved only through save_document()

CREATE OR REPLACE FUNCTION public.save_document(
  p_branch_id TEXT, p_kind TEXT, p_data JSONB, p_created_by TEXT, p_created_by_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num INT; v_number TEXT; v_id TEXT;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_kind NOT IN ('invoice', 'quotation') THEN RAISE EXCEPTION 'Unknown document type'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  IF length(p_data::text) > 200000 THEN RAISE EXCEPTION 'This document is too large to save'; END IF;

  INSERT INTO bill_counters (branch_id, order_type, last_number) VALUES (p_branch_id, 'doc-' || p_kind, 1)
  ON CONFLICT (branch_id, order_type) DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_num;
  v_number := CASE p_kind WHEN 'invoice' THEN 'INV-' ELSE 'QUO-' END || lpad(v_num::text, 4, '0');

  INSERT INTO documents (branch_id, kind, number, customer_name, customer_phone, total, data, created_by, created_by_name)
  VALUES (p_branch_id, p_kind, v_number,
          left(COALESCE(p_data->'invoiceTo', p_data->'quotationTo')->>'name', 200),
          left(COALESCE(p_data->'invoiceTo', p_data->'quotationTo')->>'phone', 40),
          COALESCE((p_data->>'total')::numeric, 0), p_data, p_created_by, p_created_by_name)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END; $$;
REVOKE ALL ON FUNCTION public.save_document(TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document(TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (manual): re-run 0029 (_add_order_items) and 0031 (next_bill_number), then
--   DROP TRIGGER IF EXISTS order_items_return_stock ON order_items;
--   DROP TRIGGER IF EXISTS orders_cancel_returns_stock ON orders;
--   DROP FUNCTION IF EXISTS public._line_returns_stock(), public._bill_cancel_returns_stock();
--   ALTER TABLE order_items DROP COLUMN IF EXISTS stock_taken;
--   DROP FUNCTION IF EXISTS public.save_document(TEXT, TEXT, JSONB, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public._sold_out_ids(TEXT);
--   DROP TABLE IF EXISTS documents;      -- ⚠ deletes saved invoices/quotations
--   ALTER TABLE products DROP COLUMN IF EXISTS track_stock;
-- ============================================================
