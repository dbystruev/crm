-- =============================================================================
-- Objects & Tasks — optional demo seed
--
-- ⚠️  DEVELOPMENT / DEMO ONLY.
-- Creates three known accounts plus sample objects, tasks, and status history.
-- Never run this against a production project.
--
-- Demo credentials:
--   manager@bystruev.com / Crm2026!Manager
--   worker1@hurated.com  / Crm2026!Worker1
--   worker2@buddian.com  / Crm2026!Worker2
--
-- Run AFTER 20260101_init.sql (and 20260102_localized_content.sql on projects
-- Demo accounts use these credentials.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Demo auth accounts
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'manager@bystruev.com',
    extensions.crypt('Crm2026!Manager', extensions.gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex Morgan"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'worker1@hurated.com',
    extensions.crypt('Crm2026!Worker1', extensions.gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Daniel Reyes"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'worker2@buddian.com',
    extensions.crypt('Crm2026!Worker2', extensions.gen_salt('bf')),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Maya Chen"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

-- Keep re-runs of the seed usable with the documented demo credentials.
-- The email is refreshed too, so an existing project created with older demo
-- addresses is migrated by running this file again.
update auth.users
set
  email = 'manager@bystruev.com',
  encrypted_password = extensions.crypt('Crm2026!Manager', extensions.gen_salt('bf')),
  email_confirmed_at = now(),
  banned_until = null,
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111';

update auth.users
set
  email = 'worker1@hurated.com',
  encrypted_password = extensions.crypt('Crm2026!Worker1', extensions.gen_salt('bf')),
  email_confirmed_at = now(),
  banned_until = null,
  updated_at = now()
where id = '22222222-2222-4222-8222-222222222222';

update auth.users
set
  email = 'worker2@buddian.com',
  encrypted_password = extensions.crypt('Crm2026!Worker2', extensions.gen_salt('bf')),
  email_confirmed_at = now(),
  banned_until = null,
  updated_at = now()
where id = '33333333-3333-4333-8333-333333333333';

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    gen_random_uuid(),
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"manager@bystruev.com","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"worker1@hurated.com","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"worker2@buddian.com","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict do nothing;

-- Keep existing email identities in sync when the seed is re-run on a project
-- created with older demo addresses.
update auth.identities
set
  identity_data = jsonb_set(identity_data, '{email}', '"manager@bystruev.com"'::jsonb),
  updated_at = now()
where user_id = '11111111-1111-4111-8111-111111111111' and provider = 'email';

update auth.identities
set
  identity_data = jsonb_set(identity_data, '{email}', '"worker1@hurated.com"'::jsonb),
  updated_at = now()
where user_id = '22222222-2222-4222-8222-222222222222' and provider = 'email';

update auth.identities
set
  identity_data = jsonb_set(identity_data, '{email}', '"worker2@buddian.com"'::jsonb),
  updated_at = now()
where user_id = '33333333-3333-4333-8333-333333333333' and provider = 'email';

-- The auth trigger creates worker profiles. Promote the manager and keep names
-- in sync with the seeded auth metadata.
insert into public.profiles (id, full_name, role, created_at)
values
  ('11111111-1111-4111-8111-111111111111', 'Alex Morgan', 'manager', now() - interval '180 days'),
  ('22222222-2222-4222-8222-222222222222', 'Daniel Reyes', 'worker', now() - interval '180 days'),
  ('33333333-3333-4333-8333-333333333333', 'Maya Chen', 'worker', now() - interval '180 days')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role;

-- -----------------------------------------------------------------------------
-- Construction objects
-- -----------------------------------------------------------------------------
insert into public.objects (id, name, address, description, created_by, created_at, updated_at)
values
  (
    '0b000000-0000-4000-8000-000000000001',
    'Riverside Residences',
    '14 Riverside Drive, Cambridge',
    'A 24-unit residential block with a shared courtyard, underground parking, and a ground-floor café. Structural work is complete; interior fit-out is underway.',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '120 days',
    now() - interval '4 days'
  ),
  (
    '0b000000-0000-4000-8000-000000000002',
    'Hillcrest Workspace',
    '88 Hillcrest Avenue, Somerville',
    'Full renovation of a three-storey office building: open-plan workspaces, two meeting suites, and a new reception.',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '82 days',
    now() - interval '1 day'
  ),
  (
    '0b000000-0000-4000-8000-000000000003',
    'Northline Warehouse',
    '5 Northline Industrial Park, Medford',
    'Steel-frame logistics warehouse with a 1,200 m² floor, four loading docks, and staff facilities.',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '48 days',
    now() - interval '8 days'
  )
on conflict (id) do update
set name = excluded.name,
    address = excluded.address,
    description = excluded.description,
    updated_at = excluded.updated_at;

-- Russian content for the seeded objects. User-created objects may leave these
-- fields null; the UI falls back to the English columns.
update public.objects
set
  name_ru = 'ЖК «Речной»',
  address_ru = 'ул. Речная, 14, Кембридж',
  description_ru = 'Жилой комплекс на 24 квартиры с общим двором, подземной парковкой и кафе на первом этаже. Конструктивные работы завершены, идёт внутренняя отделка.'
where id = '0b000000-0000-4000-8000-000000000001';

update public.objects
set
  name_ru = 'Офис «Хиллкрест»',
  address_ru = 'Хиллкрест-авеню, 88, Сомервилл',
  description_ru = 'Полная реконструкция трёхэтажного офисного здания: открытые рабочие пространства, два переговорных блока и новая зона ресепшн.'
where id = '0b000000-0000-4000-8000-000000000002';

update public.objects
set
  name_ru = 'Склад «Нортлайн»',
  address_ru = 'Нортлайн Индастриал Парк, 5, Медфорд',
  description_ru = 'Логистический склад с металлокаркасом, полом 1 200 м², четырьмя погрузочными доками и бытовыми помещениями для персонала.'
where id = '0b000000-0000-4000-8000-000000000003';

-- Reset only the seeded tasks so the file can be re-run safely. Cascades remove
-- their old history rows.
delete from public.tasks
where id in (
  '7a000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000002',
  '7a000000-0000-4000-8000-000000000003',
  '7a000000-0000-4000-8000-000000000004',
  '7a000000-0000-4000-8000-000000000005',
  '7a000000-0000-4000-8000-000000000006',
  '7a000000-0000-4000-8000-000000000007',
  '7a000000-0000-4000-8000-000000000008',
  '7a000000-0000-4000-8000-000000000009',
  '7a000000-0000-4000-8000-000000000010',
  '7a000000-0000-4000-8000-000000000011',
  '7a000000-0000-4000-8000-000000000012',
  '7a000000-0000-4000-8000-000000000013'
);

insert into public.tasks (
  id,
  object_id,
  title,
  description,
  assignee_id,
  status,
  due_date,
  created_by,
  created_at,
  updated_at
)
values
  (
    '7a000000-0000-4000-8000-000000000001',
    '0b000000-0000-4000-8000-000000000001',
    'Electrical rough-in — floors 2 & 3',
    'Pull new circuits for all 24 units on the second and third floors. Includes panel labeling, conduit runs, and outlet placement per drawing E-204.',
    '22222222-2222-4222-8222-222222222222',
    'in_progress',
    current_date + 4,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '18 days',
    now() - interval '15 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000002',
    '0b000000-0000-4000-8000-000000000001',
    'HVAC ductwork installation',
    'Install supply and return ductwork for the east and west wings. Coordinate with electrical to avoid clashes above corridor ceilings.',
    '33333333-3333-4333-8333-333333333333',
    'under_review',
    current_date - 1,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '27 days',
    now() - interval '3 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000003',
    '0b000000-0000-4000-8000-000000000001',
    'Feature wall framing — lobby',
    'Frame the double-height lobby feature wall and prepare backing for the oak slat finish.',
    '22222222-2222-4222-8222-222222222222',
    'new',
    current_date + 7,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000004',
    '0b000000-0000-4000-8000-000000000001',
    'Bathroom tile setting — units 4–8',
    'Set floor and wall tile in units 4 through 8. Align grout lines with the corridor datum and protect finished surfaces.',
    '33333333-3333-4333-8333-333333333333',
    'revision_requested',
    current_date - 2,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '32 days',
    now() - interval '4 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000005',
    '0b000000-0000-4000-8000-000000000001',
    'Foundation waterproofing',
    'Apply the below-grade membrane to the north retaining wall and install drainage board. Include the tie-in at the footings.',
    '22222222-2222-4222-8222-222222222222',
    'accepted',
    current_date - 22,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '48 days',
    now() - interval '25 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000006',
    '0b000000-0000-4000-8000-000000000002',
    'Demolition & debris removal',
    'Strip out the old partition walls on levels 1–3, remove finishes, and cart debris to the designated disposal area.',
    '33333333-3333-4333-8333-333333333333',
    'accepted',
    current_date - 20,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '65 days',
    now() - interval '28 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000007',
    '0b000000-0000-4000-8000-000000000002',
    'Drywall hanging — east wing',
    'Hang and tape drywall across the east wing, including corridor ceilings and service risers.',
    '22222222-2222-4222-8222-222222222222',
    'in_progress',
    current_date + 1,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '14 days',
    now() - interval '10 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000008',
    '0b000000-0000-4000-8000-000000000002',
    'Window glazing replacement',
    'Replace 14 failed glazing units on the south façade. Match the existing tint and check all seals after install.',
    '33333333-3333-4333-8333-333333333333',
    'new',
    current_date + 9,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '4 days',
    now() - interval '4 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000009',
    '0b000000-0000-4000-8000-000000000002',
    'Reception millwork install',
    'Install the reception desk millwork and back-wall shelving. Verify power/data cut-outs before fixing.',
    '22222222-2222-4222-8222-222222222222',
    'under_review',
    current_date + 2,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '20 days',
    now() - interval '1 day'
  ),
  (
    '7a000000-0000-4000-8000-000000000010',
    '0b000000-0000-4000-8000-000000000002',
    'Lighting control commissioning',
    'Commission the DALI lighting controls for the open-plan floor and confirm scenes in the two meeting rooms.',
    '33333333-3333-4333-8333-333333333333',
    'revision_requested',
    current_date + 5,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '13 days',
    now() - interval '2 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000011',
    '0b000000-0000-4000-8000-000000000003',
    'Loading dock steel repairs',
    'Repair corrosion on the two southern loading dock beams. Weld, treat, and repaint to spec.',
    '33333333-3333-4333-8333-333333333333',
    'in_progress',
    current_date - 1,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '24 days',
    now() - interval '19 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000012',
    '0b000000-0000-4000-8000-000000000003',
    'Fire-rated ceiling inspection',
    'Inspect and certify the fire-rated ceiling grid above the main floor. Provide a marked-up plan and photo record.',
    '33333333-3333-4333-8333-333333333333',
    'new',
    current_date + 11,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '6 days',
    now() - interval '6 days'
  ),
  (
    '7a000000-0000-4000-8000-000000000013',
    '0b000000-0000-4000-8000-000000000003',
    'Exterior cladding — south elevation',
    'Install and seal the exterior cladding panels on the south elevation, including flashings and corner trims.',
    '33333333-3333-4333-8333-333333333333',
    'accepted',
    current_date - 4,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '55 days',
    now() - interval '8 days'
  );

-- Russian content for the seeded tasks. User-created tasks may leave these
-- fields null; the UI falls back to the English columns.
update public.tasks
set
  title_ru = 'Электромонтажные работы — 2 и 3 этажи',
  description_ru = 'Проложить новые цепи для всех 24 квартир на втором и третьем этажах. Включает маркировку щитов, прокладку кабельных каналов и размещение розеток по чертежу E-204.'
where id = '7a000000-0000-4000-8000-000000000001';

update public.tasks
set
  title_ru = 'Монтаж воздуховодов вентиляции',
  description_ru = 'Установить приточные и вытяжные воздуховоды в восточном и западном крыльях. Согласовать с электромонтажниками, чтобы избежать пересечений над потолками коридоров.'
where id = '7a000000-0000-4000-8000-000000000002';

update public.tasks
set
  title_ru = 'Каркас акцентной стены — лобби',
  description_ru = 'Смонтировать каркас акцентной стены двойной высоты в лобби и подготовить основание для отделки дубовыми рейками.'
where id = '7a000000-0000-4000-8000-000000000003';

update public.tasks
set
  title_ru = 'Укладка плитки в санузлах — квартиры 4–8',
  description_ru = 'Уложить напольную и настенную плитку в квартирах с 4 по 8. Выровнять швы по отметке коридора и защитить готовые поверхности.'
where id = '7a000000-0000-4000-8000-000000000004';

update public.tasks
set
  title_ru = 'Гидроизоляция фундамента',
  description_ru = 'Нанести подземную мембрану на северную подпорную стену и установить дренажную плиту. Включить примыкание к фундаментным подошвам.'
where id = '7a000000-0000-4000-8000-000000000005';

update public.tasks
set
  title_ru = 'Демонтаж и вывоз мусора',
  description_ru = 'Демонтировать старые перегородки на 1–3 уровнях, снять отделку и вывезти мусор на отведённую площадку.'
where id = '7a000000-0000-4000-8000-000000000006';

update public.tasks
set
  title_ru = 'Монтаж гипсокартона — восточное крыло',
  description_ru = 'Смонтировать и зашпаклевать гипсокартон в восточном крыле, включая потолки коридоров и инженерные стояки.'
where id = '7a000000-0000-4000-8000-000000000007';

update public.tasks
set
  title_ru = 'Замена оконных стеклопакетов',
  description_ru = 'Заменить 14 вышедших из строя стеклопакетов на южном фасаде. Подобрать существующий оттенок и проверить все уплотнения после установки.'
where id = '7a000000-0000-4000-8000-000000000008';

update public.tasks
set
  title_ru = 'Монтаж стойки ресепшн',
  description_ru = 'Установить стойку ресепшн и полки на задней стене. Перед креплением проверить отверстия для электрики и слаботочных сетей.'
where id = '7a000000-0000-4000-8000-000000000009';

update public.tasks
set
  title_ru = 'Пусконаладка освещения',
  description_ru = 'Провести пусконаладку контроллеров DALI для открытого этажа и проверить сценарии в двух переговорных комнатах.'
where id = '7a000000-0000-4000-8000-000000000010';

update public.tasks
set
  title_ru = 'Ремонт стальных конструкций погрузочного дока',
  description_ru = 'Отремонтировать коррозию на двух южных балках погрузочного дока. Заварить, обработать и окрасить по спецификации.'
where id = '7a000000-0000-4000-8000-000000000011';

update public.tasks
set
  title_ru = 'Инспекция противопожарного потолка',
  description_ru = 'Проверить и сертифицировать противопожарную потолочную систему над основным этажом. Предоставить размеченный план и фотоотчёт.'
where id = '7a000000-0000-4000-8000-000000000012';

update public.tasks
set
  title_ru = 'Наружная облицовка — южный фасад',
  description_ru = 'Смонтировать и загерметизировать панели наружной облицовки на южном фасаде, включая отливы и угловые планки.'
where id = '7a000000-0000-4000-8000-000000000013';

-- The insert trigger writes an initial history row for each task. Replace those
-- with the full, realistic timeline below.
delete from public.task_history
where task_id in (
  '7a000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000002',
  '7a000000-0000-4000-8000-000000000003',
  '7a000000-0000-4000-8000-000000000004',
  '7a000000-0000-4000-8000-000000000005',
  '7a000000-0000-4000-8000-000000000006',
  '7a000000-0000-4000-8000-000000000007',
  '7a000000-0000-4000-8000-000000000008',
  '7a000000-0000-4000-8000-000000000009',
  '7a000000-0000-4000-8000-000000000010',
  '7a000000-0000-4000-8000-000000000011',
  '7a000000-0000-4000-8000-000000000012',
  '7a000000-0000-4000-8000-000000000013'
);

insert into public.task_history (task_id, from_status, to_status, changed_by, comment, created_at)
values
  -- Electrical rough-in
  ('7a000000-0000-4000-8000-000000000001', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '18 days'),
  ('7a000000-0000-4000-8000-000000000001', 'new', 'in_progress', '22222222-2222-4222-8222-222222222222', null, now() - interval '15 days'),

  -- HVAC
  ('7a000000-0000-4000-8000-000000000002', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '27 days'),
  ('7a000000-0000-4000-8000-000000000002', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '23 days'),
  ('7a000000-0000-4000-8000-000000000002', 'in_progress', 'under_review', '33333333-3333-4333-8333-333333333333', 'Ductwork, dampers and pressure test are complete. Test report is in the site folder.', now() - interval '3 days'),

  -- Feature wall
  ('7a000000-0000-4000-8000-000000000003', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '2 days'),

  -- Bathroom tile
  ('7a000000-0000-4000-8000-000000000004', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '32 days'),
  ('7a000000-0000-4000-8000-000000000004', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '27 days'),
  ('7a000000-0000-4000-8000-000000000004', 'in_progress', 'under_review', '33333333-3333-4333-8333-333333333333', 'Tile is set and sealed in all five units. Ready for inspection.', now() - interval '8 days'),
  ('7a000000-0000-4000-8000-000000000004', 'under_review', 'revision_requested', '11111111-1111-4111-8111-111111111111', 'Grout lines in units 6 and 7 are uneven and the edge trim at the shower niche needs rework. Please align to the corridor datum and reseal before resubmitting.', now() - interval '4 days'),

  -- Foundation
  ('7a000000-0000-4000-8000-000000000005', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '48 days'),
  ('7a000000-0000-4000-8000-000000000005', 'new', 'in_progress', '22222222-2222-4222-8222-222222222222', null, now() - interval '42 days'),
  ('7a000000-0000-4000-8000-000000000005', 'in_progress', 'under_review', '22222222-2222-4222-8222-222222222222', 'Membrane and drainage board installed. Photo record uploaded.', now() - interval '27 days'),
  ('7a000000-0000-4000-8000-000000000005', 'under_review', 'accepted', '11111111-1111-4111-8111-111111111111', 'Waterproofing detail matches the engineer''s drawing. Photo record received. Accepted.', now() - interval '25 days'),

  -- Demolition
  ('7a000000-0000-4000-8000-000000000006', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '65 days'),
  ('7a000000-0000-4000-8000-000000000006', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '60 days'),
  ('7a000000-0000-4000-8000-000000000006', 'in_progress', 'under_review', '33333333-3333-4333-8333-333333333333', 'All three levels stripped and cleared.', now() - interval '30 days'),
  ('7a000000-0000-4000-8000-000000000006', 'under_review', 'accepted', '11111111-1111-4111-8111-111111111111', 'Strip-out complete, debris removed, and floors swept. Accepted.', now() - interval '28 days'),

  -- Drywall
  ('7a000000-0000-4000-8000-000000000007', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '14 days'),
  ('7a000000-0000-4000-8000-000000000007', 'new', 'in_progress', '22222222-2222-4222-8222-222222222222', null, now() - interval '10 days'),

  -- Glazing
  ('7a000000-0000-4000-8000-000000000008', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '4 days'),

  -- Reception millwork
  ('7a000000-0000-4000-8000-000000000009', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '20 days'),
  ('7a000000-0000-4000-8000-000000000009', 'new', 'in_progress', '22222222-2222-4222-8222-222222222222', null, now() - interval '16 days'),
  ('7a000000-0000-4000-8000-000000000009', 'in_progress', 'under_review', '22222222-2222-4222-8222-222222222222', 'Millwork is fixed and level. Countertop delivery is scheduled for Thursday.', now() - interval '1 day'),

  -- Lighting controls
  ('7a000000-0000-4000-8000-000000000010', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '13 days'),
  ('7a000000-0000-4000-8000-000000000010', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '10 days'),
  ('7a000000-0000-4000-8000-000000000010', 'in_progress', 'under_review', '33333333-3333-4333-8333-333333333333', 'Commissioning sheet is complete. All scenes tested.', now() - interval '4 days'),
  ('7a000000-0000-4000-8000-000000000010', 'under_review', 'revision_requested', '11111111-1111-4111-8111-111111111111', 'Please relabel the scene buttons in the north meeting room and re-test the dimming curve at 10%. Resubmit with the commissioning sheet.', now() - interval '2 days'),

  -- Loading dock
  ('7a000000-0000-4000-8000-000000000011', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '24 days'),
  ('7a000000-0000-4000-8000-000000000011', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '19 days'),

  -- Fire ceiling
  ('7a000000-0000-4000-8000-000000000012', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '6 days'),

  -- Cladding
  ('7a000000-0000-4000-8000-000000000013', null, 'new', '11111111-1111-4111-8111-111111111111', null, now() - interval '55 days'),
  ('7a000000-0000-4000-8000-000000000013', 'new', 'in_progress', '33333333-3333-4333-8333-333333333333', null, now() - interval '50 days'),
  ('7a000000-0000-4000-8000-000000000013', 'in_progress', 'under_review', '33333333-3333-4333-8333-333333333333', 'Panels, flashings and corner trims installed on the full elevation.', now() - interval '10 days'),
  ('7a000000-0000-4000-8000-000000000013', 'under_review', 'accepted', '11111111-1111-4111-8111-111111111111', 'Panels, flashings and seals all check out. Accepted.', now() - interval '8 days');

commit;
