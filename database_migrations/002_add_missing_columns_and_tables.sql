-- ============================================================
-- Migration 002 — Add missing columns and tables
-- Safe to run on existing databases (uses IF NOT EXISTS / DO NOTHING)
-- ============================================================

-- products: add availability_status column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'available'
    CHECK (availability_status IN ('available','out-of-stock','finished'));

-- products: add station column (was missing from original schema)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS station TEXT DEFAULT 'kitchen'
    CHECK (station IN ('kitchen','juice','none'));

-- orders: add bill_number column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_number TEXT;

-- orders: add waiters array column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiters TEXT[] DEFAULT '{}';

-- orders: add cashier tracking columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_id   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashier_name TEXT;

-- orders: add CHECK constraint on discount (won't fail if it already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_discount_check CHECK (discount >= 0);
  END IF;
END $$;

-- order_items: add branch_id column (required for realtime filters)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS branch_id TEXT;

-- Back-fill branch_id on order_items from parent orders
UPDATE order_items oi
SET branch_id = o.branch_id
FROM orders o
WHERE oi.order_id = o.id AND oi.branch_id IS NULL;

-- After back-filling, add NOT NULL constraint (comment out if you need to run this in stages)
-- ALTER TABLE order_items ALTER COLUMN branch_id SET NOT NULL;

-- ── Employees table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id),
  employee_id           TEXT UNIQUE NOT NULL,
  full_name             TEXT NOT NULL,
  role                  TEXT NOT NULL,
  monthly_salary        DECIMAL(10,2) NOT NULL DEFAULT 0,
  shift_start           TEXT NOT NULL DEFAULT '09:00',
  shift_end             TEXT NOT NULL DEFAULT '17:00',
  early_checkin_minutes INTEGER DEFAULT 15,
  late_checkout_minutes INTEGER DEFAULT 15,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  branch_id             TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Employee Fingerprints table ──────────────────────────────
CREATE TABLE IF NOT EXISTS employee_fingerprints (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  template_data TEXT NOT NULL,
  template_hash TEXT NOT NULL,
  finger_index  INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  enrolled_by   TEXT NOT NULL,
  enrolled_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Attendance Logs table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  log_date            DATE NOT NULL,
  check_in_time       TIMESTAMPTZ,
  check_out_time      TIMESTAMPTZ,
  scheduled_start     TEXT NOT NULL,
  scheduled_end       TEXT NOT NULL,
  late_minutes        INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  overtime_minutes    INTEGER DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','late','on-time','early-leave')),
  check_in_method     TEXT DEFAULT 'pin'
    CHECK (check_in_method IN ('fingerprint','manual','pin')),
  check_out_method    TEXT
    CHECK (check_out_method IN ('fingerprint','manual','pin')),
  notes               TEXT,
  branch_id           TEXT NOT NULL,
  UNIQUE (employee_id, log_date)
);

-- ── Payroll Summary table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_summary (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INTEGER NOT NULL,
  monthly_salary        DECIMAL(10,2) NOT NULL,
  working_days          INTEGER NOT NULL DEFAULT 0,
  present_days          INTEGER NOT NULL DEFAULT 0,
  absent_days           INTEGER NOT NULL DEFAULT 0,
  total_late_minutes    INTEGER NOT NULL DEFAULT 0,
  total_overtime_minutes INTEGER NOT NULL DEFAULT 0,
  late_deduction        DECIMAL(10,2) DEFAULT 0,
  overtime_bonus        DECIMAL(10,2) DEFAULT 0,
  net_salary            DECIMAL(10,2) DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','paid')),
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  branch_id             TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

-- ── Loyalty Customers table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  points_balance INTEGER DEFAULT 0 CHECK (points_balance >= 0),
  total_spent    DECIMAL(10,2) DEFAULT 0,
  total_visits   INTEGER DEFAULT 0,
  branch_id      TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (phone, branch_id)
);

-- ── Loyalty Transactions table ───────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  order_id      TEXT,
  type          TEXT NOT NULL CHECK (type IN ('earn','redeem','adjust')),
  points        INTEGER NOT NULL,
  description   TEXT NOT NULL,
  branch_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Printers table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS printers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('network','usb')),
  ip_address TEXT,
  port       INTEGER,
  usb_path   TEXT,
  stations   TEXT[] DEFAULT '{}',
  is_active  BOOLEAN DEFAULT true,
  branch_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_branch_status    ON orders (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created   ON orders (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id    ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_branch_id   ON order_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_products_branch_active  ON products (branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tables_branch_status    ON tables (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date     ON attendance_logs (employee_id, log_date);
CREATE INDEX IF NOT EXISTS idx_customers_phone_branch  ON customers (phone, branch_id);
CREATE INDEX IF NOT EXISTS idx_fp_employee_active      ON employee_fingerprints (employee_id, is_active);
