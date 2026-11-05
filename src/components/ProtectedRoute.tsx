import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useLanguage } from '../i18n/language-context'
import { Button } from './Button'
import { EmptyState, LoadingScreen } from './Feedback'
import { Logo } from './Logo'
import { useToast } from './toast-context'

export function ProtectedRoute() {
  const { profile, loading, error, refreshProfile, signOut } = useAuth()
  const { t, path, errorText } = useLanguage()
  const location = useLocation()
  const { toast } = useToast()
  const [retrying, setRetrying] = useState(false)

  if (loading) {
    return <LoadingScreen label={t('protected.loading')} />
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
            title={t('protected.errorTitle')}
            description={t('protected.errorBody')}
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
                        toast({
                          tone: 'error',
                          title: t('protected.stillUnavailable'),
                          description: errorText(caught, 'protected.errorFallback'),
                        })
                      })
                      .finally(() => setRetrying(false))
                  }}
                >
                  {t('common.tryAgain')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void signOut()
                  }}
                >
                  {t('common.signOut')}
                </Button>
              </div>
            }
            className="border-line bg-paper shadow-card"
          />
          <p className="mt-4 text-center text-xs leading-5 text-muted">
            {errorText(error, 'protected.errorFallback')}
          </p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to={path('/login')} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
