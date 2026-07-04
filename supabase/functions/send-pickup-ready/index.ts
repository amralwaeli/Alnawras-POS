// supabase/functions/send-pickup-ready/index.ts
//
// Sends the "your pickup order is READY" email from the restaurant's Gmail.
// Called by the app (PickupController.setPickupStatus) with ONLY an { orderId }.
//
// SECURITY MODEL
//   The caller is NEVER trusted with the recipient address or email content.
//   Given an orderId, this function looks the order up with the service-role key
//   and derives the recipient + name + bill number itself, so it can only email
//   the customer who actually placed that pickup order — it is not an open relay.
//   Every interpolated value is HTML-escaped. CORS is restricted to the app
//   origins, and a small in-memory rate limit blunts bursts.
//
// SETUP (one time):
//   1. On alnawrasrestaurant23@gmail.com enable 2-Step Verification, then create
//      an App Password (Google Account → Security → App passwords).
//   2. supabase secrets set GMAIL_APP_PASSWORD="the-16-char-app-password"
//      (optional) supabase secrets set APP_ALLOWED_ORIGINS="https://amralwaeli.github.io,capacitor://localhost,http://localhost:5173"
//   3. supabase functions deploy send-pickup-ready
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const FROM_EMAIL = "alnawrasrestaurant23@gmail.com";
const FROM_NAME = "Alnawras Restaurant";

// Origins allowed to call this function (comma-separated via APP_ALLOWED_ORIGINS).
// Defaults cover the deployed site, the Capacitor APK, and local dev.
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://amralwaeli.github.io,capacitor://localhost,http://localhost,http://localhost:5173")
  .split(",").map((o) => o.trim()).filter(Boolean);

// Best-effort in-memory rate limit (resets on cold start). Durable rate limiting
// belongs at the gateway / a later hardening phase.
const RATE_LIMIT = 20;          // sends
const RATE_WINDOW_MS = 60_000;  // per minute, per client IP
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

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

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return json({ error: "Too many requests" }, 429);

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId;
    if (!orderId || typeof orderId !== "string") return json({ error: "Missing orderId" }, 400);

    const password = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!password) return json({ error: "Email is not configured" }, 500);

    // Resolve the recipient SERVER-SIDE from the order — never from the caller.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: order, error } = await supabase
      .from("orders")
      .select("order_type, customer_email, customer_name, bill_number")
      .eq("id", orderId)
      .single();

    if (error || !order) return json({ error: "Order not found" }, 404);
    if (order.order_type !== "pickup") return json({ error: "Not a pickup order" }, 400);
    if (!order.customer_email) return json({ success: true, skipped: "no email on order" });

    const to = String(order.customer_email);
    const safeName = escapeHtml(order.customer_name) || "there";
    const plainName = order.customer_name ? String(order.customer_name) : "there";
    const billRef = order.bill_number ? ` #${order.bill_number}` : "";
    const safeBillRef = order.bill_number ? ` #${escapeHtml(order.bill_number)}` : "";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#222">
        <h2 style="color:#f97316;margin:0 0 8px">Your order is READY 🎉</h2>
        <p>Hi ${safeName},</p>
        <p>Your pickup order${safeBillRef} at <b>Alnawras Restaurant</b> is now <b>READY</b>.</p>
        <p>You may now arrange <b>Grab Express</b>, <b>Lalamove</b>, or collect it yourself.</p>
        <p style="color:#888;font-size:12px;margin-top:24px">Thank you for ordering with Alnawras Restaurant.</p>
      </div>`;

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: FROM_EMAIL, password } },
    });
    await client.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject: `Your pickup order${billRef} is READY`,
      content: `Hi ${plainName}, your pickup order${billRef} is now READY. You may arrange Grab Express, Lalamove, or collect it yourself.`,
      html,
    });
    await client.close();

    return json({ success: true });
  } catch (e) {
    console.error("[send-pickup-ready]", e);
    return json({ error: "Failed to send email" }, 500);
  }
});
