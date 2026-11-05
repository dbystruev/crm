import { createContext, useContext } from 'react'
import type { Language, TranslationKey } from './translations'

export type TranslationParams = Record<string, string | number>
export type DueTone = 'none' | 'overdue' | 'today' | 'soon' | 'normal'

export interface DueDateInfo {
  label: string
  tone: DueTone
}

export interface LanguageContextValue {
  language: Language
  t: (key: TranslationKey, params?: TranslationParams) => string
  setLanguage: (language: Language) => void
  path: (pathname: string) => string
  errorText: (error: unknown, fallbackKey?: TranslationKey) => string
  formatDate: (value: string | null | undefined, options?: Intl.DateTimeFormatOptions) => string
  formatDateTime: (value: string | null | undefined) => string
  formatShortDate: (value: string | null | undefined) => string
  dueDateInfo: (dueDate: string | null | undefined, accepted?: boolean) => DueDateInfo
  getTodayLabel: () => string
  greeting: () => string
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside a LanguageProvider.')
  }
  return context
}
