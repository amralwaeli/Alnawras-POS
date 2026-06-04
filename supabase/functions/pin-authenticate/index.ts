import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import { corsHeaders } from '../_shared/cors.ts';
import { signJwt } from '../_shared/jwt.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const { pin } = await req.json();
    if (typeof pin !== 'string' || !/^\d{6,12}$/.test(pin)) {
      return Response.json({ error: 'Invalid PIN format' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data, error } = await admin.rpc('verify_staff_pin', { p_pin: pin }).maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: 'Invalid PIN or inactive account' }, { status: 401, headers: corsHeaders });

    const accessToken = await signJwt({
      sub: data.id,
      user_id: data.id,
      staff_role: data.role,
      branch_id: data.branch_id,
    }, jwtSecret);

    return Response.json({ user: data, access_token: accessToken, expires_in: 28800 }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error?.message ?? 'Authentication failed' }, { status: 500, headers: corsHeaders });
  }
});
