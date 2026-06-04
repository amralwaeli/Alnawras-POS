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
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(input, { ...init, headers })
      },
    },
  }
)

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('_health_check_').select('*').limit(1)
    if (error && (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes('does not exist'))) {
      return true
    }
    if (error) {
      console.warn('[Supabase] Connection failed:', error.message, 'code:', error.code)
      return false
    }
    return true
  } catch (err) {
    console.warn('[Supabase] Could not reach Supabase:', err)
    return false
  }
}
