import type { ReactNode } from 'react'
import { avatarPalette, cn, initials } from '../lib/utils'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  name: string
  seed?: string
  size?: AvatarSize
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'size-6 text-[8.5px]',
  sm: 'size-8 text-[10px]',
  md: 'size-9 text-[11px]',
  lg: 'size-11 text-xs',
  xl: 'size-14 text-sm',
}

export function Avatar({ name, seed, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide ring-2 ring-white/80',
        avatarPalette(seed ?? name),
        sizeClasses[size],
        className,
      )}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}

interface AvatarStackProps {
  people: { id: string; full_name: string }[]
  max?: number
  size?: AvatarSize
  className?: string
  empty?: ReactNode
}

export function AvatarStack({
  people,
  max = 3,
  size = 'sm',
  className,
  empty = null,
}: AvatarStackProps) {
  const unique = Array.from(new Map(people.map((person) => [person.id, person])).values())
  if (unique.length === 0) return <>{empty}</>

  const visible = unique.slice(0, max)
  const extra = unique.length - visible.length

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {visible.map((person) => (
        <Avatar key={person.id} name={person.full_name} seed={person.id} size={size} />
      ))}
      {extra > 0 ? (
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-canvas-deep text-[10px] font-bold text-ink-soft ring-2 ring-white/80">
          +{extra}
        </span>
      ) : null}
    </div>
  )
}
