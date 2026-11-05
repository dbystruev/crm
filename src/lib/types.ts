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
  created_by: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  object_id: string
  title: string
  description: string
  assignee_id: string
  status: TaskStatus
  due_date: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TaskWithRelations extends Task {
  assignee?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
  object?: Pick<ConstructionObject, 'id' | 'name' | 'address'> | null
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
}

export interface TaskInput {
  object_id: string
  title: string
  description: string
  assignee_id: string
  due_date: string | null
}

export interface TaskDetailsInput {
  title: string
  description: string
  assignee_id: string
  due_date: string | null
}

export type DemoAccountKey = 'manager' | 'worker1' | 'worker2'

export interface DemoAccount {
  key: DemoAccountKey
  label: string
  name: string
  email: string
  password: string
  role: UserRole
  blurb: string
}

export interface TransitionOption {
  to: TaskStatus
  label: string
  confirmationTitle: string
  confirmationBody: string
  confirmLabel: string
  requiresComment: boolean
  tone: 'neutral' | 'accent' | 'success' | 'danger'
}
