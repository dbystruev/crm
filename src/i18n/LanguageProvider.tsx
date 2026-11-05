import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { daysFromToday, errorMessage, parseDate } from '../lib/utils'
import { resolveErrorKey } from './errors'
import {
  LanguageContext,
  type DueDateInfo,
  type LanguageContextValue,
  type TranslationParams,
} from './language-context'
import {
  LANGUAGE_STORAGE_KEY,
  getLanguageFromPath,
  localizePath,
  preferredLanguage,
} from './paths'
import { interpolate, isLanguage, translations, type Language, type TranslationKey } from './translations'

const DATE_DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}

const SHORT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

function formatWith(
  locale: string,
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  if (!value) return '—'
  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  const language: Language = getLanguageFromPath(location.pathname) ?? preferredLanguage()
  const locale = language === 'ru' ? 'ru-RU' : 'en-US'

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) =>
      interpolate(translations[language][key], params),
    [language],
  )

  const setLanguage = useCallback(
    (next: Language) => {
      if (!isLanguage(next)) return
      const target = localizePath(location.pathname, next)
      navigate(
        { pathname: target, search: location.search, hash: location.hash },
        { replace: true },
      )
    },
    [location.pathname, location.search, location.hash, navigate],
  )

  const path = useCallback((pathname: string) => localizePath(pathname, language), [language])

  const formatDate = useCallback(
    (value: string | null | undefined, options: Intl.DateTimeFormatOptions = DATE_DEFAULT_OPTIONS) =>
      formatWith(locale, value, options),
    [locale],
  )

  const formatDateTime = useCallback(
    (value: string | null | undefined) => formatWith(locale, value, DATE_TIME_OPTIONS),
    [locale],
  )

  const formatShortDate = useCallback(
    (value: string | null | undefined) => formatWith(locale, value, SHORT_DATE_OPTIONS),
    [locale],
  )

  const dueDateInfo = useCallback(
    (dueDate: string | null | undefined, accepted = false): DueDateInfo => {
      if (!dueDate) return { label: t('due.none'), tone: 'none' }
      if (accepted) return { label: formatShortDate(dueDate), tone: 'normal' }

      const days = daysFromToday(dueDate)
      if (days === null) return { label: t('due.none'), tone: 'none' }
      if (days < 0) {
        return { label: t('due.overdue', { count: Math.abs(days) }), tone: 'overdue' }
      }
      if (days === 0) return { label: t('due.today'), tone: 'today' }
      if (days === 1) return { label: t('due.tomorrow'), tone: 'soon' }
      return { label: t('due.on', { date: formatShortDate(dueDate) }), tone: 'normal' }
    },
    [formatShortDate, t],
  )

  const getTodayLabel = useCallback(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(new Date()),
    [locale],
  )

  const greeting = useCallback(() => {
    const hour = new Date().getHours()
    if (hour < 12) return t('greeting.morning')
    if (hour < 18) return t('greeting.afternoon')
    return t('greeting.evening')
  }, [t])

  const errorText = useCallback(
    (error: unknown, fallbackKey: TranslationKey = 'errors.generic') => {
      const message = errorMessage(error, fallbackKey)
      const key = resolveErrorKey(message)
      return key ? t(key) : message
    },
    [t],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // Language switching still works when storage is unavailable.
    }
    document.documentElement.lang = language
    document.title = t('brand.documentTitle')
  }, [language, t])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t,
      setLanguage,
      path,
      errorText,
      formatDate,
      formatDateTime,
      formatShortDate,
      dueDateInfo,
      getTodayLabel,
      greeting,
    }),
    [
      language,
      t,
      setLanguage,
      path,
      errorText,
      formatDate,
      formatDateTime,
      formatShortDate,
      dueDateInfo,
      getTodayLabel,
      greeting,
    ],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
