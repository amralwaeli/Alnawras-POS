// setup-onetime-tenant — called by the super-admin panel to set up a ONE-TIME customer
// on the customer's own Supabase project, end to end:
//   1. checks the caller is the super-admin;
//   2. with a Supabase access token for the customer's project (used once, never stored):
//      reads the project's keys, runs every SmartPos migration it doesn't have yet,
//      and turns off public sign-ups;
//   3. creates the restaurant, its branch and the branch sign-in (temporary password);
//   4. signs a licence for that one project with LICENSE_PRIVATE_KEY and stores it there;
//   5. records the customer in onetime_tenants, so devices find the server by email.
// Safe to run again for the same project: finished steps are skipped.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { MIGRATIONS } from "./migrations.ts";

const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://amralwaeli.github.io,capacitor://localhost,http://localhost,http://localhost:5173,http://localhost:4173")
  .split(",").map((o) => o.trim()).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  let s = "";
  for (const n of buf) s += chars[n % chars.length];
  return s + "@7";
}
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const mainUrl = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(mainUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: isSA, error: saErr } = await caller.rpc("is_current_user_super_admin");
  if (saErr || isSA !== true) return json({ success: false, error: "Not authorized" }, 403);

  let step = "reading the request";
  try {
    const body = await req.json().catch(() => ({}));
    const tenantName = String(body?.tenantName ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const projectUrl = String(body?.projectUrl ?? "").trim().replace(/\/+$/, "");
    const token = String(body?.accessToken ?? "").trim();
    const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(projectUrl)?.[1];
    if (!tenantName) return json({ success: false, error: "Restaurant name is required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ success: false, error: "A valid branch email is required" }, 400);
    if (!ref) return json({ success: false, error: "Project URL must look like https://<project-id>.supabase.co" }, 400);
    if (projectUrl === mainUrl) return json({ success: false, error: "That is the main SmartPos project" }, 400);
    if (token.length < 20) return json({ success: false, error: "A Supabase access token is required" }, 400);
    const privateKey = Deno.env.get("LICENSE_PRIVATE_KEY");
    if (!privateKey) return json({ success: false, error: "Licence key is not configured on the server" }, 500);

    const main = createClient(mainUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    step = "checking the register";
    const [{ data: byEmail }, { data: byRef }] = await Promise.all([
      main.from("onetime_tenants").select("project_ref, email").eq("email", email),
      main.from("onetime_tenants").select("project_ref, email").eq("project_ref", ref),
    ]);
    const existing = [...(byEmail ?? []), ...(byRef ?? [])].filter((r, i, all) => all.findIndex((x) => x.project_ref === r.project_ref) === i);
    const sameCustomer = existing?.length === 1 && existing[0].email === email && existing[0].project_ref === ref;
    if (existing?.length && !sameCustomer) {
      return json({ success: false, error: "That email or project is already registered to another one-time customer" }, 400);
    }

    // Supabase Management API, with the customer project's access token.
    const mgmt = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`https://api.supabase.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    };
    const sql = (query: string) => mgmt(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }) });

    step = "reading the project's keys (is the access token for an account that can manage this project?)";
    const keys: { name: string; api_key: string }[] = await mgmt(`/projects/${ref}/api-keys`);
    const anonKey = keys.find((k) => k.name === "anon")?.api_key;
    const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
    if (!anonKey || !serviceKey) throw new Error("the project's anon / service_role keys were not found");

    step = "preparing the database";
    await sql(`CREATE SCHEMA IF NOT EXISTS smartpos_admin;
      REVOKE ALL ON SCHEMA smartpos_admin FROM PUBLIC, anon, authenticated;
      CREATE TABLE IF NOT EXISTS smartpos_admin.migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());`);
    const doneRows: { name: string }[] = await sql("SELECT name FROM smartpos_admin.migrations");
    const done = new Set((doneRows ?? []).map((r) => r.name));
    let applied = 0;
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      step = `setting up the database (${m.name})`;
      await sql(m.sql);
      await sql(`INSERT INTO smartpos_admin.migrations(name) VALUES ('${m.name.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`);
      applied++;
    }

    const warnings: string[] = [];
    step = "turning off public sign-ups";
    try { await mgmt(`/projects/${ref}/config/auth`, { method: "PATCH", body: JSON.stringify({ disable_signup: true }) }); }
    catch (e) { warnings.push(`Could not turn off public sign-ups automatically (${(e as Error).message}). Turn it off in the project's Authentication settings.`); }

    const customer = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
    let password: string | null = null;
    step = "creating the restaurant";
    const { data: branches } = await customer.from("branches").select("id").limit(1);
    if (!branches?.length) {
      password = tempPassword();
      const { data: created, error: cErr } = await customer.auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr || !created?.user) throw new Error(cErr?.message || "could not create the branch sign-in");
      const orgId = uid("org"), branchId = uid("branch");
      for (const [table, row] of [
        ["organizations", { id: orgId, name: tenantName, owner_email: email, status: "active" }],
        ["branches", { id: branchId, org_id: orgId, name: tenantName, status: "active", enabled_features: {} }],
        ["branch_logins", { auth_uid: created.user.id, branch_id: branchId, email, label: tenantName }],
        ["branch_settings", { branch_id: branchId, business_name: tenantName }],
      ] as const) {
        const { error } = await customer.from(table).insert(row as Record<string, unknown>);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    } else {
      warnings.push("The restaurant was already set up on this project; its sign-in was kept.");
    }

    step = "signing the licence";
    const payload = JSON.stringify({ v: 1, ref, tenant: tenantName, issued: new Date().toISOString().slice(0, 10) });
    const key = await crypto.subtle.importKey("pkcs8", fromB64(privateKey), { name: "Ed25519" }, false, ["sign"]);
    const sig = b64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(payload))));
    const { error: lErr } = await customer.from("smartpos_license").upsert({ id: true, payload, sig, updated_at: new Date().toISOString() });
    if (lErr) throw new Error(`storing the licence: ${lErr.message}`);

    step = "registering the customer";
    const { error: rErr } = await main.from("onetime_tenants").upsert({
      id: `ot-${ref}`, name: tenantName, email, project_ref: ref, project_url: projectUrl, anon_key: anonKey,
      license: { payload, sig },
    }, { onConflict: "project_ref" });
    if (rErr) throw new Error(rErr.message);

    return json({ success: true, email, tempPassword: password, projectRef: ref, migrationsApplied: applied, warnings });
  } catch (e) {
    console.error("[setup-onetime-tenant]", step, e);
    return json({ success: false, error: `Failed while ${step}: ${(e as Error).message}` }, 400);
  }
});
