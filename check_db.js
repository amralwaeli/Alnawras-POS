import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupDatabase() {
  try {
    console.log('Testing database connection...');

    // Try to select from users table to see if it exists
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error && error.code === 'PGRST205') {
      console.log('Users table does not exist. Please create it manually in Supabase dashboard with this SQL:');
      console.log(`
CREATE TABLE users (
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

-- Insert initial data
INSERT INTO users (id, name, employment_number, role, pin, email, status, branch_id, created_at)
VALUES
  ('user-admin-1', 'Admin User', 'EMP001', 'admin', '1234', 'admin@storehub.com', 'active', 'branch-1', '2025-01-01 00:00:00+00'),
  ('user-cashier-1', 'Sarah Johnson', 'EMP002', 'cashier', '2345', 'sarah.j@storehub.com', 'active', 'branch-1', '2025-01-15 00:00:00+00'),
  ('user-waiter-1', 'Mike Chen', 'EMP003', 'waiter', '3456', 'mike.c@storehub.com', 'active', 'branch-1', '2025-02-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;
      `);
    } else if (error) {
      console.log('Database error:', error.message);
    } else {
      console.log('✓ Database connection successful!');
      console.log('Users in database:', data?.length || 0);
    }

  } catch (error) {
    console.error('Setup failed:', error);
  }
}

setupDatabase();