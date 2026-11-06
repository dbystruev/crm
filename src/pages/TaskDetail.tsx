import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/auth-context'
import { useAsyncData } from '../hooks/useAsyncData'
import { useLanguage } from '../i18n/language-context'
import { crm } from '../lib/api'
import type { Task } from '../lib/types'
import { ErrorPanel, Skeleton } from '../components/Feedback'
import { TaskModal } from '../components/TaskModal'

// Requirement 08: a dedicated task-detail route. TaskModal's page variant
// renders the task card with task data, role-dependent ActionButtons, and the
// HistoryTimeline together in the main layout.
export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const { t, path, errorText } = useLanguage()
  const navigate = useNavigate()
  const { data: task, loading, error, reload, setData } = useAsyncData(
    async () => {
      if (!id) throw new Error('errors.taskNotFound')
      return crm.getTask(id)
    },
    [id],
  )

  if (!profile) return null

  if (loading) {
    return (
      <div className="animate-fade-in">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-[28rem] w-full rounded-card" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="animate-fade-in">
        <Link
          to={path('/')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
        >
          <ArrowLeft size={14} />
          {t('object.back')}
        </Link>
        <ErrorPanel
          className="mt-5"
          title={t('task.details')}
          message={errorText(error, 'errors.loadTasks')}
          onRetry={() => {
            void reload()
          }}
        />
      </div>
    )
  }

  const handleTaskUpdated = (updated: Task) => {
    setData((current) => (current ? { ...current, ...updated } : current))
  }

  return (
    <div className="animate-fade-in">
      <Link
        to={path('/')}
        className="group inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} className="transition group-hover:-translate-x-0.5" />
        {t('object.back')}
      </Link>
      <div className="mt-5">
        <TaskModal
          variant="page"
          open
          task={task}
          object={task.object ?? null}
          onClose={() => navigate(path('/'))}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={() => navigate(path('/'))}
        />
      </div>
    </div>
  )
}
