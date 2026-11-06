import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useAsyncData } from '../hooks/useAsyncData'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import { localizedObjectAddress, localizedObjectName, localizedTaskTitle } from '../lib/localized'
import { OPEN_STATUSES } from '../lib/status'
import type { ConstructionObject, ObjectWithTasks } from '../lib/types'
import { cn, progressPercent } from '../lib/utils'
import { AvatarStack } from '../components/Avatar'
import { Button } from '../components/Button'
import { EmptyState, ErrorPanel, Skeleton, Spinner } from '../components/Feedback'
import { ObjectModal } from '../components/ObjectModal'
import { StatusBadge } from '../components/StatusBadge'

type ObjectFilter = 'all' | 'active' | 'complete'

const TODAY_ISO = new Date().toISOString()

const coverThemes = [
  {
    cover: 'bg-[#20342b]',
    tint: 'text-[#e8c47b]',
    line: 'border-white/10',
  },
  {
    cover: 'bg-[#3b2a21]',
    tint: 'text-[#f0aa8e]',
    line: 'border-white/10',
  },
  {
    cover: 'bg-[#203040]',
    tint: 'text-[#a9c9e8]',
    line: 'border-white/10',
  },
  {
    cover: 'bg-[#2d2937]',
    tint: 'text-[#d1b9dd]',
    line: 'border-white/10',
  },
]

function objectIsComplete(object: ObjectWithTasks) {
  return object.tasks.length > 0 && object.tasks.every((task) => task.status === 'accepted')
}

function StatCard({
  label,
  value,
  detail,
  icon,
  iconClass,
}: {
  label: string
  value: number
  detail: string
  icon: ReactNode
  iconClass: string
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-4 shadow-[0_1px_2px_rgba(23,26,24,0.03)]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[8.5px] font-medium tracking-[0.13em] text-muted uppercase">
          {label}
        </p>
        <span className={cn('grid size-7 place-items-center rounded-lg', iconClass)}>{icon}</span>
      </div>
      <p className="mt-3 font-display text-3xl leading-none font-semibold tracking-[-0.04em] text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-muted">{detail}</p>
    </div>
  )
}

