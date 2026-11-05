import type { Profile, Task, TaskStatus, TransitionOption } from './types'

export const TASK_STATUSES: TaskStatus[] = [
  'new',
  'in_progress',
  'under_review',
  'revision_requested',
  'accepted',
]

export const STATUS_META: Record<
  TaskStatus,
  {
    label: string
    shortLabel: string
    description: string
    order: number
  }
> = {
  new: {
    label: 'New',
    shortLabel: 'New',
    description: 'Ready to be picked up',
    order: 3,
  },
  in_progress: {
    label: 'In progress',
    shortLabel: 'In progress',
    description: 'Work is underway',
    order: 2,
  },
  under_review: {
    label: 'Under review',
    shortLabel: 'Review',
    description: 'Waiting for a manager decision',
    order: 1,
  },
  revision_requested: {
    label: 'Revision requested',
    shortLabel: 'Revision',
    description: 'Changes are needed before acceptance',
    order: 0,
  },
  accepted: {
    label: 'Accepted',
    shortLabel: 'Accepted',
    description: 'Approved and complete',
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
          label: 'Start work',
          confirmationTitle: 'Start work on this task?',
          confirmationBody:
            'The task will move to In progress. Add an optional note to give the team context.',
          confirmLabel: 'Start work',
          requiresComment: false,
          tone: 'neutral',
        },
      ]
    case 'in_progress':
      if (!isAssignedWorker) return []
      return [
        {
          to: 'under_review',
          label: 'Submit for review',
          confirmationTitle: 'Submit this task for review?',
          confirmationBody:
            'Your manager will review the completed work and either accept it or request a revision.',
          confirmLabel: 'Submit for review',
          requiresComment: false,
          tone: 'accent',
        },
      ]
    case 'under_review':
      if (!isManager) return []
      return [
        {
          to: 'accepted',
          label: 'Accept task',
          confirmationTitle: 'Accept this task?',
          confirmationBody:
            'This marks the work as approved and closes the review cycle. The decision is recorded in the history.',
          confirmLabel: 'Accept task',
          requiresComment: false,
          tone: 'success',
        },
        {
          to: 'revision_requested',
          label: 'Request revision',
          confirmationTitle: 'Request a revision',
          confirmationBody:
            'Explain what needs to change. The worker will see your comment and can resume work.',
          confirmLabel: 'Request revision',
          requiresComment: true,
          tone: 'danger',
        },
      ]
    case 'revision_requested':
      if (!isAssignedWorker) return []
      return [
        {
          to: 'in_progress',
          label: 'Resume work',
          confirmationTitle: 'Resume work on this task?',
          confirmationBody:
            'The task will return to In progress so you can address the revision request.',
          confirmLabel: 'Resume work',
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
