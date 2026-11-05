import type { DemoAccount } from './types'

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: 'manager',
    label: 'Login as Manager',
    name: 'Alex Morgan',
    email: 'manager@objects.test',
    password: 'BuildDemo123!',
    role: 'manager',
    blurb: 'Full portfolio, reviews & team access',
  },
  {
    key: 'worker1',
    label: 'Login as Worker 1',
    name: 'Daniel Reyes',
    email: 'worker1@objects.test',
    password: 'BuildDemo123!',
    role: 'worker',
    blurb: 'Field tasks, updates & revisions',
  },
  {
    key: 'worker2',
    label: 'Login as Worker 2',
    name: 'Maya Chen',
    email: 'worker2@objects.test',
    password: 'BuildDemo123!',
    role: 'worker',
    blurb: 'Field tasks, updates & revisions',
  },
]

export const DEMO_ACCOUNT_BY_KEY = Object.fromEntries(
  DEMO_ACCOUNTS.map((account) => [account.key, account]),
) as Record<DemoAccount['key'], DemoAccount>

// Quick login is always available in local demo mode. Against a live Supabase
// project it must be enabled explicitly, so a production deployment never shows
// known demo credentials by accident.
export const SHOW_DEMO_LOGIN = import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true'
