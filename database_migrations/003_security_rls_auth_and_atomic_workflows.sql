-- ============================================================
-- Migration 003 - Security hardening, hashed PIN auth, RLS, and atomic workflows
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_must_change BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN pin DROP NOT NULL;

UPDATE users
SET pin_hash = CASE WHEN pin_hash IS NULL AND pin IS NOT NULL THEN crypt(pin, gen_salt('bf', 12)) ELSE pin_hash END,
    pin_must_change = true
WHERE pin_hash IS NULL AND pin IS NOT NULL;

UPDATE users SET pin = NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS branch_id TEXT;
UPDATE order_items oi
SET branch_id = o.branch_id
FROM orders o
WHERE oi.order_id = o.id AND oi.branch_id IS NULL;
ALTER TABLE order_items ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE orders ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE tables ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE qr_sessions ALTER COLUMN branch_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_table_fk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_table_fk FOREIGN KEY (table_id) REFERENCES tables(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_branch_order_fk') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_branch_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_claim(name TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> name, '')
$$;

CREATE OR REPLACE FUNCTION app_user_id()
RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT app_claim('user_id') $$;

CREATE OR REPLACE FUNCTION app_branch_id()
RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT app_claim('branch_id') $$;

CREATE OR REPLACE FUNCTION app_staff_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT app_claim('staff_role') $$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT app_staff_role() = 'admin' $$;

CREATE OR REPLACE FUNCTION staff_can_manage()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT app_staff_role() IN ('admin','hr') $$;

CREATE OR REPLACE FUNCTION verify_staff_pin(p_pin TEXT)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  employment_number TEXT,
  role TEXT,
  email TEXT,
  status TEXT,
  branch_id TEXT,
  created_at TIMESTAMPTZ,
  pin_must_change BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_pin !~ '^[0-9]{6,12}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE users u
  SET last_login = now()
  WHERE u.status = 'active'
    AND u.pin_hash IS NOT NULL
    AND u.pin_hash = crypt(p_pin, u.pin_hash)
  RETURNING u.id, u.name, u.employment_number, u.role, u.email, u.status, u.branch_id, u.created_at, u.pin_must_change;
END;
$$;

CREATE OR REPLACE FUNCTION change_staff_pin(p_user_id TEXT, p_current_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok BOOLEAN;
BEGIN
  IF p_new_pin !~ '^[0-9]{6,12}$'
     OR p_new_pin ~ '^([0-9])\1+$'
     OR p_new_pin ~ '(012345|123456|234567|345678|456789|987654|876543|765432|654321)' THEN
    RAISE EXCEPTION 'New PIN does not meet complexity requirements';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id AND status = 'active' AND pin_hash = crypt(p_current_pin, pin_hash)
  ) INTO ok;
  IF NOT ok THEN RETURN false; END IF;

  UPDATE users
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12)),
      pin = NULL,
      pin_must_change = false,
      pin_changed_at = now()
  WHERE id = p_user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_order_item_branch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE parent_branch TEXT;
BEGIN
  SELECT branch_id INTO parent_branch FROM orders WHERE id = NEW.order_id;
  IF parent_branch IS NULL THEN
    RAISE EXCEPTION 'Order % does not exist', NEW.order_id;
  END IF;
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := parent_branch;
  END IF;
  IF NEW.branch_id <> parent_branch THEN
    RAISE EXCEPTION 'order_items.branch_id must match parent order branch_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_branch ON order_items;
CREATE TRIGGER trg_order_items_branch
BEFORE INSERT OR UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION ensure_order_item_branch();

