import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  HardHat,
  MapPin,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useAsyncData } from '../hooks/useAsyncData'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import { localizedObjectName, localizedTaskTitle } from '../lib/localized'
import { sortTasksByPriority, STATUS_META, TASK_STATUSES } from '../lib/status'
import type { Task, TaskStatus, TaskWithRelations } from '../lib/types'
import { cn, progressPercent } from '../lib/utils'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { EmptyState, ErrorPanel, Skeleton } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { statusDotClass } from '../lib/status-styles'
import { TaskModal } from '../components/TaskModal'

// Requirement 09: «Мои задачи» is a worker-only screen. Managers are redirected
// away by the role guard below, and the queue itself comes from listMyTasks().
export const MY_TASKS_WORKER_ONLY = true

// Requirement 12: the worker queue is scoped to the signed-in assignee. The
// database policy and the API query both use assignee_id = auth.uid(); a worker
// can never request another worker's tasks from this screen.
export const MY_TASKS_ASSIGNEE_SCOPE = 'assignee_id = auth.uid()'

type TaskFilter = 'all' | TaskStatus

function StatCard({
  label,
  value,
  detail,
  icon,
  iconClass,
  danger = false,
}: {
  label: string
  value: number
  detail: string
  icon: ReactNode
  iconClass: string
  danger?: boolean
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-4 shadow-[0_1px_2px_rgba(23,26,24,0.03)]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[8.5px] font-medium tracking-[0.13em] text-muted uppercase">
          {label}
        </p>
        <span className={cn('grid size-7 place-items-center rounded-lg', iconClass)}>{icon}</span>
      </div>
      <p
        className={cn(
          'mt-3 font-display text-3xl leading-none font-semibold tracking-[-0.04em]',
          danger ? 'text-danger' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-muted">{detail}</p>
    </div>
  )
}

function TaskQueueRow({
  task,
  onOpen,
}: {
  task: TaskWithRelations
  onOpen: () => void
}) {
  const { t, dueDateInfo, language } = useLanguage()
  const due = dueDateInfo(task.due_date, task.status === 'accepted')
  const taskTitle = localizedTaskTitle(task, language)
  const objectName = task.object
    ? localizedObjectName(task.object, language)
    : t('myTasks.objectFallback')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 rounded-2xl border border-line/80 bg-paper p-3.5 text-left shadow-[0_1px_2px_rgba(23,26,24,0.025)] transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-card sm:gap-4 sm:p-4"
    >
      <span
        className={cn('mt-0.5 h-9 w-1 shrink-0 rounded-full opacity-80', statusDotClass(task.status))}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[8px] font-medium tracking-[0.1em] text-faint uppercase">
              <MapPin size={9} />
              <span className="truncate">{objectName}</span>
            </p>
            <h3 className="font-display text-sm leading-snug font-semibold tracking-[-0.01em] text-ink transition group-hover:text-accent-dark">
              {taskTitle}
            </h3>
          </div>
          <ChevronRight
            size={15}
            className="mt-0.5 hidden shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink sm:block"
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={task.status} />
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px]',
              due.tone === 'overdue'
                ? 'font-semibold text-danger'
                : due.tone === 'today' || due.tone === 'soon'
                  ? 'font-medium text-amber'
                  : 'text-muted',
            )}
          >
            <CalendarDays size={10} />
            {due.label}
          </span>
          {task.status === 'revision_requested' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-danger">
              <RotateCcw size={10} />
              {t('myTasks.managerNoteAvailable')}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export function MyTasksPage() {
  const { profile } = useAuth()
  const { t, path, dueDateInfo, getTodayLabel, greeting, errorText, language } = useLanguage()
  // listMyTasks() filters by assignee_id = auth.uid(); this queue is always the
  // signed-in worker's own work.
  const { data: tasks, loading, error, reload, setData } = useAsyncData(
    () => crm.listMyTasks(),
    [],
  )
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  if (!profile) return null
  if (!MY_TASKS_WORKER_ONLY || profile.role !== 'worker') {
    return <Navigate to={path('/')} replace />
  }

  const allTasks = tasks ?? []
  const selectedTask = selectedTaskId
    ? allTasks.find((task) => task.id === selectedTaskId) ?? null
    : null
  const accepted = allTasks.filter((task) => task.status === 'accepted').length
  const openTasks = allTasks.filter((task) => task.status !== 'accepted')
  const revisions = allTasks.filter((task) => task.status === 'revision_requested')
  const underReview = allTasks.filter((task) => task.status === 'under_review')
  const overdue = allTasks.filter(
    (task) => task.status !== 'accepted' && dueDateInfo(task.due_date).tone === 'overdue',
  )
  const percent = progressPercent(allTasks.length, accepted)

  const actionable = sortTasksByPriority(
    allTasks.filter((task) =>
      ['new', 'in_progress', 'revision_requested'].includes(task.status),
    ),
  )
  const focusTask = actionable[0] ?? sortTasksByPriority(underReview)[0] ?? null

  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'all', label: t('object.filterAll'), count: allTasks.length },
    ...TASK_STATUSES.map((status) => ({
      key: status,
      label: t(STATUS_META[status].labelKey),
      count: allTasks.filter((task) => task.status === status).length,
    })),
  ]

  const filteredTasks = sortTasksByPriority(
    filter === 'all' ? allTasks : allTasks.filter((task) => task.status === filter),
  )

  const handleTaskUpdated = (updated: Task) => {
    setData((current) =>
      current
        ? current.map((task) => (task.id === updated.id ? { ...task, ...updated } : task))
        : current,
    )
  }

  const focusDue = focusTask ? dueDateInfo(focusTask.due_date) : null
  const focusTitle = focusTask ? localizedTaskTitle(focusTask, language) : null
  const focusObjectName = focusTask?.object
    ? localizedObjectName(focusTask.object, language)
    : null
  const readyToWork = openTasks.length - revisions.length - underReview.length

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.16em] text-muted uppercase">
            <span className="size-1.5 rounded-full bg-accent" />
            {t('myTasks.eyebrow', { date: getTodayLabel() })}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
            {t('myTasks.title')}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {t('myTasks.subtitle', {
              greeting: greeting(),
              name: profile.full_name.split(/\s+/)[0],
            })}
          </p>
        </div>

        <div className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-surface px-3.5 py-2.5">
          <Avatar name={profile.full_name} seed={profile.id} size="md" />
          <div>
            <p className="text-xs font-semibold text-ink">{profile.full_name}</p>
            <p className="mt-0.5 flex items-center gap-1 font-mono text-[8px] tracking-[0.1em] text-muted uppercase">
              <HardHat size={9} />
              {t('myTasks.workerAssigned', { count: allTasks.length })}
            </p>
          </div>
          <span className="ml-2 rounded-full bg-moss-soft px-2 py-1 font-mono text-[8px] font-semibold text-moss">
            {t('myTasks.percentDone', { percent })}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="mt-7 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="rounded-2xl border border-line/80 bg-paper p-4">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-4 h-8 w-12" />
              <Skeleton className="mt-2 h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatCard
            label={t('myTasks.stats.open')}
            value={openTasks.length}
            detail={
              openTasks.length > 0
                ? t('myTasks.stats.openDetail', { count: readyToWork })
                : t('myTasks.stats.openDetailDone')
            }
            icon={<ClipboardList size={13} />}
            iconClass="bg-blue-soft text-blue"
          />
          <StatCard
            label={t('myTasks.stats.revisions')}
            value={revisions.length}
            detail={
              revisions.length > 0
                ? t('myTasks.stats.revisionsDetail')
                : t('myTasks.stats.revisionsNone')
            }
            icon={<RotateCcw size={13} />}
            iconClass="bg-danger-soft text-danger"
            danger={revisions.length > 0}
          />
          <StatCard
            label={t('myTasks.stats.review')}
            value={underReview.length}
            detail={t('myTasks.stats.reviewDetail')}
            icon={<Clock3 size={13} />}
            iconClass="bg-amber-soft text-amber"
          />
          <StatCard
            label={t('myTasks.stats.accepted')}
            value={accepted}
            detail={
              accepted > 0
                ? t('myTasks.stats.acceptedDetail', { accepted, total: allTasks.length })
                : t('myTasks.stats.acceptedNone')
            }
            icon={<CheckCircle2 size={13} />}
            iconClass="bg-moss-soft text-moss"
          />
        </div>
      )}

      {focusTask && !loading ? (
        <section className="relative mt-5 overflow-hidden rounded-card border border-ink bg-ink text-canvas shadow-card">
          <div className="bg-blueprint absolute inset-0 opacity-80" />
          <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-mono text-[8.5px] font-medium tracking-[0.16em] text-accent uppercase">
                <span className="size-1.5 rounded-full bg-accent" />
                {focusTask.status === 'revision_requested'
                  ? t('myTasks.focus.revision')
                  : focusTask.status === 'in_progress'
                    ? t('myTasks.focus.continue')
                    : focusTask.status === 'new'
                      ? t('myTasks.focus.ready')
                      : t('myTasks.focus.review')}
              </p>
              <h2 className="mt-2 max-w-2xl font-display text-xl leading-snug font-semibold tracking-[-0.025em] text-canvas sm:text-2xl">
                {focusTitle}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-canvas/50">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={10} />
                  {focusObjectName ?? t('myTasks.objectFallback')}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    focusDue?.tone === 'overdue' ? 'font-semibold text-orange-300' : '',
                  )}
                >
                  <CalendarDays size={10} />
                  {focusDue?.label}
                </span>
                <StatusBadge status={focusTask.status} />
              </div>
            </div>
            <Button
              variant="secondary"
              iconRight={<ArrowUpRight size={14} />}
              onClick={() => setSelectedTaskId(focusTask.id)}
              className="w-full shrink-0 border-white/15 bg-canvas text-ink hover:bg-white sm:w-auto"
            >
              {t('myTasks.focus.viewTask')}
            </Button>
          </div>
        </section>
      ) : null}

      {error && !tasks ? (
        <ErrorPanel
          className="mt-5"
          message={errorText(error, 'myTasks.errorLoad')}
          onRetry={() => {
            void reload()
          }}
        />
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[8.5px] font-medium tracking-[0.15em] text-muted uppercase">
            {t('myTasks.assignedWork')}
          </p>
          <h2 className="mt-1.5 flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.035em] text-ink">
            {t('myTasks.queue')}
            <span className="rounded-full bg-canvas-deep px-2 py-0.5 font-mono text-[9px] font-medium text-muted">
              {allTasks.length}
            </span>
          </h2>
        </div>
        <p className="text-[10px] text-muted">
          {overdue.length > 0
            ? t('myTasks.pastDue', { count: overdue.length })
            : t('myTasks.nothingPastDue')}
        </p>
      </div>

      <div className="scrollbar-thin mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10.5px] font-semibold transition',
              filter === item.key
                ? 'border-ink bg-ink text-canvas shadow-sm'
                : 'border-line bg-surface text-muted hover:border-ink/25 hover:text-ink',
            )}
          >
            {item.key !== 'all' ? (
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  filter === item.key ? 'bg-canvas/70' : statusDotClass(item.key),
                )}
              />
            ) : null}
            {item.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 font-mono text-[8px]',
                filter === item.key ? 'bg-white/15 text-canvas/75' : 'bg-canvas-deep text-faint',
              )}
            >
              {item.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {loading ? (
          [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-2xl" />)
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon={allTasks.length === 0 ? <ClipboardCheck size={23} /> : <ClipboardList size={22} />}
            title={
              allTasks.length === 0 ? t('myTasks.emptyNoTasks') : t('myTasks.emptyFilter')
            }
            description={
              allTasks.length === 0
                ? t('myTasks.emptyNoTasksBody')
                : t('myTasks.emptyFilterBody')
            }
            action={
              allTasks.length > 0 ? (
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  {t('common.showAllTasks')}
                </Button>
              ) : null
            }
          />
        ) : (
          filteredTasks.map((task) => (
            <TaskQueueRow
              key={task.id}
              task={task}
              onOpen={() => setSelectedTaskId(task.id)}
            />
          ))
        )}
      </div>

      {allTasks.length > 0 ? (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-line/70 bg-surface/60 px-3.5 py-3">
          <ClipboardCheck size={13} className="shrink-0 text-moss" />
          <p className="text-[10px] leading-4 text-muted">{t('myTasks.footerTip')}</p>
        </div>
      ) : null}

      <TaskModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        object={selectedTask?.object ?? null}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={handleTaskUpdated}
      />
    </div>
  )
}
