import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  LogOut,
  ShieldCheck,
  HardHat,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useLanguage } from '../i18n/language-context'
import { cn } from '../lib/utils'
import { Avatar } from './Avatar'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Logo } from './Logo'
import { useToast } from './toast-context'

export function Navbar() {
  const { profile, signOut, isDemo } = useAuth()
  const { t, path, errorText } = useLanguage()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  if (!profile) return null

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate(path('/login'), { replace: true })
    } catch (caught) {
      toast({
        tone: 'error',
        title: t('errors.signOut'),
        description: errorText(caught, 'errors.signOut'),
      })
    } finally {
      setSigningOut(false)
    }
  }

  const links = [
    { to: path('/'), label: t('nav.objects'), icon: Building2, end: true },
    ...(profile.role === 'worker'
      ? [{ to: path('/my-tasks'), label: t('nav.myTasks'), icon: ClipboardList, end: false }]
      : []),
  ]

  const RoleIcon = profile.role === 'manager' ? ShieldCheck : HardHat
  const roleLabel = profile.role === 'manager' ? t('roles.manager') : t('roles.worker')

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink to={path('/')} className="shrink-0" aria-label={t('brand.home')}>
            <Logo />
          </NavLink>

          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label={t('nav.primary')}>
            {links.map((link) => {
              const Icon = link.icon
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-xs font-semibold transition',
                      isActive
                        ? 'bg-ink text-canvas shadow-sm'
                        : 'text-muted hover:bg-ink/[0.055] hover:text-ink',
                    )
                  }
                >
                  <Icon size={15} strokeWidth={2.1} />
                  {link.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {isDemo ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-line-strong/70 bg-surface px-2.5 py-1 font-mono text-[9px] font-medium tracking-[0.12em] text-muted uppercase lg:inline-flex">
                <Sparkles size={11} className="text-accent" />
                {t('nav.demo')}
              </span>
            ) : null}

            <LanguageSwitcher />

            <div className="hidden h-8 w-px bg-line sm:block" />

            <div className="flex items-center gap-2.5">
              <Avatar name={profile.full_name} seed={profile.id} size="sm" />
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[150px] truncate text-xs font-semibold text-ink">
                  {profile.full_name}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[9px] font-medium tracking-wide text-muted uppercase">
                  <RoleIcon size={10} />
                  {roleLabel}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="hidden size-9 place-items-center rounded-full text-muted transition hover:bg-ink/[0.055] hover:text-ink disabled:opacity-50 md:grid"
              title={t('nav.signOut')}
              aria-label={t('nav.signOut')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-canvas/95 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
        aria-label={t('nav.mobile')}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition',
                    isActive ? 'text-accent' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid h-7 w-11 place-items-center rounded-full transition',
                        isActive ? 'bg-accent-soft' : 'bg-transparent',
                      )}
                    >
                      <Icon size={17} strokeWidth={2.1} />
                    </span>
                    {link.label}
                  </>
                )}
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-muted"
          >
            <span className="grid h-7 w-11 place-items-center rounded-full">
              <LogOut size={17} strokeWidth={2.1} />
            </span>
            {t('nav.signOut')}
          </button>
        </div>
      </nav>
    </>
  )
}
