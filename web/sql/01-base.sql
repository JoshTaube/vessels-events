-- Vessels Events: part 1 of 3. Vessels Live's event schema, copied verbatim from
-- F:\VESSELS\Vessels Live\event-schema.sql (2026-09-05): the game tables recovered from prod, the cv/le
-- ballot pairs, event_control, open-to-anon RLS (prod's trust model), the realtime publication.
-- Applied to the Vessels Events project (dvrarldwfemirjeodjnq) through the Supabase connector.

-- ============================================================================
-- VESSELS LIVE - the event project's schema.
--
-- Run this ONCE in the SQL editor of the NEW Supabase project (the one that
-- exists only for live events). Do NOT run it against the playvessels.com
-- project: the ballot tables there are already live and this file's `reveal_at`
-- column is not something prod's code knows about.
--
-- WHAT THE EVENT IS: twelve players on a stage, a non-playing audience voting
-- from their own phones, two games in one show. In event mode the stage players
-- do not vote at all - the audience is the judging body. See
-- docs/specs/2026-08-30-vessels-live-event-mode-design.md.
--
-- AN AUDIENCE MEMBER IS NOT A PLAYER. That is the entire cost story, and it is
-- inherited unchanged from the shipped prod migrations (cv-audience.sql,
-- le-audience.sql), which have been live since 2026-07-31:
--   * no `players` row          (so never trips a seat cap, never takes a role,
--                                never counts toward player-count logic)
--   * no realtime subscription  (a seated room's realtime traffic grows with the
--                                SQUARE of the room; that is what makes seats
--                                scarce and why the crowd must stay out of it)
--   * no heartbeat
--   * ONE small poll of the ballot row - their only read
--   * ONE upsert when they vote - nothing subscribes to it, so a vote never
--     fans out to anybody
-- Cost is LINEAR in the size of the crowd. Nothing is O(N^2). At the 584-phone
-- design ceiling that is ~292 reads/sec of a sub-1KB row on its primary key.
--
-- SAFE TO RE-RUN: create-if-not-exists / drop-policy-if-exists throughout.
-- ============================================================================


-- ============================================================================
-- 1. THE BALLOT TABLES
--
-- Two pairs, one per game, deliberately NOT shared. Every mode mints room codes
-- from the same generator, so a shared ballot table would let a stale Lesser
-- Evil ballot be harvested into a Core Vessels round that drew the same code.
-- The failure mode is SILENT WRONG VOTES at a live event, which is the worst
-- possible place to discover it. Two extra creates remove the whole class.
--
-- The show runs both games under ONE room code (tv.html takes ?code=,
-- lesser-evil-tv.html takes ?create= plus a threaded code), which is what lets
-- an audience phone poll straight through the 15-minute intermission without
-- rejoining. `event_control.game` says which pair is live right now.
-- ============================================================================

-- ---- Core Vessels ----------------------------------------------------------
create table if not exists public.cv_ballot (
  game_id    text primary key,                   -- the room code
  seq        int  not null default 0,            -- ballot number, strictly ascending
  kind       text not null default 'vote',       -- 'vote' | 'results' | 'over' | 'download'
  prompt     text,                               -- one short line of instruction
  options    jsonb not null default '[]'::jsonb, -- [{id, label}] - DISPLAY LABELS ONLY
  pick       int  not null default 1,
  open       bool not null default false,        -- false = cast nothing, watch the screen
  -- THE SYNCHRONIZED REVEAL. Set a few seconds into the future when the
  -- narrator closes a window. Clients fetch the result early and hold it until
  -- this instant, so audience phones, player phones and the screen all flip at
  -- once instead of trickling in as each phone's poll happens to land.
  -- Clients MUST compare this against server time (every poll carries one), not
  -- their own clock - device skew has already caused a live timer bug in this
  -- codebase, and a phone two minutes fast would reveal early and spoil the
  -- result for whoever is sitting next to it.
  reveal_at  timestamptz,
  result     jsonb,                              -- the resolved counts + winner, written at close
  updated_at timestamptz not null default now()
);

-- ---- Lesser Evil -----------------------------------------------------------
create table if not exists public.le_ballot (
  game_id    text primary key,
  seq        int  not null default 0,
  kind       text not null default 'vote',       -- 'vote' | 'sudden_death' | 'final' | 'download'
  prompt     text,
  options    jsonb not null default '[]'::jsonb,
  pick       int  not null default 1,
  open       bool not null default false,
  reveal_at  timestamptz,
  result     jsonb,
  updated_at timestamptz not null default now()
);

-- IMPORTANT, both tables: this row is read by every phone in the room and is
-- the audience's ONLY view of the show. It must never carry anything a
-- spectator could use to play the seated game better than the players - no role
-- claims, no night results, no suspicion figures. Option labels are display
-- names. The audience is deliberately kept in the dark and votes on
-- performance; that is the design, not an oversight.


-- ============================================================================
-- 2. THE VOTE TABLES
--
-- `voter_uid` is a random per-DEVICE id minted into the phone's localStorage on
-- first load. No names, no accounts: the audience is anonymous and the room only
-- ever sees counts. Persisting it is also what carries a session through the
-- intermission when phones sleep and tabs close.
--
-- THE UNIQUE CONSTRAINT IS THE WHOLE SAFETY STORY. A voter may CHANGE their pick
-- while a window is open (the phone upserts on conflict) but can never stuff the
-- box, and a dropped-then-retried write is idempotent. That is what stops one
-- phone swinging a live-event vote twice.
--
-- `choice` is ALWAYS a jsonb array of option ids, even for a single-pick ballot,
-- so one shape serves every ballot kind.
-- ============================================================================

create table if not exists public.cv_votes (
  game_id    text  not null,
  seq        int   not null,
  voter_uid  text  not null,
  choice     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint cv_votes_uniq unique (game_id, seq, voter_uid)
);

create table if not exists public.le_votes (
  game_id    text  not null,
  seq        int   not null,
  voter_uid  text  not null,
  choice     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint le_votes_uniq unique (game_id, seq, voter_uid)
);

-- The harvest is always `where game_id = ? and seq = ?`. These indexes are what
-- keep it cheap once a night's worth of ballots is in the table.
create index if not exists cv_votes_ballot_idx on public.cv_votes (game_id, seq);
create index if not exists le_votes_ballot_idx on public.le_votes (game_id, seq);


-- ============================================================================
-- 3. event_control - the narrator's phone talks to the screen through this
--
-- The narrator carries a phone. It never runs the game engine; it writes a
-- command here and tv.html (which stays the engine holder, exactly as in prod)
-- polls and acts. One row per room.
--
-- Every command carries a NONCE because polling reads the same row repeatedly
-- and "open the vote" must happen once. A surface seeds its gate with whatever
-- nonce is already in the row at boot, so a TV restarting mid-show does not
-- replay the last command and reopen a window the narrator had closed.
-- ============================================================================
create table if not exists public.event_control (
  game_id     text primary key,                  -- the room code, shared by both games
  event_mode  bool not null default false,       -- the master switch: audience joins, players stop voting
  game        text,                              -- 'le' | 'cv' - which ballot pair is live right now
  cmd         text,                              -- 'open_vote' | 'close_vote' | 'reveal' | 'end_show'
  nonce       bigint not null default 0,         -- strictly ascending; a command runs once
  nominees    jsonb not null default '[]'::jsonb,-- Core Vessels: the 2-3 the narrator sent to the crowd
  -- MANUAL OVERRIDE. Not a debug tool - a show path. If the venue's cell
  -- coverage dies mid-show the room does a hand raise, the narrator types the
  -- counts, and they enter through the SAME resolve() the network path uses so
  -- nothing downstream can tell the difference. The show cannot stop to debug a
  -- connection in front of an audience.
  override    jsonb,                             -- {optionId: count} or null
  started_at  timestamptz,                       -- drives the narrator's runtime clock. NARRATOR-ONLY.
  round_at    timestamptz,                       -- start of the current round, same
  updated_at  timestamptz not null default now()
);

-- The runtime clock is narrator-only on purpose: they need to know they are
-- running long without a visible countdown pressuring the players on stage.
-- Nothing that renders to the room may read started_at or round_at.


-- ============================================================================
-- 4. ROW LEVEL SECURITY
--
-- Open to anon, matching how the rest of Vessels already works. A determined
-- audience member COULD read raw ballots mid-round via the REST API. That is
-- the trust model this project runs on; the surfaces never expose it, and there
-- are deliberately NO live tallies anywhere to leak. This event project is also
-- not public - it is reached by QR at our own shows.
--
-- No DELETE policy anywhere: nothing the app does ever deletes a ballot, so
-- cleanup is a service-role job (section 5). That is deliberate - it means a
-- phone in the room cannot erase votes.
-- ============================================================================

alter table public.cv_ballot    enable row level security;
alter table public.le_ballot    enable row level security;
alter table public.cv_votes     enable row level security;
alter table public.le_votes     enable row level security;
alter table public.event_control enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cv_ballot','le_ballot','cv_votes','le_votes','event_control']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_update', t);
    execute format('create policy %I on public.%I for select to anon using (true)', t || '_anon_select', t);
    execute format('create policy %I on public.%I for insert to anon with check (true)', t || '_anon_insert', t);
    execute format('create policy %I on public.%I for update to anon using (true) with check (true)', t || '_anon_update', t);
  end loop;
