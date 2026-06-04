-- ============================================================
-- Alnawras POS — Complete Database Schema
-- Run this on a fresh Supabase project to initialise all tables.
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  employment_number TEXT UNIQUE NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('admin','cashier','waiter','kitchen','hr','juice','staff','accounting')),
  pin               TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  branch_id         TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Categories ───────────────────────────────────────────────
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

-- ── Products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category_id         TEXT REFERENCES categories(id),
  category            TEXT NOT NULL,
  price               DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  stock               INTEGER DEFAULT 0 CHECK (stock >= 0),
  image               TEXT,
  sku                 TEXT UNIQUE,
  tax_rate            DECIMAL(5,2) DEFAULT 0,
  reorder_point       INTEGER DEFAULT 0,
  branch_id           TEXT NOT NULL,
  station             TEXT DEFAULT 'kitchen' CHECK (station IN ('kitchen','juice','none')),
  kitchen_status      TEXT DEFAULT 'available' CHECK (kitchen_status IN ('available','out-of-stock','finished')),
  availability_status TEXT DEFAULT 'available' CHECK (availability_status IN ('available','out-of-stock','finished')),
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tables (
  id                  TEXT PRIMARY KEY,
  number              INTEGER NOT NULL,
  capacity            INTEGER NOT NULL,
  status              TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved')),
  branch_id           TEXT NOT NULL,
  current_order_id    TEXT,
  assigned_cashier_id TEXT,
  needs_waiter        BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, number)
);

-- ── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  table_id       TEXT REFERENCES tables(id),
  table_number   INTEGER NOT NULL,
  subtotal       DECIMAL(10,2) DEFAULT 0,
  tax            DECIMAL(10,2) DEFAULT 0,
  discount       DECIMAL(10,2) DEFAULT 0 CHECK (discount >= 0),
  total          DECIMAL(10,2) DEFAULT 0,
  status         TEXT DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  payment_method TEXT,
  order_type     TEXT DEFAULT 'dine-in' CHECK (order_type IN ('dine-in','takeaway')),
  bill_number    TEXT,
  waiters        TEXT[] DEFAULT '{}',
  cashier_id     TEXT,
  cashier_name   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  branch_id      TEXT NOT NULL
);

-- ── Order Items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id      TEXT REFERENCES products(id),
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  price           DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  subtotal        DECIMAL(10,2) NOT NULL,
  added_by        TEXT NOT NULL,
  added_by_name   TEXT NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','preparing','ready','served')),
  notes           TEXT,
  sent_to_kitchen BOOLEAN DEFAULT true,
  branch_id       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── QR Sessions ──────────────────────────────────────────────
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

-- ── Expenses ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other',
  description     TEXT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  receipt         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Employees (HR) ───────────────────────────────────────────
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

-- ── Employee Fingerprints ────────────────────────────────────
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

-- ── Attendance Logs ──────────────────────────────────────────
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
  status              TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','on-time','early-leave')),
  check_in_method     TEXT DEFAULT 'pin' CHECK (check_in_method IN ('fingerprint','manual','pin')),
  check_out_method    TEXT CHECK (check_out_method IN ('fingerprint','manual','pin')),
  notes               TEXT,
  branch_id           TEXT NOT NULL,
  UNIQUE (employee_id, log_date)
);

-- ── Payroll Summary ──────────────────────────────────────────
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
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  branch_id             TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

-- ── Loyalty Customers ────────────────────────────────────────
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

-- ── Loyalty Transactions ─────────────────────────────────────
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

-- ── Printers ─────────────────────────────────────────────────
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

