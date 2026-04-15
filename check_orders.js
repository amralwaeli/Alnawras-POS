import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkOrders() {
  try {
    console.log('Checking orders in database...\n');

    // Get all orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*');

    if (ordersError) {
      console.error('Orders error:', ordersError);
      return;
    }

    console.log(`Total orders: ${orders?.length || 0}\n`);
    
    if (orders && orders.length > 0) {
      orders.forEach((order, idx) => {
        console.log(`Order ${idx + 1}:`);
        console.log(`  ID: ${order.id}`);
        console.log(`  Table ID: ${order.table_id}`);
        console.log(`  Branch ID: ${order.branch_id}`);
        console.log(`  Status: ${order.status}`);
        console.log(`  Total: ${order.total}`);
        console.log('');
      });
    }

    // Get all tables
    console.log('\nChecking tables...\n');
    const { data: tables, error: tablesError } = await supabase
      .from('tables')
      .select('*');

    if (tablesError) {
      console.error('Tables error:', tablesError);
      return;
    }

    console.log(`Total tables: ${tables?.length || 0}\n`);
    
    if (tables && tables.length > 0) {
      tables.forEach((table, idx) => {
        console.log(`Table ${idx + 1}:`);
        console.log(`  ID: ${table.id}`);
        console.log(`  Number: ${table.number}`);
        console.log(`  Status: ${table.status}`);
        console.log(`  Current Order ID: ${table.current_order_id || 'null'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Check failed:', error);
  }
}

checkOrders();
