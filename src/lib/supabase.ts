import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from './authSession'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and rebuild.')
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
  {
    global: {
      fetch: (input, init = {}) => {
        const token = getAccessToken()
        const headers = new Headers(init.headers)
        // Only inject if it is a real JWT (3 dot-separated parts)
        if (token && token.split('.').length === 3) {
          headers.set('Authorization', `Bearer ${token}`)
        }
        return fetch(input, { ...init, headers })
      },
    },
  }
)

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    // Use a plain fetch with only the anon key — no Bearer token — so an
    // invalid session token cannot cause a false "connection failed" report.
    const res = await fetch(
      `${supabaseUrl ?? ''}/rest/v1/_health_check_?select=*&limit=1`,
      { headers: { apikey: supabaseAnonKey ?? '', 'Content-Type': 'application/json' } }
    )
    // Any HTTP response (including 404 / 401 / 406) means the server is reachable.
    return res.status < 500
  } catch {
    return false
  }
}
