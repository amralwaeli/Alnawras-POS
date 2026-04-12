const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://uasnihapkcrgibnpqdyi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc25paGFwa2NyZ2libnBxZHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTA2MzYsImV4cCI6MjA5MTU2NjYzNn0.jqOZYNqyKO0nbOVRv5Rp_IKKdhW8Ze062QQkGcNQCuc';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupDatabase() {
  try {
    console.log('Setting up database...');

    // Read SQL file
    const sqlFile = path.join(__dirname, 'database_setup.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.trim().substring(0, 50) + '...');

        const { error } = await supabase.rpc('exec_sql', {
          sql: statement.trim() + ';'
        });

        if (error) {
          console.log('Error:', error.message);
        } else {
          console.log('✓ Success');
        }
      }
    }

    console.log('Database setup complete!');
  } catch (error) {
    console.error('Setup failed:', error);
  }
}

setupDatabase();