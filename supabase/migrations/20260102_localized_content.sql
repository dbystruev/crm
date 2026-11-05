-- =============================================================================
-- Objects & Tasks — localized seeded content
-- Migration: 20260102_localized_content.sql
--
-- Adds optional Russian fields for objects and tasks. English remains in the
-- original columns, so user-created content works unchanged and Russian text is
-- rendered only when it is present.
-- =============================================================================

begin;

alter table public.objects
  add column if not exists name_ru text,
  add column if not exists address_ru text,
  add column if not exists description_ru text;

alter table public.tasks
  add column if not exists title_ru text,
  add column if not exists description_ru text;

do $$
begin
  alter table public.objects
    add constraint objects_name_ru_length
    check (name_ru is null or char_length(btrim(name_ru)) between 1 and 160);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.objects
    add constraint objects_address_ru_length
    check (address_ru is null or char_length(btrim(address_ru)) between 1 and 300);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.objects
    add constraint objects_description_ru_length
    check (description_ru is null or char_length(description_ru) <= 4000);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.tasks
    add constraint tasks_title_ru_length
    check (title_ru is null or char_length(btrim(title_ru)) between 1 and 180);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.tasks
    add constraint tasks_description_ru_length
    check (description_ru is null or char_length(description_ru) <= 4000);
exception
  when duplicate_object then null;
end
$$;

commit;
