import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Missing session token' }, { status: 401, headers: corsHeaders });

    const { currentPin, newPin } = await req.json();
    if (typeof currentPin !== 'string' || typeof newPin !== 'string') {
      return Response.json({ error: 'PIN values are required' }, { status: 400, headers: corsHeaders });
    }
    if (!/^\d{6,12}$/.test(newPin)) {
      return Response.json({ error: 'New PIN must be 6 to 12 digits' }, { status: 400, headers: corsHeaders });
    }
    if (/^(\d)\1+$/.test(newPin) || /012345|123456|234567|345678|456789|987654|876543|765432|654321/.test(newPin)) {
      return Response.json({ error: 'New PIN is too predictable' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const [, body] = token.split('.');
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    const { data, error } = await admin.rpc('change_staff_pin', {
      p_user_id: claims.user_id,
      p_current_pin: currentPin,
      p_new_pin: newPin,
    });
    if (error) throw error;
    if (data !== true) return Response.json({ error: 'Current PIN is incorrect' }, { status: 401, headers: corsHeaders });

    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error?.message ?? 'PIN change failed' }, { status: 500, headers: corsHeaders });
  }
});
