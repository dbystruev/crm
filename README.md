# Objects & Tasks

A focused construction mini-CRM for managers and field crews. Managers run the
site portfolio and review completed work. Workers see only the sites and tasks
assigned to them, move work through the field workflow, and get a clear note
when something needs rework.

The app works in two modes:

- **Local demo** — no configuration. Sample data and sign-in live in this
  browser, so every screen and workflow can be tried immediately.
- **Live Supabase** — authentication, shared data, row-level security, and
  database-enforced workflow rules.

## Features

- Role-aware login with one-click demo access.
- Manager portfolio with sites, progress, open work, overdue work, and review
  counts.
- Site detail with task filters and a review queue.
- Task detail with assignee, due date, brief, and next actions based on role and
  status.
- Mandatory revision comments and a permanent, read-only status timeline.
- Worker **My Tasks** queue with a "next task" focus card.
- Responsive desktop and mobile layouts.
- Demo data survives refreshes in `localStorage`; Supabase mode is shared across
  users.

## Tech stack

- Vite, React 19, TypeScript
- Tailwind CSS v4
- React Router
- Supabase Auth, Postgres, and Row-Level Security
- Lucide icons

## Quick start — local demo

Requirements: Node.js 20.19+ or 22.12+ (Node 22 LTS recommended) and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then use any quick-login button.

No `.env` file is needed. The demo backend seeds three sites, thirteen tasks,
and realistic history in the browser.

| Account | Email | Password |
| --- | --- | --- |
| Manager — Alex Morgan | `manager@objects.test` | `BuildDemo123!` |
| Worker 1 — Daniel Reyes | `worker1@objects.test` | `BuildDemo123!` |
| Worker 2 — Maya Chen | `worker2@objects.test` | `BuildDemo123!` |

The email/password form also accepts these demo credentials. There is no public
sign-up.

### Reset the demo

Open the browser console and run:

```js
localStorage.removeItem('objects-and-tasks:demo-database:v1')
localStorage.removeItem('objects-and-tasks:demo-session:v1')
location.reload()
```

## Connect a live Supabase project

### 1. Create the project

