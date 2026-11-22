#!/usr/bin/env node
/**
 * Set up or update a ONE-TIME customer's own Supabase project (see CUSTOMER_SETUP.md).
 *
 *   node scripts/customer.mjs <project-ref>
 *
 * 1. Applies every database migration the project does not have yet (remembered in
 *    a private schema, so running it again later only applies new ones = updates).
 * 2. The first time: asks for the restaurant name, branch email and password, and
 *    creates the restaurant, its branch and the branch sign-in.
 * 3. Prints the setup code to enter on each device ("Connect to your own server").
 *
 * Runs on YOUR computer with your Supabase CLI login. The project's service-role key
 * is fetched here, used here, and never written to disk or put in the setup code.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };   // don't echo the password
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

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

// ── 2. Keys (kept in memory only) ─────────────────────────────────────────────
const keys = JSON.parse(cli(['projects', 'api-keys', '--project-ref', ref, '-o', 'json']));
const anon = keys.find((k) => k.name === 'anon')?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key;
if (!anon || !service) { console.error('Could not read the project\'s keys. Are you a member of its Supabase organization?'); process.exit(1); }
const url = `https://${ref}.supabase.co`;

// ── 3. Restaurant + branch sign-in (first time only) ─────────────────────────
const branches = sql('SELECT b.name, bl.email FROM branches b LEFT JOIN branch_logins bl ON bl.branch_id = b.id');
if (branches.length) {
  console.log(`Restaurant already set up: ${branches.map((b) => `${b.name} (${b.email ?? 'no sign-in'})`).join(', ')}`);
} else {
  const name = await ask('Restaurant name: ');
  const email = (await ask('Branch email (used to sign in devices and the website): ')).toLowerCase();
  const password = await ask('Branch password (at least 10 characters, not shown): ', { hidden: true });
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 10) {
    console.error('Need a name, a valid email and a password of at least 10 characters.'); process.exit(1);
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr || !created?.user) { console.error('Could not create the sign-in:', cErr?.message); process.exit(1); }
  const id = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const orgId = id('org'), branchId = id('branch');
  const steps = [
    () => admin.from('organizations').insert({ id: orgId, name, owner_email: email, status: 'active' }),
    () => admin.from('branches').insert({ id: branchId, org_id: orgId, name, status: 'active', enabled_features: {} }),
    () => admin.from('branch_logins').insert({ auth_uid: created.user.id, branch_id: branchId, email, label: name }),
    () => admin.from('branch_settings').upsert({ branch_id: branchId, business_name: name }, { onConflict: 'branch_id' }),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      console.error('Setup failed, undoing:', error.message);
      await admin.from('branch_logins').delete().eq('auth_uid', created.user.id);
      await admin.from('branches').delete().eq('id', branchId);
      await admin.from('organizations').delete().eq('id', orgId);
      await admin.auth.admin.deleteUser(created.user.id);
      process.exit(1);
    }
  }
  console.log(`Created restaurant "${name}" with sign-in ${email}.`);
}

// ── 4. Setup code ─────────────────────────────────────────────────────────────
const code = Buffer.from(JSON.stringify({ u: url, k: anon })).toString('base64');
console.log(`
Done. On each device (app or website), on the sign-in screen tap
"Bought SmartPos once? Connect to your own server" and paste this setup code:

${code}

Then sign in with the branch email and password.
One more step in the Supabase dashboard (see CUSTOMER_SETUP.md): turn OFF
Authentication → Sign In / Providers → "Allow new users to sign up".
`);