end $$;


-- ============================================================================
-- 5. HOUSEKEEPING
--
-- The vote tables are the only things here that grow without bound - one row
-- per audience member per ballot, and a 584-seat house produces a lot of both.
-- Run after an event, or wire to a scheduled job. anon has no delete policy, so
-- this only works from the SQL editor or a service-role job, which is the point.
--
--   delete from public.cv_votes  where created_at < now() - interval '7 days';
--   delete from public.le_votes  where created_at < now() - interval '7 days';
--   delete from public.cv_ballot where updated_at < now() - interval '7 days';
--   delete from public.le_ballot where updated_at < now() - interval '7 days';
-- ============================================================================


-- ============================================================================
-- 6. VERIFY
--
-- Run these after the migration. A missing table 404s through the REST API with
-- PGRST205, so a clean 0 here is proof the migration actually landed.
--
--   select count(*) from public.cv_ballot;     -- 0
--   select count(*) from public.le_ballot;     -- 0
--   select count(*) from public.cv_votes;      -- 0
--   select count(*) from public.le_votes;      -- 0
--   select count(*) from public.event_control; -- 0
--
-- Confirm the constraints that make a vote un-stuffable actually exist:
--   select conname from pg_constraint
--    where conrelid in ('public.cv_votes'::regclass, 'public.le_votes'::regclass);
--   -> expect cv_votes_uniq and le_votes_uniq
--
-- Confirm the reveal column landed on both ballot tables:
--   select table_name from information_schema.columns
--    where column_name = 'reveal_at' and table_schema = 'public';
--   -> expect cv_ballot and le_ballot
--
-- CONFIRM REALTIME, which is the one that fails SILENTLY - the client will
-- subscribe successfully and then simply never receive anything:
--   select schemaname, tablename from pg_publication_tables
--    where pubname = 'supabase_realtime';
--   -> expect public/games and public/players
--
-- Confirm the egress guard:
--   select relname, relreplident from pg_class
--    where relname in ('games','players');
--   -> expect 'd' (default), NOT 'f' (full)
-- ============================================================================


