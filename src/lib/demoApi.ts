import { DEMO_ACCOUNTS } from './demoAccounts'
import type {
  ConstructionObject,
  DemoAccountKey,
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

const DATABASE_KEY = 'objects-and-tasks:demo-database:v1'
const SESSION_KEY = 'objects-and-tasks:demo-session:v1'

const MANAGER_ID = '11111111-1111-4111-8111-111111111111'
const WORKER_1_ID = '22222222-2222-4222-8222-222222222222'
const WORKER_2_ID = '33333333-3333-4333-8333-333333333333'

const PROFILE_IDS: Record<DemoAccountKey, string> = {
  manager: MANAGER_ID,
  worker1: WORKER_1_ID,
  worker2: WORKER_2_ID,
}

function dateTimeDaysAgo(daysAgo: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function dateOnlyInDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const profiles: Profile[] = DEMO_ACCOUNTS.map((account) => ({
  id: PROFILE_IDS[account.key],
  full_name: account.name,
  role: account.role,
  created_at: dateTimeDaysAgo(180, 9),
}))

const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

interface DemoDatabase {
  objects: ConstructionObject[]
  tasks: Task[]
  history: TaskHistoryEntry[]
}

interface SeedStep {
  to: TaskStatus
  by: string
  daysAgo: number
  comment?: string
}

interface SeedTask {
  id: string
  objectId: string
  title: string
  description: string
  assigneeId: string
  dueInDays: number
  createdDaysAgo: number
  steps: SeedStep[]
}

const OBJECT_IDS = {
  riverside: '0b000000-0000-4000-8000-000000000001',
  hillcrest: '0b000000-0000-4000-8000-000000000002',
  northline: '0b000000-0000-4000-8000-000000000003',
} as const

const seedTasks: SeedTask[] = [
  {
    id: '7a000000-0000-4000-8000-000000000001',
    objectId: OBJECT_IDS.riverside,
    title: 'Electrical rough-in — floors 2 & 3',
    description:
      'Pull new circuits for all 24 units on the second and third floors. Includes panel labeling, conduit runs, and outlet placement per drawing E-204.',
    assigneeId: WORKER_1_ID,
    dueInDays: 4,
    createdDaysAgo: 18,
    steps: [{ to: 'in_progress', by: WORKER_1_ID, daysAgo: 15 }],
  },
  {
    id: '7a000000-0000-4000-8000-000000000002',
    objectId: OBJECT_IDS.riverside,
    title: 'HVAC ductwork installation',
    description:
      'Install supply and return ductwork for the east and west wings. Coordinate with electrical to avoid clashes above corridor ceilings.',
    assigneeId: WORKER_2_ID,
    dueInDays: -1,
    createdDaysAgo: 27,
    steps: [
      { to: 'in_progress', by: WORKER_2_ID, daysAgo: 23 },
      {
        to: 'under_review',
        by: WORKER_2_ID,
        daysAgo: 3,
        comment:
          'Ductwork, dampers and pressure test are complete. Test report is in the site folder.',
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000003',
    objectId: OBJECT_IDS.riverside,
    title: 'Feature wall framing — lobby',
    description:
      'Frame the double-height lobby feature wall and prepare backing for the oak slat finish.',
    assigneeId: WORKER_1_ID,
    dueInDays: 7,
    createdDaysAgo: 2,
    steps: [],
  },
  {
    id: '7a000000-0000-4000-8000-000000000004',
    objectId: OBJECT_IDS.riverside,
    title: 'Bathroom tile setting — units 4–8',
    description:
      'Set floor and wall tile in units 4 through 8. Align grout lines with the corridor datum and protect finished surfaces.',
    assigneeId: WORKER_2_ID,
    dueInDays: -2,
    createdDaysAgo: 32,
    steps: [
      { to: 'in_progress', by: WORKER_2_ID, daysAgo: 27 },
      { to: 'under_review', by: WORKER_2_ID, daysAgo: 8 },
      {
        to: 'revision_requested',
        by: MANAGER_ID,
        daysAgo: 4,
        comment:
          'Grout lines in units 6 and 7 are uneven and the edge trim at the shower niche needs rework. Please align to the corridor datum and reseal before resubmitting.',
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000005',
    objectId: OBJECT_IDS.riverside,
    title: 'Foundation waterproofing',
    description:
      'Apply the below-grade membrane to the north retaining wall and install drainage board. Include the tie-in at the footings.',
    assigneeId: WORKER_1_ID,
    dueInDays: -22,
    createdDaysAgo: 48,
    steps: [
      { to: 'in_progress', by: WORKER_1_ID, daysAgo: 42 },
      { to: 'under_review', by: WORKER_1_ID, daysAgo: 27 },
      {
        to: 'accepted',
        by: MANAGER_ID,
        daysAgo: 25,
        comment:
          "Membrane and drainage board match the engineer's detail. Photo record received. Accepted.",
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000006',
    objectId: OBJECT_IDS.hillcrest,
    title: 'Demolition & debris removal',
    description:
      'Strip out the old partition walls on levels 1–3, remove finishes, and cart debris to the designated disposal area.',
    assigneeId: WORKER_2_ID,
    dueInDays: -20,
    createdDaysAgo: 65,
    steps: [
      { to: 'in_progress', by: WORKER_2_ID, daysAgo: 60 },
      { to: 'under_review', by: WORKER_2_ID, daysAgo: 30 },
      {
        to: 'accepted',
        by: MANAGER_ID,
        daysAgo: 28,
        comment: 'Strip-out complete, debris removed, and floors swept. Accepted.',
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000007',
    objectId: OBJECT_IDS.hillcrest,
    title: 'Drywall hanging — east wing',
    description:
      'Hang and tape drywall across the east wing, including corridor ceilings and service risers.',
    assigneeId: WORKER_1_ID,
    dueInDays: 1,
    createdDaysAgo: 14,
    steps: [{ to: 'in_progress', by: WORKER_1_ID, daysAgo: 10 }],
  },
  {
    id: '7a000000-0000-4000-8000-000000000008',
    objectId: OBJECT_IDS.hillcrest,
    title: 'Window glazing replacement',
    description:
      'Replace 14 failed glazing units on the south façade. Match the existing tint and check all seals after install.',
    assigneeId: WORKER_2_ID,
    dueInDays: 9,
    createdDaysAgo: 4,
    steps: [],
  },
  {
    id: '7a000000-0000-4000-8000-000000000009',
    objectId: OBJECT_IDS.hillcrest,
    title: 'Reception millwork install',
    description:
      'Install the reception desk millwork and back-wall shelving. Verify power/data cut-outs before fixing.',
    assigneeId: WORKER_1_ID,
    dueInDays: 2,
    createdDaysAgo: 20,
    steps: [
      { to: 'in_progress', by: WORKER_1_ID, daysAgo: 16 },
      {
        to: 'under_review',
        by: WORKER_1_ID,
        daysAgo: 1,
        comment:
          'Millwork is fixed and level. Countertop delivery is scheduled for Thursday.',
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000010',
    objectId: OBJECT_IDS.hillcrest,
    title: 'Lighting control commissioning',
    description:
      'Commission the DALI lighting controls for the open-plan floor and confirm scenes in the two meeting rooms.',
    assigneeId: WORKER_2_ID,
    dueInDays: 5,
    createdDaysAgo: 13,
    steps: [
      { to: 'in_progress', by: WORKER_2_ID, daysAgo: 10 },
      { to: 'under_review', by: WORKER_2_ID, daysAgo: 4 },
      {
        to: 'revision_requested',
        by: MANAGER_ID,
        daysAgo: 2,
        comment:
          'Please relabel the scene buttons in the north meeting room and re-test the dimming curve at 10%. Resubmit with the commissioning sheet.',
      },
    ],
  },
  {
    id: '7a000000-0000-4000-8000-000000000011',
    objectId: OBJECT_IDS.northline,
    title: 'Loading dock steel repairs',
    description:
      'Repair corrosion on the two southern loading dock beams. Weld, treat, and repaint to spec.',
    assigneeId: WORKER_2_ID,
    dueInDays: -1,
    createdDaysAgo: 24,
    steps: [{ to: 'in_progress', by: WORKER_2_ID, daysAgo: 19 }],
  },
  {
    id: '7a000000-0000-4000-8000-000000000012',
    objectId: OBJECT_IDS.northline,
    title: 'Fire-rated ceiling inspection',
    description:
      'Inspect and certify the fire-rated ceiling grid above the main floor. Provide a marked-up plan and photo record.',
    assigneeId: WORKER_2_ID,
    dueInDays: 11,
    createdDaysAgo: 6,
    steps: [],
  },
  {
    id: '7a000000-0000-4000-8000-000000000013',
    objectId: OBJECT_IDS.northline,
    title: 'Exterior cladding — south elevation',
    description:
      'Install and seal the exterior cladding panels on the south elevation, including flashings and corner trims.',
    assigneeId: WORKER_2_ID,
    dueInDays: -4,
    createdDaysAgo: 55,
    steps: [
      { to: 'in_progress', by: WORKER_2_ID, daysAgo: 50 },
      { to: 'under_review', by: WORKER_2_ID, daysAgo: 10 },
      {
        to: 'accepted',
        by: MANAGER_ID,
        daysAgo: 8,
        comment: 'Panels, flashings and seals all check out. Accepted.',
      },
    ],
  },
]

function buildSeedDatabase(): DemoDatabase {
  const objects: ConstructionObject[] = [
    {
      id: OBJECT_IDS.riverside,
      name: 'Riverside Residences',
      address: '14 Riverside Drive, Cambridge',
      description:
        'A 24-unit residential block with a shared courtyard, underground parking, and a ground-floor café. Structural work is complete; interior fit-out is underway.',
      created_by: MANAGER_ID,
      created_at: dateTimeDaysAgo(120, 8),
      updated_at: dateTimeDaysAgo(4, 16),
    },
    {
      id: OBJECT_IDS.hillcrest,
      name: 'Hillcrest Workspace',
      address: '88 Hillcrest Avenue, Somerville',
      description:
        'Full renovation of a three-storey office building: open-plan workspaces, two meeting suites, and a new reception.',
      created_by: MANAGER_ID,
      created_at: dateTimeDaysAgo(82, 8),
      updated_at: dateTimeDaysAgo(1, 14),
    },
    {
      id: OBJECT_IDS.northline,
      name: 'Northline Warehouse',
      address: '5 Northline Industrial Park, Medford',
      description:
        'Steel-frame logistics warehouse with a 1,200 m² floor, four loading docks, and staff facilities.',
      created_by: MANAGER_ID,
      created_at: dateTimeDaysAgo(48, 8),
      updated_at: dateTimeDaysAgo(8, 12),
    },
  ]

  const tasks: Task[] = []
  const history: TaskHistoryEntry[] = []

  seedTasks.forEach((seedTask, taskIndex) => {
    const createdAt = dateTimeDaysAgo(seedTask.createdDaysAgo, 9, taskIndex % 50)
    let previousStatus: TaskStatus = 'new'
    let updatedAt = createdAt

    history.push({
      id: crypto.randomUUID(),
      task_id: seedTask.id,
      from_status: null,
      to_status: 'new',
      changed_by: MANAGER_ID,
      comment: null,
      created_at: createdAt,
    })

    seedTask.steps.forEach((step, stepIndex) => {
      const changedAt = dateTimeDaysAgo(step.daysAgo, 10 + (stepIndex % 7), taskIndex % 50)
      history.push({
        id: crypto.randomUUID(),
        task_id: seedTask.id,
        from_status: previousStatus,
        to_status: step.to,
        changed_by: step.by,
        comment: step.comment ?? null,
        created_at: changedAt,
      })
      previousStatus = step.to
      updatedAt = changedAt
    })

    tasks.push({
      id: seedTask.id,
      object_id: seedTask.objectId,
      title: seedTask.title,
      description: seedTask.description,
      assignee_id: seedTask.assigneeId,
      status: previousStatus,
      due_date: dateOnlyInDays(seedTask.dueInDays),
      created_by: MANAGER_ID,
      created_at: createdAt,
      updated_at: updatedAt,
    })
  })

  return { objects, tasks, history }
}

function readDatabase(): DemoDatabase {
  try {
    const raw = window.localStorage.getItem(DATABASE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoDatabase>
      if (
        Array.isArray(parsed.objects) &&
        Array.isArray(parsed.tasks) &&
        Array.isArray(parsed.history)
      ) {
        return parsed as DemoDatabase
      }
    }
  } catch {
    // Fall through to a fresh seed if local storage is unavailable or malformed.
  }

  const database = buildSeedDatabase()
  writeDatabase(database)
  return database
}

function writeDatabase(database: DemoDatabase) {
  try {
    window.localStorage.setItem(DATABASE_KEY, JSON.stringify(database))
  } catch {
    // The demo still works in memory for the current call if storage is blocked.
  }
}

export function getDemoProfile(): Profile | null {
  try {
    const id = window.localStorage.getItem(SESSION_KEY)
    if (!id) return null
    return profileById.get(id) ?? null
  } catch {
    return null
  }
}

export function demoSignIn(email: string, password: string): Profile {
  const account = DEMO_ACCOUNTS.find(
    (candidate) =>
      candidate.email.toLowerCase() === email.trim().toLowerCase() &&
      candidate.password === password,
  )
  if (!account) {
    throw new Error(
      'errors.demoCredentials',
    )
  }
  return demoSignInAs(account.key)
}

export function demoSignInAs(key: DemoAccountKey): Profile {
  const profile = profileById.get(PROFILE_IDS[key])
  if (!profile) throw new Error('errors.demoAccountNotFound')
  window.localStorage.setItem(SESSION_KEY, profile.id)
  return profile
}

export function demoSignOut() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore storage access errors during sign-out.
  }
}

function requireActor(): Profile {
  const actor = getDemoProfile()
  if (!actor) throw new Error('errors.sessionExpired')
  return actor
}

function assertManager(actor: Profile) {
  if (actor.role !== 'manager') {
    throw new Error('errors.managerOnly')
  }
}

function visibleTasks(database: DemoDatabase, actor: Profile) {
  return actor.role === 'manager'
    ? database.tasks
    : database.tasks.filter((task) => task.assignee_id === actor.id)
}

function assertTaskAccess(actor: Profile, task: Task) {
  if (actor.role === 'manager' || task.assignee_id === actor.id) return
  throw new Error('errors.taskAccess')
}

function withRelations(task: Task, database: DemoDatabase): TaskWithRelations {
  const assignee = profileById.get(task.assignee_id)
  const object = database.objects.find((item) => item.id === task.object_id)
  return {
    ...task,
    assignee: assignee
      ? { id: assignee.id, full_name: assignee.full_name, role: assignee.role }
      : null,
    object: object ? { id: object.id, name: object.name, address: object.address } : null,
  }
}

function visibleObjects(database: DemoDatabase, actor: Profile): ObjectWithTasks[] {
  const visible = visibleTasks(database, actor)
  const visibleObjectIds = new Set(visible.map((task) => task.object_id))
  const objects =
    actor.role === 'manager'
      ? database.objects
      : database.objects.filter((object) => visibleObjectIds.has(object.id))

  return [...objects]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((object) => ({
      ...object,
      tasks: database.tasks
        .filter((task) => task.object_id === object.id)
        .filter((task) => actor.role === 'manager' || task.assignee_id === actor.id)
        .map((task) => withRelations(task, database)),
    }))
}

const allowedEdges: Record<TaskStatus, TaskStatus[]> = {
  new: ['in_progress'],
  in_progress: ['under_review'],
  under_review: ['accepted', 'revision_requested'],
  revision_requested: ['in_progress'],
  accepted: [],
}

const demoApi = {
  async listObjects(): Promise<ObjectWithTasks[]> {
    const actor = requireActor()
    return visibleObjects(readDatabase(), actor)
  },

  async getObject(objectId: string): Promise<ObjectWithTasks> {
    const actor = requireActor()
    const object = visibleObjects(readDatabase(), actor).find((item) => item.id === objectId)
    if (!object) throw new Error('errors.objectNotFound')
    return object
  },

  async listMyTasks(): Promise<TaskWithRelations[]> {
    const actor = requireActor()
    const database = readDatabase()
    return database.tasks
      .filter((task) => task.assignee_id === actor.id)
      .map((task) => withRelations(task, database))
  },

  async listProfiles(): Promise<Profile[]> {
    requireActor()
    return [...profiles]
  },

  async createObject(input: ObjectInput): Promise<ConstructionObject> {
    const actor = requireActor()
    assertManager(actor)
    const database = readDatabase()
    const now = new Date().toISOString()
    const object: ConstructionObject = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      address: input.address.trim(),
      description: input.description.trim(),
      created_by: actor.id,
      created_at: now,
      updated_at: now,
    }
    database.objects.push(object)
    writeDatabase(database)
    return object
  },

  async updateObject(
    objectId: string,
    input: ObjectInput,
  ): Promise<ConstructionObject> {
    const actor = requireActor()
    assertManager(actor)
    const database = readDatabase()
    const object = database.objects.find((item) => item.id === objectId)
    if (!object) throw new Error('errors.objectNotFound')
    object.name = input.name.trim()
    object.address = input.address.trim()
    object.description = input.description.trim()
    object.updated_at = new Date().toISOString()
    writeDatabase(database)
    return object
  },

  async createTask(input: TaskInput): Promise<Task> {
    const actor = requireActor()
    assertManager(actor)
    const database = readDatabase()
    const assignee = profileById.get(input.assignee_id)
    if (!assignee || assignee.role !== 'worker') {
      throw new Error('errors.workerAssignment')
    }
    const now = new Date().toISOString()
    const task: Task = {
      id: crypto.randomUUID(),
      object_id: input.object_id,
      title: input.title.trim(),
      description: input.description.trim(),
      assignee_id: input.assignee_id,
      status: 'new',
      due_date: input.due_date || null,
      created_by: actor.id,
      created_at: now,
      updated_at: now,
    }
    database.tasks.push(task)
    database.history.push({
      id: crypto.randomUUID(),
      task_id: task.id,
      from_status: null,
      to_status: 'new',
      changed_by: actor.id,
      comment: null,
      created_at: now,
    })
    writeDatabase(database)
    return task
  },

  async updateTask(taskId: string, input: TaskDetailsInput): Promise<Task> {
    const actor = requireActor()
    assertManager(actor)
    const database = readDatabase()
    const task = database.tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('errors.taskNotFound')
    const assignee = profileById.get(input.assignee_id)
    if (!assignee || assignee.role !== 'worker') {
      throw new Error('errors.workerAssignment')
    }
    task.title = input.title.trim()
    task.description = input.description.trim()
    task.assignee_id = input.assignee_id
    task.due_date = input.due_date || null
    task.updated_at = new Date().toISOString()
    writeDatabase(database)
    return task
  },

  async transitionTask(
    taskId: string,
    toStatus: TaskStatus,
    comment: string,
  ): Promise<Task> {
    const actor = requireActor()
    const database = readDatabase()
    const task = database.tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('errors.taskNotFound')
    assertTaskAccess(actor, task)

    if (actor.role === 'worker' && task.assignee_id !== actor.id) {
      throw new Error('errors.workerOwnTasks')
    }
    if (!allowedEdges[task.status].includes(toStatus)) {
      throw new Error('errors.invalidTransition')
    }
    if (toStatus === 'accepted' || toStatus === 'revision_requested') {
      if (actor.role !== 'manager') {
        throw new Error('errors.managerDecision')
      }
    } else if (actor.role !== 'worker' || task.assignee_id !== actor.id) {
      throw new Error('errors.assignedWorkerOnly')
    }

    const cleanComment = comment.trim()
    if (toStatus === 'revision_requested' && !cleanComment) {
      throw new Error('errors.revisionCommentRequired')
    }

    const fromStatus = task.status
    const now = new Date().toISOString()
    task.status = toStatus
    task.updated_at = now
    database.history.push({
      id: crypto.randomUUID(),
      task_id: task.id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: actor.id,
      comment: cleanComment || null,
      created_at: now,
    })
    writeDatabase(database)
    return task
  },

  async listTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
    const actor = requireActor()
    const database = readDatabase()
    const task = database.tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('errors.taskNotFound')
    assertTaskAccess(actor, task)

    return database.history
      .filter((entry) => entry.task_id === taskId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((entry) => {
        const actorProfile = entry.changed_by ? profileById.get(entry.changed_by) : undefined
        return {
          ...entry,
          actor: actorProfile
            ? {
                id: actorProfile.id,
                full_name: actorProfile.full_name,
                role: actorProfile.role,
              }
            : null,
        }
      })
  },
}

export { demoApi }
