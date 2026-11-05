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
  listProfiles(): Promise<Profile[]>
  createObject(input: ObjectInput): Promise<ConstructionObject>
  updateObject(objectId: string, input: ObjectInput): Promise<ConstructionObject>
  createTask(input: TaskInput): Promise<Task>
  updateTask(taskId: string, input: TaskDetailsInput): Promise<Task>
  transitionTask(taskId: string, status: TaskStatus, comment: string): Promise<Task>
  listTaskHistory(taskId: string): Promise<TaskHistoryEntry[]>
}

const OBJECT_SELECT = `
  id, name, address, description, created_by, created_at, updated_at,
  tasks (
    id, object_id, title, description, assignee_id, status, due_date,
    created_by, created_at, updated_at,
    assignee:profiles!tasks_assignee_id_fkey ( id, full_name, role )
  )
`

function friendlyDatabaseError(message: string | undefined, fallback: string) {
  if (!message) return new Error(fallback)
  if (message.includes('row-level security policy')) {
    return new Error('You do not have permission to perform this action.')
  }
  if (message.includes('invalid input value for enum')) {
    return new Error('That status change is not valid for this task.')
  }
  return new Error(message)
}

async function requireUserId() {
  const client = requireSupabase()
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    throw new Error('Your session has expired. Please sign in again.')
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

    if (error) throw friendlyDatabaseError(error.message, 'Could not load objects.')
    return (data ?? []) as unknown as ObjectWithTasks[]
  },

  async getObject(objectId) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .select(OBJECT_SELECT)
      .eq('id', objectId)
      .maybeSingle()

    if (error) throw friendlyDatabaseError(error.message, 'Could not load this object.')
    if (!data) throw new Error('Object not found, or you do not have access to it.')
    return data as unknown as ObjectWithTasks
  },

  async listMyTasks() {
    const userId = await requireUserId()
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .select(
        `
          *,
          assignee:profiles!tasks_assignee_id_fkey ( id, full_name, role ),
          object:objects!tasks_object_id_fkey ( id, name, address )
        `,
      )
      .eq('assignee_id', userId)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (error) throw friendlyDatabaseError(error.message, 'Could not load your tasks.')
    return (data ?? []) as unknown as TaskWithRelations[]
  },

  async listProfiles() {
    const client = requireSupabase()
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('full_name', { ascending: true })

    if (error) throw friendlyDatabaseError(error.message, 'Could not load team profiles.')
    return (data ?? []) as Profile[]
  },

  async createObject(input) {
    const userId = await requireUserId()
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .insert({
        name: input.name.trim(),
        address: input.address.trim(),
        description: input.description.trim(),
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw friendlyDatabaseError(error.message, 'Could not create the object.')
    return data as ConstructionObject
  },

  async updateObject(objectId, input) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('objects')
      .update({
        name: input.name.trim(),
        address: input.address.trim(),
        description: input.description.trim(),
      })
      .eq('id', objectId)
      .select()
      .single()

    if (error) throw friendlyDatabaseError(error.message, 'Could not update the object.')
    return data as ConstructionObject
  },

  async createTask(input) {
    const userId = await requireUserId()
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .insert({
        object_id: input.object_id,
        title: input.title.trim(),
        description: input.description.trim(),
        assignee_id: input.assignee_id,
        due_date: input.due_date || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) throw friendlyDatabaseError(error.message, 'Could not create the task.')
    return data as Task
  },

  async updateTask(taskId, input) {
    const client = requireSupabase()
    const { data, error } = await client
      .from('tasks')
      .update({
        title: input.title.trim(),
        description: input.description.trim(),
        assignee_id: input.assignee_id,
        due_date: input.due_date || null,
      })
      .eq('id', taskId)
      .select()
      .single()

    if (error) throw friendlyDatabaseError(error.message, 'Could not update the task.')
    return data as Task
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

    if (error) throw friendlyDatabaseError(error.message, 'Could not update the task status.')
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

    if (error) throw friendlyDatabaseError(error.message, 'Could not load the task history.')
    return (data ?? []) as unknown as TaskHistoryEntry[]
  },
}

export const crm: CrmApi = isSupabaseConfigured ? supabaseApi : demoApi
export const isDemoMode = !isSupabaseConfigured
