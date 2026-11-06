import { demoApi } from './demoApi'
import { isSupabaseConfigured, requireSupabase } from './supabase'
import type {
  ConstructionObject,
  ObjectInput,
  ObjectWithTasks,
  Profile,
  Task,
  TaskDetailsInput,
  TaskHistoryEntry,
  TaskInput,
  TaskStatus,
  TaskWithRelations,
} from './types'

export interface CrmApi {
  listObjects(): Promise<ObjectWithTasks[]>
  getObject(objectId: string): Promise<ObjectWithTasks>
  listMyTasks(): Promise<TaskWithRelations[]>
  getTask(taskId: string): Promise<TaskWithRelations>
  listProfiles(): Promise<Profile[]>
  createObject(input: ObjectInput): Promise<ConstructionObject>
  updateObject(objectId: string, input: ObjectInput): Promise<ConstructionObject>
  deleteObject(objectId: string): Promise<void>
  createTask(input: TaskInput): Promise<Task>
  updateTask(taskId: string, input: TaskDetailsInput): Promise<Task>
  deleteTask(taskId: string): Promise<void>
  transitionTask(taskId: string, status: TaskStatus, comment: string): Promise<Task>
  listTaskHistory(taskId: string): Promise<TaskHistoryEntry[]>
}

const OBJECT_SELECT = `
  *,
  tasks (
    *,
    assignee:profiles!tasks_assignee_id_fkey ( id, full_name, role )
  )
`

function isMissingLocalizedColumn(message: string | undefined) {
  return Boolean(
    message &&
      /(name_ru|address_ru|description_ru|title_ru)/.test(message) &&
      /(does not exist|could not find|schema cache)/i.test(message),
  )
}

function friendlyDatabaseError(message: string | undefined, fallback: string) {
  if (!message) return new Error(fallback)
  if (message.includes('row-level security policy')) {
    return new Error('errors.permission')
  }
  if (message.includes('invalid input value for enum')) {
    return new Error('errors.invalidStatus')
  }
  return new Error(message)
}

async function runWithLocalizedFallback<T>(
  run: (
    payload: Record<string, unknown>,
  ) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  basePayload: Record<string, unknown>,
  localizedPayload: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  let result = await run(localizedPayload)

  if (result.error && isMissingLocalizedColumn(result.error.message)) {
    result = await run(basePayload)
  }

  if (result.error) throw friendlyDatabaseError(result.error.message, fallback)
  if (!result.data) throw new Error(fallback)
  return result.data
}

async function requireUserId() {
  const client = requireSupabase()
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    throw new Error('errors.sessionExpired')
  }
  return user.id
}

