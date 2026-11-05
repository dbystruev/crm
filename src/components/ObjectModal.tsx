import { useState, type FormEvent } from 'react'
import { Building2, Info } from 'lucide-react'
import { crm } from '../lib/api'
import type { ConstructionObject } from '../lib/types'
import { errorMessage } from '../lib/utils'
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
      setError('Add an object name.')
      return
    }
    if (!address.trim()) {
      setError('Add the site address so the crew knows where to go.')
      return
    }

    setSaving(true)
    try {
      const saved = object
        ? await crm.updateObject(object.id, { name, address, description })
        : await crm.createObject({ name, address, description })

      toast({
        tone: 'success',
        title: isEditing ? 'Object updated' : 'Object created',
        description: isEditing
          ? `${saved.name} is up to date.`
          : `${saved.name} is ready for tasks.`,
      })
      onSaved(saved)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the object.'))
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
      eyebrow="Object details"
      title={isEditing ? 'Edit object' : 'Create an object'}
      description={
        isEditing
          ? 'Update the site information shown to your team.'
          : 'Add a construction site to the portfolio. You can create tasks right after.'
      }
      icon={
        <span className="grid size-11 place-items-center rounded-2xl bg-ink text-canvas">
          <Building2 size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="object-form" loading={saving} variant="accent">
            {isEditing ? 'Save changes' : 'Create object'}
          </Button>
        </>
      }
    >
      <form id="object-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? <InlineError>{error}</InlineError> : null}

        <FormField label="Object name" htmlFor="object-name" required>
          <input
            id="object-name"
            data-autofocus
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Riverside Residences"
            maxLength={160}
            autoComplete="off"
            required
          />
        </FormField>

        <FormField label="Site address" htmlFor="object-address" required>
          <input
            id="object-address"
            className={inputClass}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Street, city, state"
            maxLength={300}
            autoComplete="street-address"
            required
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="object-description"
          hint="A short overview of the scope, phase, or access notes."
        >
          <textarea
            id="object-description"
            className={textareaClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What are we building or renovating here?"
            rows={4}
            maxLength={4000}
          />
        </FormField>

        <div className="flex items-start gap-2.5 rounded-xl border border-blue/10 bg-blue-soft/55 px-3.5 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-blue" />
          <p className="text-[11px] leading-5 text-muted">
            Workers only see an object after they have at least one assigned task on it. Access is
            enforced by the database, not just this screen.
          </p>
        </div>
      </form>
    </Modal>
  )
}
