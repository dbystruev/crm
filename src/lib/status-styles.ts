import type { TaskStatus } from './types'

export const badgeStyles: Record<TaskStatus, { container: string; dot: string }> = {
  new: {
    container: 'border-line-strong/70 bg-canvas-deep/65 text-ink-soft',
    dot: 'bg-faint',
  },
  in_progress: {
    container: 'border-blue/15 bg-blue-soft text-blue',
    dot: 'bg-blue',
  },
  under_review: {
    container: 'border-amber/15 bg-amber-soft text-amber',
    dot: 'bg-amber',
  },
  accepted: {
    container: 'border-moss/15 bg-moss-soft text-moss',
    dot: 'bg-moss',
  },
  revision_requested: {
    container: 'border-danger/15 bg-danger-soft text-danger',
    dot: 'bg-danger',
  },
}

export function statusDotClass(status: TaskStatus) {
  return badgeStyles[status].dot
}
