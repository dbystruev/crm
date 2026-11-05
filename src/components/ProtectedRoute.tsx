import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { errorMessage } from '../lib/utils'
import { Button } from './Button'
import { EmptyState, LoadingScreen } from './Feedback'
import { Logo } from './Logo'
import { useToast } from './toast-context'

export function ProtectedRoute() {
  const { profile, loading, error, refreshProfile, signOut } = useAuth()
  const location = useLocation()
  const { toast } = useToast()
  const [retrying, setRetrying] = useState(false)

  if (loading) {
    return <LoadingScreen label="Opening your workspace…" />
  }

  if (!profile && error) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-4">
        <div className="bg-blueprint-light pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative w-full max-w-lg">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <EmptyState
            icon={<LogOut size={22} />}
            title="We could not open your workspace"
            description="Your session is active, but the account profile could not be loaded. Try again, or sign out and use a different account."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  icon={<RotateCcw size={15} />}
                  loading={retrying}
                  onClick={() => {
                    setRetrying(true)
                    void refreshProfile()
                      .catch((caught: unknown) => {
                        toast({ tone: 'error', title: 'Still unavailable', description: errorMessage(caught) })
                      })
                      .finally(() => setRetrying(false))
                  }}
                >
                  Try again
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void signOut()
                  }}
                >
                  Sign out
                </Button>
              </div>
            }
            className="border-line bg-paper shadow-card"
          />
          <p className="mt-4 text-center text-xs leading-5 text-muted">{error}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
