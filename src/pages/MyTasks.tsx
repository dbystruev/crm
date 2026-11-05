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
import { crm } from '../lib/api'
import { sortTasksByPriority, STATUS_META, TASK_STATUSES } from '../lib/status'
import type { Task, TaskStatus, TaskWithRelations } from '../lib/types'
import {
  cn,
  dueDateInfo,
  getTodayLabel,
  greeting,
  pluralize,
  progressPercent,
} from '../lib/utils'
import { Avatar } from '../components/Avatar'
import { Button } from '../components/Button'
import { EmptyState, ErrorPanel, Skeleton } from '../components/Feedback'
import { StatusBadge } from '../components/StatusBadge'
import { statusDotClass } from '../lib/status-styles'
import { TaskModal } from '../components/TaskModal'

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
  const due = dueDateInfo(task.due_date, task.status === 'accepted')

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
              <span className="truncate">{task.object?.name ?? 'Construction object'}</span>
            </p>
            <h3 className="font-display text-sm leading-snug font-semibold tracking-[-0.01em] text-ink transition group-hover:text-accent-dark">
              {task.title}
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
              Manager note available
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export function MyTasksPage() {
  const { profile } = useAuth()
  const { data: tasks, loading, error, reload, setData } = useAsyncData(
    () => crm.listMyTasks(),
    [],
  )
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  if (!profile) return null
  if (profile.role !== 'worker') return <Navigate to="/" replace />

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
    { key: 'all', label: 'All tasks', count: allTasks.length },
    ...TASK_STATUSES.map((status) => ({
      key: status,
      label: STATUS_META[status].label,
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

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.16em] text-muted uppercase">
            <span className="size-1.5 rounded-full bg-accent" />
            Field queue · {getTodayLabel()}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
            My tasks
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {greeting()}, {profile.full_name.split(/\s+/)[0]}. Your assigned work, sorted by what
            needs attention first.
          </p>
        </div>

        <div className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-surface px-3.5 py-2.5">
          <Avatar name={profile.full_name} seed={profile.id} size="md" />
          <div>
            <p className="text-xs font-semibold text-ink">{profile.full_name}</p>
            <p className="mt-0.5 flex items-center gap-1 font-mono text-[8px] tracking-[0.1em] text-muted uppercase">
              <HardHat size={9} />
              Worker · {allTasks.length} assigned
            </p>
          </div>
          <span className="ml-2 rounded-full bg-moss-soft px-2 py-1 font-mono text-[8px] font-semibold text-moss">
            {percent}% done
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
            label="Open tasks"
            value={openTasks.length}
            detail={openTasks.length > 0 ? `${openTasks.length - revisions.length - underReview.length} ready to work` : 'All caught up'}
            icon={<ClipboardList size={13} />}
            iconClass="bg-blue-soft text-blue"
          />
          <StatCard
            label="Revisions"
            value={revisions.length}
            detail={revisions.length > 0 ? 'Needs your attention' : 'No rework requested'}
            icon={<RotateCcw size={13} />}
            iconClass="bg-danger-soft text-danger"
            danger={revisions.length > 0}
          />
          <StatCard
            label="In review"
            value={underReview.length}
            detail="Waiting for your manager"
            icon={<Clock3 size={13} />}
            iconClass="bg-amber-soft text-amber"
          />
          <StatCard
            label="Accepted"
            value={accepted}
            detail={accepted > 0 ? `${accepted} of ${allTasks.length} complete` : 'No sign-offs yet'}
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
                  ? 'Revision needs your attention'
                  : focusTask.status === 'in_progress'
                    ? 'Continue this task'
                    : focusTask.status === 'new'
                      ? 'Ready to start'
                      : 'Waiting for manager review'}
              </p>
              <h2 className="mt-2 max-w-2xl font-display text-xl leading-snug font-semibold tracking-[-0.025em] text-canvas sm:text-2xl">
                {focusTask.title}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-canvas/50">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={10} />
                  {focusTask.object?.name ?? 'Construction object'}
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
              View task
            </Button>
          </div>
        </section>
      ) : null}

      {error && !tasks ? (
        <ErrorPanel
          className="mt-5"
          message={error}
          onRetry={() => {
            void reload()
          }}
        />
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[8.5px] font-medium tracking-[0.15em] text-muted uppercase">
            Assigned work
          </p>
          <h2 className="mt-1.5 flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.035em] text-ink">
            Task queue
            <span className="rounded-full bg-canvas-deep px-2 py-0.5 font-mono text-[9px] font-medium text-muted">
              {allTasks.length}
            </span>
          </h2>
        </div>
        <p className="text-[10px] text-muted">
          {overdue.length > 0
            ? `${pluralize(overdue.length, 'task')} past due`
            : 'Nothing past due — nice work.'}
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
              allTasks.length === 0
                ? 'No tasks assigned to you yet'
                : `No ${filter === 'all' ? '' : STATUS_META[filter].label.toLowerCase() + ' '}tasks`
            }
            description={
              allTasks.length === 0
                ? 'When a manager assigns work on a construction site, it will show up here with a clear due date and next step.'
                : 'Try another status filter to see the rest of your assigned work.'
            }
            action={
              allTasks.length > 0 ? (
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  Show all tasks
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
          <p className="text-[10px] leading-4 text-muted">
            Submit work for review when it is ready. Your manager will accept it or send a revision
            note, both recorded in the task history.
          </p>
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
