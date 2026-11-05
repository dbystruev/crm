import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ClipboardList, Info, UserRound } from 'lucide-react'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import {
  localizedTaskDescription,
  localizedTaskTitle,
  nextRussianValue,
} from '../lib/localized'
import type { Profile, Task } from '../lib/types'
import { toDateInputValue } from '../lib/utils'
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
  const { t, errorText, language } = useLanguage()
  const { toast } = useToast()
  const [title, setTitle] = useState(task ? localizedTaskTitle(task, language) : '')
  const [description, setDescription] = useState(
    task ? localizedTaskDescription(task, language) : '',
  )
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
        setWorkerError(errorText(caught, 'taskForm.loadWorkersError'))
      })
      .finally(() => {
        if (active) setLoadingWorkers(false)
      })

    return () => {
      active = false
    }
  }, [errorText])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError(t('taskForm.errorTitle'))
      return
    }
    if (!assigneeId) {
      setError(t('taskForm.errorAssignee'))
      return
    }

    setSaving(true)
    try {
      const localizedPayload =
        language === 'ru'
          ? {
              title: task?.title ?? title,
              description: task?.description ?? description,
              title_ru: nextRussianValue(task?.title, task?.title_ru, title),
              description_ru: nextRussianValue(
                task?.description,
                task?.description_ru,
                description,
              ),
            }
          : {
              title,
              description,
              title_ru: task?.title_ru ?? null,
              description_ru: task?.description_ru ?? null,
            }

      if (task) {
        const saved = await crm.updateTask(task.id, {
          ...localizedPayload,
          assignee_id: assigneeId,
          due_date: dueDate || null,
        })
        toast({
          tone: 'success',
          title: t('taskForm.toastUpdated'),
          description: t('taskForm.toastUpdatedBody', {
            title: localizedTaskTitle(saved, language),
          }),
        })
      } else {
        const saved = await crm.createTask({
          object_id: object.id,
          ...localizedPayload,
          assignee_id: assigneeId,
          due_date: dueDate || null,
        })
        toast({
          tone: 'success',
          title: t('taskForm.toastCreated'),
          description: t('taskForm.toastCreatedBody', {
            title: localizedTaskTitle(saved, language),
          }),
        })
      }
      onSaved()
      onClose()
    } catch (caught) {
      setError(errorText(caught, 'taskForm.saveError'))
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
      eyebrow={t('taskForm.eyebrow', { name: object.name })}
      title={isEditing ? t('taskForm.editTitle') : t('taskForm.createTitle')}
      description={
        isEditing ? t('taskForm.editDescription') : t('taskForm.createDescription')
      }
      icon={
        <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-dark">
          <ClipboardList size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="task-form"
            loading={saving}
            disabled={noWorkers}
            variant="accent"
          >
            {isEditing ? t('common.saveChanges') : t('taskForm.createAction')}
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
              {t('taskForm.noWorkersBefore')}
              <span className="font-semibold text-ink">{t('taskForm.noWorkersRole')}</span>
              {t('taskForm.noWorkersAfter')}
            </p>
          </div>
        ) : null}

        <FormField label={t('taskForm.title')} htmlFor="task-title" required>
          <input
            id="task-title"
            data-autofocus
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('taskForm.titlePlaceholder')}
            maxLength={180}
            autoComplete="off"
            required
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('taskForm.assignee')} htmlFor="task-assignee" required>
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
                  {loadingWorkers ? t('taskForm.loadingWorkers') : t('taskForm.chooseWorker')}
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

          <FormField
            label={t('taskForm.dueDate')}
            htmlFor="task-due-date"
            hint={t('taskForm.dueDateHint')}
          >
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
          label={t('taskForm.brief')}
          htmlFor="task-description"
          hint={t('taskForm.briefHint')}
        >
          <textarea
            id="task-description"
            className={textareaClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('taskForm.briefPlaceholder')}
            rows={4}
            maxLength={4000}
          />
        </FormField>
      </form>
    </Modal>
  )
}
