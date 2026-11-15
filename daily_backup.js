/**
 * AlnawrasPOS — full database backup to local JSON files.
 *
 * The Supabase Free plan keeps NO backups. This script is the backup: run it
 * every night on the owner's PC and copy the folder to an external drive.
 *
 * SETUP (once)
 *   1. Node.js 20.12 or newer.
 *   2. In this folder's `.env` (already git-ignored — never commit it):
 *        SUPABASE_URL=https://<your-PRODUCTION-project>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=<Dashboard → Project Settings → API keys → service_role>
 *      Check the URL is the LIVE project, not a test one.
 *      The service key can read everything: keep it on this PC only. It must
 *      NOT start with VITE_ (that would ship it inside the website).
 *
 * RUN
 *   node daily_backup.js
 *   Schedule it nightly with Windows Task Scheduler. A non-zero exit code means
 *   the backup is INCOMPLETE — do not trust that folder.
 *
 * WHAT YOU GET   backups/backup-<timestamp>/
 *   <table>.json       every row of every table. The table list comes from the
 *                      server itself; if the server will not list them, it
 *                      falls back to every table named in supabase/migrations.
 *   _auth_users.json   login accounts (id + email; passwords are never exported)
 *   _manifest.json     row counts per table — compare against a previous night
 *
 * NOT INCLUDED  uploaded files (product photos, receipts, payment QR) and login
 *   passwords. After a restore, accounts are re-invited / passwords reset.
 *
 * RESTORE  import each <table>.json through the Supabase Table Editor (or an
 *   upsert script) into a database built from supabase/migrations, parents
 *   before children: organizations → branches → users/categories → products →
 *   tables → orders → order_items → the rest.
 *
 * ⚠ The output contains staff PINs, salaries and customer phone numbers in
 *   plain text. Store it like cash.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

try { process.loadEnvFile?.(); } catch { /* no .env file — use real environment variables */ }

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outRoot = process.env.BACKUP_DIR || './backups';
const PAGE = Number(process.env.BACKUP_PAGE_SIZE) || 1000; // PostgREST returns at most 1000 rows per request

const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

/** Every table named by a CREATE TABLE in supabase/migrations (no key info). */
function tablesFromMigrations() {
  const dir = new URL('./supabase/migrations/', import.meta.url);
  const names = new Set();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql'))) {
    for (const m of readFileSync(new URL(file, dir), 'utf8').matchAll(/^CREATE TABLE IF NOT EXISTS (\w+)/gm)) names.add(m[1]);
  }
  return [...names].map(name => ({ name, pk: [] }));
}

/** Every table the API exposes, with its primary-key columns (for stable paging). */
async function discoverTables() {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const { definitions } = res.ok ? await res.json() : {};
  if (!definitions) {
    console.warn(`  (server would not list its tables — HTTP ${res.status}; using the list in supabase/migrations)`);
    return tablesFromMigrations();
  }
  return Object.entries(definitions).map(([name, def]) => ({
    name,
    pk: Object.entries(def.properties ?? {})
      .filter(([, col]) => String(col.description ?? '').includes('<pk/>'))
      .map(([col]) => col),
  }));
}

/** All rows of one table, paged in primary-key order; throws if the count is off. */
async function dumpTable({ name, pk }) {
  const rows = [];
  let expected = null;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(name).select('*', from === 0 ? { count: 'exact' } : undefined).range(from, from + PAGE - 1);
    for (const col of pk) q = q.order(col);
    const { data, error, count } = await q;
    if (error?.code === 'PGRST205') return null; // named in a migration that is not applied on this server
    if (error) throw new Error(error.message);
    if (from === 0) expected = count;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  // shortcut: a table written to DURING the run can legitimately differ by a few
  // rows; run this after closing time. Switch to pg_dump if that ever stops being true.
  if (expected !== null && rows.length !== expected) {
    throw new Error(`expected ${expected} rows but read ${rows.length}`);
  }
  return rows;
}

async function dumpAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  if (!supabase) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env — see the header of this file.');
    return 1;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(outRoot, `backup-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const manifest = { project: url, takenAt: new Date().toISOString(), tables: {}, notOnServer: [], authUsers: null, failed: [] };
  const save = (file, value) => writeFileSync(join(dir, file), JSON.stringify(value, null, 2));
  const attempt = async (label, fn) => {
    try { await fn(); } catch (err) {
      manifest.failed.push(`${label}: ${err.message}`);
      console.error(`  ${label.padEnd(36)} FAILED — ${err.message}`);
    }
  };

  console.log(`AlnawrasPOS backup → ${dir}`);
  await attempt('table list', async () => {
    const tables = await discoverTables();
    if (tables.length === 0) throw new Error('no tables found');
    for (const table of tables) {
      await attempt(table.name, async () => {
        const rows = await dumpTable(table);
        if (rows === null) { manifest.notOnServer.push(table.name); return; }
        save(`${table.name}.json`, rows);
        manifest.tables[table.name] = rows.length;
        console.log(`  ${table.name.padEnd(36)} ${rows.length}`);
      });
    }
  });
  await attempt('login accounts', async () => {
    const users = await dumpAuthUsers();
    save('_auth_users.json', users);
    manifest.authUsers = users.length;
    console.log(`  ${'(login accounts)'.padEnd(36)} ${users.length}`);
  });
  save('_manifest.json', manifest);

  if (manifest.notOnServer.length > 0) console.warn(`
Not on this server (migration not applied?): ${manifest.notOnServer.join(', ')}`);
  if (manifest.failed.length > 0) {
    console.error(`
✗ Backup INCOMPLETE (${manifest.failed.length} problem(s)). Do not rely on ${dir}.`);
    return 1;
  }
  console.log(`
✓ Backup complete: ${Object.keys(manifest.tables).length} tables. Copy ${dir} to your external drive.`);
  return 0;
}

// exitCode (not process.exit) so open network handles close cleanly on Windows.
process.exitCode = await main();
