import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  HardHat,
  LockKeyhole,
  Mail,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { DEMO_ACCOUNTS, SHOW_DEMO_LOGIN } from '../lib/demoAccounts'
import type { DemoAccount, DemoAccountKey } from '../lib/types'
import { cn, errorMessage } from '../lib/utils'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { InlineError, LoadingScreen, Spinner } from '../components/Feedback'
import { Logo } from '../components/Logo'

const CURRENT_YEAR = new Date().getFullYear()

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

function QuickAccountButton({
  account,
  pending,
  disabled,
  onClick,
  variant,
}: {
  account: DemoAccount
  pending: boolean
  disabled: boolean
  onClick: () => void
  variant: 'manager' | 'worker'
}) {
  const isManager = variant === 'manager'
  const RoleIcon = isManager ? ShieldCheck : HardHat

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition duration-200 disabled:cursor-wait disabled:opacity-70',
        isManager
          ? 'border-ink bg-ink text-canvas shadow-sm hover:-translate-y-0.5 hover:shadow-lift'
          : 'border-line-strong/80 bg-paper text-ink hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-card',
      )}
    >
      <Avatar
        name={account.name}
        seed={account.email}
        size={isManager ? 'lg' : 'md'}
        className={isManager ? 'ring-ink' : 'ring-paper'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-xs font-bold', isManager ? 'text-canvas' : 'text-ink')}>
            {account.label}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[7.5px] font-medium tracking-[0.08em] uppercase',
              isManager ? 'bg-white/10 text-canvas/55' : 'bg-canvas-deep/70 text-muted',
            )}
          >
            <RoleIcon size={8} />
            {account.role}
          </span>
        </div>
        <p className={cn('mt-0.5 text-[11px]', isManager ? 'text-canvas/65' : 'text-muted')}>
          {account.name}
          <span className={isManager ? 'text-canvas/35' : 'text-faint'}>
            {' '}
            · {account.blurb}
          </span>
        </p>
      </div>
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full transition',
          isManager
            ? 'bg-white/10 text-canvas group-hover:bg-accent group-hover:text-white'
            : 'bg-canvas text-muted group-hover:bg-accent group-hover:text-white',
        )}
      >
        {pending ? (
          <Spinner size={14} />
        ) : isManager ? (
          <ArrowRight size={15} />
        ) : (
          <ArrowUpRight size={15} />
        )}
      </span>
    </button>
  )
}

