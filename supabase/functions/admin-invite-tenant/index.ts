// supabase/functions/admin-invite-tenant/index.ts
//
// Super-admin-only. Creates a whole tenant in one call:
//   1. verifies the CALLER is a registered super-admin (using their own token),
//   2. creates a login account for the tenant admin (with a temp password),
//   3. creates the organization + branch,
//   4. maps the account -> branch in branch_logins (so on the website that
//      email+password logs straight into the branch admin dashboard),
//   5. stores a single-use invite token and emails the admin a link to set
//      their own password (temp password included as a fallback).
//
// The invite email is sent with the SAME Gmail SMTP as send-pickup-ready
// (GMAIL_APP_PASSWORD), so it doesn't depend on Supabase's rate-limited auth mailer.
//
// SETUP:  supabase functions deploy admin-invite-tenant
//   Reuses GMAIL_APP_PASSWORD. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
//   SUPABASE_ANON_KEY are injected automatically. Optional: APP_SITE_URL.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SITE = (Deno.env.get("APP_SITE_URL") ?? "https://amralwaeli.github.io/Alnawras-POS").replace(/\/+$/, "");
const FROM_EMAIL = "alnawrasrestaurant23@gmail.com";
const FROM_NAME = "Alnawras POS";
const INVITE_TTL_HOURS = 72;

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

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function randToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  let s = "";
  for (const n of buf) s += chars[n % chars.length];
  return s + "@7"; // guarantee a digit + symbol
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // 1) The caller must be a super-admin — checked with THEIR token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: isSA, error: saErr } = await caller.rpc("is_current_user_super_admin");
    if (saErr || isSA !== true) return json({ success: false, error: "Not authorized" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const tenantName = String(body?.tenantName ?? "").trim();
    const branchName = String(body?.branchName ?? "").trim() || tenantName;
    const contractStart = body?.contractStart || null;
    const contractEnd = body?.contractEnd || null;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ success: false, error: "A valid tenant admin email is required" }, 400);
    if (!tenantName) return json({ success: false, error: "Tenant / restaurant name is required" }, 400);

    const admin = createClient(url, serviceKey);

    // 2) Create the login account (confirmed + temp password so it works immediately).
    const tempPass = tempPassword();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password: tempPass, email_confirm: true, user_metadata: { tenant: tenantName },
    });
    if (cErr || !created?.user) {
      return json({ success: false, error: cErr?.message || "That email may already have an account." }, 400);
    }
    const authUid = created.user.id;

    // Roll the account back if any later step fails, so a half-made tenant can't linger.
    const rollback = async () => { try { await admin.auth.admin.deleteUser(authUid); } catch (_) { /* ignore */ } };

    // 3) Organization + branch.
    const orgId = uid("org");
    const branchId = uid("branch");
    const { error: oErr } = await admin.from("organizations").insert({
      id: orgId, name: tenantName, owner_email: email, status: "active",
    });
    if (oErr) { await rollback(); return json({ success: false, error: oErr.message }, 400); }

    const { error: bErr } = await admin.from("branches").insert({
      id: branchId, org_id: orgId, name: branchName,
      contract_start: contractStart, contract_end: contractEnd,
      status: "active", enabled_features: {},
    });
    if (bErr) { await rollback(); return json({ success: false, error: bErr.message }, 400); }

    // 4) Bind the account to the branch (website login -> that branch's admin).
    const { error: lErr } = await admin.from("branch_logins").insert({
      auth_uid: authUid, branch_id: branchId, email, label: tenantName,
    });
    if (lErr) { await rollback(); return json({ success: false, error: lErr.message }, 400); }

    // 5) Single-use set-password token + link.
    const token = randToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000).toISOString();
    await admin.from("tenant_invites").insert({ token, auth_uid: authUid, email, branch_id: branchId, expires_at: expiresAt });
    const setUrl = `${SITE}/#/set-password?token=${token}`;

    // 6) Email the invite (best-effort via Gmail). The temp password is included
    //    so onboarding still works even if the email is delayed / not received.
    let emailSent = false;
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (gmailPass) {
      try {
        const safeTenant = escapeHtml(tenantName);
        const html = `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#222">
            <h2 style="color:#f97316;margin:0 0 8px">Welcome to Alnawras POS</h2>
            <p>An account has been created for <b>${safeTenant}</b>.</p>
            <p><a href="${setUrl}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Set your password</a></p>
            <p style="font-size:13px;color:#555">Or sign in with your email and this temporary password, then change it:<br>
              <b>${escapeHtml(tempPass)}</b></p>
            <p style="color:#888;font-size:12px;margin-top:24px">This set-password link expires in ${INVITE_TTL_HOURS} hours.</p>
          </div>`;
        const client = new SMTPClient({
          connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: FROM_EMAIL, password: gmailPass } },
        });
        await client.send({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: email,
          subject: "Your Alnawras POS account",
          content: `Welcome to Alnawras POS. Set your password: ${setUrl}\nOr sign in with your email and temporary password: ${tempPass} (then change it). Link expires in ${INVITE_TTL_HOURS} hours.`,
          html,
        });
        await client.close();
        emailSent = true;
      } catch (e) {
        console.error("[admin-invite-tenant] email failed", e);
      }
    }

    return json({ success: true, branchId, email, tempPassword: tempPass, setPasswordUrl: setUrl, emailSent });
  } catch (e) {
    console.error("[admin-invite-tenant]", e);
    return json({ success: false, error: "Failed to create the tenant" }, 500);
  }
});
