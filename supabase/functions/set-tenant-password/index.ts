// supabase/functions/set-tenant-password/index.ts
//
// Public (the invite token IS the credential). Validates a single-use token
// created by admin-invite-tenant and sets the account's password. No super-admin
// or session required — the tenant clicking their emailed link isn't logged in.
//
// SETUP:  supabase functions deploy set-tenant-password
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://amralwaeli.github.io,capacitor://localhost,http://localhost,http://localhost:5173")
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

// Best-effort in-memory rate limit (resets on cold start).
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return json({ success: false, error: "Too many attempts. Try again shortly." }, 429);

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "");
    const password = String(body?.password ?? "");
    if (!token) return json({ success: false, error: "Missing token" }, 400);
    if (password.length < 6) return json({ success: false, error: "Password must be at least 6 characters" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: inv, error: iErr } = await admin
      .from("tenant_invites").select("*").eq("token", token).maybeSingle();
    if (iErr) throw iErr;
    if (!inv) return json({ success: false, error: "This link is invalid." }, 400);
    if (inv.used_at) return json({ success: false, error: "This link has already been used." }, 400);
    if (new Date(inv.expires_at).getTime() < Date.now()) return json({ success: false, error: "This link has expired." }, 400);

    const { error: uErr } = await admin.auth.admin.updateUserById(inv.auth_uid, { password });
    if (uErr) return json({ success: false, error: uErr.message }, 400);

    await admin.from("tenant_invites").update({ used_at: new Date().toISOString() }).eq("token", token);

    return json({ success: true, email: inv.email });
  } catch (e) {
    console.error("[set-tenant-password]", e);
    return json({ success: false, error: "Could not set the password" }, 500);
  }
});
