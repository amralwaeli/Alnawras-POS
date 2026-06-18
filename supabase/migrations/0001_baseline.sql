-- ============================================================
-- 0001 BASELINE — authoritative reconstruction of the LIVE schema
--
-- This file documents the production database AS IT ACTUALLY EXISTS
-- (Supabase project uasnihapkcrgibnpqdyi), confirmed column-by-column
-- against the live PostgREST API. It supersedes the previous scattered
-- sources (database_schema.sql, database_setup.sql, database_migrations/,
-- and the old supabase/migrations/001-004), which had drifted from prod.
--
-- Every CREATE is IF NOT EXISTS, so running this against the existing prod
-- DB is a no-op; it exists to (a) document reality and (b) rebuild a fresh
-- environment to match prod. Subsequent migrations (0002+) move the schema
-- forward to what the application code requires.
--
-- PROVENANCE / CONFIDENCE:
--   * Column PRESENCE: confirmed against live prod (high confidence).
--   * Column TYPES for tables that never had a committed CREATE
--     (employees, attendance_logs, employee_fingerprints, payroll_summary)
--     are reconstructed from application code and marked [type inferred].
--     To verify exact types, run in the SQL Editor:
--       SELECT table_name, column_name, data_type FROM information_schema.columns
--       WHERE table_schema='public' ORDER BY table_name, ordinal_position;
--
-- Row-Level Security is intentionally NOT configured here — it is addressed
-- as a dedicated migration in a later phase. Today prod has RLS effectively
-- open on all tables.
-- ============================================================

-- ─── users ───────────────────────────────────────────────────
-- NOTE: prod has NO last_login / avatar_url / updated_at columns.
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  employment_number TEXT UNIQUE NOT NULL,
  role              TEXT NOT NULL CHECK (role IN
                      ('admin','cashier','waiter','kitchen','hr','juice','staff','accounting')),
  pin               TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  branch_id         TEXT NOT NULL,
  hire_date         DATE,
  hourly_rate       DECIMAL(10,2) DEFAULT 0,
  job_role          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── categories ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  color         TEXT DEFAULT '#3B82F6',
  icon          TEXT,
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  branch_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── products ────────────────────────────────────────────────
-- NOTE: station + availability_status confirmed present in prod
-- (the previous schema files omitted them).
CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category_id         TEXT REFERENCES categories(id),
  category            TEXT NOT NULL,
  price               DECIMAL(10,2) NOT NULL,
  stock               INTEGER DEFAULT 0,
  image               TEXT,
  sku                 TEXT UNIQUE,
  tax_rate            DECIMAL(5,2) DEFAULT 0,
  reorder_point       INTEGER DEFAULT 0,
  branch_id           TEXT NOT NULL,
  station             TEXT DEFAULT 'kitchen',                         -- [type inferred]
  kitchen_status      TEXT DEFAULT 'available'
                        CHECK (kitchen_status IN ('available','out-of-stock','finished')),
  availability_status TEXT DEFAULT 'available'                        -- [type inferred]
                        CHECK (availability_status IN ('available','out-of-stock','finished')),
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tables (
  id                  TEXT PRIMARY KEY,
  number              INTEGER NOT NULL,
  capacity            INTEGER NOT NULL,
  status              TEXT DEFAULT 'available'
                        CHECK (status IN ('available','occupied','reserved')),
  branch_id           TEXT NOT NULL,
  current_order_id    TEXT,
  assigned_cashier_id TEXT,
  needs_waiter        BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, number)
);

-- ─── orders ──────────────────────────────────────────────────
-- NOTE: waiters / cashier_id / cashier_name / bill_number confirmed
-- present in prod (the previous schema files omitted all four).
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  table_id       TEXT REFERENCES tables(id),
  table_number   INTEGER NOT NULL,
  subtotal       DECIMAL(10,2) DEFAULT 0,
  tax            DECIMAL(10,2) DEFAULT 0,
  discount       DECIMAL(10,2) DEFAULT 0,
  total          DECIMAL(10,2) DEFAULT 0,
  status         TEXT DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  payment_method TEXT,
  order_type     TEXT DEFAULT 'dine-in' CHECK (order_type IN ('dine-in','takeaway')),
  waiters        JSONB DEFAULT '[]'::jsonb,   -- string[] of user ids   [type inferred]
  cashier_id     TEXT,                        -- [type inferred]
  cashier_name   TEXT,                        -- [type inferred]
  bill_number    TEXT,                        -- [type inferred]
  branch_id      TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

