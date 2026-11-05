import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

const avatarPalettes = [
  'bg-accent-soft text-accent-dark',
  'bg-blue-soft text-blue',
  'bg-moss-soft text-moss',
  'bg-amber-soft text-amber',
  'bg-plum-soft text-plum',
] as const

export function avatarPalette(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return avatarPalettes[Math.abs(hash) % avatarPalettes.length]
}

export function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`)
  }
  return new Date(value)
}

export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
) {
  if (!value) return '—'
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', options).format(date)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatShortDate(value: string | null | undefined) {
  return formatDate(value, { month: 'short', day: 'numeric' })
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysFromToday(value: string | null | undefined) {
  if (!value) return null
  const target = startOfDay(parseDate(value))
  if (Number.isNaN(target.getTime())) return null
  const today = startOfDay(new Date())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function dueDateInfo(
  dueDate: string | null | undefined,
  accepted = false,
): { label: string; tone: 'none' | 'overdue' | 'today' | 'soon' | 'normal' } {
  if (!dueDate) return { label: 'No due date', tone: 'none' }
  if (accepted) return { label: formatShortDate(dueDate), tone: 'normal' }

  const days = daysFromToday(dueDate)
  if (days === null) return { label: 'No due date', tone: 'none' }
  if (days < 0) {
    const count = Math.abs(days)
    return { label: `${count} day${count === 1 ? '' : 's'} overdue`, tone: 'overdue' }
  }
  if (days === 0) return { label: 'Due today', tone: 'today' }
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' }
  return { label: `Due ${formatShortDate(dueDate)}`, tone: 'normal' }
}

export function getTodayLabel() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function progressPercent(total: number, completed: number) {
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (message.trim()) return message
  }
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export function toDateInputValue(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}
