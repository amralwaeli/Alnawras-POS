import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and rebuild.')
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
)

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl ?? ''}/rest/v1/_health_check_?select=*&limit=1`,
      { headers: { apikey: supabaseAnonKey ?? '', 'Content-Type': 'application/json' } }
    )
    return res.status < 500
  } catch {
    return false
  }
}
