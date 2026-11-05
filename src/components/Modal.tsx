import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { cn } from '../lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  footer?: ReactNode
  size?: ModalSize
  layer?: 'base' | 'top'
  className?: string
  bodyClassName?: string
  footerClassName?: string
  headerClassName?: string
  ariaLabel?: string
  showClose?: boolean
  closeOnEscape?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

let openModalCount = 0
const modalStack: string[] = []

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const previousOverflow = document.body.style.overflow
    openModalCount += 1
    document.body.style.overflow = 'hidden'

    return () => {
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) {
        document.body.style.overflow = previousOverflow
      }
    }
  }, [active])
}

export function Modal({
  open,
  onClose,
  children,
  title,
  eyebrow,
  description,
  icon,
  footer,
  size = 'md',
  layer = 'base',
  className,
  bodyClassName,
  footerClassName,
  headerClassName,
  ariaLabel,
  showClose = true,
  closeOnEscape = true,
}: ModalProps) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const headingId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscapeRef.current = closeOnEscape
  }, [onClose, closeOnEscape])

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return

    const modalToken = headingId
    modalStack.push(modalToken)

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => {
      const autofocus = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      ;(autofocus ?? panelRef.current)?.focus()
    }, 30)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== modalToken) return

      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)

      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === first || !panelRef.current.contains(activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (activeElement === last || !panelRef.current.contains(activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      const index = modalStack.lastIndexOf(modalToken)
      if (index !== -1) modalStack.splice(index, 1)
      previouslyFocused?.focus?.()
    }
  }, [open, headingId])

  if (!open) return null

  return createPortal(
    <div
      className={cn('fixed inset-0 overflow-y-auto', layer === 'top' ? 'z-[90]' : 'z-50')}
      aria-hidden={false}
    >
      <div
        className="animate-overlay absolute inset-0 bg-ink/55 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex min-h-full items-center justify-center p-3 sm:p-6">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={!title ? ariaLabel : undefined}
          aria-labelledby={title ? headingId : undefined}
          tabIndex={-1}
          className={cn(
            'animate-modal relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-[1.5rem] border border-white/70 bg-paper shadow-modal outline-none sm:max-h-[calc(100dvh-3rem)]',
            sizeClasses[size],
            className,
          )}
        >
          {title || eyebrow || icon ? (
            <header
              className={cn(
                'relative flex shrink-0 items-start gap-3.5 border-b border-line/80 px-5 py-5 sm:px-6',
                headerClassName,
              )}
            >
              {icon ? <div className="shrink-0">{icon}</div> : null}
              <div className="min-w-0 flex-1 pr-8">
                {eyebrow ? (
                  <div className="mb-1.5 font-mono text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
                    {eyebrow}
                  </div>
                ) : null}
                {title ? (
                  <h2
                    id={headingId}
                    className="font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-2xl"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <div className="mt-1.5 text-sm leading-6 text-muted">{description}</div>
                ) : null}
              </div>
            </header>
          ) : null}

          <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>
            {children}
          </div>

          {footer ? (
            <footer
              className={cn(
                'flex shrink-0 flex-col-reverse gap-2.5 border-t border-line/80 bg-canvas/45 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6',
                footerClassName,
              )}
            >
              {footer}
            </footer>
          ) : null}

          {showClose ? (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 right-3.5 z-10 grid size-9 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
              aria-label={t('common.closeDialog')}
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
