#!/usr/bin/env node
/**
 * Update a ONE-TIME customer's own Supabase project after a SmartPos update that
 * changes the database (see CUSTOMER_SETUP.md). First-time setup and the licence are
 * done from the super-admin panel (Add Tenant → One-time purchase).
 *
 *   node scripts/customer.mjs <project-ref>
 *
 * Applies every database migration the project does not have yet (remembered in a
 * private schema, so running it again only applies new ones). Runs on YOUR computer
 * with your Supabase CLI login.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The shell-quoting warning (DEP0190) doesn't apply: every argument here is fixed or validated above.
process.noDeprecation = true;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2];
if (!/^[a-z0-9]{20}$/.test(ref ?? '')) {
  console.error('Usage: node scripts/customer.mjs <project-ref>   (the 20-letter id in the project URL)');
  process.exit(1);
}
if (ref === 'uasnihapkcrgibnpqdyi') {
  console.error('That is the main SmartPos project. This script is only for one-time customers\' own projects.');
  process.exit(1);
}

// npx is a .cmd on Windows, which needs a shell; every argument is quoted and SQL always
// goes through a file, so nothing in a query is ever parsed by the shell.
const win = process.platform === 'win32';
const q = (a) => (win ? `"${a}"` : a);
const cli = (args, opts = {}) => execFileSync(win ? 'npx.cmd' : 'npx', ['supabase', ...args].map(q),
  { cwd: ROOT, encoding: 'utf8', shell: win, ...opts });
const sqlFile = (file) => {
  const out = cli(['db', 'query', `--remote=${ref}`, '--yes', '-o', 'json', '-f', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.slice(out.indexOf('{'))).rows ?? [];
};
const tmp = path.join(mkdtempSync(path.join(tmpdir(), 'smartpos-')), 'q.sql');
const sql = (query) => { writeFileSync(tmp, query); return sqlFile(tmp); };

// ── 1. Database ───────────────────────────────────────────────────────────────
console.log(`\nProject ${ref}: checking the database…`);
sql(`CREATE SCHEMA IF NOT EXISTS smartpos_admin;
     REVOKE ALL ON SCHEMA smartpos_admin FROM PUBLIC, anon, authenticated;
     CREATE TABLE IF NOT EXISTS smartpos_admin.migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());`);
const done = new Set(sql('SELECT name FROM smartpos_admin.migrations').map((r) => r.name));
const files = readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const pending = files.filter((f) => !done.has(f));
for (const f of pending) {
  process.stdout.write(`  applying ${f} … `);
  sqlFile(path.join(ROOT, 'supabase', 'migrations', f));
  sql(`INSERT INTO smartpos_admin.migrations(name) VALUES ('${f.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`);
  console.log('ok');
}
console.log(pending.length ? `Database updated (${pending.length} step(s)).` : 'Database already up to date.');

// ── 2. Restaurant ─────────────────────────────────────────────────────────────
const branches = sql('SELECT b.name, bl.email FROM branches b LEFT JOIN branch_logins bl ON bl.branch_id = b.id');
if (branches.length) {
  console.log(`Restaurant: ${branches.map((b) => `${b.name} (${b.email ?? 'no sign-in'})`).join(', ')}`);
} else {
  console.log('No restaurant on this project yet. Set the customer up from the super-admin panel');
  console.log('(Add Tenant → One-time purchase): it creates the restaurant and its licence.');
}
