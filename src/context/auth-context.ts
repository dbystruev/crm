import { createContext, useContext } from 'react'
import type { Profile } from '../lib/types'

/**
 * Public self-registration is intentionally disabled for this workspace.
 * Accounts are provisioned manually by an administrator in Supabase. The
 * application only exposes credential sign-in.
 */
export const PUBLIC_REGISTRATION_ENABLED: boolean = false
export const PUBLIC_REGISTRATION_DISABLED_MESSAGE =
  'Public registration is disabled. Ask an administrator to provision your account in Supabase.'

/**
 * Defensive guard used by authentication screens. It makes the disabled
 * registration policy explicit and fails closed if the flag is ever changed
 * without adding a supported provisioning flow.
 */
export function assertPublicRegistrationDisabled(): void {
  if (PUBLIC_REGISTRATION_ENABLED) {
    throw new Error(PUBLIC_REGISTRATION_DISABLED_MESSAGE)
  }
}

export interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.')
  }
  return context
}
