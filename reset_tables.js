import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function resetOccupiedTables() {
  try {
    console.log('Resetting occupied tables with no orders to available...\n');

    // Get all occupied tables with no current_order_id
    const { data: tables, error: tablesError } = await supabase
      .from('tables')
      .select('id, number, status, current_order_id')
      .eq('status', 'occupied')
      .is('current_order_id', null);

    if (tablesError) {
      console.error('Error fetching tables:', tablesError);
      return;
    }

    console.log(`Found ${tables?.length || 0} occupied tables with no orders\n`);

    let resetCount = 0;

    for (const table of tables || []) {
      console.log(`Resetting table ${table.number} (ID: ${table.id}) from occupied to available`);
      
      const { error: updateError } = await supabase
        .from('tables')
        .update({ status: 'available' })
        .eq('id', table.id);

      if (updateError) {
        console.error(`  Error: ${updateError.message}`);
      } else {
        resetCount++;
        console.log(`  ✓ Reset successfully`);
      }
    }

    console.log(`\n✅ Reset ${resetCount} tables to available status`);

  } catch (error) {
    console.error('Reset failed:', error);
  }
}

resetOccupiedTables();
