import type { TranslationKey } from '../i18n/translations'
import type { Profile, Task, TaskStatus, TransitionOption } from './types'

export const TASK_STATUSES: TaskStatus[] = [
  'new',
  'in_progress',
  'under_review',
  'revision_requested',
  'accepted',
]

export const STATUS_META: Record<TaskStatus, { labelKey: TranslationKey; order: number }> = {
  new: {
    labelKey: 'status.new',
    order: 3,
  },
  in_progress: {
    labelKey: 'status.in_progress',
    order: 2,
  },
  under_review: {
    labelKey: 'status.under_review',
    order: 1,
  },
  revision_requested: {
    labelKey: 'status.revision_requested',
    order: 0,
  },
  accepted: {
    labelKey: 'status.accepted',
    order: 4,
  },
}

export const OPEN_STATUSES: TaskStatus[] = ['new', 'in_progress', 'revision_requested']

export function sortTasksByPriority<T extends Task>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const statusOrder = STATUS_META[a.status].order - STATUS_META[b.status].order
    if (statusOrder !== 0) return statusOrder
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export function getAvailableTransitions(task: Task, profile: Profile | null): TransitionOption[] {
  if (!profile) return []

  const isManager = profile.role === 'manager'
  const isAssignedWorker = profile.role === 'worker' && task.assignee_id === profile.id

  switch (task.status) {
    case 'new':
      if (!isAssignedWorker) return []
      return [
        {
          to: 'in_progress',
          labelKey: 'action.startWork',
          titleKey: 'action.startWorkTitle',
          bodyKey: 'action.startWorkBody',
          confirmKey: 'action.startWork',
          requiresComment: false,
          tone: 'neutral',
        },
      ]
    case 'in_progress':
      if (!isAssignedWorker) return []
      return [
        {
          to: 'under_review',
          labelKey: 'action.submitReview',
          titleKey: 'action.submitReviewTitle',
          bodyKey: 'action.submitReviewBody',
          confirmKey: 'action.submitReview',
          requiresComment: false,
          tone: 'accent',
        },
      ]
    case 'under_review':
      if (!isManager) return []
      return [
        {
          to: 'accepted',
          labelKey: 'action.accept',
          titleKey: 'action.acceptTitle',
          bodyKey: 'action.acceptBody',
          confirmKey: 'action.accept',
          requiresComment: false,
          tone: 'success',
        },
        {
          to: 'revision_requested',
          labelKey: 'action.requestRevision',
          titleKey: 'action.requestRevisionTitle',
          bodyKey: 'action.requestRevisionBody',
          confirmKey: 'action.requestRevision',
          requiresComment: true,
          tone: 'danger',
        },
      ]
    case 'revision_requested':
      if (!isAssignedWorker) return []
      return [
        {
          to: 'in_progress',
          labelKey: 'action.resume',
          titleKey: 'action.resumeTitle',
          bodyKey: 'action.resumeBody',
          confirmKey: 'action.resume',
          requiresComment: false,
          tone: 'neutral',
        },
      ]
    case 'accepted':
      return []
  }
}

export function latestRevisionComment(
  history: { to_status: TaskStatus; comment: string | null }[],
): string | null {
  for (const entry of history) {
    if (entry.to_status === 'revision_requested' && entry.comment) return entry.comment
  }
  return null
}
