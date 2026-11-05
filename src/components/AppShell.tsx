import { Outlet } from 'react-router-dom'
import { LockKeyhole, Sparkles } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useLanguage } from '../i18n/language-context'
import { Navbar } from './Navbar'

export function AppShell() {
  const { isDemo } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="flex min-h-dvh flex-col">
      {isDemo ? (
        <div className="border-b border-ink/10 bg-ink text-canvas">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center font-mono text-[9px] font-medium tracking-[0.13em] uppercase sm:text-[10px]">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-amber" />
            {t('shell.demoBanner')}
          </div>
        </div>
      ) : null}

      <Navbar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-7 pb-28 sm:px-6 sm:pt-9 md:pb-12 lg:px-8">
        <Outlet />
      </main>

      <footer className="hidden border-t border-line/70 md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 text-[10px] font-medium text-muted sm:px-6 lg:px-8">
          <span className="font-mono tracking-[0.12em] uppercase">{t('brand.name')}</span>
          <span className="flex items-center gap-1.5">
            {isDemo ? <Sparkles size={11} /> : <LockKeyhole size={11} />}
            {isDemo ? t('shell.localDemo') : t('shell.secureFooter')}
          </span>
        </div>
      </footer>
    </div>
  )
}