-- ============================================================
-- INDEXES — critical for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_branch_status    ON orders (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created   ON orders (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id    ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_branch_id   ON order_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_products_branch_active  ON products (branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tables_branch_status    ON tables (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date     ON attendance_logs (employee_id, log_date);
CREATE INDEX IF NOT EXISTS idx_customers_phone_branch  ON customers (phone, branch_id);
CREATE INDEX IF NOT EXISTS idx_fp_employee_active      ON employee_fingerprints (employee_id, is_active);

-- ============================================================
-- SEED DATA — initial categories, products, tables and admin user
-- Change PINs before going to production!
-- ============================================================

INSERT INTO categories (id, name, description, color, icon, display_order, branch_id)
VALUES
  ('cat-appetizers',   'Appetizers',   'Starters and small plates', '#10B981', '🥗', 1, 'branch-1'),
  ('cat-main-courses', 'Main Courses', 'Primary dishes',            '#F59E0B', '🍽️', 2, 'branch-1'),
  ('cat-desserts',     'Desserts',     'Sweet treats and desserts', '#EC4899', '🍰', 3, 'branch-1'),
  ('cat-beverages',    'Beverages',    'Drinks and refreshments',   '#3B82F6', '🥤', 4, 'branch-1'),
  ('cat-sides',        'Sides',        'Side dishes',               '#8B5CF6', '🍟', 5, 'branch-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, category_id, category, price, stock, sku, tax_rate, reorder_point, branch_id, station, kitchen_status, availability_status)
VALUES
  ('prod-caesar-salad',       'Caesar Salad',     'cat-appetizers',   'Appetizers',   12.99,  50, 'SALAD-001', 0, 10, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-mozzarella-sticks',  'Mozzarella Sticks','cat-appetizers',   'Appetizers',    8.99,  30, 'APP-001',   0,  5, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-grilled-salmon',     'Grilled Salmon',   'cat-main-courses', 'Main Courses', 24.99,  20, 'MAIN-001',  0,  3, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-ribeye-steak',       'Ribeye Steak',     'cat-main-courses', 'Main Courses', 32.99,  15, 'MAIN-002',  0,  2, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-chocolate-cake',     'Chocolate Cake',   'cat-desserts',     'Desserts',      6.99,  25, 'DESSERT-001',0, 5, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-tiramisu',           'Tiramisu',         'cat-desserts',     'Desserts',      7.99,  20, 'DESSERT-002',0, 4, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-coca-cola',          'Coca Cola',        'cat-beverages',    'Beverages',     2.99, 100, 'BEV-001',   0, 20, 'branch-1', 'juice',   'available', 'available'),
  ('prod-coffee',             'Coffee',           'cat-beverages',    'Beverages',     3.49,  50, 'BEV-002',   0, 10, 'branch-1', 'juice',   'available', 'available'),
  ('prod-french-fries',       'French Fries',     'cat-sides',        'Sides',         4.99,  40, 'SIDE-001',  0,  8, 'branch-1', 'kitchen', 'available', 'available'),
  ('prod-garlic-bread',       'Garlic Bread',     'cat-sides',        'Sides',         5.99,  35, 'SIDE-002',  0,  7, 'branch-1', 'kitchen', 'available', 'available')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tables (id, number, capacity, status, branch_id)
VALUES
  ('table-1', 1, 4, 'available', 'branch-1'),
  ('table-2', 2, 4, 'available', 'branch-1'),
  ('table-3', 3, 6, 'available', 'branch-1'),
  ('table-4', 4, 6, 'available', 'branch-1'),
  ('table-5', 5, 2, 'available', 'branch-1'),
  ('table-6', 6, 2, 'available', 'branch-1'),
  ('table-7', 7, 8, 'available', 'branch-1'),
  ('table-8', 8, 8, 'available', 'branch-1')
ON CONFLICT (id) DO NOTHING;

-- IMPORTANT: Change all PINs before going to production!
INSERT INTO users (id, name, employment_number, role, pin, email, status, branch_id, created_at)
VALUES
  ('user-admin-1',   'Admin User',    'EMP001', 'admin',   '0000', 'admin@alnawras.com',   'active', 'branch-1', NOW()),
  ('user-cashier-1', 'Cashier Staff', 'EMP002', 'cashier', '0001', 'cashier@alnawras.com', 'active', 'branch-1', NOW()),
  ('user-waiter-1',  'Waiter Staff',  'EMP003', 'waiter',  '0002', 'waiter@alnawras.com',  'active', 'branch-1', NOW())
ON CONFLICT (id) DO NOTHING;
