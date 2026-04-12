-- Create users table
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

-- Insert initial mock data
INSERT INTO users (id, name, employment_number, role, pin, email, status, branch_id, created_at)
VALUES
  ('user-admin-1', 'Admin User', 'EMP001', 'admin', '1234', 'admin@storehub.com', 'active', 'branch-1', '2025-01-01 00:00:00+00'),
  ('user-cashier-1', 'Sarah Johnson', 'EMP002', 'cashier', '2345', 'sarah.j@storehub.com', 'active', 'branch-1', '2025-01-15 00:00:00+00'),
  ('user-waiter-1', 'Mike Chen', 'EMP003', 'waiter', '3456', 'mike.c@storehub.com', 'active', 'branch-1', '2025-02-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;