export function LoginPage() {
  const { profile, loading, isDemo, signIn, signInAs } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingAccount, setPendingAccount] = useState<DemoAccountKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const targetPath =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== '/login'
      ? ((location.state as { from?: string }).from as string)
      : '/'

  if (loading) {
    return <LoadingScreen label="Checking your session…" />
  }

  if (profile) {
    return <Navigate to={targetPath} replace />
  }

  const showQuickLogin = isDemo || SHOW_DEMO_LOGIN
  const busy = submitting || pendingAccount !== null

  const handleQuickLogin = async (account: DemoAccount) => {
    setError(null)
    setPendingAccount(account.key)
    try {
      await signInAs(account.key)
      navigate(targetPath, { replace: true })
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in with the demo account.'))
    } finally {
      setPendingAccount(null)
    }
  }

  const handleEmailSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(targetPath, { replace: true })
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in.'))
    } finally {
      setSubmitting(false)
    }
  }

  const managerAccount = DEMO_ACCOUNTS.find((account) => account.key === 'manager')!
  const workerAccounts = DEMO_ACCOUNTS.filter((account) => account.key !== 'manager')

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-blueprint relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-ink p-10 lg:sticky lg:top-0 lg:flex lg:h-dvh xl:p-14">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[30rem] rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[34rem] rounded-full bg-blue/20 blur-3xl" />

        <div className="relative">
          <Logo tone="dark" />
        </div>

        <div className="relative max-w-xl py-12">
          <p className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.22em] text-accent uppercase">
            <span className="h-px w-8 bg-accent" />
            Construction operations
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] font-semibold tracking-[-0.045em] text-canvas text-balance xl:text-[4.4rem]">
            Every site.
            <br />
            Every task.
            <br />
            <span className="text-accent">One clear view.</span>
          </h1>
          <p className="mt-7 max-w-md text-sm leading-7 text-canvas/55">
            A focused workspace for construction teams. Managers keep the portfolio moving, workers
            know exactly what is next, and every handover leaves a permanent trail.
          </p>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.16em] text-canvas/45 uppercase">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                Live workflow
              </span>
              <span className="font-mono text-[8.5px] tracking-[0.12em] text-canvas/30 uppercase">
                Database-enforced
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <FlowNode label="New" />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label="In progress" />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label="Review" tone="accent" />
              <ArrowRight size={11} className="text-canvas/25" />
              <FlowNode label="Accepted" tone="success" />
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-white/8 pt-3">
              <RotateCcw size={11} className="text-canvas/35" />
              <span className="text-[10px] text-canvas/40">
                Revision requested
                <span className="mx-1.5 text-canvas/20">→</span>
                back to In progress, with a mandatory note
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[8.5px] font-medium tracking-[0.14em] text-canvas/30 uppercase">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={11} /> 2 roles
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={11} /> 5 statuses
          </span>
          <span className="flex items-center gap-1.5">
            <RotateCcw size={11} /> Immutable audit trail
          </span>
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col overflow-hidden">
        <div className="bg-blueprint-light pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute top-24 -right-32 size-[26rem] rounded-full bg-accent/8 blur-3xl" />

        <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Logo />
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[8px] font-medium tracking-[0.1em] text-muted uppercase">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isDemo ? 'bg-amber' : 'bg-moss',
                )}
              />
              {isDemo ? 'Local demo' : 'Live'}
            </span>
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
                {isDemo ? 'Local demo workspace' : 'Connected to Supabase'}
              </span>
            </div>

            <h2 className="font-display text-3xl leading-tight font-semibold tracking-[-0.035em] text-ink text-balance sm:text-4xl">
              Pick up where the build left off.
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Sign in to manage sites, move tasks through review, and keep the crew aligned.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/80 bg-paper/90 p-5 shadow-card backdrop-blur-sm sm:p-7">
            {showQuickLogin ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[9px] font-semibold tracking-[0.16em] text-muted uppercase">
                    One-click demo access
                  </p>
                  <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 font-mono text-[8px] font-medium tracking-[0.08em] text-accent-dark uppercase">
                    <Sparkles size={9} />
                    No password
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <QuickAccountButton
                    account={managerAccount}
                    pending={pendingAccount === 'manager'}
                    disabled={busy}
                    onClick={() => void handleQuickLogin(managerAccount)}
                    variant="manager"
                  />
                  <div className="space-y-2">
                    {workerAccounts.map((account) => (
                      <QuickAccountButton
                        key={account.key}
                        account={account}
                        pending={pendingAccount === account.key}
                        disabled={busy}
                        onClick={() => void handleQuickLogin(account)}
                        variant="worker"
                      />
                    ))}
                  </div>
                </div>

                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[8px] font-medium tracking-[0.14em] text-faint uppercase">
                    or sign in with email
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              </div>
            ) : null}

            <form onSubmit={handleEmailSignIn} className="space-y-4">
              {error ? <InlineError>{error}</InlineError> : null}

              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-ink">
                  Email address
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
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pr-3.5 pl-10 text-sm text-ink transition placeholder:text-faint focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-semibold text-ink">
                    Password
                  </label>
                  <span className="font-mono text-[8px] tracking-[0.1em] text-faint uppercase">
                    Admin-managed
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
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pr-11 pl-10 text-sm text-ink transition placeholder:text-faint focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute top-1/2 right-2.5 grid size-7 -translate-y-1/2 place-items-center rounded-full text-faint transition hover:bg-canvas hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                Sign in
              </Button>
            </form>

            <div className="mt-5 flex items-start gap-2 border-t border-line/80 pt-4">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-moss" />
              <p className="text-[10px] leading-4 text-muted">
                {isDemo
                  ? 'Local demo mode. Accounts and data live in this browser only. Add Supabase environment variables to connect a secure, shared workspace.'
                  : 'Access is protected by Supabase Auth. Data visibility and status rules are enforced by database row-level security and triggers.'}
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] text-faint">
            Accounts are provisioned by your administrator. There is no public sign-up.
          </p>
        </div>

        <div className="relative mx-auto flex w-full max-w-lg items-center justify-between px-4 py-5 text-[9px] text-faint sm:px-8">
          <span>© {CURRENT_YEAR} Objects &amp; Tasks</span>
          <span className="font-mono tracking-[0.12em] uppercase">Built for the field</span>
        </div>
      </main>
    </div>
  )
}
