import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useAsyncData } from '../hooks/useAsyncData'
import { crm } from '../lib/api'
import { sortTasksByPriority, STATUS_META, TASK_STATUSES } from '../lib/status'
import type { ObjectWithTasks, Task, TaskStatus, TaskWithRelations } from '../lib/types'
import {
  cn,
  dueDateInfo,
  formatDate,
  formatDateTime,
  pluralize,
  progressPercent,
} from '../lib/utils'
import { Avatar, AvatarStack } from '../components/Avatar'
import { Button } from '../components/Button'
import { EmptyState, ErrorPanel, Skeleton, Spinner } from '../components/Feedback'
import { ObjectModal } from '../components/ObjectModal'
import { StatusBadge } from '../components/StatusBadge'
import { statusDotClass } from '../lib/status-styles'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskModal } from '../components/TaskModal'

type TaskFilter = 'all' | TaskStatus

function ProgressRing({ percent }: { percent: number }) {
  const size = 112
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference
  const color = percent === 100 ? '#86d2a6' : '#e4572e'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.11)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-display text-2xl leading-none font-semibold tracking-[-0.04em] text-canvas">
          {percent}
          <span className="text-sm text-canvas/50">%</span>
        </p>
        <p className="mt-1 font-mono text-[7.5px] tracking-[0.14em] text-canvas/40 uppercase">
          accepted
        </p>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onOpen,
}: {
  task: TaskWithRelations
  onOpen: (task: TaskWithRelations) => void
}) {
  const due = dueDateInfo(task.due_date, task.status === 'accepted')

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="group flex w-full items-start gap-3 rounded-2xl border border-line/80 bg-paper p-3.5 text-left shadow-[0_1px_2px_rgba(23,26,24,0.025)] transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-card sm:gap-4 sm:p-4"
    >
      <span
        className={cn('mt-0.5 h-9 w-1 shrink-0 rounded-full opacity-80', statusDotClass(task.status))}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-sm leading-snug font-semibold tracking-[-0.01em] text-ink transition group-hover:text-accent-dark">
            {task.title}
          </h3>
          <ChevronRight
            size={15}
            className="mt-0.5 hidden shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink sm:block"
          />
        </div>
        <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-muted">
          {task.description || 'No brief added.'}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={task.status} />
          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
            {task.assignee ? (
              <>
                <Avatar name={task.assignee.full_name} seed={task.assignee.id} size="xs" />
                {task.assignee.full_name}
              </>
            ) : (
              'Unassigned'
            )}
          </span>
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
        </div>
      </div>
    </button>
  )
}

