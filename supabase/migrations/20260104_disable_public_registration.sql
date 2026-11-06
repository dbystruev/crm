-- =============================================================================
-- Objects & Tasks — disable public registration at the database boundary
-- Migration: 20260104_disable_public_registration.sql
--
-- Requirement 15: public self-registration is disabled. Accounts are created
-- manually by an administrator in Supabase. The trigger below rejects inserts
-- into auth.users that originate from the anonymous API role.
-- =============================================================================

begin;

-- Prevent public sign-ups via anonymous API calls at DB level.
create or replace function public.prevent_public_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' or auth.role() = 'anon' then
    raise exception 'Public registration is disabled. Test users must be created manually in Supabase by an administrator.';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_prevent_signup on auth.users;
create trigger on_auth_user_created_prevent_signup
  before insert on auth.users
  for each row execute function public.prevent_public_signup();

commit;
