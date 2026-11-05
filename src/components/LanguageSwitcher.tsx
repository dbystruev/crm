import { useLanguage } from '../i18n/language-context'
import { LANGUAGES } from '../i18n/translations'
import { cn } from '../lib/utils'

interface LanguageSwitcherProps {
  className?: string
  tone?: 'light' | 'dark'
}

export function LanguageSwitcher({ className, tone = 'light' }: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border p-0.5',
        tone === 'dark'
          ? 'border-white/15 bg-white/10'
          : 'border-line-strong/70 bg-surface',
        className,
      )}
    >
      {LANGUAGES.map((value) => {
        const active = value === language
        return (
          <button
            key={value}
            type="button"
            onClick={() => setLanguage(value)}
            aria-label={value === 'en' ? t('nav.english') : t('nav.russian')}
            aria-pressed={active}
            title={value === 'en' ? t('nav.switchToEnglish') : t('nav.switchToRussian')}
            className={cn(
              'rounded-full px-2 py-1 font-mono text-[9px] font-semibold tracking-[0.08em] uppercase transition',
              active
                ? tone === 'dark'
                  ? 'bg-canvas text-ink'
                  : 'bg-ink text-canvas'
                : tone === 'dark'
                  ? 'text-canvas/60 hover:text-canvas'
                  : 'text-muted hover:text-ink',
            )}
          >
            {value}
          </button>
        )
      })}
    </div>
  )
}
