import { LockKeyhole, MessageSquareQuote, ShieldCheck, HardHat } from 'lucide-react'
import { STATUS_META } from '../lib/status'
import type { TaskHistoryEntry, TaskStatus } from '../lib/types'
import { cn, formatDateTime } from '../lib/utils'
import { StatusBadge } from './StatusBadge'
import { statusDotClass } from '../lib/status-styles'
import { Skeleton } from './Feedback'

interface HistoryTimelineProps {
  entries: TaskHistoryEntry[]
  loading?: boolean
  error?: string | null
}

function dotClass(status: TaskStatus) {
  return statusDotClass(status)
}

export function HistoryTimeline({ entries, loading = false, error = null }: HistoryTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-4" aria-label="Loading history">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="mt-1 size-3 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
              {index === 0 ? <Skeleton className="h-14 w-full rounded-xl" /> : null}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/15 bg-danger-soft/60 px-4 py-3 text-xs leading-5 text-danger">
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-xs text-muted">
        No history has been recorded for this task yet.
      </p>
    )
  }

  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div>
      <ol aria-label="Task status history">
        {sorted.map((entry, index) => {
          const isLatest = index === 0
          const isRevision = entry.to_status === 'revision_requested'
          const isCreation = entry.from_status === null
          const ActorIcon = entry.actor?.role === 'manager' ? ShieldCheck : HardHat

          return (
            <li key={entry.id} className="flex gap-3.5">
              <div className="flex w-3 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-paper',
                    dotClass(entry.to_status),
                    isLatest && 'outline-2 outline-offset-2 outline-ink/10',
                  )}
                />
                {index < sorted.length - 1 ? (
                  <span className="mt-1.5 w-px flex-1 bg-line" aria-hidden="true" />
                ) : null}
              </div>

              <div className={cn('min-w-0 flex-1', index < sorted.length - 1 ? 'pb-5' : 'pb-1')}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-xs font-semibold text-ink">
                    {entry.actor?.full_name ?? 'System'}
                  </p>
                  {entry.actor ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-canvas-deep/70 px-1.5 py-0.5 font-mono text-[8px] font-medium tracking-wide text-muted uppercase">
                      <ActorIcon size={9} />
                      {entry.actor.role}
                    </span>
                  ) : null}
                  {isLatest ? (
                    <span className="rounded-full bg-ink px-1.5 py-0.5 font-mono text-[8px] font-medium tracking-wide text-canvas uppercase">
                      Latest
                    </span>
                  ) : null}
                  <time
                    dateTime={entry.created_at}
                    className="ml-auto font-mono text-[9px] whitespace-nowrap text-faint"
                  >
                    {formatDateTime(entry.created_at)}
                  </time>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {isCreation ? (
                    <>
                      <span>Created the task</span>
                      <StatusBadge status={entry.to_status} size="sm" withDot={false} />
                    </>
                  ) : (
                    <>
                      <span>Moved from</span>
                      <span className="font-medium text-ink-soft">
                        {entry.from_status ? STATUS_META[entry.from_status].label : '—'}
                      </span>
                      <span className="text-faint">→</span>
                      <StatusBadge status={entry.to_status} size="sm" withDot={false} />
                    </>
                  )}
                </div>

                {entry.comment ? (
                  <div
                    className={cn(
                      'mt-2.5 rounded-r-lg rounded-bl-lg border-l-2 px-3 py-2.5',
                      isRevision
                        ? 'border-danger/50 bg-danger-soft/50'
                        : 'border-line-strong bg-canvas/70',
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1.5 font-mono text-[8.5px] font-medium tracking-[0.1em] uppercase">
                      <MessageSquareQuote
                        size={11}
                        className={isRevision ? 'text-danger' : 'text-muted'}
                      />
                      <span className={isRevision ? 'text-danger' : 'text-muted'}>
                        {isRevision ? 'Revision note' : 'Note'}
                      </span>
                    </p>
                    <p className="text-xs leading-5 text-ink-soft">{entry.comment}</p>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-canvas/60 px-3 py-2.5">
        <LockKeyhole size={12} className="mt-0.5 shrink-0 text-faint" />
        <p className="text-[10px] leading-4 text-muted">
          History is immutable. Entries are written automatically by the database and cannot be
          edited or deleted.
        </p>
      </div>
    </div>
  )
}
