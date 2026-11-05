-- =============================================================================
-- Objects & Tasks — optional demo seed
--
-- ⚠️  DEVELOPMENT / DEMO ONLY.
-- Creates three known accounts (password: BuildDemo123!) plus sample objects,
-- tasks, and status history. Never run this against a production project.
--
-- Run AFTER 20260101_init.sql. The quick-login buttons use these credentials.
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
    'manager@objects.test',
    extensions.crypt('BuildDemo123!', extensions.gen_salt('bf')),
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
    'worker1@objects.test',
    extensions.crypt('BuildDemo123!', extensions.gen_salt('bf')),
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
    'worker2@objects.test',
    extensions.crypt('BuildDemo123!', extensions.gen_salt('bf')),
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

-- Keep re-runs of the seed usable with the documented demo password.
update auth.users
set
  encrypted_password = extensions.crypt('BuildDemo123!', extensions.gen_salt('bf')),
  email_confirmed_at = now(),
  banned_until = null,
  updated_at = now()
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

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
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"manager@objects.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"worker1@objects.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"worker2@objects.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict do nothing;

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
