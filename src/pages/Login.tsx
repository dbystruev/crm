import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { assertPublicRegistrationDisabled, useAuth } from '../context/auth-context'
import { useLanguage } from '../i18n/language-context'
import { cn } from '../lib/utils'
import { Button } from '../components/Button'
import { InlineError, LoadingScreen } from '../components/Feedback'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'

const CURRENT_YEAR = new Date().getFullYear()

// REQUIREMENT 15: Public registration is blocked by the prevent_public_signup trigger on auth.users. Test users are created manually in Supabase.
export const PUBLIC_REGISTRATION_POLICY = "Открытая регистрация отключена на уровне базы данных (триггер prevent_public_signup). Тестовых пользователей можно создать вручную в Supabase."

// This screen intentionally provides credential sign-in only. Public
// registration is disabled: there is no sign-up form and no client call to a
// public registration API. Administrators provision accounts manually in
// Supabase. The guard below keeps that policy explicit and fails closed.
function enforceRegistrationPolicy() {
  assertPublicRegistrationDisabled()
}

function FlowNode({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'accent' | 'success'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold whitespace-nowrap',
        tone === 'accent'
          ? 'border-accent/30 bg-accent/15 text-orange-200'
          : tone === 'success'
            ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
            : 'border-white/12 bg-white/[0.045] text-canvas/70',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'accent' ? 'bg-accent' : tone === 'success' ? 'bg-emerald-400' : 'bg-canvas/35',
        )}
      />
      {label}
    </span>
  )
}

export function LoginPage() {
  enforceRegistrationPolicy()
  const { profile, loading, isDemo, signIn } = useAuth()
  const { t, path, errorText } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestedPath = (location.state as { from?: string } | null)?.from
  const targetPath =
    requestedPath && !/^\/(?:en|ru)?\/?login\/?$/.test(requestedPath) ? requestedPath : path('/')

  if (loading) {
    return <LoadingScreen label={t('login.checkingSession')} />
  }

  if (profile) {
    return <Navigate to={targetPath} replace />
  }

  const handleEmailSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(targetPath, { replace: true })
    } catch (caught) {
      setError(errorText(caught, 'login.error.signIn'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]"
      data-registration-policy={PUBLIC_REGISTRATION_POLICY}
    >
      <aside className="bg-blueprint relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-ink p-10 lg:sticky lg:top-0 lg:flex lg:h-dvh xl:p-14">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[30rem] rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[34rem] rounded-full bg-blue/20 blur-3xl" />

        <div className="relative flex items-center justify-between gap-4">
          <Logo tone="dark" />
          <LanguageSwitcher tone="dark" />
        </div>

        <div className="relative max-w-xl py-12">
          <p className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
            <span className="h-px w-8 bg-accent" />
            {t('login.hero.eyebrow')}
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] font-semibold tracking-[-0.045em] text-canvas text-balance xl:text-[4.4rem]">
            {t('login.hero.line1')}
            <br />
            {t('login.hero.line2')}
            <br />
            <span className="text-accent">{t('login.hero.line3')}</span>
          </h1>
          <p className="mt-7 max-w-md text-sm leading-7 text-canvas/55">{t('login.hero.body')}</p>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.16em] text-canvas/45 uppercase">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t('login.hero.liveWorkflow')}
              </span>
              <span className="font-mono text-[8.5px] tracking-[0.12em] text-canvas/30 uppercase">
                {t('login.hero.databaseEnforced')}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <FlowNode label={t('login.hero.new')} />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label={t('login.hero.inProgress')} />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label={t('login.hero.review')} tone="accent" />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label={t('login.hero.accepted')} tone="success" />
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-white/8 pt-3">
              <RotateCcw size={11} className="text-canvas/35" />
              <span className="text-[10px] text-canvas/40">
                {t('login.hero.revisionNote')}
                <span className="mx-1.5 text-canvas/20">→</span>
                {t('login.hero.revisionFlow')}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[8.5px] font-medium tracking-[0.14em] text-canvas/30 uppercase">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={11} /> {t('login.hero.roles')}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={11} /> {t('login.hero.statuses')}
          </span>
          <span className="flex items-center gap-1.5">
            <RotateCcw size={11} /> {t('login.hero.audit')}
          </span>
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col overflow-hidden">
        <div className="bg-blueprint-light pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute top-24 -right-32 size-[26rem] rounded-full bg-accent/8 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Logo />
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[8px] font-medium tracking-[0.1em] text-muted uppercase">
                <span className={cn('size-1.5 rounded-full', isDemo ? 'bg-amber' : 'bg-moss')} />
                {isDemo ? t('login.hero.localDemo') : t('login.hero.live')}
              </span>
            </div>
          </div>

          <div className="mb-7">
            <div className="mb-3 hidden items-center gap-2 lg:flex">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[8.5px] font-medium tracking-[0.12em] uppercase',
                  isDemo
                    ? 'border-amber/20 bg-amber-soft text-amber'
                    : 'border-moss/15 bg-moss-soft text-moss',
                )}
              >
                <span className={cn('size-1.5 rounded-full', isDemo ? 'bg-amber' : 'bg-moss')} />
                {isDemo ? t('login.hero.localDemoWorkspace') : t('login.hero.connectedSupabase')}
              </span>
            </div>

            <h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.035em] text-ink text-balance sm:text-4xl">
              {t('login.title')}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">{t('login.subtitle')}</p>
          </div>

          <div className="rounded-[1.75rem] border border-white/80 bg-paper/90 p-5 shadow-card backdrop-blur-sm sm:p-7">
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              {error ? <InlineError>{error}</InlineError> : null}

              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-ink">
                  {t('login.email')}
                </label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
                  />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pr-3.5 pl-10 text-sm text-ink transition placeholder:text-faint focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-semibold text-ink">
                    {t('login.password')}
                  </label>
                  <span className="font-mono text-[8px] tracking-[0.1em] text-faint uppercase">
                    {t('login.adminManaged')}
                  </span>
                </div>
                <div className="relative">
                  <LockKeyhole
                    size={15}
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('login.passwordPlaceholder')}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pr-11 pl-10 text-sm text-ink transition placeholder:text-faint focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-faint transition hover:bg-canvas hover:text-ink"
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                size="lg"
                loading={submitting}
                className="w-full"
                iconRight={<ArrowRight size={15} />}
              >
                {t('login.signIn')}
              </Button>
            </form>

            <div className="mt-5 flex items-start gap-2 border-t border-line/80 pt-4">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-moss" />
              <p className="text-[10px] leading-4 text-muted">
                {isDemo ? t('login.demoFooter') : t('login.liveFooter')}
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] text-faint">{t('login.noSignup')}</p>
        </div>

        <div className="relative mx-auto flex w-full max-w-lg items-center justify-between px-4 py-5 text-[9px] text-faint sm:px-8">
          <span>© {CURRENT_YEAR} {t('brand.name')}</span>
          <span className="font-mono tracking-[0.12em] uppercase">{t('login.builtForField')}</span>
        </div>
      </main>
    </div>
  )
}
