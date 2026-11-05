import { useState, type FormEvent } from 'react'
import { Building2, Info } from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
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
  const { t, errorText } = useLanguage()
  const { toast } = useToast()
  const [name, setName] = useState(object?.name ?? '')
  const [address, setAddress] = useState(object?.address ?? '')
  const [description, setDescription] = useState(object?.description ?? '')
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
      const saved = object
        ? await crm.updateObject(object.id, { name, address, description })
        : await crm.createObject({ name, address, description })

      toast({
        tone: 'success',
        title: isEditing ? t('objectForm.toastUpdated') : t('objectForm.toastCreated'),
        description: isEditing
          ? t('objectForm.toastUpdatedBody', { name: saved.name })
          : t('objectForm.toastCreatedBody', { name: saved.name }),
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
