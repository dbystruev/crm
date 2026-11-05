import { cn } from '../lib/utils'

export const inputClass =
  'w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-paper focus:ring-4 focus:ring-accent/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

export const textareaClass = cn(inputClass, 'min-h-24 resize-y leading-6')

export const selectClass = cn(inputClass, 'appearance-none pr-10')
