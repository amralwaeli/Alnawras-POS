/**
 * AlnawrasPOS - Local Backup Script
 * This script downloads your entire database as a JSON file for local backup.
 * 
 * SETUP:
 * 1. Ensure you have Node.js installed.
 * 2. Run: npm install @supabase/supabase-js fs path
 * 3. Run every night: node daily_backup.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const backupFolder = './backups'; // Change this to your External HDD path like 'E:/backups'

const supabase = createClient(supabaseUrl, supabaseKey);

// Tables to backup
const tables = [
  'users', 'categories', 'products', 'tables', 'orders', 
  'order_items', 'expenses', 'customers', 'loyalty_transactions',
  'employees', 'attendance_logs', 'shifts'
];

async function runBackup() {
  console.log('--- Starting AlnawrasPOS Daily Backup ---');
  
  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dailyFolder = path.join(backupFolder, `backup-${timestamp}`);
  fs.mkdirSync(dailyFolder);

  for (const table of tables) {
    console.log(`Backing up table: ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    
    if (error) {
      console.error(`Error backing up ${table}:`, error.message);
      continue;
    }

    fs.writeFileSync(
      path.join(dailyFolder, `${table}.json`),
      JSON.stringify(data, null, 2)
    );
  }

  console.log(`\n✅ Backup complete! Saved to: ${dailyFolder}`);
  console.log('You can now copy this folder to your External HDD.');
}

runBackup().catch(err => console.error('Fatal backup error:', err));
