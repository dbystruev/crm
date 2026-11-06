import { useEffect, useMemo, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  History,
  MessageSquareWarning,
  Pencil,
  Play,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import {
  localizedObjectName,
  localizedTaskDescription,
  localizedTaskTitle,
} from '../lib/localized'
import { latestRevisionComment } from '../lib/status'
import type {
  Task,
  TaskHistoryEntry,
  TaskStatus,
  TaskWithRelations,
  TransitionOption,
} from '../lib/types'
import { cn } from '../lib/utils'
import { ActionButtons } from './ActionButtons'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { InlineError } from './Feedback'
import { FormField } from './FormField'
import { textareaClass } from './form-styles'
import { HistoryTimeline } from './HistoryTimeline'
import { Modal } from './Modal'
import { StatusBadge } from './StatusBadge'
import { useToast } from './toast-context'

interface TaskModalProps {
  open: boolean
  task: TaskWithRelations | null
  object: { id: string; name: string; name_ru?: string | null } | null
  onClose: () => void
  onTaskUpdated: (task: Task) => void
  onTaskDeleted?: (taskId: string) => void
  onEdit?: (task: TaskWithRelations) => void
  variant?: 'modal' | 'page'
}

const statusIconStyles: Record<TaskStatus, { container: string; Icon: typeof CircleDot }> = {
  new: { container: 'bg-canvas-deep text-ink-soft', Icon: CircleDot },
  in_progress: { container: 'bg-blue-soft text-blue', Icon: Play },
  under_review: { container: 'bg-amber-soft text-amber', Icon: Clock3 },
  accepted: { container: 'bg-moss-soft text-moss', Icon: CheckCircle2 },
  revision_requested: { container: 'bg-danger-soft text-danger', Icon: MessageSquareWarning },
}

const transitionIconStyles: Record<TransitionOption['tone'], string> = {
  neutral: 'bg-ink text-canvas',
  accent: 'bg-accent-soft text-accent-dark',
  success: 'bg-moss-soft text-moss',
  danger: 'bg-danger-soft text-danger',
}

type TaskSurfaceProps = ComponentProps<typeof Modal> & { page: boolean }

// Renders the exact same task card content either as the usual modal or as a
// standalone page card. The page variant gives the requirement-08 task card a
// real route while keeping task data, ActionButtons, and HistoryTimeline in one
// visible layout.
function TaskSurface({
  page,
  children,
  title,
  eyebrow,
  description,
  icon,
  bodyClassName,
  ...modalProps
}: TaskSurfaceProps) {
  if (!page) {
    return (
      <Modal
        {...modalProps}
        title={title}
        eyebrow={eyebrow}
        description={description}
        icon={icon}
        bodyClassName={bodyClassName}
      >
        {children}
      </Modal>
    )
  }

  return (
    <section className="rounded-card border border-line/80 bg-paper p-5 shadow-card sm:p-7">
      <div className="flex items-start gap-4">
        {icon}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="font-mono text-[8.5px] font-medium tracking-[0.14em] text-muted uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 font-display text-2xl leading-tight font-semibold tracking-[-0.03em] text-ink text-balance sm:text-3xl">
            {title}
          </h1>
          {description ? <div className="mt-2.5">{description}</div> : null}
        </div>
      </div>
      <div className={cn('mt-5', bodyClassName ?? 'space-y-5')}>{children}</div>
    </section>
  )
}

export function TaskModal({
  open,
  task,
  object,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onEdit,
  variant = 'modal',
}: TaskModalProps) {
  const { profile } = useAuth()
  const { t, path, errorText, dueDateInfo, formatDate, formatDateTime, language } = useLanguage()
  const { toast } = useToast()

  const [currentTask, setCurrentTask] = useState<TaskWithRelations | null>(task)
  const [history, setHistory] = useState<TaskHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [selectedTransition, setSelectedTransition] = useState<TransitionOption | null>(null)
  const [comment, setComment] = useState('')
  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [deletingTask, setDeletingTask] = useState(false)

  const taskId = task?.id

  useEffect(() => {
    if (!open || !task) return

    let active = true
    setCurrentTask(task)
    setHistory([])
    setHistoryLoading(true)
    setHistoryError(null)
    setSelectedTransition(null)
    setComment('')
    setTransitionError(null)

    void crm
      .listTaskHistory(task.id)
      .then((entries) => {
        if (active) setHistory(entries)
      })
      .catch((caught: unknown) => {
        if (active) setHistoryError(errorText(caught, 'task.historyLoadError'))
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })

    return () => {
      active = false
    }
    // We only reset when a different task opens. Status changes are merged into local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId])

  const revisionEntry = useMemo(() => {
    if (!currentTask || currentTask.status !== 'revision_requested') return null
    const latestComment = latestRevisionComment(history)
    if (!latestComment) return null
    return [...history]
      .reverse()
      .find((entry) => entry.to_status === 'revision_requested' && entry.comment)
  }, [history, currentTask])

  if (!task || !currentTask) return null

  const taskObject = object ?? currentTask.object ?? null
  const taskTitle = localizedTaskTitle(currentTask, language)
  const taskDescription = localizedTaskDescription(currentTask, language)
  const taskObjectName = taskObject ? localizedObjectName(taskObject, language) : null
  const due = dueDateInfo(currentTask.due_date, currentTask.status === 'accepted')
  const statusVisual = statusIconStyles[currentTask.status]
  const StatusIcon = statusVisual.Icon
  const isManager = profile?.role === 'manager'
  const canEdit = isManager && Boolean(onEdit)
  const roleLabel = profile
    ? profile.role === 'manager'
      ? t('roles.manager')
      : t('roles.worker')
    : t('common.viewer')

  const handleDeleteTask = async () => {
    if (!isManager || deletingTask) return
    if (!window.confirm(t('task.deleteConfirm', { title: taskTitle }))) return

    setDeletingTask(true)
    try {
      await crm.deleteTask(currentTask.id)
      toast({
        tone: 'success',
        title: t('task.toast.deleted'),
        description: t('task.toast.deletedBody', { title: taskTitle }),
      })
      onTaskDeleted?.(currentTask.id)
      onClose()
    } catch (caught) {
      toast({
        tone: 'error',
        title: t('task.deleteError'),
        description: errorText(caught, 'errors.deleteTask'),
      })
    } finally {
      setDeletingTask(false)
    }
  }

  const handleTransitionSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTransition) return

    const cleanComment = comment.trim()
    if (selectedTransition.requiresComment && !cleanComment) {
      setTransitionError(t('task.revisionCommentRequired'))
      return
    }

    setTransitioning(true)
    setTransitionError(null)

    try {
      const updated = await crm.transitionTask(
        currentTask.id,
        selectedTransition.to,
        cleanComment,
      )
      const merged = { ...currentTask, ...updated }
      setCurrentTask(merged)
      setSelectedTransition(null)
      setComment('')
      onTaskUpdated(updated)

      const toastTitle =
        selectedTransition.to === 'accepted'
          ? t('task.toast.acceptedTitle')
          : selectedTransition.to === 'revision_requested'
            ? t('task.toast.revisionTitle')
            : selectedTransition.to === 'under_review'
              ? t('task.toast.reviewTitle')
              : t('task.toast.progressTitle')

      toast({
        tone:
          selectedTransition.to === 'revision_requested'
            ? 'info'
            : selectedTransition.to === 'accepted'
              ? 'success'
              : 'info',
        title: toastTitle,
        description:
          selectedTransition.to === 'revision_requested'
            ? t('task.toast.revisionBody')
            : t('task.toast.defaultBody'),
      })

      try {
        const entries = await crm.listTaskHistory(currentTask.id)
        setHistory(entries)
        setHistoryError(null)
      } catch (caught) {
        setHistoryError(errorText(caught, 'task.historyRefreshError'))
      }
    } catch (caught) {
      setTransitionError(errorText(caught, 'task.transitionError'))
    } finally {
      setTransitioning(false)
    }
  }

  const closeTransition = () => {
    if (transitioning) return
    setSelectedTransition(null)
    setComment('')
    setTransitionError(null)
  }

  const TransitionIcon = selectedTransition
    ? selectedTransition.to === 'accepted'
      ? CheckCircle2
      : selectedTransition.to === 'revision_requested'
        ? MessageSquareWarning
        : selectedTransition.to === 'under_review'
          ? Clock3
          : selectedTransition.labelKey === 'action.resume'
            ? History
            : Play
    : Play

  return (
    <>
      <TaskSurface
        page={variant === 'page'}
        open={open}
        onClose={() => {
          if (!transitioning) onClose()
        }}
        size="lg"
        closeOnEscape={!selectedTransition}
        eyebrow={taskObjectName ? t('task.eyebrow', { name: taskObjectName }) : t('task.details')}
        title={taskTitle}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={currentTask.status} size="md" />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold',
                due.tone === 'overdue'
                  ? 'text-danger'
                  : due.tone === 'today' || due.tone === 'soon'
                    ? 'text-amber'
                    : 'text-muted',
              )}
            >
              <CalendarDays size={11} />
              {due.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[9px] text-muted">
              {t('task.entries', { count: history.length })}
            </span>
          </div>
        }
        icon={
          <span className={cn('grid size-11 place-items-center rounded-2xl', statusVisual.container)}>
            <StatusIcon size={20} />
          </span>
        }
        bodyClassName="space-y-5"
      >
        {revisionEntry ? (
          <div className="rounded-2xl border border-danger/20 bg-danger-soft/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-danger shadow-sm">
                <MessageSquareWarning size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-xs font-bold tracking-wide text-danger uppercase">
                    {t('task.revisionRequested')}
                  </p>
                  <span className="font-mono text-[9px] text-muted">
                    {formatDateTime(revisionEntry.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-ink-soft">{revisionEntry.comment}</p>
                <p className="mt-1.5 text-[10px] text-muted">
                  {revisionEntry.actor?.full_name ?? t('task.managerFallback')} ·{' '}
                  {t('task.reviewNote')}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MetaCard label={t('task.assignee')} icon={<UserRound size={12} />}>
            <div className="flex min-w-0 items-center gap-1.5">
              {currentTask.assignee ? (
                <>
                  <Avatar
                    name={currentTask.assignee.full_name}
                    seed={currentTask.assignee.id}
                    size="xs"
                  />
                  <span className="truncate text-xs font-semibold text-ink">
                    {currentTask.assignee.full_name}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted">{t('object.taskUnassigned')}</span>
              )}
            </div>
          </MetaCard>

          <MetaCard label={t('task.dueDate')} icon={<CalendarDays size={12} />}>
            <p
              className={cn(
                'text-xs font-semibold',
                due.tone === 'overdue'
                  ? 'text-danger'
                  : due.tone === 'today' || due.tone === 'soon'
                    ? 'text-amber'
                    : 'text-ink',
              )}
            >
              {due.label}
            </p>
          </MetaCard>

          <MetaCard label={t('task.created')} icon={<CircleDot size={12} />}>
            <p className="text-xs font-semibold text-ink">{formatDate(currentTask.created_at)}</p>
          </MetaCard>

          <MetaCard label={t('task.lastUpdate')} icon={<Clock3 size={12} />}>
            <p className="text-xs font-semibold text-ink">
              {formatDateTime(currentTask.updated_at)}
            </p>
          </MetaCard>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-display text-sm font-semibold tracking-[-0.01em] text-ink">
              {t('task.brief')}
            </h3>
            <div className="flex items-center gap-1">
              {variant === 'modal' ? (
                <Link
                  to={path(`/tasks/${currentTask.id}`)}
                  className="mr-1 hidden text-[11px] font-semibold text-accent-dark hover:underline sm:inline"
                >
                  {t('task.openFullCard')}
                </Link>
              ) : null}
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil size={13} />}
                  onClick={() => onEdit?.(currentTask)}
                  className="-mr-1.5 h-7 px-2 text-[11px]"
                >
                  {t('task.editDetails')}
                </Button>
              ) : null}
              {isManager ? (
                <Button
                  variant="danger-outline"
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    void handleDeleteTask()
                  }}
                  loading={deletingTask}
                  className="h-7 px-2 text-[11px]"
                >
                  {t('task.delete')}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-line/80 bg-surface px-4 py-3.5">
            <p className="text-sm leading-6 whitespace-pre-line text-ink-soft">
              {taskDescription || t('task.noBrief')}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-canvas/45 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold tracking-[-0.01em] text-ink">
                {t('task.nextStep')}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted">{t('task.actionsHint')}</p>
            </div>
            <span className="font-mono text-[8.5px] tracking-[0.12em] text-faint uppercase">
              {roleLabel}
            </span>
          </div>
          <ActionButtons
            task={currentTask}
            profile={profile}
            onTransition={(option) => {
              setSelectedTransition(option)
              setComment('')
              setTransitionError(null)
            }}
            busy={transitioning}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold tracking-[-0.01em] text-ink">
              <History size={14} className="text-muted" />
              {t('task.statusHistory')}
            </h3>
            <span className="font-mono text-[8.5px] tracking-[0.12em] text-faint uppercase">
              {t('task.newestFirst')}
            </span>
          </div>
          <HistoryTimeline entries={history} loading={historyLoading} error={historyError} />
        </section>
      </TaskSurface>

      <Modal
        open={Boolean(selectedTransition)}
        onClose={closeTransition}
        layer="top"
        size="sm"
        eyebrow={t('task.statusChange')}
        title={selectedTransition ? t(selectedTransition.titleKey) : undefined}
        description={selectedTransition ? t(selectedTransition.bodyKey) : undefined}
        icon={
          <span
            className={cn(
              'grid size-11 place-items-center rounded-2xl',
              selectedTransition ? transitionIconStyles[selectedTransition.tone] : 'bg-ink text-canvas',
            )}
          >
            <TransitionIcon size={20} />
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeTransition} disabled={transitioning}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="transition-form"
              variant={
                selectedTransition?.tone === 'success'
                  ? 'success'
                  : selectedTransition?.tone === 'danger'
                    ? 'danger'
                    : selectedTransition?.tone === 'accent'
                      ? 'accent'
                      : 'primary'
              }
              loading={transitioning}
            >
              {selectedTransition ? t(selectedTransition.confirmKey) : t('common.confirm')}
            </Button>
          </>
        }
      >
        <form id="transition-form" onSubmit={handleTransitionSubmit} className="space-y-3">
          {transitionError ? <InlineError>{transitionError}</InlineError> : null}
          <FormField
            label={
              selectedTransition?.requiresComment
                ? t('task.revisionComment')
                : t('common.note')
            }
            htmlFor="transition-comment"
            required={selectedTransition?.requiresComment}
            hint={
              selectedTransition?.requiresComment
                ? t('task.revisionHint')
                : t('task.noteHint')
            }
            labelExtra={
              <span className="font-mono text-[9px] text-faint">{comment.length}/1200</span>
            }
          >
            <textarea
              id="transition-comment"
              data-autofocus
              className={textareaClass}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value)
                if (transitionError) setTransitionError(null)
              }}
              rows={4}
              maxLength={1200}
              placeholder={
                selectedTransition?.requiresComment
                  ? t('task.revisionPlaceholder')
                  : t('task.notePlaceholder')
              }
            />
          </FormField>
        </form>
      </Modal>
    </>
  )
}

function MetaCard({
  label,
  icon,
  children,
}: {
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line/80 bg-surface px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1 font-mono text-[8.5px] font-medium tracking-[0.1em] text-faint uppercase">
        {icon}
        {label}
      </p>
      {children}
    </div>
  )
}