-- ─── order_items ─────────────────────────────────────────────
-- NOTE: station + branch_id confirmed present in prod. The realtime
-- sync filter on order_items.branch_id therefore works as written.
CREATE TABLE IF NOT EXISTS order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id      TEXT REFERENCES products(id),
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  added_by        TEXT NOT NULL,
  added_by_name   TEXT NOT NULL,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','preparing','ready','served')),
  notes           TEXT,
  sent_to_kitchen BOOLEAN DEFAULT true,
  station         TEXT,                        -- [type inferred]
  branch_id       TEXT,                        -- [type inferred]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── qr_sessions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_sessions (
  id               TEXT PRIMARY KEY,
  table_id         TEXT REFERENCES tables(id) ON DELETE CASCADE,
  active           BOOLEAN DEFAULT true,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  branch_id        TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (table_id)
);

-- ─── expenses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other',
  description     TEXT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'approved',
  receipt         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── customers (loyalty) ─────────────────────────────────────  [types inferred]
-- NOTE: the app inserts without an id, so id carries a DB-side default.
CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  points_balance INTEGER DEFAULT 0,
  total_spent    DECIMAL(10,2) DEFAULT 0,
  total_visits   INTEGER DEFAULT 0,
  branch_id      TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── loyalty_transactions ────────────────────────────────────  [types inferred]
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  order_id    TEXT REFERENCES orders(id),
  type        TEXT NOT NULL CHECK (type IN ('earn','redeem','adjust')),
  points      INTEGER NOT NULL,
  description TEXT,
  branch_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ingredient_orders (kitchen → owner via WhatsApp) ────────  [types inferred]
CREATE TABLE IF NOT EXISTS ingredient_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by      TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  role              TEXT,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes             TEXT,
  status            TEXT DEFAULT 'pending',
  branch_id         TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── employees ───────────────────────────────────────────────
-- Base table as it exists in prod TODAY. The columns the application
-- also needs (employee_number, email, phone, department, hire_date,
-- avatar_url, notes) are MISSING in prod and added in 0002. [types inferred]
CREATE TABLE IF NOT EXISTS employees (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT,
  employee_id           TEXT UNIQUE NOT NULL,
  full_name             TEXT NOT NULL,
  role                  TEXT NOT NULL,
  monthly_salary        DECIMAL(10,2) DEFAULT 0,
  shift_start           TEXT,
  shift_end             TEXT,
  early_checkin_minutes INTEGER DEFAULT 5,
  late_checkout_minutes INTEGER DEFAULT 5,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  branch_id             TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─── attendance_logs ─────────────────────────────────────────  [types inferred]
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  log_date            DATE NOT NULL,
  check_in_time       TIMESTAMPTZ,
  check_out_time      TIMESTAMPTZ,
  scheduled_start     TEXT,
  scheduled_end       TEXT,
  late_minutes        INTEGER DEFAULT 0,
  early_leave_minutes INTEGER DEFAULT 0,
  overtime_minutes    INTEGER DEFAULT 0,
  status              TEXT,
  check_in_method     TEXT,
  check_out_method    TEXT,
  notes               TEXT,
  branch_id           TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── employee_fingerprints ───────────────────────────────────  [types inferred]
-- NOTE: prod has NO created_at column on this table.
CREATE TABLE IF NOT EXISTS employee_fingerprints (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT NOT NULL,
  template_data TEXT NOT NULL,
  template_hash TEXT NOT NULL,
  finger_index  INTEGER NOT NULL,
  quality_score INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  enrolled_by   TEXT,
  enrolled_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── payroll_summary ─────────────────────────────────────────  [types inferred]
CREATE TABLE IF NOT EXISTS payroll_summary (
  id                     TEXT PRIMARY KEY,
  employee_id            TEXT NOT NULL,
  full_name              TEXT NOT NULL,
  month                  INTEGER NOT NULL,
  year                   INTEGER NOT NULL,
  monthly_salary         DECIMAL(10,2) DEFAULT 0,
  working_days           INTEGER DEFAULT 0,
  present_days           INTEGER DEFAULT 0,
  absent_days            INTEGER DEFAULT 0,
  total_late_minutes     INTEGER DEFAULT 0,
  total_overtime_minutes INTEGER DEFAULT 0,
  late_deduction         DECIMAL(10,2) DEFAULT 0,
  overtime_bonus         DECIMAL(10,2) DEFAULT 0,
  net_salary             DECIMAL(10,2) DEFAULT 0,
  status                 TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  approved_by            TEXT,
  approved_at            TIMESTAMPTZ,
  branch_id              TEXT NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

-- ─── indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_user_id  ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_status   ON employees(status);
CREATE INDEX IF NOT EXISTS idx_emp_branch   ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_emp_role     ON employees(role);
CREATE INDEX IF NOT EXISTS idx_att_employee ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_att_date     ON attendance_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_att_branch   ON attendance_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_fp_employee  ON employee_fingerprints(employee_id);
CREATE INDEX IF NOT EXISTS idx_fp_active    ON employee_fingerprints(is_active);
CREATE INDEX IF NOT EXISTS idx_pay_employee ON payroll_summary(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_period   ON payroll_summary(month, year);
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_branch     ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer     ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_branch    ON ingredient_orders(branch_id);