CREATE OR REPLACE FUNCTION submit_order_items(
  p_order_id TEXT,
  p_table_id TEXT,
  p_order_type TEXT,
  p_items JSONB,
  p_added_by TEXT DEFAULT NULL,
  p_added_by_name TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch TEXT := coalesce(app_branch_id(), (SELECT branch_id FROM tables WHERE id = p_table_id));
  v_order_id TEXT := p_order_id;
  v_table_number INTEGER := 0;
  v_item JSONB;
  v_subtotal NUMERIC(10,2);
BEGIN
  IF v_branch IS NULL THEN RAISE EXCEPTION 'Branch is required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  IF v_order_id IS NULL THEN v_order_id := gen_random_uuid()::text; END IF;

  IF p_order_type = 'dine-in' THEN
    SELECT number INTO v_table_number FROM tables WHERE id = p_table_id AND branch_id = v_branch FOR UPDATE;
    IF v_table_number IS NULL THEN RAISE EXCEPTION 'Table not found'; END IF;

    UPDATE tables
    SET status = 'occupied', current_order_id = v_order_id
    WHERE id = p_table_id AND branch_id = v_branch AND (current_order_id IS NULL OR current_order_id = v_order_id);
    IF NOT FOUND THEN
      SELECT current_order_id INTO v_order_id FROM tables WHERE id = p_table_id AND branch_id = v_branch;
    END IF;
  END IF;

  INSERT INTO orders (id, table_id, table_number, status, payment_status, order_type, branch_id, subtotal, total, waiters)
  VALUES (v_order_id, CASE WHEN p_order_type = 'dine-in' THEN p_table_id ELSE NULL END, v_table_number, 'open', 'unpaid', p_order_type, v_branch, 0, 0, ARRAY[]::TEXT[])
  ON CONFLICT (id) DO NOTHING;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (id, order_id, product_id, product_name, quantity, price, subtotal, added_by, added_by_name, status, notes, sent_to_kitchen, branch_id)
    VALUES (
      coalesce(v_item->>'id', gen_random_uuid()::text),
      v_order_id,
      v_item->>'product_id',
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'price')::numeric,
      ((v_item->>'quantity')::numeric * (v_item->>'price')::numeric),
      coalesce(p_added_by, 'guest'),
      coalesce(p_added_by_name, 'Guest'),
      'pending',
      nullif(v_item->>'notes', ''),
      true,
      v_branch
    );
  END LOOP;

  SELECT coalesce(sum(subtotal), 0) INTO v_subtotal FROM order_items WHERE order_id = v_order_id;
  UPDATE orders SET subtotal = v_subtotal, total = greatest(v_subtotal + coalesce(tax,0) - coalesce(discount,0),0) WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id TEXT,
  p_payment_method TEXT,
  p_discount NUMERIC DEFAULT NULL
)
RETURNS TABLE(order_id TEXT, bill_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_bill TEXT;
  v_item RECORD;
BEGIN
  IF app_staff_role() NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND branch_id = app_branch_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status = 'completed' THEN RAISE EXCEPTION 'Order is already completed'; END IF;

  FOR v_item IN SELECT product_id, sum(quantity)::integer qty FROM order_items WHERE order_id = p_order_id GROUP BY product_id
  LOOP
    UPDATE products
    SET stock = stock - v_item.qty,
        availability_status = CASE WHEN stock - v_item.qty <= 0 THEN 'out-of-stock' ELSE availability_status END,
        kitchen_status = CASE WHEN stock - v_item.qty <= 0 THEN 'out-of-stock' ELSE kitchen_status END
    WHERE id = v_item.product_id AND branch_id = v_order.branch_id AND stock >= v_item.qty;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for product %', v_item.product_id; END IF;
  END LOOP;

  SELECT lpad((coalesce(max(nullif(bill_number, '')::integer), 0) + 1)::text, 4, '0')
  INTO v_bill
  FROM orders WHERE branch_id = v_order.branch_id AND order_type = v_order.order_type AND bill_number ~ '^[0-9]+$';

  UPDATE orders
  SET status = 'completed',
      completed_at = now(),
      payment_method = p_payment_method,
      bill_number = v_bill,
      payment_status = 'paid',
      discount = coalesce(p_discount, discount),
      total = greatest(subtotal + coalesce(tax,0) - coalesce(p_discount, discount, 0), 0)
  WHERE id = p_order_id;

  IF v_order.table_id IS NOT NULL THEN
    UPDATE tables SET status = 'available', current_order_id = NULL WHERE id = v_order.table_id AND branch_id = v_order.branch_id;
  END IF;

  RETURN QUERY SELECT p_order_id, v_bill;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_users_branch_status ON users (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_users_employment_branch ON users (employment_number, branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders (table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (branch_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_branch_active ON qr_sessions (branch_id, active);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_branch_period ON payroll_summary (branch_id, year, month);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read branch users sanitized" ON users FOR SELECT TO authenticated USING (branch_id = app_branch_id() AND app_staff_role() IN ('admin','hr'));
CREATE POLICY "admin manage branch users" ON users FOR ALL TO authenticated USING (branch_id = app_branch_id() AND is_admin()) WITH CHECK (branch_id = app_branch_id() AND is_admin());

CREATE POLICY "public read active menu categories" ON categories FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "staff manage branch categories" ON categories FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());

CREATE POLICY "public read active products" ON products FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "staff read branch products" ON products FOR SELECT TO authenticated USING (branch_id = app_branch_id());
CREATE POLICY "inventory manage products" ON products FOR ALL TO authenticated USING (branch_id = app_branch_id() AND app_staff_role() IN ('admin','kitchen','juice')) WITH CHECK (branch_id = app_branch_id() AND app_staff_role() IN ('admin','kitchen','juice'));

CREATE POLICY "public read table routing data" ON tables FOR SELECT TO anon USING (true);
CREATE POLICY "public call waiter" ON tables FOR UPDATE TO anon USING (true) WITH CHECK (needs_waiter = true);
CREATE POLICY "staff branch tables" ON tables FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());

CREATE POLICY "public read open qr orders" ON orders FOR SELECT TO anon USING (status = 'open');
CREATE POLICY "staff branch orders" ON orders FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());

CREATE POLICY "public read qr order items" ON order_items FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.status = 'open'));
CREATE POLICY "staff branch order items" ON order_items FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());

