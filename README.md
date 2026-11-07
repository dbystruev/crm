# Objects & Tasks

[Русская версия](README.ru.md)

A focused construction mini-CRM for managers and field crews. Managers run the
site portfolio and review completed work. Workers see only the sites and tasks
assigned to them, move work through the field workflow, and get a clear note
when something needs rework.

Live deployment: [crm.bystruev.com](https://crm.bystruev.com) ·
[Russian sign-in](https://crm.bystruev.com/ru/login)

Video walkthrough: [youtu.be/pqW4gMYX3zM](https://youtu.be/pqW4gMYX3zM) ·
Repository: [github.com/dbystruev/crm](https://github.com/dbystruev/crm)

The app works in two modes:

- **Local demo** — no configuration. Sample data and sign-in live in this
  browser, so every screen and workflow can be tried immediately.
- **Live Supabase** — authentication, shared data, row-level security, and
  database-enforced workflow rules.

## Features

- Role-aware email/password login.
- Manager portfolio with sites, progress, open work, overdue work, and review
  counts.
- Site detail with task filters and a review queue.
- Dedicated task detail route (`/:lang/tasks/:id`, e.g. `/en/tasks/:id`) with
  assignee, due date, brief, role- and status-based actions, and status
  history. The same task card can also open as a modal from lists.
- Manager-only delete actions for sites and tasks, with confirmation prompts.
- Mandatory revision comments and a read-only status timeline for the life of
  the task.
- Worker **My Tasks** queue with a "next task" focus card.
- English and Russian UI with path-based routing (`/en`, `/ru`).
- Seeded sites and tasks have localized English/Russian names, addresses, and descriptions.
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

Open the URL printed by Vite, then sign in with one of the demo accounts below.

No `.env` file is needed. The demo backend seeds three sites, thirteen tasks,
and realistic history in the browser.

| Account | Email | Password |
| --- | --- | --- |
| Manager — Alex Morgan | `manager@bystruev.com` | `Crm2026!Manager` |
| Worker 1 — Daniel Reyes | `worker1@hurated.com` | `Crm2026!Worker1` |
| Worker 2 — Maya Chen | `worker2@buddian.com` | `Crm2026!Worker2` |

The email/password form also accepts these demo credentials. There is no public
sign-up.

### Language and routing

The app is available in English and Russian. The language is part of the URL,
not a hidden client-only setting:

| URL | Language |
| --- | --- |
| `/en` | English portfolio |
| `/ru` | Russian portfolio |
| `/en/objects/:id` | English site detail |
| `/ru/objects/:id` | Russian site detail |
| `/en/tasks/:id` | English task detail |
| `/ru/tasks/:id` | Russian task detail |
| `/ru/my-tasks` | Russian worker queue |
| `/en/login` | English sign-in |
| `/ru/login` | Russian sign-in |

Opening `/` redirects to the last language stored in this browser, falling back
to the browser language and then English. The EN/RU switcher in the navigation
header keeps the current page while replacing the language prefix. Older
unprefixed links such as `/objects/:id` or `/my-tasks` redirect to the preferred
language automatically.

All UI copy, status badges, buttons, modals, validation messages, toasts, and
known API/auth errors are translated. Dates, due-date labels, and greetings use
the active locale. Translation strings live in
[`src/i18n/translations.ts`](src/i18n/translations.ts).

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

### 2. Run the migrations

Open the Supabase **SQL Editor** and run the files in
[`supabase/migrations/`](supabase/migrations/) in numeric order:

1. [`20260101_init.sql`](supabase/migrations/20260101_init.sql) — schema,
   triggers, RLS, and base grants.
2. [`20260102_localized_content.sql`](supabase/migrations/20260102_localized_content.sql)
   — adds the optional Russian content columns. It uses `add column if not
   exists`, so it is safe on fresh projects and on upgrades.
3. [`20260103_manager_delete_permissions.sql`](supabase/migrations/20260103_manager_delete_permissions.sql)
   — manager-only DELETE policies and grants for objects and tasks.
4. [`20260104_disable_public_registration.sql`](supabase/migrations/20260104_disable_public_registration.sql)
   — the `prevent_public_signup` trigger on `auth.users`.

The migrations create:

- `user_role` and `task_status` enums
- `profiles`, `objects`, `tasks`, and `task_history`
- profile provisioning for new auth users
- status-transition and audit-log triggers
- manager-only delete policies for sites and tasks
- a database-level public-registration guard
- indexes, row-level security policies, and API grants

If you use the Supabase CLI, run the files through the SQL Editor or your normal
migration workflow. The repository has no `supabase/config.toml`, so the SQL
Editor is the simplest path.

### 3. Optional: seed demo data

For a development or staging project only, paste and run
[`supabase/seed.sql`](supabase/seed.sql). It creates the same three accounts as
the local demo, three sites, thirteen tasks, and their history. Seeded objects
and tasks include Russian `*_ru` fields next to the English content, and the UI
picks the active language automatically. The seeded accounts use the domain
credentials listed above. Re-running the seed also updates existing auth users
and email identities to those addresses and passwords.

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

### 5. Create real users

There is no sign-up screen. Create teammates in **Authentication → Users** in
the Supabase dashboard. A database trigger creates a `worker` profile for every
new auth user.

Public registration is also blocked at the database boundary by
`supabase/migrations/20260104_disable_public_registration.sql`. It installs the
`prevent_public_signup` trigger on `auth.users`, which rejects anonymous API
sign-ups. Keep **Allow new users to sign up** disabled in Supabase Auth as the
outer GoTrue guard too. The code-level policy is:

> Открытая регистрация отключена на уровне базы данных (триггер prevent_public_signup). Тестовых пользователей можно создать вручную в Supabase.

Invite or create accounts as an administrator.

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

The login page should show a **Connected to Supabase** badge. Sign in with a
real account or with one of the seeded demo accounts.

## Roles and workflow

### Manager

- Sees the full portfolio and every task.
- Creates and edits sites, tasks, assignees, and due dates.
- Deletes sites and tasks. Deleting a site also removes its tasks and their
  history through foreign-key cascades.
- Accepts work or requests a revision when a task is under review.
- Cannot perform field-work transitions. Those belong to the assigned worker.

### Worker

- Sees only sites where they have at least one assigned task.
- Sees only their own tasks in site views and **My Tasks**.
- Starts work, submits it for review, and resumes after a revision.
- Cannot accept work, request revisions, edit task content, delete sites or
  tasks, or see another worker's site/task.

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
  anonymous sign-ups are rejected by the `prevent_public_signup` trigger on
  `auth.users` in `20260104_disable_public_registration.sql`. An administrator
  creates users manually in Supabase.
- **Workers only see their own work.** Database policies limit objects and tasks
  to the signed-in worker's assignments. Hiding a button is not the protection;
  the database enforces the same rule for direct API calls.
- **The workflow is enforced server-side.** A task can only move along the
  allowed status edges. Only the assigned worker can do field transitions, and
  only a manager can accept or request a revision.
- **Rework needs an explanation.** A revision request is rejected unless it
  contains a comment. The note is stored in the task history.
- **History cannot be edited through the app.** Clients have read-only
  access to `task_history`; triggers write the audit entries. Only managers can
  delete a task or a site, and those deletions cascade through the foreign keys,
  removing the associated history with the record.
- **Managers are promoted deliberately.** New accounts always start as workers;
  role changes require administrator access, not an API call.
- **The public Supabase key is not a password.** It only identifies the project.
  Row-level security and triggers protect the data. Never put the `service_role`
  key in a Vite app: all `VITE_*` values are included in the browser bundle.
- **Demo credentials are public.** Never run `supabase/seed.sql` in production.

For a real rollout, keep public sign-ups disabled in Supabase Auth, configure
email confirmation, set the Site URL and redirect URLs for your deployment
domain, and apply a password policy appropriate to your team.

## Data model

| Table | Purpose |
| --- | --- |
| `profiles` | One row per auth user with display name and `manager`/`worker` role |
| `objects` | Construction sites; optional `name_ru`, `address_ru`, `description_ru` |
| `tasks` | Work items, one assignee, one current status; optional `title_ru`, `description_ru` |
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
  i18n/             EN/RU dictionary, language provider, routing and error helpers
  lib/              API switch, demo backend, status rules, Supabase client
  pages/            Login, Objects, ObjectDetail, TaskDetail, MyTasks, NotFound
  App.tsx           Localized routes and providers
supabase/
  migrations/20260101_init.sql
  migrations/20260102_localized_content.sql
  migrations/20260103_manager_delete_permissions.sql
  migrations/20260104_disable_public_registration.sql
  seed.sql          Optional development/demo data with EN/RU content
verify.sh           Requirement-driven live/static verification harness
```

## Scripts

```bash
npm run dev       # Vite dev server
npm run build     # Type-check and production build to dist/
npm run preview   # Preview the production build
npm run lint      # Oxlint
```

## Verification harness

`verify.sh` parses a markdown/plain-text specification into requirements and
checks them with live runtime probes, embedded executable checks, and a strict
OpenRouter code review. It defaults to the live app at
`https://crm.bystruev.com` and the live Supabase project, and prints the deployed
asset hash and API health in its header.

```bash
./verify.sh --list path/to/spec.md
./verify.sh -r 7 -y path/to/spec.md
./verify.sh --model nvidia/nemotron-3.5-lightning:free -y path/to/spec.md
```

Requires `OR_API_KEY` (or `~/.llm_config`) for semantic checks. Live probes use
the seeded demo accounts and the public anon key extracted from the deployed
bundle unless `SUPABASE_ANON_KEY` is set.

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
changing them.

## Troubleshooting

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
