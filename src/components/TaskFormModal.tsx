import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ClipboardList, Info, UserRound } from 'lucide-react'
import { crm } from '../lib/api'
import type { Profile, Task } from '../lib/types'
import { errorMessage, toDateInputValue } from '../lib/utils'
import { Button } from './Button'
import { InlineError } from './Feedback'
import { FormField } from './FormField'
import { inputClass, selectClass, textareaClass } from './form-styles'
import { Modal } from './Modal'
import { useToast } from './toast-context'

interface TaskFormModalProps {
  open: boolean
  onClose: () => void
  object: { id: string; name: string }
  task: Task | null
  onSaved: () => void
}

export function TaskFormModal({ open, ...props }: TaskFormModalProps) {
  if (!open) return null
  return (
    <TaskFormModalContent
      key={`${props.object.id}:${props.task?.id ?? 'new'}`}
      {...props}
    />
  )
}

function TaskFormModalContent({
  onClose,
  object,
  task,
  onSaved,
}: Omit<TaskFormModalProps, 'open'>) {
  const { toast } = useToast()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.due_date))
  const [workers, setWorkers] = useState<Profile[]>([])
  const [loadingWorkers, setLoadingWorkers] = useState(true)
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = Boolean(task)

  useEffect(() => {
    let active = true

    void crm
      .listProfiles()
      .then((profiles) => {
        if (!active) return
        const workerProfiles = profiles.filter((profile) => profile.role === 'worker')
        setWorkers(workerProfiles)
        setAssigneeId((current) => current || workerProfiles[0]?.id || '')
      })
      .catch((caught: unknown) => {
        if (!active) return
        setWorkerError(errorMessage(caught, 'Could not load workers.'))
      })
      .finally(() => {
        if (active) setLoadingWorkers(false)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Add a task title.')
      return
    }
    if (!assigneeId) {
      setError('Choose a worker to assign this task to.')
      return
    }

    setSaving(true)
    try {
      if (task) {
        const saved = await crm.updateTask(task.id, {
          title,
          description,
          assignee_id: assigneeId,
          due_date: dueDate || null,
        })
        toast({
          tone: 'success',
          title: 'Task updated',
          description: `${saved.title} is up to date.`,
        })
      } else {
        const saved = await crm.createTask({
          object_id: object.id,
          title,
          description,
          assignee_id: assigneeId,
          due_date: dueDate || null,
        })
        toast({
          tone: 'success',
          title: 'Task created',
          description: `${saved.title} was assigned and is ready to start.`,
        })
      }
      onSaved()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the task.'))
    } finally {
      setSaving(false)
    }
  }

  const noWorkers = !loadingWorkers && workers.length === 0

  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose()
      }}
      size="md"
      eyebrow={`Object · ${object.name}`}
      title={isEditing ? 'Edit task' : 'Create a task'}
      description={
        isEditing
          ? 'Update the brief, owner, or due date. Status history stays untouched.'
          : 'Give the crew a clear brief and one accountable owner.'
      }
      icon={
        <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-dark">
          <ClipboardList size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="task-form"
            loading={saving}
            disabled={noWorkers}
            variant="accent"
          >
            {isEditing ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
        {error ? <InlineError>{error}</InlineError> : null}
        {workerError ? <InlineError>{workerError}</InlineError> : null}
        {noWorkers ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber/20 bg-amber-soft/60 px-3.5 py-3">
            <Info size={14} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-[11px] leading-5 text-muted">
              There are no worker profiles yet. Create a worker account in Supabase first, then set
              its role to <span className="font-semibold text-ink">worker</span>.
            </p>
          </div>
        ) : null}

        <FormField label="Task title" htmlFor="task-title" required>
          <input
            id="task-title"
            data-autofocus
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Install second-floor drywall"
            maxLength={180}
            autoComplete="off"
            required
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Assignee" htmlFor="task-assignee" required>
            <div className="relative">
              <UserRound
                size={15}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
              />
              <select
                id="task-assignee"
                className={`${selectClass} pl-10`}
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
                disabled={loadingWorkers || noWorkers}
                required
              >
                <option value="" disabled>
                  {loadingWorkers ? 'Loading workers…' : 'Choose a worker'}
                </option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
              />
            </div>
          </FormField>

          <FormField label="Due date" htmlFor="task-due-date" hint="Optional. Shown as overdue after this day.">
            <input
              id="task-due-date"
              type="date"
              className={inputClass}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </FormField>
        </div>

        <FormField
          label="Task brief"
          htmlFor="task-description"
          hint="Include scope, drawings, materials, or anything the crew should know."
        >
          <textarea
            id="task-description"
            className={textareaClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the work and the expected finish…"
            rows={4}
            maxLength={4000}
          />
        </FormField>
      </form>
    </Modal>
  )
}