function ObjectCard({
  object,
  index,
  onEdit,
  canEdit,
}: {
  object: ObjectWithTasks
  index: number
  onEdit: (object: ConstructionObject) => void
  canEdit: boolean
}) {
  const { t, path, dueDateInfo, language } = useLanguage()
  const theme = coverThemes[index % coverThemes.length]
  const objectName = localizedObjectName(object, language)
  const objectAddress = localizedObjectAddress(object, language)
  const completed = object.tasks.filter((task) => task.status === 'accepted').length
  const open = object.tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length
  const review = object.tasks.filter((task) => task.status === 'under_review').length
  const revisions = object.tasks.filter((task) => task.status === 'revision_requested').length
  const overdue = object.tasks.filter(
    (task) => task.status !== 'accepted' && dueDateInfo(task.due_date).tone === 'overdue',
  ).length
  const percent = progressPercent(object.tasks.length, completed)
  const isComplete = objectIsComplete(object)
  const team = object.tasks
    .map((task) => task.assignee)
    .filter((assignee): assignee is { id: string; full_name: string; role: 'worker' } => Boolean(assignee))

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line/80 bg-paper shadow-card transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lift focus-within:ring-2 focus-within:ring-accent/35">
      <Link
        to={path(`/objects/${object.id}`)}
        className="absolute inset-0 z-10 rounded-card focus-visible:outline-none"
        aria-label={t('objects.card.open', { name: objectName })}
      >
        <span className="sr-only">{t('objects.card.open', { name: objectName })}</span>
      </Link>

      <div className={cn('relative h-36 overflow-hidden', theme.cover)}>
        <div className="bg-blueprint absolute inset-0 opacity-70" />
        <div className={cn('absolute -top-10 -right-8 size-36 rounded-full border', theme.line)} />
        <div className={cn('absolute -top-3 -right-1 size-24 rounded-full border', theme.line)} />
        <div className="absolute right-6 bottom-5 grid grid-cols-2 gap-1.5 opacity-60">
          <span className={cn('h-7 w-9 rounded-[3px] border', theme.line)} />
          <span className={cn('h-7 w-9 rounded-[3px] border', theme.line)} />
          <span className={cn('h-7 w-9 rounded-[3px] border', theme.line)} />
          <span className={cn('h-7 w-9 rounded-[3px] border', theme.line)} />
        </div>
        <span className={cn('absolute right-5 bottom-3 font-display text-6xl leading-none font-semibold tracking-[-0.06em]', theme.tint, 'opacity-20')}>
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="absolute top-3.5 left-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 font-mono text-[8px] font-medium tracking-[0.1em] text-white/75 uppercase backdrop-blur-sm">
            <span className={cn('size-1.5 rounded-full', isComplete ? 'bg-emerald-400' : 'bg-amber-300')} />
            {isComplete ? t('objects.card.completed') : t('objects.card.activeSite')}
          </span>
          <span className="font-mono text-[8px] tracking-[0.1em] text-white/35">
            OBJ-{String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(object)}
            className="absolute top-3 right-3 z-20 grid size-8 place-items-center rounded-full border border-white/10 bg-black/15 text-white/65 backdrop-blur-sm transition hover:bg-white hover:text-ink"
            aria-label={t('objects.card.edit', { name: objectName })}
            title={t('objects.card.editTitle')}
          >
            <Pencil size={13} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-display text-lg leading-snug font-semibold tracking-[-0.025em] text-ink transition group-hover:text-accent-dark">
          {objectName}
        </h2>
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-muted">
          <MapPin size={11} className="mt-0.5 shrink-0 text-faint" />
          {objectAddress}
        </p>

        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <span className="font-mono text-[8.5px] font-medium tracking-[0.12em] text-muted uppercase">
              {t('objects.card.siteProgress')}
            </span>
            <span
              className={cn(
                'font-display text-lg leading-none font-semibold tracking-[-0.03em]',
                percent === 100 ? 'text-moss' : 'text-ink',
              )}
            >
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas-deep">
            <div
              className={cn('h-full rounded-full transition-all duration-500', percent === 100 ? 'bg-moss' : 'bg-accent')}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-faint">
            {object.tasks.length > 0
              ? t('objects.card.acceptedOf', { completed, total: object.tasks.length })
              : t('objects.card.noTasks')}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-medium text-muted">
          {object.tasks.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-faint">
              <ClipboardList size={11} /> {t('objects.card.waitingFirst')}
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-blue" />
                {t('objects.card.openTasks', { count: open })}
              </span>
              {review > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber" />
                  {t('objects.card.inReview', { count: review })}
                </span>
              ) : null}
              {overdue > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-danger">
                  <AlertTriangle size={10} />
                  {t('objects.card.overdue', { count: overdue })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-moss" />
                  {t('objects.card.done', { count: completed })}
                </span>
              )}
            </>
          )}
          {revisions > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <span className="size-1.5 rounded-full bg-danger" />
              {t('objects.card.revisions', { count: revisions })}
            </span>
          ) : null}
        </div>

        {object.tasks.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-line/75 pt-3" aria-label={t('objects.card.taskList')}>
            {object.tasks.slice(0, 3).map((task) => (
              <li key={task.id} className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-[10px] font-medium text-ink-soft">
                  {localizedTaskTitle(task, language)}
                </span>
                <StatusBadge status={task.status} />
              </li>
            ))}
            {object.tasks.length > 3 ? (
              <li className="text-[9px] text-faint">
                {t('objects.card.moreTasks', { count: object.tasks.length - 3 })}
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/75 pt-4">
          <AvatarStack
            people={team}
            size="sm"
            empty={<span className="text-[10px] text-faint">{t('objects.card.noAssignees')}</span>}
          />
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink transition group-hover:text-accent-dark">
            {t('objects.card.openSite')}
            <ArrowUpRight size={12} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </article>
  )
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line/70 bg-paper">
      <Skeleton className="h-36 rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="mt-5 h-2 w-full" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex justify-between border-t border-line/70 pt-4">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

export function ObjectsPage() {
  const { profile } = useAuth()
  const { t, path, dueDateInfo, getTodayLabel, greeting, formatShortDate, errorText, language } =
    useLanguage()
  const navigate = useNavigate()

  const { data: objects, loading, refreshing, error, reload } = useAsyncData(
    () => crm.listObjects(),
    [],
  )
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ObjectFilter>('all')
  const [objectModalOpen, setObjectModalOpen] = useState(false)
  const [editingObject, setEditingObject] = useState<ConstructionObject | null>(null)

  const list = useMemo(() => objects ?? [], [objects])

  const stats = useMemo(() => {
    const tasks = list.flatMap((object) => object.tasks)
    const open = tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length
    const review = tasks.filter((task) => task.status === 'under_review').length
    const accepted = tasks.filter((task) => task.status === 'accepted').length
    const overdue = tasks.filter(
      (task) => task.status !== 'accepted' && dueDateInfo(task.due_date).tone === 'overdue',
    ).length
    const activeSites = list.filter((object) => !objectIsComplete(object)).length
    const percent = progressPercent(tasks.length, accepted)

    return { tasks, open, review, accepted, overdue, activeSites, percent }
  }, [list, dueDateInfo])

  if (!profile) return null

  const isManager = profile.role === 'manager'
  const firstName = profile.full_name.split(/\s+/)[0]

  const normalizedSearch = search.trim().toLowerCase()
  const filteredObjects = list.filter((object) => {
    const searchableName = localizedObjectName(object, language).toLowerCase()
    const searchableAddress = localizedObjectAddress(object, language).toLowerCase()
    const matchesSearch =
      !normalizedSearch ||
      searchableName.includes(normalizedSearch) ||
      searchableAddress.includes(normalizedSearch)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && !objectIsComplete(object)) ||
      (filter === 'complete' && objectIsComplete(object))
    return matchesSearch && matchesFilter
  })

  const completeCount = list.filter(objectIsComplete).length
  const activeCount = list.length - completeCount

  const openCreate = () => {
    setEditingObject(null)
    setObjectModalOpen(true)
  }

  const openEdit = (object: ConstructionObject) => {
    setEditingObject(object)
    setObjectModalOpen(true)
  }

  const handleObjectSaved = (saved: ConstructionObject) => {
    const wasCreating = editingObject === null
    setEditingObject(null)
    if (wasCreating) {
      navigate(path(`/objects/${saved.id}`))
    } else {
      void reload()
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.16em] text-muted uppercase">
            <span className="size-1.5 rounded-full bg-accent" />
            {t('objects.eyebrow', { date: getTodayLabel() })}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.04em] text-ink text-balance sm:text-4xl">
            {isManager
              ? t('objects.titleManager', { greeting: greeting(), name: firstName })
              : t('objects.titleWorker')}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {isManager ? t('objects.subtitleManager') : t('objects.subtitleWorker')}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isManager ? (
            <Button
              variant="accent"
              icon={<Plus size={16} />}
              onClick={openCreate}
              className="h-11 px-5"
            >
              {t('objects.newObject')}
            </Button>
          ) : (
            <Link
              to={path('/my-tasks')}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-xs font-semibold text-canvas transition hover:bg-ink-soft"
            >
              <ClipboardList size={15} />
              {t('objects.viewMyTasks')}
              <ArrowRight size={14} />
            </Link>
          )}
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
            label={t('objects.stats.sites')}
            value={list.length}
            detail={t('objects.stats.sitesDetail', { count: stats.activeSites })}
            icon={<Building2 size={13} />}
            iconClass="bg-accent-soft text-accent-dark"
          />
          <StatCard
            label={t('objects.stats.open')}
            value={stats.open}
            detail={
              stats.overdue > 0
                ? t('objects.stats.openDetailOverdue', { count: stats.overdue })
                : t('objects.stats.openDetail')
            }
            icon={<ClipboardList size={13} />}
            iconClass="bg-blue-soft text-blue"
          />
          <StatCard
            label={t('objects.stats.review')}
            value={stats.review}
            detail={
              isManager ? t('objects.stats.reviewManager') : t('objects.stats.reviewWorker')
            }
            icon={<Clock3 size={13} />}
            iconClass="bg-amber-soft text-amber"
          />
          <StatCard
            label={t('objects.stats.accepted')}
            value={stats.accepted}
            detail={t('objects.stats.acceptedDetail', { percent: stats.percent })}
            icon={<CheckCircle2 size={13} />}
            iconClass="bg-moss-soft text-moss"
          />
        </div>
      )}

      <div className="mt-7 flex flex-col gap-3 border-b border-line/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              { key: 'all', label: t('objects.filter.all'), count: list.length },
              { key: 'active', label: t('objects.filter.active'), count: activeCount },
              { key: 'complete', label: t('objects.filter.complete'), count: completeCount },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition',
                filter === item.key
                  ? 'bg-ink text-canvas shadow-sm'
                  : 'text-muted hover:bg-ink/[0.055] hover:text-ink',
              )}
            >
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[8px]',
                  filter === item.key ? 'bg-white/15 text-canvas/70' : 'bg-canvas-deep text-faint',
                )}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full lg:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('objects.searchPlaceholder')}
              aria-label={t('objects.searchAria')}
              className="h-9 w-full rounded-full border border-line-strong bg-surface pr-8 pl-9 text-xs text-ink transition placeholder:text-faint focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-faint hover:bg-canvas hover:text-ink"
                aria-label={t('objects.clearSearch')}
              >
                <X size={11} />
              </button>
            ) : null}
          </div>
          {refreshing ? <Spinner size={13} className="text-muted" /> : null}
          <span className="hidden shrink-0 font-mono text-[8.5px] tracking-[0.1em] text-faint uppercase sm:block">
            {t('common.shown', { count: filteredObjects.length })}
          </span>
        </div>
      </div>

      {error && !objects ? (
        <ErrorPanel
          className="mt-6"
          message={errorText(error, 'errors.loadObjects')}
          onRetry={() => {
            void reload()
          }}
        />
      ) : loading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <CardSkeleton key={item} />
          ))}
        </div>
      ) : filteredObjects.length === 0 ? (
        <div className="mt-6">
          {list.length === 0 ? (
            <EmptyState
              icon={<Building2 size={23} />}
              title={isManager ? t('objects.emptyTitleManager') : t('objects.emptyTitleWorker')}
              description={
                isManager ? t('objects.emptyBodyManager') : t('objects.emptyBodyWorker')
              }
              action={
                isManager ? (
                  <Button variant="accent" icon={<Plus size={15} />} onClick={openCreate}>
                    {t('objects.createFirst')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon={<Search size={22} />}
              title={t('objects.noMatchTitle')}
              description={t('objects.noMatchBody')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('')
                    setFilter('all')
                  }}
                >
                  {t('common.clearFilters')}
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredObjects.map((object, index) => (
            <div key={object.id} className="animate-rise" style={{ animationDelay: `${index * 45}ms` }}>
              <ObjectCard
                object={object}
                index={index}
                onEdit={openEdit}
                canEdit={isManager}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-line/70 bg-surface/50 px-4 py-3">
        <p className="flex items-center gap-2 text-[10px] text-muted">
          <MapPin size={12} className="text-faint" />
          {isManager ? t('objects.workersNoteManager') : t('objects.workersNoteWorker')}
        </p>
        <p className="hidden font-mono text-[8px] tracking-[0.12em] text-faint uppercase sm:block">
          {t('objects.totalTasks', {
            count: stats.tasks.length,
            date: formatShortDate(TODAY_ISO),
          })}
        </p>
      </div>

      <ObjectModal
        open={objectModalOpen}
        onClose={() => setObjectModalOpen(false)}
        object={editingObject}
        onSaved={handleObjectSaved}
      />
    </div>
  )
}
