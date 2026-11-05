import { Link } from 'react-router-dom'
import { ArrowLeft, Construction } from 'lucide-react'
import { Logo } from '../components/Logo'

export function NotFoundPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-4">
      <div className="bg-blueprint-light pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative w-full max-w-md text-center">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-card border border-line bg-paper p-8 shadow-card">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-dark">
            <Construction size={24} />
          </div>
          <p className="mt-5 font-mono text-[9px] font-medium tracking-[0.16em] text-accent uppercase">
            Error 404
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            This page is still under construction
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            The address you followed does not exist in this workspace.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-semibold text-canvas transition hover:bg-ink-soft"
          >
            <ArrowLeft size={14} />
            Back to objects
          </Link>
        </div>
      </div>
    </div>
  )
}
