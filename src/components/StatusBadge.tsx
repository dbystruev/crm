import { useLanguage } from '../i18n/language-context'
import { STATUS_META } from '../lib/status'
import { badgeStyles } from '../lib/status-styles'
import type { TaskStatus } from '../lib/types'
import { cn } from '../lib/utils'

interface StatusBadgeProps {
  status: TaskStatus
  size?: 'sm' | 'md'
  withDot?: boolean
  className?: string
}

export function StatusBadge({
  status,
  size = 'sm',
  withDot = true,
  className,
}: StatusBadgeProps) {
  const { t } = useLanguage()
  const styles = badgeStyles[status]

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        styles.container,
        size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs',
        className,
      )}
    >
      {withDot ? <span className={cn('size-1.5 rounded-full', styles.dot)} /> : null}
      {t(STATUS_META[status].labelKey)}
    </span>
  )
}
