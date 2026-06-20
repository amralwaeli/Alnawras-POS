// supabase/functions/send-pickup-ready/index.ts
//
// Sends the "your pickup order is READY" email from the restaurant's Gmail.
// Called by the app (PickupController.setPickupStatus) when a pickup order is
// marked Ready and the customer left an email.
//
// SETUP (one time):
//   1. On alnawrasrestaurant23@gmail.com enable 2-Step Verification, then create
//      an App Password (Google Account → Security → App passwords).
//   2. Store it as a secret:
//        supabase secrets set GMAIL_APP_PASSWORD="the-16-char-app-password"
//   3. Deploy:
//        supabase functions deploy send-pickup-ready
//
// The app invokes it with the anon key (a valid JWT), so the default
// JWT verification passes — no extra config needed.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const FROM_EMAIL = "alnawrasrestaurant23@gmail.com";
const FROM_NAME = "Alnawras Restaurant";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, customerName, billNumber } = await req.json();
    if (!to) return json({ error: "Missing recipient email" }, 400);

    const password = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!password) return json({ error: "GMAIL_APP_PASSWORD secret is not set" }, 500);

    const ref = billNumber ? ` #${billNumber}` : "";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#222">
        <h2 style="color:#f97316;margin:0 0 8px">Your order is READY 🎉</h2>
        <p>Hi ${customerName || "there"},</p>
        <p>Your pickup order${ref} at <b>Alnawras Restaurant</b> is now <b>READY</b>.</p>
        <p>You may now arrange <b>Grab Express</b>, <b>Lalamove</b>, or collect it yourself.</p>
        <p style="color:#888;font-size:12px;margin-top:24px">Thank you for ordering with Alnawras Restaurant.</p>
      </div>`;

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: FROM_EMAIL, password } },
    });
    await client.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject: `Your pickup order${ref} is READY`,
      content: `Hi ${customerName || "there"}, your pickup order${ref} is now READY. You may arrange Grab Express, Lalamove, or collect it yourself.`,
      html,
    });
    await client.close();

    return json({ success: true });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