-- ============================================================================
-- 7. THE GAME TABLES
--
-- Recovered from the production project on 2026-08-30 via dump-prod-schema.sql,
-- because the repo has no base migration for them - they were built up over
-- time. These are what tv.html and player.html actually read and write; without
-- them those surfaces cannot boot in the event project at all.
--
-- Column shapes are prod's, verbatim. Do not "tidy" them: the surfaces read
-- these names directly, and a rename here is a silent breakage there.
-- ============================================================================

create table if not exists public.games (
  id text not null,
  created_at timestamp with time zone default now(),
  phase text default 'lobby'::text,
  night_number integer default 0,
  action_target uuid,
  pending_action_type text,
  voting_open boolean default false,
  votes jsonb default '{}'::jsonb,
  winner text,
  final_accusation_active boolean default false,
  final_accusation_target text,
  bots_get_special_roles boolean default false,
  theme jsonb,
  narrator_notes jsonb default '[]'::jsonb,
  last_elimination jsonb,
  coin_flip jsonb,
  final_girl_appointed jsonb,
  floor jsonb,
  table_talk jsonb default '[]'::jsonb,
  action_deadline bigint,
  final_girl_designate text,
  final_girl_pending jsonb,
  vote_log jsonb,
  trivia jsonb,
  demon_trickster_used boolean default false,
  trickster_round integer,
  demon_transfer_used boolean default false,
  demon_transfer_round integer,
  demon_transferred_from text,
  vote_history jsonb default '[]'::jsonb,
  score_log jsonb default '[]'::jsonb,
  relics_dropped jsonb default '[]'::jsonb,
  fg_stage text,
  autopilot boolean not null default false,
  captain_action text,
  narrator_claimed boolean not null default false,
  mode text default 'classic'::text,
  engine_owner text,
  engine_owner_ts timestamp with time zone,
  ss jsonb not null default '{}'::jsonb,
  gcbc jsonb not null default '{}'::jsonb,
  pb jsonb,
  le jsonb,
  gcbc_photo text,
  updated_at timestamp with time zone not null default now(),
  ls_state jsonb,
  primary key (id)
);

