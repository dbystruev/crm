-- =============================================================================
-- Objects & Tasks — manager delete permissions
-- Migration: 20260103_manager_delete_permissions.sql
--
-- Managers must be able to delete objects and tasks from the application.
-- The UI only exposes these actions to managers, and the policies below enforce
-- the same rule at the database boundary. Deleting an object cascades to its
-- tasks and their history rows.
-- =============================================================================

begin;

-- Objects: only managers may delete a site.
drop policy if exists objects_delete_manager on public.objects;
create policy objects_delete_manager
  on public.objects
  for delete
  to authenticated
  using (public.is_manager());

-- Tasks: only managers may delete individual tasks.
drop policy if exists tasks_delete_manager on public.tasks;
create policy tasks_delete_manager
  on public.tasks
  for delete
  to authenticated
  using (public.is_manager());

-- Supabase revokes all table privileges in the initial migration. Add DELETE
-- back for signed-in users; RLS above still restricts it to managers.
grant delete on table public.objects to authenticated;
grant delete on table public.tasks to authenticated;

commit;
