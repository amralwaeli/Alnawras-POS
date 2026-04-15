ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS needs_waiter BOOLEAN DEFAULT false;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine-in' CHECK (order_type IN ('dine-in', 'takeaway'));

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS sent_to_kitchen BOOLEAN DEFAULT true;

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
