import { useState, type FormEvent } from 'react'
import { Building2, Info } from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import {
  localizedObjectAddress,
  localizedObjectDescription,
  localizedObjectName,
  nextRussianValue,
} from '../lib/localized'
import type { ConstructionObject } from '../lib/types'
import { Button } from './Button'
import { InlineError } from './Feedback'
import { FormField } from './FormField'
import { inputClass, textareaClass } from './form-styles'
import { Modal } from './Modal'
import { useToast } from './toast-context'

interface ObjectModalProps {
  open: boolean
  onClose: () => void
  object: ConstructionObject | null
  onSaved: (object: ConstructionObject) => void
}

export function ObjectModal({ open, ...props }: ObjectModalProps) {
  if (!open) return null
  return <ObjectModalContent key={props.object?.id ?? 'new'} {...props} />
}

function ObjectModalContent({ onClose, object, onSaved }: Omit<ObjectModalProps, 'open'>) {
  const { t, errorText, language } = useLanguage()
  const { toast } = useToast()
  const [name, setName] = useState(object ? localizedObjectName(object, language) : '')
  const [address, setAddress] = useState(
    object ? localizedObjectAddress(object, language) : '',
  )
  const [description, setDescription] = useState(
    object ? localizedObjectDescription(object, language) : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = Boolean(object)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError(t('objectForm.errorName'))
      return
    }
    if (!address.trim()) {
      setError(t('objectForm.errorAddress'))
      return
    }

    setSaving(true)
    try {
      const payload =
        language === 'ru'
          ? {
              name: object?.name ?? name,
              address: object?.address ?? address,
              description: object?.description ?? description,
              name_ru: nextRussianValue(object?.name, object?.name_ru, name),
              address_ru: nextRussianValue(object?.address, object?.address_ru, address),
              description_ru: nextRussianValue(
                object?.description,
                object?.description_ru,
                description,
              ),
            }
          : {
              name,
              address,
              description,
              name_ru: object?.name_ru ?? null,
              address_ru: object?.address_ru ?? null,
              description_ru: object?.description_ru ?? null,
            }

      const saved = object
        ? await crm.updateObject(object.id, payload)
        : await crm.createObject(payload)

      toast({
        tone: 'success',
        title: isEditing ? t('objectForm.toastUpdated') : t('objectForm.toastCreated'),
        description: isEditing
          ? t('objectForm.toastUpdatedBody', {
              name: localizedObjectName(saved, language),
            })
          : t('objectForm.toastCreatedBody', {
              name: localizedObjectName(saved, language),
            }),
      })
      onSaved(saved)
      onClose()
    } catch (caught) {
      setError(errorText(caught, 'objectForm.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose()
      }}
      size="md"
      eyebrow={t('objectForm.eyebrow')}
      title={isEditing ? t('objectForm.editTitle') : t('objectForm.createTitle')}
      description={
        isEditing ? t('objectForm.editDescription') : t('objectForm.createDescription')
      }
      icon={
        <span className="grid size-11 place-items-center rounded-2xl bg-ink text-canvas">
          <Building2 size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="object-form" loading={saving} variant="accent">
            {isEditing ? t('common.saveChanges') : t('objectForm.createAction')}
          </Button>
        </>
      }
    >
      <form id="object-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? <InlineError>{error}</InlineError> : null}

        <FormField label={t('objectForm.name')} htmlFor="object-name" required>
          <input
            id="object-name"
            data-autofocus
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('objectForm.namePlaceholder')}
            maxLength={160}
            autoComplete="off"
            required
          />
        </FormField>

        <FormField label={t('objectForm.address')} htmlFor="object-address" required>
          <input
            id="object-address"
            className={inputClass}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t('objectForm.addressPlaceholder')}
            maxLength={300}
            autoComplete="street-address"
            required
          />
        </FormField>

        <FormField
          label={t('objectForm.description')}
          htmlFor="object-description"
          hint={t('objectForm.descriptionHint')}
        >
          <textarea
            id="object-description"
            className={textareaClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('objectForm.descriptionPlaceholder')}
            rows={4}
            maxLength={4000}
          />
        </FormField>

        <div className="flex items-start gap-2.5 rounded-xl border border-blue/10 bg-blue-soft/55 px-3.5 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-blue" />
          <p className="text-[11px] leading-5 text-muted">{t('objectForm.info')}</p>
        </div>
      </form>
    </Modal>
  )
}
