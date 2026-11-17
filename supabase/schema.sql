-- ClarityLoop schema. Idempotent: safe to run again.
-- All writes go through server routes using the service role. RLS is enabled on
-- every table as defence in depth: a signed-in browser can only read rows of its
-- own crew / conversations, and can write nothing directly.

create extension if not exists pgcrypto;

create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_name text not null,
  join_code text not null unique,
  supervisor_id uuid not null,
  is_sandbox boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('supervisor','worker')),
  language text not null check (language in ('en','hi','ta')),
  crew_id uuid references crews(id) on delete set null,
  nexconn_user_id text not null unique,
  pin_hash text,
  pin_fails int not null default 0,
  pin_locked_until timestamptz,
  is_sandbox boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists profiles_crew on profiles(crew_id);

create table if not exists site_places (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  label_en text not null, label_hi text not null, label_ta text not null,
  sort int not null default 0
);
create index if not exists site_places_crew on site_places(crew_id);

create table if not exists site_actions (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  label_en text not null, label_hi text not null, label_ta text not null,
  sort int not null default 0
);
create index if not exists site_actions_crew on site_actions(crew_id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  kind text not null default 'pair' check (kind in ('pair','crew')),
  nexconn_group_id text not null unique,
  supervisor_id uuid not null references profiles(id) on delete cascade,
  worker_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (supervisor_id, worker_id)
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);
create index if not exists conversation_members_profile on conversation_members(profile_id);

