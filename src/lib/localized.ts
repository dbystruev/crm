import type { Language } from '../i18n/translations'

export function localizedText(
  language: Language,
  english: string | null | undefined,
  russian: string | null | undefined,
) {
  if (language === 'ru') {
    const value = russian?.trim()
    if (value) return value
  }
  return english ?? ''
}

export function nextRussianValue(
  english: string | null | undefined,
  existingRussian: string | null | undefined,
  next: string,
) {
  if (existingRussian?.trim()) return next
  if (english !== null && english !== undefined && english === next) return null
  return next
}

export function localizedObjectName(
  object: { name: string; name_ru?: string | null },
  language: Language,
) {
  return localizedText(language, object.name, object.name_ru)
}

export function localizedObjectAddress(
  object: { address: string; address_ru?: string | null },
  language: Language,
) {
  return localizedText(language, object.address, object.address_ru)
}

export function localizedObjectDescription(
  object: { description: string; description_ru?: string | null },
  language: Language,
) {
  return localizedText(language, object.description, object.description_ru)
}

export function localizedTaskTitle(
  task: { title: string; title_ru?: string | null },
  language: Language,
) {
  return localizedText(language, task.title, task.title_ru)
}

export function localizedTaskDescription(
  task: { description: string; description_ru?: string | null },
  language: Language,
) {
  return localizedText(language, task.description, task.description_ru)
}
