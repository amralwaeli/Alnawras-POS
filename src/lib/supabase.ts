import { createClient } from '@supabase/supabase-js'
import { isNativeApp } from './platform'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and rebuild.')
}

// Website: the branch login is the owner/admin session, so it lasts only while
// this tab is open — a later visitor to the link on the same computer must sign in
// again. The installed app keeps its login (tablets stay signed in between shifts).
const webTabOnly = typeof window !== 'undefined' && !isNativeApp()
if (webTabOnly) {
  try {
    // Drop a login remembered by an older version of the site.
    for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token/.test(k)) localStorage.removeItem(k)
  } catch { /* storage blocked: nothing remembered */ }
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-key',
  webTabOnly ? { auth: { storage: window.sessionStorage } } : undefined
)
