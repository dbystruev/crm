import { en, type TranslationKey } from './translations'

const ERROR_KEYS_BY_MESSAGE: Record<string, TranslationKey> = {
  'Supabase configuration is missing.': 'errors.supabaseMissing',
  'Your account profile could not be loaded. Ask an administrator to check your profile setup.':
    'errors.authProfile',
  'Sign-in did not return a user session.': 'errors.authMissingUser',
  'Email or password is incorrect. If you are using a new Supabase project, seed the demo accounts first.':
    'errors.authInvalidCredentials',
  'This account has not confirmed its email yet. Ask an administrator to confirm it.':
    'errors.authEmailUnconfirmed',
  'Too many sign-in attempts. Wait a moment and try again.': 'errors.authRateLimited',

  'You do not have permission to perform this action.': 'errors.permission',
  'That status change is not valid for this task.': 'errors.invalidStatus',
  'Your session has expired. Please sign in again.': 'errors.sessionExpired',

  'Could not load objects.': 'errors.loadObjects',
  'Could not load this object.': 'errors.loadObject',
  'Object not found.': 'errors.objectNotFound',
  'Object not found, or you do not have access to it.': 'errors.objectNotFound',
  'Could not load your tasks.': 'errors.loadTasks',
  'Could not load team profiles.': 'errors.loadProfiles',
  'Could not create the object.': 'errors.saveObject',
  'Could not update the object.': 'errors.saveObject',
  'Could not create the task.': 'errors.saveTask',
  'Could not update the task.': 'errors.saveTask',
  'Could not update the task status.': 'errors.updateStatus',
  'Could not load the task history.': 'errors.loadHistory',

  'Those credentials do not match a demo account. Use one of the quick-login accounts.':
    'errors.demoCredentials',
  'Demo account not found.': 'errors.demoAccountNotFound',
  'Only managers can perform this action.': 'errors.managerOnly',
  'You do not have access to this task.': 'errors.taskAccess',
  'Tasks can only be assigned to workers.': 'errors.workerAssignment',
  'Task not found.': 'errors.taskNotFound',
  'Workers can only update tasks assigned to them.': 'errors.workerOwnTasks',
  'Only a manager can accept work or request a revision.': 'errors.managerDecision',
  'Only the assigned worker can move this task through field work.': 'errors.assignedWorkerOnly',
  'A revision request requires a comment.': 'errors.revisionCommentRequired',

  'Something went wrong. Please try again.': 'errors.generic',
  'Could not load this view.': 'errors.load',
  'Could not sign in.': 'errors.signIn',
  'Could not sign out.': 'errors.signOut',
  'Could not sign in with the demo account.': 'errors.demoSignIn',
  'Could not save the object.': 'errors.saveObject',
  'Could not save the task.': 'errors.saveTask',
  'Could not load the history.': 'errors.loadHistory',
  'Could not refresh the history.': 'errors.historyRefresh',
  'Could not load workers.': 'errors.loadProfiles',
}

function knownKey(message: string): TranslationKey | null {
  if (message in en) return message as TranslationKey
  return ERROR_KEYS_BY_MESSAGE[message] ?? null
}

export function resolveErrorKey(message: string): TranslationKey | null {
  const mapped = knownKey(message)
  if (mapped) return mapped

  if (/invalid login credentials/i.test(message)) return 'errors.authInvalidCredentials'
  if (/email not confirmed/i.test(message)) return 'errors.authEmailUnconfirmed'
  if (/rate limit|too many requests/i.test(message)) return 'errors.authRateLimited'
  if (/row-level security policy/i.test(message)) return 'errors.permission'
  if (/invalid input value for enum/i.test(message)) return 'errors.invalidStatus'
  if (/^Invalid status transition from .+ to .+\.$/.test(message)) return 'errors.invalidTransition'

  return null
}
