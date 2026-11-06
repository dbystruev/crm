-- =============================================================================
-- Objects & Tasks — construction mini-CRM
-- Migration: 20260101_init.sql
--
-- Run this file once in a fresh Supabase project (SQL Editor, or `supabase db push`).
-- It creates the schema, business-rule triggers, and row-level security policies.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Extensions & enums
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.user_role as enum ('manager', 'worker');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.task_status as enum (
    'new',
    'in_progress',
    'under_review',
    'accepted',
    'revision_requested'
  );
exception
  when duplicate_object then null;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  role public.user_role not null default 'worker',
  created_at timestamptz not null default now()
);

create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  description text not null default '' check (char_length(description) <= 4000),
  name_ru text check (name_ru is null or char_length(btrim(name_ru)) between 1 and 160),
  address_ru text check (address_ru is null or char_length(btrim(address_ru)) between 1 and 300),
  description_ru text check (description_ru is null or char_length(description_ru) <= 4000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  title_ru text check (title_ru is null or char_length(btrim(title_ru)) between 1 and 180),
  description_ru text check (description_ru is null or char_length(description_ru) <= 4000),
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  status public.task_status not null default 'new',
  due_date date,
  created_by uuid not null references public.profiles (id) on delete restrict,
  -- Transient hand-off column: the client writes the comment with the new status;
  -- the database records it in task_history and clears it again.
  transition_comment text check (char_length(transition_comment) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  from_status public.task_status,
  to_status public.task_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists objects_created_at_idx on public.objects (created_at desc);
create index if not exists tasks_object_id_idx on public.tasks (object_id);
create index if not exists tasks_assignee_id_idx on public.tasks (assignee_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists task_history_task_id_idx
  on public.task_history (task_id, created_at);
create index if not exists task_history_changed_by_idx on public.task_history (changed_by);

-- -----------------------------------------------------------------------------
-- Profile provisioning
-- Every new auth user gets a worker profile. Managers must be promoted explicitly
-- by an administrator; a user can never self-assign the manager role.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New user'
  );

  insert into public.profiles (id, full_name, role)
  values (new.id, left(v_name, 120), 'worker')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Access helpers
-- SECURITY DEFINER keeps RLS policy evaluation simple and avoids recursive
-- policy lookups. Each function is pinned to a safe search_path.
-- -----------------------------------------------------------------------------
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'manager'
  );
$$;

create or replace function public.can_view_object(p_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_manager()
    or exists (
      select 1
      from public.tasks
      where object_id = p_object_id
        and assignee_id = (select auth.uid())
    );
$$;

create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_manager()
    or exists (
      select 1
      from public.tasks
      where id = p_task_id
        and assignee_id = (select auth.uid())
    );
$$;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists objects_set_updated_at on public.objects;
create trigger objects_set_updated_at
  before update on public.objects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Status transition guard
--
-- Valid graph:
--   new -> in_progress
--   in_progress -> under_review
--   under_review -> accepted | revision_requested
--   revision_requested -> in_progress
--
-- Managers make review decisions only. A worker may move an assigned task
-- through field work (start, submit, resume) but may not edit task content in
-- the same update. Requirements 01 and 12: this trigger, together with the
-- assignee_id = auth.uid() RLS policies, prevents workers from changing another
-- worker's task or editing fields they do not own. A revision request is rejected
-- unless a non-empty comment is supplied. Trusted administrative SQL
-- (auth.uid() is null) may set any valid edge but cannot skip steps in the graph.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_task_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.user_role;
  v_comment text;
begin
  if v_actor is not null then
    select role into v_role
    from public.profiles
    where id = v_actor;

    if v_role is null then
      raise exception 'No profile exists for the current user';
    end if;
  else
    -- Trusted administrative/SQL context (scripts, seed, service role). Ordinary
    -- API requests are authenticated and subject to RLS before this trigger runs.
    v_role := 'manager';
  end if;

  v_comment := nullif(btrim(coalesce(new.transition_comment, '')), '');

  if tg_op = 'INSERT' then
    if v_actor is not null and new.status <> 'new' then
      raise exception 'New tasks must start with status "new"';
    end if;

    if not exists (
      select 1 from public.profiles
      where id = new.assignee_id and role = 'worker'
    ) then
      raise exception 'Tasks can only be assigned to worker profiles';
    end if;

    -- No status change has happened yet; don't retain a stray hand-off comment.
    new.transition_comment := null;
    return new;
  end if;

  -- UPDATE from here on.
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Task identity fields are immutable';
  end if;

  if new.status is not distinct from old.status then
    -- The AFTER trigger clears transition_comment after logging. Enforcing this
    -- here also prevents stale comments being attached to a later transition.
    new.transition_comment := null;

    if v_role = 'worker' and (
      new.object_id is distinct from old.object_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.assignee_id is distinct from old.assignee_id
      or new.due_date is distinct from old.due_date
    ) then
      raise exception 'Workers can only change the status of assigned tasks';
    end if;

    if new.assignee_id is distinct from old.assignee_id
       and not exists (
         select 1 from public.profiles
         where id = new.assignee_id and role = 'worker'
       ) then
      raise exception 'Tasks can only be assigned to worker profiles';
    end if;

    return new;
  end if;

  if v_role = 'worker' and new.assignee_id is distinct from v_actor then
    raise exception 'Workers can only update tasks assigned to them';
  end if;

  if v_role = 'worker' and (
    new.object_id is distinct from old.object_id
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id
    or new.due_date is distinct from old.due_date
  ) then
    raise exception 'Workers can only change the status of assigned tasks';
  end if;

  if not (
    (old.status = 'new' and new.status = 'in_progress')
    or (old.status = 'in_progress' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status in ('accepted', 'revision_requested'))
    or (old.status = 'revision_requested' and new.status = 'in_progress')
  ) then
    raise exception 'Invalid status transition: % -> %', old.status, new.status;
  end if;

  if new.status in ('accepted', 'revision_requested') and v_role <> 'manager' then
    raise exception 'Only a manager can accept work or request a revision';
  end if;

  if v_actor is not null
     and new.status in ('in_progress', 'under_review')
     and v_role = 'manager' then
    raise exception 'Only the assigned worker can move a task through field work';
  end if;

  if new.status = 'revision_requested' and v_comment is null then
    raise exception 'A revision request requires a comment';
  end if;

  if new.assignee_id is distinct from old.assignee_id
     and not exists (
       select 1 from public.profiles
       where id = new.assignee_id and role = 'worker'
     ) then
    raise exception 'Tasks can only be assigned to worker profiles';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_enforce_status_transition on public.tasks;
create trigger tasks_enforce_status_transition
  before insert or update on public.tasks
  for each row execute function public.enforce_task_status_transition();

-- -----------------------------------------------------------------------------
-- Audit trail
-- Fires automatically on task creation and every status change. The task row's
-- transient transition_comment is copied into history, then cleared.
-- -----------------------------------------------------------------------------
create or replace function public.log_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_comment text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_history (task_id, from_status, to_status, changed_by, comment)
    values (new.id, null, new.status, coalesce(v_actor, new.created_by), null);
    return new;
  end if;

  if new.status is distinct from old.status then
    v_comment := nullif(btrim(coalesce(new.transition_comment, '')), '');

    insert into public.task_history (task_id, from_status, to_status, changed_by, comment)
    values (
      new.id,
      old.status,
      new.status,
      coalesce(v_actor, new.created_by),
      v_comment
    );

    -- The comment lives in history, not on the task itself. This UPDATE does not
    -- list status in its SET list, so it cannot re-fire the status trigger.
    if new.transition_comment is not null then
      update public.tasks
      set transition_comment = null
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_log_history_on_insert on public.tasks;
create trigger tasks_log_history_on_insert
  after insert on public.tasks
  for each row execute function public.log_task_status_change();

drop trigger if exists tasks_log_history_on_status on public.tasks;
create trigger tasks_log_history_on_status
  after update of status on public.tasks
  for each row execute function public.log_task_status_change();

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

-- Profiles: visible to signed-in teammates, read-only from the API. Roles are
-- promoted only by an administrator with SQL/service access.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

-- Objects: managers see everything. Workers only see objects on which they have
-- at least one assigned task. Only managers can create or edit objects.
drop policy if exists objects_select_visible on public.objects;
create policy objects_select_visible
  on public.objects
  for select
  to authenticated
  using (public.can_view_object(id));

drop policy if exists objects_insert_manager on public.objects;
create policy objects_insert_manager
  on public.objects
  for insert
  to authenticated
  with check (
    public.is_manager()
    and created_by = (select auth.uid())
  );

drop policy if exists objects_update_manager on public.objects;
create policy objects_update_manager
  on public.objects
  for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- Tasks: managers see and manage everything. Workers only see and update their
-- own assigned tasks; the trigger above limits them to status changes.
-- Requirements 09 and 12: the worker scope is exactly
-- assignee_id = (select auth.uid()). A worker can never read or update a task
-- assigned to another worker, even through a direct Supabase API call.
drop policy if exists tasks_select_visible on public.tasks;
create policy tasks_select_visible
  on public.tasks
  for select
  to authenticated
  using (
    public.is_manager()
    or assignee_id = (select auth.uid())
  );

drop policy if exists tasks_insert_manager on public.tasks;
create policy tasks_insert_manager
  on public.tasks
  for insert
  to authenticated
  with check (
    public.is_manager()
    and created_by = (select auth.uid())
  );

drop policy if exists tasks_update_visible on public.tasks;
-- Requirement 12: the same assignee_id = auth.uid() scope applies to UPDATE.
create policy tasks_update_visible
  on public.tasks
  for update
  to authenticated
  using (
    public.is_manager()
    or assignee_id = (select auth.uid())
  )
  with check (
    public.is_manager()
    or assignee_id = (select auth.uid())
  );

-- History: read-only to the API. Managers see every entry; workers see entries
-- for tasks assigned to them. There is intentionally no INSERT/UPDATE/DELETE
-- policy or table grant — only the audit trigger (definer) can write.
drop policy if exists task_history_select_visible on public.task_history;
create policy task_history_select_visible
  on public.task_history
  for select
  to authenticated
  using (public.can_access_task(task_id));

-- -----------------------------------------------------------------------------
-- API privileges
-- Tighten Supabase's default broad grants. Audit rows are never written or
-- changed directly by clients. Objects and tasks are not deletable here;
-- manager-only DELETE is added in 20260103_manager_delete_permissions.sql and
-- cascades through the foreign keys.
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.objects from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.task_history from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert, update on table public.objects to authenticated;
grant select, insert, update on table public.tasks to authenticated;
grant select on table public.task_history to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_task_status_transition() from public, anon, authenticated;
revoke all on function public.log_task_status_change() from public, anon, authenticated;

revoke all on function public.is_manager() from public, anon, authenticated;
revoke all on function public.can_view_object(uuid) from public, anon, authenticated;
revoke all on function public.can_access_task(uuid) from public, anon, authenticated;

grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_view_object(uuid) to authenticated;
grant execute on function public.can_access_task(uuid) to authenticated;

commit;