CREATE POLICY "public qr sessions" ON qr_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "staff branch qr sessions" ON qr_sessions FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());

CREATE POLICY "admin accounting expenses" ON expenses FOR ALL TO authenticated USING (branch_id = app_branch_id() AND app_staff_role() IN ('admin','accounting')) WITH CHECK (branch_id = app_branch_id() AND app_staff_role() IN ('admin','accounting'));
CREATE POLICY "hr employee data" ON employees FOR ALL TO authenticated USING (branch_id = app_branch_id() AND staff_can_manage()) WITH CHECK (branch_id = app_branch_id() AND staff_can_manage());
CREATE POLICY "hr fingerprint data" ON employee_fingerprints FOR ALL TO authenticated USING (staff_can_manage()) WITH CHECK (staff_can_manage());
CREATE POLICY "hr attendance data" ON attendance_logs FOR ALL TO authenticated USING (branch_id = app_branch_id() AND app_staff_role() IN ('admin','hr')) WITH CHECK (branch_id = app_branch_id() AND app_staff_role() IN ('admin','hr'));
CREATE POLICY "hr payroll data" ON payroll_summary FOR ALL TO authenticated USING (branch_id = app_branch_id() AND app_staff_role() IN ('admin','hr')) WITH CHECK (branch_id = app_branch_id() AND app_staff_role() IN ('admin','hr'));

CREATE POLICY "staff loyalty customers" ON customers FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());
CREATE POLICY "staff loyalty transactions" ON loyalty_transactions FOR ALL TO authenticated USING (branch_id = app_branch_id()) WITH CHECK (branch_id = app_branch_id());
CREATE POLICY "admin printers" ON printers FOR ALL TO authenticated USING (branch_id = app_branch_id() AND is_admin()) WITH CHECK (branch_id = app_branch_id() AND is_admin());

REVOKE ALL ON FUNCTION verify_staff_pin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION change_staff_pin(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_staff_pin(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION change_staff_pin(TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION submit_order_items(TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_order_payment(TEXT,TEXT,NUMERIC) TO authenticated;