const supabaseApi: CrmApi = {
  async listObjects() {
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .select(OBJECT_SELECT)
      .order('created_at', { ascending: false })

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadObjects')
    return (data ?? []) as unknown as ObjectWithTasks[]
  },

  async getObject(objectId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .select(OBJECT_SELECT)
      .eq('id', objectId)
      .maybeSingle()

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadObject')
    if (!data) throw new Error('errors.objectNotFound')
    return data as unknown as ObjectWithTasks
  },

  async listMyTasks() {
    const userId = await requireUserId()
    const client = requireSupabase()
    // Requirements 09 and 12: the worker queue is always scoped to the signed-in
    // user. The matching RLS policy also enforces assignee_id = auth.uid().
    const { data, error } = await client
      .from('tasks')
      .select(
        `
          *,
          assignee:profiles!tasks_assignee_id_fkey ( id, full_name, role ),
          object:objects!tasks_object_id_fkey ( * )
        `,
      )
      .eq('assignee_id', userId)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadTasks')
    return (data ?? []) as unknown as TaskWithRelations[]
  },

  async getTask(taskId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .select(
        `
          *,
          assignee:profiles!tasks_assignee_id_fkey ( id, full_name, role ),
          object:objects!tasks_object_id_fkey ( * )
        `,
      )
      .eq('id', taskId)
      .maybeSingle()

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadTasks')
    if (!data) throw new Error('errors.taskNotFound')
    return data as unknown as TaskWithRelations
  },

  async listProfiles() {
    const client = requireSupabase()
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('full_name', { ascending: true })

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadProfiles')
    return (data ?? []) as Profile[]
  },

  async createObject(input) {
    const userId = await requireUserId()
    const client = requireSupabase()
    const basePayload = {
      name: input.name.trim(),
      address: input.address.trim(),
      description: input.description.trim(),
      created_by: userId,
    }
    const localizedPayload = {
      ...basePayload,
      ...(input.name_ru !== undefined
        ? { name_ru: input.name_ru?.trim() || null }
        : {}),
      ...(input.address_ru !== undefined
        ? { address_ru: input.address_ru?.trim() || null }
        : {}),
      ...(input.description_ru !== undefined
        ? { description_ru: input.description_ru?.trim() || null }
        : {}),
    }

    return runWithLocalizedFallback<ConstructionObject>(
      (payload) => client.from('objects').insert(payload).select().single(),
      basePayload,
      localizedPayload,
      'errors.saveObject',
    )
  },

  async updateObject(objectId, input) {
    const client = requireSupabase()
    const basePayload = {
      name: input.name.trim(),
      address: input.address.trim(),
      description: input.description.trim(),
    }
    const localizedPayload = {
      ...basePayload,
      ...(input.name_ru !== undefined
        ? { name_ru: input.name_ru?.trim() || null }
        : {}),
      ...(input.address_ru !== undefined
        ? { address_ru: input.address_ru?.trim() || null }
        : {}),
      ...(input.description_ru !== undefined
        ? { description_ru: input.description_ru?.trim() || null }
        : {}),
    }

    return runWithLocalizedFallback<ConstructionObject>(
      (payload) =>
        client.from('objects').update(payload).eq('id', objectId).select().single(),
      basePayload,
      localizedPayload,
      'errors.saveObject',
    )
  },

  async deleteObject(objectId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .delete()
      .eq('id', objectId)
      .select('id')

    if (error) throw friendlyDatabaseError(error.message, 'errors.deleteObject')
    if (!data || data.length === 0) throw new Error('errors.permission')
  },

  async createTask(input) {
    const userId = await requireUserId()
    const client = requireSupabase()
    const basePayload = {
      object_id: input.object_id,
      title: input.title.trim(),
      description: input.description.trim(),
      assignee_id: input.assignee_id,
      due_date: input.due_date || null,
      created_by: userId,
    }
    const localizedPayload = {
      ...basePayload,
      ...(input.title_ru !== undefined
        ? { title_ru: input.title_ru?.trim() || null }
        : {}),
      ...(input.description_ru !== undefined
        ? { description_ru: input.description_ru?.trim() || null }
        : {}),
    }

    return runWithLocalizedFallback<Task>(
      (payload) => client.from('tasks').insert(payload).select().single(),
      basePayload,
      localizedPayload,
      'errors.saveTask',
    )
  },

  async updateTask(taskId, input) {
    const client = requireSupabase()
    const basePayload = {
      title: input.title.trim(),
      description: input.description.trim(),
      assignee_id: input.assignee_id,
      due_date: input.due_date || null,
    }
    const localizedPayload = {
      ...basePayload,
      ...(input.title_ru !== undefined
        ? { title_ru: input.title_ru?.trim() || null }
        : {}),
      ...(input.description_ru !== undefined
        ? { description_ru: input.description_ru?.trim() || null }
        : {}),
    }

    return runWithLocalizedFallback<Task>(
      (payload) => client.from('tasks').update(payload).eq('id', taskId).select().single(),
      basePayload,
      localizedPayload,
      'errors.saveTask',
    )
  },

  async deleteTask(taskId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .select('id')

    if (error) throw friendlyDatabaseError(error.message, 'errors.deleteTask')
    if (!data || data.length === 0) throw new Error('errors.permission')
  },

  async transitionTask(taskId, status, comment) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .update({
        status,
        transition_comment: comment.trim() || null,
      })
      .eq('id', taskId)
      .select()
      .single()

    if (error) throw friendlyDatabaseError(error.message, 'errors.updateStatus')
    return data as Task
  },

  async listTaskHistory(taskId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('task_history')
      .select(
        `
          *,
          actor:profiles!task_history_changed_by_fkey ( id, full_name, role )
        `,
      )
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (error) throw friendlyDatabaseError(error.message, 'errors.loadHistory')
    return (data ?? []) as unknown as TaskHistoryEntry[]
  },
}

export const crm: CrmApi = isSupabaseConfigured ? supabaseApi : demoApi
export const isDemoMode = !isSupabaseConfigured
