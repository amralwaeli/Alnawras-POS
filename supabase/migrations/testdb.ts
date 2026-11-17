/**
 * Test-only: a real Postgres (PGlite, in-process, no network) with the few
 * Supabase pieces the migrations rely on — the anon/authenticated roles,
 * auth.uid(), the extensions + storage schemas and Supabase's default table
 * grants — then every migration in this folder applied in order.
 *
 * shortcut: stub of Supabase, not the real stack (no PostgREST/Realtime/Auth);
 * use `supabase start` (Docker) for a click-through rehearsal before prod.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));

export const migrationFiles = () =>
  readdirSync(DIR).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();

export async function makeDb(upTo?: string) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;          -- as on Supabase
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT ALL ON storage.objects TO anon, authenticated;
    GRANT USAGE ON SCHEMA auth, public, extensions TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    SET search_path = public, extensions;
  `);
  for (const f of migrationFiles()) {
    if (upTo && f > upTo) break;
    try {
      await db.exec(readFileSync(DIR + f, 'utf8'));
    } catch (e: any) {
      throw new Error(`${f}: ${e.message}`);
    }
  }
  return db;
}

/** Run `fn` as a Supabase role; `sub` is the signed-in auth user id (or null). */
export async function as<T>(db: PGlite, role: 'anon' | 'authenticated', sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${sub ?? ''}', false); SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec('RESET ROLE;'); }
}

/** Value of a single-row, single-column query. */
export async function one<T = any>(db: PGlite, sql: string, params: any[] = []): Promise<T> {
  const r = await db.query<any>(sql, params);
  const row = r.rows[0];
  return row ? (Object.values(row)[0] as T) : (undefined as T);
}

/** The error message, or null if the statement succeeded. */
export async function fails(db: PGlite, sql: string, params: any[] = []): Promise<string | null> {
  try { await db.query(sql, params); return null; } catch (e: any) { return e.message; }
}
