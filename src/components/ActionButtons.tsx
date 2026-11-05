import {
  CheckCircle2,
  Clock3,
  MessageSquareWarning,
  Play,
  RotateCcw,
  Send,
} from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { getAvailableTransitions } from '../lib/status'
import type { Profile, Task, TransitionOption } from '../lib/types'
import { cn } from '../lib/utils'
import { Button, type ButtonVariant } from './Button'

interface ActionButtonsProps {
  task: Task
  profile: Profile | null
  onTransition: (option: TransitionOption) => void
  busy?: boolean
  className?: string
}

function iconFor(option: TransitionOption) {
  if (option.to === 'accepted') return <CheckCircle2 size={15} />
  if (option.to === 'revision_requested') return <MessageSquareWarning size={15} />
  if (option.to === 'under_review') return <Send size={15} />
  if (option.to === 'in_progress' && option.labelKey === 'action.resume') {
    return <RotateCcw size={15} />
  }
  return <Play size={15} />
}

function variantFor(option: TransitionOption): ButtonVariant {
  if (option.tone === 'success') return 'success'
  if (option.tone === 'danger') return 'danger-outline'
  if (option.tone === 'accent') return 'accent'
  return 'primary'
}

export function ActionButtons({
  task,
  profile,
  onTransition,
  busy = false,
  className,
}: ActionButtonsProps) {
  const { t } = useLanguage()
  const options = getAvailableTransitions(task, profile)

  if (options.length === 0) {
    const isAccepted = task.status === 'accepted'
    const isWorker = profile?.role === 'worker'
    const isManager = profile?.role === 'manager'
    const waitingForWorker =
      isManager && !isAccepted && !['under_review', 'accepted'].includes(task.status)

    const title = isAccepted
      ? t('action.acceptedTitle')
      : task.status === 'under_review' && isWorker
        ? t('action.waitingReview')
        : waitingForWorker
          ? t('action.waitingTeam')
          : t('action.noActions')

    const body = isAccepted
      ? t('action.acceptedBody')
      : task.status === 'under_review'
        ? t('action.waitingReviewBody')
        : waitingForWorker
          ? t('action.waitingTeamBody')
          : t('action.noActionsBody')

    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border border-line bg-canvas/55 px-4 py-3.5',
          className,
        )}
      >
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full',
            isAccepted ? 'bg-moss-soft text-moss' : 'bg-canvas-deep text-muted',
          )}
        >
          {isAccepted ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
        </span>
        <div>
          <p className="text-xs font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">{body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end', className)}>
      {options.map((option) => (
        <Button
          key={option.to}
          variant={variantFor(option)}
          icon={iconFor(option)}
          onClick={() => onTransition(option)}
          disabled={busy}
          loading={busy}
          className="w-full sm:w-auto"
        >
          {t(option.labelKey)}
        </Button>
      ))}
    </div>
  )
}
