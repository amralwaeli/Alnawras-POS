# Kitchen Real-Time Sync - Setup Instructions

## ⚠️ CRITICAL: Enable Supabase Realtime Replication

The kitchen view won't receive real-time updates unless Supabase replication is enabled on the tables.

### Step 1: Open Supabase Dashboard
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run This SQL
Copy and paste this entire SQL script into the Supabase SQL Editor and click **Run**:

```sql
-- Enable replication for order_items table
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- Enable replication for orders table  
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Enable replication for tables table
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

-- Verify replication is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### Step 3: Verify It Worked
After running the SQL, you should see these tables in the results:
- `order_items`
- `orders`
- `tables`

### Step 4: Test the Kitchen View
1. **Refresh your browser** (Ctrl+F5) to load the new build
2. **Open browser console** (F12)
3. **Login as kitchen staff**
4. **Open another tab as waiter** and create a new order
5. **Watch the console** - you should see:
   ```
   [Kitchen] Loading tickets from database...
   [Kitchen] Loaded 1 active tickets
   [Kitchen] Order item change: INSERT item-xxx Status: pending
   [Kitchen] Loading tickets from database...
   ```

### What Changed in the Code:

1. **Removed invalid `branch_id` filter** from `order_items` subscription (column doesn't exist)
2. **Added subscription to `orders` UPDATE events** (catches status changes)
3. **Added comprehensive logging** to track realtime events
4. **300ms polling** as backup to realtime subscriptions

### How the Realtime Sync Works Now:

1. **Waiter creates order** → Supabase fires INSERT event → Kitchen receives it instantly
2. **Kitchen marks item as "Ready"** → UPDATE event fires → All kitchens see change
3. **Waiter serves item** → Status changes to "served" → Item disappears immediately
4. **All items served** → Ticket vanishes from kitchen display
5. **300ms polling** → Backup sync if realtime subscription misses anything

### Troubleshooting:

**Problem:** Kitchen still doesn't update in real-time
**Solution:** 
1. Check console for `[Kitchen]` logs
2. Verify SQL was run successfully
3. Check Supabase Dashboard → Database → Replication
4. Ensure all 3 tables are listed in `supabase_realtime` publication

**Problem:** Console shows "Order item change" but tickets don't update
**Solution:** 
1. Check for errors in console
2. Verify `loadTickets()` is being called
3. Check network tab for Supabase requests
