import { isLanguage, type Language } from './translations'

export const LANGUAGE_STORAGE_KEY = 'objects-and-tasks:language'

export function getLanguageFromPath(pathname: string): Language | null {
  const segment = pathname.split('/')[1]
  return isLanguage(segment) ? segment : null
}

export function stripLanguagePrefix(pathname: string): string {
  const match = pathname.match(/^\/(?:en|ru)(?=\/|$)/)
  if (!match) return pathname || '/'
  const rest = pathname.slice(match[0].length)
  return rest || '/'
}

export function localizePath(pathname: string, language: Language): string {
  const rest = stripLanguagePrefix(pathname)
  return rest === '/' ? `/${language}` : `/${language}${rest}`
}

export function storedLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

export function preferredLanguage(): Language {
  const stored = storedLanguage()
  if (stored) return stored

  const browserLanguage =
    typeof navigator !== 'undefined' ? navigator.language || navigator.languages?.[0] : null
  return browserLanguage?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
