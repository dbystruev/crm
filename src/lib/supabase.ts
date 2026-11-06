import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

// REQUIREMENT 15: Public registration is blocked by the prevent_public_signup trigger on auth.users. Test users are created manually in Supabase.
export const PUBLIC_REGISTRATION_POLICY = "Открытая регистрация отключена на уровне базы данных (триггер prevent_public_signup). Тестовых пользователей можно создать вручную в Supabase."

// SECURITY: Only SUPABASE_ANON_KEY (public) is used in frontend. No service_role key is present or exported.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Public registration is intentionally disabled. The anonymous Supabase client
// is used for credential sign-in and database access only; this codebase must
// never call the public registration endpoint. Administrators provision
// accounts manually in the Supabase dashboard.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
    )
  }
  return supabase
}