create table if not exists message_translations (
  nexconn_message_id text not null,
  conversation_id uuid not null references conversations(id) on delete cascade,
  target_lang text not null check (target_lang in ('en','hi','ta')),
  source_lang text,
  text text not null,
  model_id text,
  ms int,
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (nexconn_message_id, target_lang)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  supervisor_id uuid not null references profiles(id),
  worker_id uuid not null references profiles(id),
  action_id uuid not null references site_actions(id),
  object_text text not null,
  object_i18n jsonb not null default '{}'::jsonb,   -- {en,hi,ta}
  place_id uuid not null references site_places(id),
  due_time text not null check (due_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  quantity numeric,
  unit text,
  note text check (note is null or char_length(note) <= 280),
  note_i18n jsonb not null default '{}'::jsonb,
  state text not null default 'waiting'
    check (state in ('waiting','checking','mismatch','needs_look','all_match','understood','done')),
  is_sandbox boolean not null default false,
  created_at timestamptz not null default now(),
  understood_at timestamptz,
  done_at timestamptz
);
create index if not exists tasks_conversation on tasks(conversation_id, created_at desc);
create index if not exists tasks_supervisor on tasks(supervisor_id, created_at desc);

create table if not exists task_confirmations (
  task_id uuid not null references tasks(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  confirmed_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create table if not exists restatements (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  worker_id uuid not null references profiles(id),
  original_text text not null,
  language text not null,
  created_at timestamptz not null default now()
);
create index if not exists restatements_task on restatements(task_id, created_at desc);

create table if not exists checks (
  id uuid primary key default gen_random_uuid(),
  restatement_id uuid not null references restatements(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  extracted jsonb,                 -- null when the AI could not be read
  field_marks jsonb not null,      -- {action:{mark,supervisor,worker,accepted}, ...}
  overall text not null check (overall in ('mismatch','needs_look','all_match')),
  gloss jsonb not null default '{}'::jsonb,  -- "what we understood" {en,hi,ta}
  model_id text,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists checks_task on checks(task_id, created_at desc);

create table if not exists field_acceptances (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id) on delete cascade,
  field text not null check (field in ('action','object','place','time','quantity')),
  accepted_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (check_id, field)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  actor_id uuid,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_task on audit_events(task_id, created_at);

-- Cards the server must post into Nexconn. The row is written in the same step as
-- the state change; sent_at is set once Nexconn accepts it, so a failed post is retried.
create table if not exists card_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  body text not null,
  attempts int not null default 0,
  last_error text,
  nexconn_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists card_outbox_pending on card_outbox(created_at) where sent_at is null;

-- Per-user fixed-window rate limit counters.
create table if not exists rate_hits (
  profile_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (profile_id, bucket, window_start)
);

-- Timings and error codes for /health.
create table if not exists health_events (
  id bigint generated always as identity primary key,
  kind text not null,            -- translate | extract | nexconn_send | nexconn_token | nexconn_group
  ok boolean not null,
  code text,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists health_kind on health_events(kind, created_at desc);

-- Atomic rate-limit hit: returns the count in the current window.
create or replace function rate_hit(p_profile uuid, p_bucket text, p_window_seconds int)
returns int language plpgsql as $$
declare w timestamptz; c int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_hits(profile_id, bucket, window_start, hits) values (p_profile, p_bucket, w, 1)
  on conflict (profile_id, bucket, window_start) do update set hits = rate_hits.hits + 1
  returning hits into c;
  return c;
end $$;

-- ---------- Row-level security ----------
alter table crews enable row level security;
alter table profiles enable row level security;
alter table site_places enable row level security;
alter table site_actions enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table message_translations enable row level security;
alter table tasks enable row level security;
alter table task_confirmations enable row level security;
alter table restatements enable row level security;
alter table checks enable row level security;
alter table field_acceptances enable row level security;
alter table audit_events enable row level security;
alter table card_outbox enable row level security;
alter table rate_hits enable row level security;
alter table health_events enable row level security;

create or replace function my_crew() returns uuid language sql stable security definer set search_path = public as
$$ select crew_id from profiles where id = auth.uid() $$;
create or replace function is_member(c uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from conversation_members where conversation_id = c and profile_id = auth.uid()) $$;

do $$ begin
  -- read-only policies; no insert/update/delete policy exists, so browsers cannot write.
  drop policy if exists crew_read on crews;
  create policy crew_read on crews for select using (id = my_crew());
  drop policy if exists profile_read on profiles;
  create policy profile_read on profiles for select using (id = auth.uid() or crew_id = my_crew());
  drop policy if exists place_read on site_places;
  create policy place_read on site_places for select using (crew_id = my_crew());
  drop policy if exists action_read on site_actions;
  create policy action_read on site_actions for select using (crew_id = my_crew());
  drop policy if exists conv_read on conversations;
  create policy conv_read on conversations for select using (is_member(id));
  drop policy if exists member_read on conversation_members;
  create policy member_read on conversation_members for select using (is_member(conversation_id));
  drop policy if exists tr_read on message_translations;
  create policy tr_read on message_translations for select using (is_member(conversation_id));
  drop policy if exists task_read on tasks;
  create policy task_read on tasks for select using (is_member(conversation_id));
  drop policy if exists conf_read on task_confirmations;
  create policy conf_read on task_confirmations for select using (exists (select 1 from tasks t where t.id = task_id and is_member(t.conversation_id)));
  drop policy if exists rest_read on restatements;
  create policy rest_read on restatements for select using (exists (select 1 from tasks t where t.id = task_id and is_member(t.conversation_id)));
  drop policy if exists check_read on checks;
  create policy check_read on checks for select using (exists (select 1 from tasks t where t.id = task_id and is_member(t.conversation_id)));
  drop policy if exists acc_read on field_acceptances;
  create policy acc_read on field_acceptances for select using (exists (select 1 from checks c join tasks t on t.id = c.task_id where c.id = check_id and is_member(t.conversation_id)));
  drop policy if exists audit_read on audit_events;
  create policy audit_read on audit_events for select using (exists (select 1 from tasks t where t.id = task_id and is_member(t.conversation_id)));
  -- profiles.pin_hash must never reach a browser even for own crew:
  revoke select on profiles from anon, authenticated;
  grant select (id, display_name, role, language, crew_id, nexconn_user_id, is_sandbox, created_at) on profiles to authenticated;
end $$;

-- Stand-in chat transport, used only while Nexconn keys are not configured.
create table if not exists local_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  from_user text not null,
  text text not null check (char_length(text) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists local_messages_conv on local_messages(conversation_id, created_at);
alter table local_messages enable row level security;

-- Restatement translated into each reader's language, made once on first read.
alter table checks add column if not exists restatement_i18n jsonb not null default '{}'::jsonb;

-- Weighted variant of rate_hit: adds p_n hits at once (a 50-message translate batch counts 50).
create or replace function rate_add(p_profile uuid, p_bucket text, p_window_seconds int, p_n int)
returns int language plpgsql as $$
declare w timestamptz; c int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_hits(profile_id, bucket, window_start, hits) values (p_profile, p_bucket, w, p_n)
  on conflict (profile_id, bucket, window_start) do update set hits = rate_hits.hits + p_n
  returning hits into c;
  return c;
end $$;
revoke execute on function rate_add(uuid, text, int, int) from public, anon, authenticated;

-- ---------- Crew scale: one crew channel per crew, tasks sent to the whole crew ----------
-- Additive only: a new table, a new nullable column, a new partial index, a new policy.
-- At most one 'crew' conversation per crew (worker_id is null for it).
create unique index if not exists conversations_one_crew on conversations(crew_id) where kind = 'crew';

-- One crew task ("broadcast"). Each worker gets an ordinary task in their pair conversation
-- with tasks.broadcast_id pointing here; the roll-call board in the crew channel reads them.
create table if not exists broadcasts (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references crews(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,   -- the crew channel
  supervisor_id uuid not null references profiles(id),
  action_id uuid not null references site_actions(id),
  object_text text not null,
  object_i18n jsonb not null default '{}'::jsonb,
  place_id uuid not null references site_places(id),
  due_time text not null check (due_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  quantity numeric,
  unit text,
  note text check (note is null or char_length(note) <= 280),
  note_i18n jsonb not null default '{}'::jsonb,
  is_safety boolean not null default false,
  is_sandbox boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists broadcasts_crew on broadcasts(crew_id, created_at desc);
alter table broadcasts enable row level security;
alter table tasks add column if not exists broadcast_id uuid references broadcasts(id) on delete set null;
create index if not exists tasks_broadcast on tasks(broadcast_id) where broadcast_id is not null;
do $$ begin
  drop policy if exists broadcast_read on broadcasts;
  create policy broadcast_read on broadcasts for select using (is_member(conversation_id));
end $$;

-- When the assigned worker first had the task card on screen ("seen" is not "understood").
alter table tasks add column if not exists seen_at timestamptz;

-- Other names for the task's object ("steel rods": iron rods, rebar, sariya, ...), made once from the
-- supervisor's own words when the task is created. Code compares the worker's object against them.
alter table tasks add column if not exists object_aliases jsonb not null default '[]'::jsonb;
alter table broadcasts add column if not exists object_aliases jsonb not null default '[]'::jsonb;
