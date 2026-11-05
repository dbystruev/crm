import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { ToastContext, type ToastOptions, type ToastTone } from './toast-context'

interface ToastItem extends ToastOptions {
  id: number
}

let toastCounter = 0

const toneStyles: Record<
  ToastTone,
  { icon: typeof CheckCircle2; iconClass: string; barClass: string }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: 'bg-moss-soft text-moss',
    barClass: 'bg-moss',
  },
  error: {
    icon: AlertTriangle,
    iconClass: 'bg-danger-soft text-danger',
    barClass: 'bg-danger',
  },
  info: {
    icon: Info,
    iconClass: 'bg-blue-soft text-blue',
    barClass: 'bg-blue',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    ({ title, description, tone = 'success' }: ToastOptions) => {
      toastCounter += 1
      const id = toastCounter
      setItems((current) => [...current.slice(-2), { id, title, description, tone }])
      const timer = window.setTimeout(() => dismiss(id), 4800)
      timers.current.push(timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed right-4 bottom-20 z-[120] flex w-[min(370px,calc(100vw-2rem))] flex-col gap-2.5 md:bottom-6"
          aria-live="polite"
          aria-label="Notifications"
        >
          {items.map((item) => {
            const tone = toneStyles[item.tone ?? 'success']
            const ToneIcon = tone.icon
            return (
              <div
                key={item.id}
                className="animate-toast pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border border-line bg-paper p-4 pr-10 shadow-lift"
                role="status"
              >
                <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', tone.iconClass)}>
                  <ToneIcon size={16} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-xs leading-5 text-muted">{item.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-faint transition hover:bg-canvas hover:text-ink"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
                <span className={cn('absolute inset-y-0 left-0 w-1', tone.barClass)} />
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