function PageSkeleton() {
  return (
    <div className="animate-fade-in">
      <Skeleton className="h-4 w-28" />
      <div className="mt-5 overflow-hidden rounded-card border border-line/70 bg-paper">
        <div className="grid lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 p-6 sm:p-8">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-3 h-16 w-full" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <div className="bg-ink/95 p-6">
            <Skeleton className="h-3 w-20 bg-white/10" />
            <div className="mt-6 flex items-center gap-5">
              <Skeleton className="size-24 rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-16 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
                <Skeleton className="h-3 w-3/4 bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 flex gap-2">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-5 space-y-2.5">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const { data: object, loading, refreshing, error, reload, setData } = useAsyncData(
    async () => {
      if (!id) throw new Error('Object ID is missing.')
      return crm.getObject(id)
    },
    [id],
  )

  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null)
  const [objectModalOpen, setObjectModalOpen] = useState(false)

  if (!profile) return null

  const isManager = profile.role === 'manager'

  if (loading) return <PageSkeleton />

  if (!object) {
    return (
      <div className="animate-fade-in">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
        >
          <ArrowLeft size={14} />
          All objects
        </Link>
        <ErrorPanel
          className="mt-5"
          title="This object could not be opened"
          message={error ?? 'Object not found, or you do not have access to it.'}
          onRetry={() => {
            void reload()
          }}
        />
      </div>
    )
  }

  const tasks = object.tasks
  const completed = tasks.filter((task) => task.status === 'accepted').length
  const underReview = tasks.filter((task) => task.status === 'under_review').length
  const revisions = tasks.filter((task) => task.status === 'revision_requested').length
  const overdue = tasks.filter(
    (task) => task.status !== 'accepted' && dueDateInfo(task.due_date).tone === 'overdue',
  ).length
  const percent = progressPercent(tasks.length, completed)
  const isComplete = completed === tasks.length && tasks.length > 0
  const team = Array.from(
    new Map(
      tasks
        .map((task) => task.assignee)
        .filter((assignee): assignee is { id: string; full_name: string; role: 'worker' } =>
          Boolean(assignee),
        )
        .map((assignee) => [assignee.id, assignee]),
    ).values(),
  )

  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All tasks', count: tasks.length },
    ...TASK_STATUSES.map((status) => ({
      key: status,
      label: STATUS_META[status].label,
      count: tasks.filter((task) => task.status === status).length,
    })),
  ]

  const filteredTasks = sortTasksByPriority(
    filter === 'all' ? tasks : tasks.filter((task) => task.status === filter),
  )
  const selectedTask =
    (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : null) ?? null

  const handleTaskUpdated = (updated: Task) => {
    setData((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) =>
              task.id === updated.id ? { ...task, ...updated } : task,
            ),
          }
        : current,
    )
  }

  const openNewTask = () => {
    setEditingTask(null)
    setTaskFormOpen(true)
  }

  const handleEditTask = (task: TaskWithRelations) => {
    setSelectedTaskId(null)
    setEditingTask(task)
    setTaskFormOpen(true)
  }

  const handleTaskFormSaved = () => {
    setEditingTask(null)
    void reload()
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
        >
          <ArrowLeft size={14} className="transition group-hover:-translate-x-0.5" />
          All objects
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {refreshing ? <Spinner size={13} className="mr-1 text-muted" /> : null}
          {isManager ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={13} />}
                onClick={() => setObjectModalOpen(true)}
                className="h-9"
              >
                Edit object
              </Button>
              <Button
                variant="accent"
                size="sm"
                icon={<Plus size={14} />}
                onClick={openNewTask}
                className="h-9"
              >
                New task
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <section className="relative mt-5 overflow-hidden rounded-card border border-line/80 bg-paper shadow-card">
        <div className="grid lg:grid-cols-[1fr_330px]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[8px] font-medium tracking-[0.13em] text-muted uppercase">
                <ClipboardList size={10} />
                Object
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[8px] font-medium tracking-[0.1em] uppercase">
                <span className={cn('size-1.5 rounded-full', isComplete ? 'bg-moss' : 'bg-amber')} />
                <span className={isComplete ? 'text-moss' : 'text-amber'}>
                  {isComplete ? 'Completed' : 'Active site'}
                </span>
              </span>
              <span className="font-mono text-[8px] tracking-[0.1em] text-faint">
                Opened {formatDate(object.created_at)}
              </span>
            </div>

            <h1 className="mt-4 font-display text-3xl leading-[1.05] font-semibold tracking-[-0.04em] text-ink text-balance sm:text-4xl">
              {object.name}
            </h1>
            <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-5 text-muted sm:text-sm">
              <MapPin size={14} className="mt-0.5 shrink-0 text-faint" />
              {object.address}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-6 whitespace-pre-line text-ink-soft/80">
              {object.description || 'No description has been added for this object yet.'}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line/75 pt-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
                <ClipboardList size={12} className="text-faint" />
                {pluralize(tasks.length, 'task')}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
                <Clock3 size={12} className="text-faint" />
                Updated {formatDateTime(object.updated_at)}
              </span>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                <Users size={12} className="text-faint" />
                <AvatarStack
                  people={team}
                  max={4}
                  size="xs"
                  empty={<span className="text-faint">No assignees</span>}
                />
              </span>
            </div>
          </div>

          <aside className="bg-blueprint relative overflow-hidden bg-ink p-5 text-canvas sm:p-6">
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[8.5px] font-medium tracking-[0.16em] text-canvas/50 uppercase">
                  Site pulse
                </p>
                <ShieldCheck size={13} className="text-canvas/25" />
              </div>

              <div className="mt-4 flex flex-col gap-4 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-5">
                <div className="flex justify-center min-[360px]:block">
                  <ProgressRing percent={percent} />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <p className="text-[10px] leading-4 text-canvas/60">
                    {completed} of {tasks.length} tasks accepted
                  </p>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn('h-full rounded-full transition-all', percent === 100 ? 'bg-emerald-400' : 'bg-accent')}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <div className="rounded-lg bg-white/[0.055] px-1.5 py-2 text-center">
                      <p className="font-display text-base leading-none font-semibold">
                        {underReview}
                      </p>
                      <p className="mt-1 font-mono text-[7.5px] tracking-[0.08em] text-canvas/45 uppercase">
                        Review
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.055] px-1.5 py-2 text-center">
                      <p className="font-display text-base leading-none font-semibold">{revisions}</p>
                      <p className="mt-1 font-mono text-[7.5px] tracking-[0.08em] text-canvas/45 uppercase">
                        Revisions
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.055] px-1.5 py-2 text-center">
                      <p
                        className={cn(
                          'font-display text-base leading-none font-semibold',
                          overdue > 0 && 'text-orange-300',
                        )}
                      >
                        {overdue}
                      </p>
                      <p className="mt-1 font-mono text-[7.5px] tracking-[0.08em] text-canvas/45 uppercase">
                        Overdue
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {overdue > 0 ? (
                <p className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-[9px] text-orange-200/75">
                  <AlertTriangle size={10} />
                  {overdue} task{overdue === 1 ? '' : 's'} past the due date
                </p>
              ) : (
                <p className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-[9px] text-canvas/40">
                  <CheckCircle2 size={10} />
                  No overdue work on this site
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[8.5px] font-medium tracking-[0.15em] text-muted uppercase">
            Work breakdown
          </p>
          <h2 className="mt-1.5 flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.035em] text-ink">
            Tasks
            <span className="rounded-full bg-canvas-deep px-2 py-0.5 font-mono text-[9px] font-medium text-muted">
              {tasks.length}
            </span>
          </h2>
        </div>
        <p className="text-[10px] text-muted">
          Sorted by urgency and due date · {filteredTasks.length} shown
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

      {error && object ? (
        <div className="mt-4">
          <ErrorPanel
            message={error}
            onRetry={() => {
              void reload()
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-2.5">
        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={
              filter === 'revision_requested' ? (
                <RotateCcw size={22} />
              ) : filter === 'under_review' ? (
                <Clock3 size={22} />
              ) : (
                <ClipboardList size={22} />
              )
            }
            title={
              tasks.length === 0
                ? 'No tasks on this object yet'
                : `No ${filter === 'all' ? '' : STATUS_META[filter].label.toLowerCase() + ' '}tasks in this view`
            }
            description={
              tasks.length === 0
                ? isManager
                  ? 'Create the first task, assign a worker, and the status flow can begin.'
                  : 'No work has been assigned to you on this site yet.'
                : 'Switch to another status filter to see the rest of the work.'
            }
            action={
              tasks.length === 0 ? (
                isManager ? (
                  <Button variant="accent" icon={<Plus size={15} />} onClick={openNewTask}>
                    Create first task
                  </Button>
                ) : null
              ) : (
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  Show all tasks
                </Button>
              )
            }
          />
        ) : (
          filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={(item) => setSelectedTaskId(item.id)} />
          ))
        )}
      </div>

      {tasks.length > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 text-[9px] text-faint">
          <ShieldCheck size={11} />
          Every status change is recorded automatically in an immutable audit trail.
        </p>
      ) : null}

      <TaskModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        object={{ id: object.id, name: object.name }}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={handleTaskUpdated}
        onEdit={isManager ? handleEditTask : undefined}
      />

      {isManager ? (
        <>
          <TaskFormModal
            open={taskFormOpen}
            onClose={() => setTaskFormOpen(false)}
            object={{ id: object.id, name: object.name }}
            task={editingTask}
            onSaved={handleTaskFormSaved}
          />
          <ObjectModal
            open={objectModalOpen}
            onClose={() => setObjectModalOpen(false)}
            object={object as ObjectWithTasks}
            onSaved={() => {
              void reload()
            }}
          />
        </>
      ) : null}
    </div>
  )
}
