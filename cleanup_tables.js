import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanupInvalidReferences() {
  try {
    console.log('Starting cleanup of invalid table order references...\n');

    // Get all tables with current_order_id
    const { data: tables, error: tablesError } = await supabase
      .from('tables')
      .select('id, number, current_order_id')
      .not('current_order_id', 'is', null);

    if (tablesError) {
      console.error('Error fetching tables:', tablesError);
      return;
    }

    console.log(`Found ${tables?.length || 0} tables with order references\n`);

    let cleanedCount = 0;

    for (const table of tables || []) {
      console.log(`Checking table ${table.number} (ID: ${table.id}) -> Order: ${table.current_order_id}`);
      
      // Check if the referenced order exists
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', table.current_order_id)
        .single();

      if (orderError || !order) {
        console.log(`  ❌ Order ${table.current_order_id} does not exist - clearing reference`);
        
        // Clear the invalid reference
        const { error: updateError } = await supabase
          .from('tables')
          .update({ current_order_id: null })
          .eq('id', table.id);

        if (updateError) {
          console.error(`  Error updating table: ${updateError.message}`);
        } else {
          cleanedCount++;
        }
      } else if (order.status === 'completed') {
        console.log(`  ⚠️  Order ${order.id} is completed - clearing reference`);
        
        // Clear completed order reference
        const { error: updateError } = await supabase
          .from('tables')
          .update({ 
            current_order_id: null, 
            status: 'available'
          })
          .eq('id', table.id);

        if (updateError) {
          console.error(`  Error updating table: ${updateError.message}`);
        } else {
          cleanedCount++;
        }
      } else {
        console.log(`  ✓ Order ${order.id} is valid (${order.status})`);
      }
    }

    console.log(`\n✅ Cleanup complete! Fixed ${cleanedCount} invalid references`);

  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

cleanupInvalidReferences();
