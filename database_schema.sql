-- Complete database schema for Alnawras POS system

-- Users table (already created)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  employment_number TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'waiter', 'kitchen', 'hr')),
  pin TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  branch_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categories table for product categorization
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  branch_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  category TEXT NOT NULL, -- Denormalized for easier queries
  price DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  image TEXT,
  sku TEXT UNIQUE,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  branch_id TEXT NOT NULL,
  kitchen_status TEXT DEFAULT 'available' CHECK (kitchen_status IN ('available', 'out-of-stock', 'finished')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tables table
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  branch_id TEXT NOT NULL,
  current_order_id TEXT,
  assigned_cashier_id TEXT,
  needs_waiter BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(branch_id, number)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  table_id TEXT REFERENCES tables(id),
  table_number INTEGER NOT NULL,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  payment_method TEXT,
  order_type TEXT DEFAULT 'dine-in' CHECK (order_type IN ('dine-in', 'takeaway')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  branch_id TEXT NOT NULL
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  added_by TEXT NOT NULL, -- User ID
  added_by_name TEXT NOT NULL, -- User name
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
  notes TEXT,
  sent_to_kitchen BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qr_sessions (
  id TEXT PRIMARY KEY,
  table_id TEXT REFERENCES tables(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  branch_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (table_id)
);

CREATE TABLE IF NOT EXISTS qr_sessions (
  id TEXT PRIMARY KEY,
  table_id TEXT REFERENCES tables(id) ON DELETE CASCADE,
  active BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  branch_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (table_id)
);

-- Insert initial data

-- Categories
INSERT INTO categories (id, name, description, color, icon, display_order, branch_id)
VALUES
  ('cat-appetizers', 'Appetizers', 'Starters and small plates', '#10B981', '🥗', 1, 'branch-1'),
  ('cat-main-courses', 'Main Courses', 'Primary dishes', '#F59E0B', '🍽️', 2, 'branch-1'),
  ('cat-desserts', 'Desserts', 'Sweet treats and desserts', '#EC4899', '🍰', 3, 'branch-1'),
  ('cat-beverages', 'Beverages', 'Drinks and refreshments', '#3B82F6', '🥤', 4, 'branch-1'),
  ('cat-sides', 'Sides', 'Side dishes and accompaniments', '#8B5CF6', '🍟', 5, 'branch-1')
ON CONFLICT (id) DO NOTHING;

-- Products
INSERT INTO products (id, name, category_id, category, price, stock, sku, tax_rate, reorder_point, branch_id)
VALUES
  ('prod-caesar-salad', 'Caesar Salad', 'cat-appetizers', 'Appetizers', 12.99, 50, 'SALAD-001', 8.25, 10, 'branch-1'),
  ('prod-mozzarella-sticks', 'Mozzarella Sticks', 'cat-appetizers', 'Appetizers', 8.99, 30, 'APP-001', 8.25, 5, 'branch-1'),
  ('prod-grilled-salmon', 'Grilled Salmon', 'cat-main-courses', 'Main Courses', 24.99, 20, 'MAIN-001', 8.25, 3, 'branch-1'),
  ('prod-ribeye-steak', 'Ribeye Steak', 'cat-main-courses', 'Main Courses', 32.99, 15, 'MAIN-002', 8.25, 2, 'branch-1'),
  ('prod-chocolate-cake', 'Chocolate Cake', 'cat-desserts', 'Desserts', 6.99, 25, 'DESSERT-001', 8.25, 5, 'branch-1'),
  ('prod-tiramisu', 'Tiramisu', 'cat-desserts', 'Desserts', 7.99, 20, 'DESSERT-002', 8.25, 4, 'branch-1'),
  ('prod-coca-cola', 'Coca Cola', 'cat-beverages', 'Beverages', 2.99, 100, 'BEV-001', 8.25, 20, 'branch-1'),
  ('prod-coffee', 'Coffee', 'cat-beverages', 'Beverages', 3.49, 50, 'BEV-002', 8.25, 10, 'branch-1'),
  ('prod-french-fries', 'French Fries', 'cat-sides', 'Sides', 4.99, 40, 'SIDE-001', 8.25, 8, 'branch-1'),
  ('prod-garlic-bread', 'Garlic Bread', 'cat-sides', 'Sides', 5.99, 35, 'SIDE-002', 8.25, 7, 'branch-1')
ON CONFLICT (id) DO NOTHING;

-- Tables
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

-- Users (if not already inserted)
INSERT INTO users (id, name, employment_number, role, pin, email, status, branch_id, created_at)
VALUES
  ('user-admin-1', 'Admin User', 'EMP001', 'admin', '1234', 'admin@storehub.com', 'active', 'branch-1', '2025-01-01 00:00:00+00'),
  ('user-cashier-1', 'Sarah Johnson', 'EMP002', 'cashier', '2345', 'sarah.j@storehub.com', 'active', 'branch-1', '2025-01-15 00:00:00+00'),
  ('user-waiter-1', 'Mike Chen', 'EMP003', 'waiter', '3456', 'mike.c@storehub.com', 'active', 'branch-1', '2025-02-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;