Create a project at [supabase.com](https://supabase.com). From **Project
Settings → API**, copy the project URL and the **anon / publishable** key. Never
use the `service_role` key in this frontend.

### 2. Run the migration

Open the Supabase **SQL Editor**, paste the full contents of
[`supabase/migrations/20260101_init.sql`](supabase/migrations/20260101_init.sql),
and run it once.

The migration creates:

- `user_role` and `task_status` enums
- `profiles`, `objects`, `tasks`, and `task_history`
- profile provisioning for new auth users
- status-transition and audit-log triggers
- indexes, row-level security policies, and API grants

If you use the Supabase CLI, run the file through the SQL Editor or your normal
migration workflow. The repository has no `supabase/config.toml`, so the SQL
Editor is the simplest path.

### 3. Optional: seed demo data

For a development or staging project only, paste and run
[`supabase/seed.sql`](supabase/seed.sql). It creates the same three accounts as
the local demo, three sites, thirteen tasks, and their history. Every seeded
account uses `BuildDemo123!`.

> **Do not run the seed against production.** Its credentials are public in
> this repository. Keep it for demos, previews, and local Supabase instances.

### 4. Add environment variables

Copy `.env.example` to `.env` and fill in the project values:

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Restart the dev server after changing env values.

`VITE_SHOW_DEMO_LOGIN` is optional. It defaults to `false` when Supabase is
configured. Set it to `true` only on a seeded demo/staging project if you want
the one-click credential buttons there. Demo mode always shows them.

### 5. Create real users

There is no sign-up screen. Create teammates in **Authentication → Users** in
the Supabase dashboard. A database trigger creates a `worker` profile for every
new auth user.

Also turn off **Allow new users to sign up** in the Supabase Auth settings. The
frontend has no registration flow, but disabling sign-ups closes the direct API
route as well. Invite or create accounts as an administrator.

To promote a manager, run this once in the SQL Editor:

```sql
update public.profiles
set role = 'manager'
where id = (
  select id from auth.users where email = 'owner@company.com'
);
```

Only an administrator with SQL/service access can change roles. The API cannot
promote a user.

### 6. Start the app

```bash
npm run dev
```

The login page should show a **Connected to Supabase** badge. If the quick-login
buttons are missing, that is expected: set `VITE_SHOW_DEMO_LOGIN=true` for a
seeded staging project, or sign in with a real account.

## Roles and workflow

### Manager

- Sees the full portfolio and every task.
- Creates and edits sites, tasks, assignees, and due dates.
- Accepts work or requests a revision when a task is under review.
- Cannot perform field-work transitions. Those belong to the assigned worker.

### Worker

- Sees only sites where they have at least one assigned task.
- Sees only their own tasks in site views and **My Tasks**.
- Starts work, submits it for review, and resumes after a revision.
- Cannot accept work, request revisions, edit task content, or see another
  worker's site/task.

### Status flow

```text
new -> in_progress -> under_review -> accepted
                         |
                         +-> revision_requested -> in_progress
```

| From | To | Who | Rule |
| --- | --- | --- | --- |
| `new` | `in_progress` | Assigned worker | Start work |
| `in_progress` | `under_review` | Assigned worker | Submit for review |
| `under_review` | `accepted` | Manager | Approve and close |
| `under_review` | `revision_requested` | Manager | A non-empty comment is required |
| `revision_requested` | `in_progress` | Assigned worker | Resume work |

`accepted` is terminal. Invalid jumps (for example `new -> accepted`) are
rejected by a database trigger even if someone calls the API directly.

## Security in plain English

- **Accounts are invite-only.** There is no public registration screen, and
  sign-ups should be disabled in Supabase Auth. An administrator creates users
  in Supabase.
- **Workers only see their own work.** Database policies limit objects and tasks
  to the signed-in worker's assignments. Hiding a button is not the protection;
  the database enforces the same rule for direct API calls.
- **The workflow is enforced server-side.** A task can only move along the
  allowed status edges. Only the assigned worker can do field transitions, and
  only a manager can accept or request a revision.
- **Rework needs an explanation.** A revision request is rejected unless it
  contains a comment. The note is stored in the task history.
- **History cannot be edited or deleted through the app.** Clients have read-only
  access to `task_history`; triggers write the audit entries. Task and site
  deletes are not exposed or granted, so the trail stays intact.
- **Managers are promoted deliberately.** New accounts always start as workers;
  role changes require administrator access, not an API call.
- **The public Supabase key is not a password.** It only identifies the project.
  Row-level security and triggers protect the data. Never put the `service_role`
  key in a Vite app: all `VITE_*` values are included in the browser bundle.
- **Demo credentials are public.** Never run `supabase/seed.sql` in production,
  and keep `VITE_SHOW_DEMO_LOGIN=false` on production deployments.

For a real rollout, also disable public sign-ups, configure Supabase Auth email
confirmation, set the Site URL and redirect URLs for your deployment domain, and
apply a password policy appropriate to your team.

## Data model

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user with display name and `manager`/`worker` role |
| `objects` | Construction sites |
| `tasks` | Work items, one assignee, one current status |
| `task_history` | Append-only status timeline and comments |

`tasks.transition_comment` is a transient hand-off column. The client writes a
note with a status update; the database trigger copies it into `task_history`
and clears the task row. This keeps the task record clean while preserving the
full audit trail.

## Project structure

```text
src/
  components/       UI primitives, task/object modals, timeline, navigation
  context/          Supabase/demo authentication context
  hooks/            Async data loading
  lib/              API switch, demo backend, status rules, Supabase client
  pages/            Login, Objects, ObjectDetail, MyTasks, NotFound
  App.tsx           Routes and providers
supabase/
  migrations/20260101_init.sql
  seed.sql          Optional development/demo data
```

## Scripts

```bash
npm run dev       # Vite dev server
npm run build     # Type-check and production build to dist/
npm run preview   # Preview the production build
npm run lint      # Oxlint
```

## Deployment

```bash
npm run build
```

Deploy `dist/` to any static host. The app uses client-side routing, so configure
a fallback to `index.html` for unknown paths:

- **Vercel:** `vercel.json` is included with the rewrite.
- **Netlify:** `public/_redirects` is included and copied into `dist/`.
- **Other hosts:** rewrite all non-file routes to `/index.html`.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting provider's
build environment. Vite bakes these values in at build time, so redeploy after
changing them. Keep `VITE_SHOW_DEMO_LOGIN` unset or `false` in production.

## Troubleshooting

**Quick-login buttons are missing in live mode.** That is the secure default.
Set `VITE_SHOW_DEMO_LOGIN=true` only for a staging project seeded with demo
accounts.

**"Email or password is incorrect" with demo accounts.** The live project has
not run `supabase/seed.sql`, or the seed was run in a different project. Confirm
the env URL, or use a real account.

**"Your account profile could not be loaded."** The auth user exists but its
profile is missing. Check that the migration's `handle_new_user` trigger is
installed, then create the profile manually or re-run the user provisioning
step.

**A worker cannot see a site.** Workers only see sites where they have an
assigned task. Assign them a task on that site first. This is enforced by RLS,
not just by the UI.

**A manager cannot move a task to In progress.** By design: field transitions
belong to the assigned worker. Managers review work once it is submitted.

**Changes are not shared in demo mode.** Demo data is local to one browser by
design. Connect Supabase for shared data. Use the reset snippet above to start
over.
