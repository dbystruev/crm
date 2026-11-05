import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isDemoMode } from '../lib/api'
import { DEMO_ACCOUNT_BY_KEY } from '../lib/demoAccounts'
import { demoSignIn, demoSignInAs, demoSignOut, getDemoProfile } from '../lib/demoApi'
import { requireSupabase, supabase } from '../lib/supabase'
import type { DemoAccountKey, Profile } from '../lib/types'
import { errorMessage } from '../lib/utils'
import { AuthContext, type AuthContextValue } from './auth-context'

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

async function fetchProfile(userId: string): Promise<Profile> {
  const client = requireSupabase()

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }
    if (data) {
      return data as Profile
    }
    if (attempt < 3) {
      await wait(350)
    }
  }

  throw new Error(
    'errors.authProfile',
  )
}

function friendlyAuthError(caught: unknown) {
  const message = errorMessage(caught)
  if (/invalid login credentials/i.test(message)) {
    return 'errors.authInvalidCredentials'
  }
  if (/email not confirmed/i.test(message)) {
    return 'errors.authEmailUnconfirmed'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return 'errors.authRateLimited'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(() =>
    isDemoMode ? getDemoProfile() : null,
  )
  const [loading, setLoading] = useState(() => !isDemoMode && Boolean(supabase))
  const [error, setError] = useState<string | null>(() =>
    !isDemoMode && !supabase ? 'errors.supabaseMissing' : null,
  )
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (isDemoMode) return

    const client = supabase
    if (!client) return

    let active = true

    const loadInitialSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await client.auth.getSession()

        if (sessionError) throw sessionError

        if (session?.user) {
          const loadedProfile = await fetchProfile(session.user.id)
          if (active) setProfile(loadedProfile)
        }
      } catch (caught) {
        if (active) setError(friendlyAuthError(caught))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInitialSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (active) {
          setProfile(null)
          setError(null)
          setLoading(false)
        }
        return
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void fetchProfile(session.user.id)
          .then((loadedProfile) => {
            if (active) {
              setProfile(loadedProfile)
              setError(null)
            }
          })
          .catch((caught: unknown) => {
            if (active) setError(friendlyAuthError(caught))
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)

    if (isDemoMode) {
      const loadedProfile = demoSignIn(email, password)
      setProfile(loadedProfile)
      return
    }

    const client = requireSupabase()
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      if (!data.user) throw new Error('errors.authMissingUser')

      const loadedProfile = await fetchProfile(data.user.id)
      if (mountedRef.current) setProfile(loadedProfile)
    } catch (caught) {
      const message = friendlyAuthError(caught)
      if (mountedRef.current) setError(message)
      throw new Error(message)
    }
  }, [])

  const signInAs = useCallback(async (key: DemoAccountKey) => {
    setError(null)
    const account = DEMO_ACCOUNT_BY_KEY[key]

    if (isDemoMode) {
      const loadedProfile = demoSignInAs(key)
      setProfile(loadedProfile)
      return
    }

    const client = requireSupabase()
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      })
      if (signInError) throw signInError
      if (!data.user) throw new Error('errors.authMissingUser')

      const loadedProfile = await fetchProfile(data.user.id)
      if (mountedRef.current) setProfile(loadedProfile)
    } catch (caught) {
      const message = friendlyAuthError(caught)
      if (mountedRef.current) setError(message)
      throw new Error(message)
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    if (isDemoMode) {
      demoSignOut()
      setProfile(null)
      return
    }

    const client = requireSupabase()
    const { error: signOutError } = await client.auth.signOut()
    if (signOutError) throw signOutError
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    setError(null)
    if (isDemoMode) {
      setProfile(getDemoProfile())
      return
    }

    const client = requireSupabase()
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser()

    if (userError) {
      const message = friendlyAuthError(userError)
      setError(message)
      throw new Error(message)
    }
    if (!user) {
      setProfile(null)
      return
    }

    try {
      const loadedProfile = await fetchProfile(user.id)
      setProfile(loadedProfile)
    } catch (caught) {
      const message = friendlyAuthError(caught)
      setError(message)
      throw new Error(message)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      loading,
      error,
      isDemo: isDemoMode,
      signIn,
      signInAs,
      signOut,
      refreshProfile,
    }),
    [profile, loading, error, signIn, signInAs, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
