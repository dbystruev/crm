import type { DemoAccount } from './types'

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: 'manager',
    labelKey: 'login.quick.manager.label',
    name: 'Alex Morgan',
    email: 'manager@bystruev.com',
    password: 'Crm2026!Manager',
    role: 'manager',
    blurbKey: 'login.quick.manager.blurb',
  },
  {
    key: 'worker1',
    labelKey: 'login.quick.worker1.label',
    name: 'Daniel Reyes',
    email: 'worker1@hurated.com',
    password: 'Crm2026!Worker1',
    role: 'worker',
    blurbKey: 'login.quick.worker1.blurb',
  },
  {
    key: 'worker2',
    labelKey: 'login.quick.worker2.label',
    name: 'Maya Chen',
    email: 'worker2@buddian.com',
    password: 'Crm2026!Worker2',
    role: 'worker',
    blurbKey: 'login.quick.worker2.blurb',
  },
]

export const DEMO_ACCOUNT_BY_KEY = Object.fromEntries(
  DEMO_ACCOUNTS.map((account) => [account.key, account]),
) as Record<DemoAccount['key'], DemoAccount>

// Quick login is always available in local demo mode. Against a live Supabase
// project it must be enabled explicitly, so a production deployment never shows
// known demo credentials by accident.
export const SHOW_DEMO_LOGIN = import.meta.env.VITE_SHOW_DEMO_LOGIN === 'true'
