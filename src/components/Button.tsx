import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'ghost'
  | 'success'
  | 'danger'
  | 'danger-outline'

type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-canvas shadow-sm hover:bg-ink-soft active:bg-ink disabled:bg-ink/50',
  accent:
    'bg-accent text-white shadow-sm hover:bg-accent-dark active:bg-accent-dark disabled:bg-accent/50',
  secondary:
    'border border-line-strong bg-paper text-ink shadow-sm hover:border-ink/30 hover:bg-surface active:bg-canvas',
  ghost: 'text-muted hover:bg-ink/[0.055] hover:text-ink',
  success: 'bg-moss text-white shadow-sm hover:bg-moss/90 active:bg-moss',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger/90 active:bg-danger',
  'danger-outline':
    'border border-danger/25 bg-paper text-danger shadow-sm hover:border-danger/40 hover:bg-danger-soft',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2.5 px-5 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}
