import type { TranslationKey } from '../i18n/translations'

export type UserRole = 'manager' | 'worker'

export type TaskStatus =
  | 'new'
  | 'in_progress'
  | 'under_review'
  | 'accepted'
  | 'revision_requested'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface ConstructionObject {
  id: string
  name: string
  address: string
  description: string
  name_ru?: string | null
  address_ru?: string | null
  description_ru?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  object_id: string
  title: string
  description: string
  title_ru?: string | null
  description_ru?: string | null
  assignee_id: string
  status: TaskStatus
  due_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TaskWithRelations extends Task {
  assignee?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
  object?: Pick<
    ConstructionObject,
    'id' | 'name' | 'address' | 'name_ru' | 'address_ru'
  > | null
}

export interface ObjectWithTasks extends ConstructionObject {
  tasks: TaskWithRelations[]
}

export interface TaskHistoryEntry {
  id: string
  task_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  changed_by: string | null
  comment: string | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

export interface ObjectInput {
  name: string
  address: string
  description: string
  name_ru?: string | null
  address_ru?: string | null
  description_ru?: string | null
}

export interface TaskInput {
  object_id: string
  title: string
  description: string
  title_ru?: string | null
  description_ru?: string | null
  assignee_id: string
  due_date: string | null
}

export interface TaskDetailsInput {
  title: string
  description: string
  title_ru?: string | null
  description_ru?: string | null
  assignee_id: string
  due_date: string | null
}

export type DemoAccountKey = 'manager' | 'worker1' | 'worker2'

export interface DemoAccount {
  key: DemoAccountKey
  name: string
  email: string
  password: string
  role: UserRole
}

export interface TransitionOption {
  to: TaskStatus
  labelKey: TranslationKey
  titleKey: TranslationKey
  bodyKey: TranslationKey
  confirmKey: TranslationKey
  requiresComment: boolean
  tone: 'neutral' | 'accent' | 'success' | 'danger'
}