create table if not exists public.players (
  id uuid not null default gen_random_uuid(),
  game_id text,
  name text not null,
  role text,
  is_possessed boolean default false,
  is_eliminated boolean default false,
  is_stunned boolean default false,
  stunned_until_night integer default 0,
  is_protected_tonight boolean default false,
  has_used_protection boolean default false,
  last_possessed_night integer default 0,
  has_revealed_once boolean default false,
  skipped_this_round boolean default false,
  possession_acknowledged boolean default false,
  pending_hw_result jsonb,
  joined_at timestamp with time zone default now(),
  is_final_girl boolean default false,
  final_girl_acknowledged boolean default false,
  is_bot boolean default false,
  bot_suspicion jsonb default '{}'::jsonb,
  vigil_score integer not null default 0,
  avatar text,
  trivia_score integer not null default 0,
  demon_promoted boolean default false,
  claimed_role text,
  anointed_used boolean default false,
  device_uid text,
  relic text,
  hunter_used boolean default false,
  pending_true_vision jsonb,
  read_floor_key text,
  party_color text,
  party_label text,
  faction_leader_id uuid,
  is_independent boolean default false,
  night_action text,
  night_target uuid,
  cd_no_attack boolean default false,
  cd_no_defend boolean default false,
  cd_no_counter boolean default false,
  night_notice text,
  last_seen timestamp with time zone default now(),
  ghost_score integer not null default 0,
  pb jsonb,
  le jsonb,
  primary key (id)
);

create table if not exists public.night_actions (
  id uuid not null default gen_random_uuid(),
  game_id text,
  night_number integer not null,
  action_type text not null,
  actor_id uuid,
  target_id uuid,
  result text,
  blocked boolean default false,
  created_at timestamp with time zone default now(),
  primary key (id)
);

create table if not exists public.engine_leases (
  room text not null,
  engine_id text not null,
  ts bigint not null,
  updated_at timestamp with time zone not null default now(),
  primary key (room)
);

create table if not exists public.game_sessions (
  id uuid not null default gen_random_uuid(),
  room_code text not null,
  round_number integer,
  mode text not null,
  player_count integer,
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  source text,
  primary key (id)
);

create table if not exists public.profiles (
  uid text not null,
  display_name text,
  total_points integer default 0,
  games_played integer default 0,
  wins integer default 0,
  mvps integer default 0,
  updated_at timestamp with time zone default now(),
  primary key (uid)
);

-- The lookups every surface does constantly.
create index if not exists players_game_idx        on public.players (game_id);
create index if not exists night_actions_game_idx  on public.night_actions (game_id, night_number);
create index if not exists game_sessions_room_idx  on public.game_sessions (room_code);

alter table public.games         enable row level security;
alter table public.players       enable row level security;
alter table public.night_actions enable row level security;
alter table public.engine_leases enable row level security;
alter table public.game_sessions enable row level security;
alter table public.profiles      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['games','players','night_actions','engine_leases','game_sessions','profiles']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_update', t);
    execute format('create policy %I on public.%I for select to anon using (true)', t || '_anon_select', t);
    execute format('create policy %I on public.%I for insert to anon with check (true)', t || '_anon_insert', t);
    execute format('create policy %I on public.%I for update to anon using (true) with check (true)', t || '_anon_update', t);
  end loop;
end $$;

-- Deletes stay revoked, matching prod's hardening. Nothing the app does needs
-- them, and a phone that can delete players can end somebody's game.


