import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSpecificOrder() {
  const orderId = 'order-1776261958659';
  
  console.log(`Checking if order ${orderId} exists...\n`);

  // Try to get the order without branch filter
  const { data: order1, error: error1 } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId);

  console.log('Query without branch filter:');
  console.log('Error:', error1);
  console.log('Result:', order1);
  console.log('');

  // Try with branch filter
  const { data: order2, error: error2 } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('branch_id', 'branch-1');

  console.log('Query with branch filter:');
  console.log('Error:', error2);
  console.log('Result:', order2);
  console.log('');

  // Get all open orders
  const { data: openOrders, error: error3 } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'open');

  console.log('All open orders:');
  console.log('Error:', error3);
  console.log('Count:', openOrders?.length || 0);
  console.log('Orders:', openOrders);
}

checkSpecificOrder();
