import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLanguage } from '../i18n/language-context'
import { cn } from '../lib/utils'
import { Button } from './Button'
import { Logo } from './Logo'

export function Spinner({ className, size = 18 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} />
}

export function LoadingScreen({ label }: { label?: string }) {
  const { t } = useLanguage()

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas">
      <div className="bg-blueprint-light pointer-events-none absolute inset-0 opacity-60" />
      <div className="absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-accent/5 blur-3xl" />
      <div className="relative flex flex-col items-center gap-7">
        <Logo />
        <div className="flex items-center gap-2.5 text-xs font-medium text-muted">
          <Spinner size={14} className="text-accent" />
          {label ?? t('common.loading')}
        </div>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="grid size-14 place-items-center rounded-2xl bg-canvas-deep text-muted">{icon}</div>
      <h3 className="mt-5 font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

interface ErrorPanelProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorPanel({
  title,
  message,
  onRetry,
  className,
}: ErrorPanelProps) {
  const { t } = useLanguage()

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-card border border-danger/15 bg-danger-soft/55 p-5 sm:flex-row sm:items-center sm:p-6',
        className,
      )}
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-paper text-danger shadow-sm">
        <AlertTriangle size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title ?? t('feedback.couldNotLoad')}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={onRetry}>
          {t('feedback.tryAgain')}
        </Button>
      ) : null}
    </div>
  )
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-danger/15 bg-danger-soft/60 px-3.5 py-3 text-xs leading-5 text-danger"
      role="alert"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-canvas-deep/80', className)} />
}
