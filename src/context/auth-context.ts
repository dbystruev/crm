import { createContext, useContext } from 'react'
import type { Profile } from '../lib/types'

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