-- ============================================================================
-- 8. REALTIME - the two things the dump could not tell me
--
-- (a) tv.html and player.html subscribe to postgres_changes on `games` and
--     `players`. Those subscriptions are how the room stays in sync, and they
--     deliver NOTHING unless the tables are in the supabase_realtime
--     publication. A fresh project has them out of it, so without this block
--     the event build boots, connects, and then simply never updates - which
--     looks like a code bug and is not one.
--
-- (b) REPLICA IDENTITY. Set it to DEFAULT explicitly. With FULL, every realtime
--     message carries the entire OLD row as well as the new one, and `games`
--     holds a dozen jsonb blobs - that is the prime suspect in the 3.2GB egress
--     night on the prod project (see the 2026-08 egress audit). Starting the
--     event project with DEFAULT means never having to find it twice.
-- ============================================================================

alter table public.games   replica identity default;
alter table public.players replica identity default;

-- A BRAND NEW Supabase project has no `supabase_realtime` publication at all,
-- so `alter publication ... add table` raises undefined_object and aborts the
-- whole script - taking every section after this one with it. Create it first,
-- then add each table only if it is not already there. Idempotent, throws
-- nothing, safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['games','players','night_actions']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- night_actions is in the list because tv.html and player.html bind it on the
-- SAME channel as games/players. Found 2026-09-04: Realtime answers a join with
-- one unpublished binding "ok", then posts a `system` error and delivers
-- NOTHING on that channel - games and players included. The TV only advanced
-- on its 45s quiet-resync. `node --experimental-websocket _rtcheck.mjs` now
-- joins with the TV's exact bindings and fails on that error.
--
-- Deliberately NOT added to the publication: cv_votes, le_votes, cv_ballot,
-- le_ballot, event_control. The audience never subscribes to anything - it
-- polls - and putting a table 584 phones write to on the realtime bus is
-- exactly the O(N^2) fan-out the whole audience design exists to avoid.


-- ============================================================================
-- 9. AVATARS - a Storage bucket, not a table  (OPTIONAL - the show runs without it)
--
-- It did not come back in the schema dump because it is not in the database.
-- players.avatar holds a URL into this bucket. Without the bucket the phone
-- falls back to inline base64: ~15KB re-synced through realtime on every player
-- update. At twelve players that is wasteful but survivable, so this is a
-- nice-to-have, NOT a blocker for the show.
--
-- WHY IT IS WRAPPED: `create policy ... on storage.objects` requires ownership
-- of that table, which the SQL editor's role does not have on a modern Supabase
-- project - it raises `must be owner of table objects`. Unwrapped, that error
-- aborted this whole script once already and took the sections after it down
-- too. Now it warns and moves on.
--
-- EASIEST PATH: skip the SQL and use the Dashboard - Storage -> New bucket ->
-- name it `avatars`, tick Public. That creates the bucket and its policies with
-- the right ownership and takes about fifteen seconds.
-- ============================================================================

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;
exception when others then
  raise notice 'avatars bucket not created (%): make it in the Dashboard instead - Storage -> New bucket -> avatars, Public.', sqlerrm;
end $$;

do $$
begin
  execute $p$drop policy if exists "avatars public read" on storage.objects$p$;
  execute $p$create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars')$p$;
  execute $p$drop policy if exists "avatars public write" on storage.objects$p$;
  execute $p$create policy "avatars public write" on storage.objects for insert with check (bucket_id = 'avatars')$p$;
  execute $p$drop policy if exists "avatars public update" on storage.objects$p$;
  execute $p$create policy "avatars public update" on storage.objects for update using (bucket_id = 'avatars')$p$;
exception when others then
  raise notice 'avatars policies not created (%): a Public bucket made in the Dashboard already has them.', sqlerrm;
end $$;


-- ============================================================================
-- 10. NOT COPIED FROM PROD, ON PURPOSE
--
-- The 12-player join cap trigger from security-hardening-v2.sql. Its first
-- version used count(*) ... FOR UPDATE, hit error 0A000, and 400'd every join
-- in every mode until it was rewritten around an advisory lock. The event show
-- is a controlled room with a known cast of twelve; a cap buys nothing here and
-- the failure mode is "nobody can join", live, on stage. If you ever do want
-- it, take the FIXED advisory-lock version, and test a join before the doors
-- open.
-- ============================================================================

-- Vessels Events (2026-10-26): tv.html writes games.round_number (a replayed room's round); the dump above missed it.
alter table public.games add column if not exists round_number integer default 1;
