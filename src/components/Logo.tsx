import { HardHat } from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { cn } from '../lib/utils'

interface LogoProps {
  tone?: 'light' | 'dark'
  compact?: boolean
  className?: string
}

export function Logo({ tone = 'light', compact = false, className }: LogoProps) {
  const { t } = useLanguage()

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-[14px] shadow-sm',
          tone === 'light' ? 'bg-ink text-canvas' : 'bg-canvas text-ink',
        )}
      >
        <HardHat size={19} strokeWidth={2} />
      </div>
      {!compact ? (
        <div className="min-w-0">
          <p
            className={cn(
              'font-display text-[16px] leading-none font-bold tracking-[-0.025em]',
              tone === 'light' ? 'text-ink' : 'text-canvas',
            )}
          >
            {t('brand.nameFirst')}{' '}
            <span className="text-accent">{t('brand.nameConnector')}</span>{' '}
            {t('brand.nameLast')}
          </p>
          <p
            className={cn(
              'mt-1.5 font-mono text-[8.5px] font-medium tracking-[0.22em] uppercase',
              tone === 'light' ? 'text-muted' : 'text-canvas/45',
            )}
          >
            {t('brand.subtitle')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
