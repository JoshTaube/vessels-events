-- Vessels Events: part 3 of 3. The show layer the launcher runs (2026-10-26).
--
--   ev_show   one row per night: its two rooms (Lesser Evil, Vessels), where the cast should be right now, what the
--             audience sees (waiting / a vote / the download screen)
--   ev_cast   the night's twelve: name and a SALTED HASH of their private code (the codes never reach the database),
--             check-in time, last heard from
--   ev_vote   one row per audience vote: candidates are cast ids only (faces and names are static files on the site)
--   ev_ballot one row per phone per vote; the primary key is the one-vote-per-phone rule
--
-- Nothing here is readable or writable by phones directly (RLS on, no policies). Everything goes through the
-- functions below. The admin ones need the OPERATOR KEY, held only by the launcher on the operator's laptop: so the
-- audience can't open a vote, see a live tally, or read the roster's codes.
--
-- Load: ~100 audience phones read ev_now through a Netlify function cached ~2 s (so the database sees about one read
-- every 2 s), and write one ev_vote_cast per vote. Nothing here is on the realtime bus.

create table if not exists public.ev_operator (
  id int primary key default 1 check (id = 1),
  key_hash text not null                                   -- sha256 hex of the operator key
);

create table if not exists public.ev_show (
  id          text primary key,                            -- the show file's slug
  name        text,
  host_hash   text,                                        -- sha256 of the host code (Phase 3 host view)
  le_room     text,                                        -- the Lesser Evil room code
  cv_room     text,                                        -- the Vessels room code
  live_game   text,                                        -- 'le' | 'cv' | null: where cast phones belong now
  live_room   text,
  stage       text not null default 'waiting',             -- the audience: 'waiting' | 'vote' | 'download'
  redo        jsonb,                                       -- S6: {at, who: 'all' | cast_id}
  updated_at  timestamptz not null default now()
);

create table if not exists public.ev_cast (
  show_id       text not null references public.ev_show(id) on delete cascade,
  cast_id       text not null,
  name          text not null,
  code_hash     text not null,                             -- sha256 hex of (show_id || ':' || CODE)
  seat          int,
  checked_in_at timestamptz,
  last_seen     timestamptz,
  device        text,
  primary key (show_id, cast_id)
);
create unique index if not exists ev_cast_code_idx on public.ev_cast (show_id, code_hash);

create table if not exists public.ev_vote (
  id         bigint generated always as identity primary key,
  show_id    text not null references public.ev_show(id) on delete cascade,
  game       text not null,                                -- 'le' | 'cv' | 'practice' | 'mvp'
  prompt     text,
  candidates jsonb not null default '[]'::jsonb,           -- ["ava","dex"]: cast ids, nothing else
  practice   boolean not null default false,
  state      text not null default 'open',                 -- 'open' | 'closed'
  opened_at  timestamptz not null default now(),
  closes_at  timestamptz,                                  -- null: the operator closes it
  closed_at  timestamptz,
  reveal_at  timestamptz,                                  -- phones hold the result until then (server time)
  result     jsonb                                         -- {counts:{id:n}, total, winner, tied}
);
create index if not exists ev_vote_show_idx on public.ev_vote (show_id, id desc);

create table if not exists public.ev_ballot (
  vote_id    bigint not null references public.ev_vote(id) on delete cascade,
  device     text not null,                                -- random per-phone id from localStorage
  choice     text not null,
  created_at timestamptz not null default now(),
  primary key (vote_id, device)                            -- one vote per phone per round
);

alter table public.ev_operator enable row level security;
alter table public.ev_show     enable row level security;
alter table public.ev_cast     enable row level security;
alter table public.ev_vote     enable row level security;
alter table public.ev_ballot   enable row level security;
-- (no policies: phones go through the functions below, never the tables)

-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.ev_sha(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex');
$$;

create or replace function public.ev_is_operator(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ev_operator where key_hash = ev_sha(p_key)) and length(coalesce(p_key, '')) >= 24;
$$;

-- Counts for one vote (internal: the live tally is operator-only, see ev_tally).
create or replace function public.ev_counts(p_vote bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('counts', coalesce((select jsonb_object_agg(choice, n) from
           (select choice, count(*) n from ev_ballot where vote_id = p_vote group by choice) t), '{}'::jsonb),
         'total', (select count(*) from ev_ballot where vote_id = p_vote));
$$;
revoke all on function public.ev_counts(bigint) from public, anon, authenticated;

-- The launcher registers tonight's show: its rooms and the cast (codes hashed on the laptop, salted by the show id).
-- Re-running it keeps check-ins for cast who are still in the roster.
create or replace function public.ev_setup_show(p_key text, p_show jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text := p_show->>'id'; c jsonb;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  if coalesce(v_id, '') = '' then return jsonb_build_object('ok', false, 'reason', 'no id'); end if;
  insert into ev_show (id, name, host_hash, le_room, cv_room, updated_at)
  values (v_id, p_show->>'name', p_show->>'host_hash', p_show->>'le_room', p_show->>'cv_room', now())
  on conflict (id) do update set name = excluded.name, host_hash = excluded.host_hash,
    le_room = excluded.le_room, cv_room = excluded.cv_room, updated_at = now();
  delete from ev_cast where show_id = v_id
    and cast_id not in (select x->>'id' from jsonb_array_elements(p_show->'cast') x);
  for c in select * from jsonb_array_elements(p_show->'cast') loop
    insert into ev_cast (show_id, cast_id, name, code_hash, seat)
    values (v_id, c->>'id', c->>'name', c->>'code_hash', (c->>'seat')::int)
    on conflict (show_id, cast_id) do update set name = excluded.name, code_hash = excluded.code_hash, seat = excluded.seat;
  end loop;
  return jsonb_build_object('ok', true, 'cast', (select count(*) from ev_cast where show_id = v_id));
end $$;

-- Where the cast belongs (the launcher moves the night between rooms), what the audience sees, and S6.
create or replace function public.ev_set_show(p_key text, p_show text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  update ev_show set
    live_game = case when p_patch ? 'live_game' then p_patch->>'live_game' else live_game end,
    live_room = case when p_patch ? 'live_room' then p_patch->>'live_room' else live_room end,
    stage     = case when p_patch ? 'stage' then coalesce(p_patch->>'stage', 'waiting') else stage end,
    redo      = case when p_patch ? 'redo' then p_patch->'redo' else redo end,
    updated_at = now()
  where id = p_show;
  return jsonb_build_object('ok', found);
end $$;

-- A cast phone enters its private code: checks in, learns who it is and where the show is.
create or replace function public.ev_join(p_show text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ev_cast; s ev_show;
begin
  select * into r from ev_cast where show_id = p_show
    and code_hash = ev_sha(p_show || ':' || upper(trim(coalesce(p_code, ''))));
  if not found then return jsonb_build_object('ok', false); end if;
  update ev_cast set checked_in_at = coalesce(checked_in_at, now()), last_seen = now(), device = left(p_device, 64)
   where show_id = p_show and cast_id = r.cast_id;
  select * into s from ev_show where id = p_show;
  return jsonb_build_object('ok', true, 'cast_id', r.cast_id, 'name', r.name,
    'live_game', s.live_game, 'live_room', s.live_room, 'redo', s.redo, 'now', floor(extract(epoch from now()) * 1000));
end $$;

-- Every few seconds from a cast phone: I'm here; where's the show? (A phone that has been replaced by a newer
-- device with the same code is told so, and goes back to the code screen.)
create or replace function public.ev_ping(p_show text, p_cast text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ev_cast; s ev_show;
begin
  select * into r from ev_cast where show_id = p_show and cast_id = p_cast;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if r.device is distinct from left(p_device, 64) then return jsonb_build_object('ok', false, 'reason', 'replaced'); end if;
  update ev_cast set last_seen = now() where show_id = p_show and cast_id = p_cast;
  select * into s from ev_show where id = p_show;
  return jsonb_build_object('ok', true, 'name', r.name, 'live_game', s.live_game, 'live_room', s.live_room,
    'redo', s.redo, 'checked_in_at', r.checked_in_at, 'now', floor(extract(epoch from now()) * 1000));
end $$;

-- The launcher's check-in board.
create or replace function public.ev_cast_status(p_key text, p_show text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  return jsonb_build_object('now', floor(extract(epoch from now()) * 1000), 'cast', coalesce((
    select jsonb_agg(jsonb_build_object('id', cast_id, 'name', name, 'checked_in_at', checked_in_at, 'last_seen', last_seen) order by seat, cast_id)
      from ev_cast where show_id = p_show), '[]'::jsonb));
end $$;

-- Open an audience vote (any vote still open for this show closes first, unscored).
create or replace function public.ev_open_vote(p_key text, p_show text, p_game text, p_prompt text, p_candidates jsonb,
                                               p_practice boolean, p_secs int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no candidates'); end if;
  update ev_vote set state = 'closed', closed_at = now() where show_id = p_show and state = 'open';
  insert into ev_vote (show_id, game, prompt, candidates, practice, closes_at)
  values (p_show, p_game, left(p_prompt, 120), p_candidates, coalesce(p_practice, false),
          case when coalesce(p_secs, 0) > 0 then now() + make_interval(secs => least(p_secs, 600)) end)
  returning id into v_id;
  update ev_show set stage = 'vote', updated_at = now() where id = p_show;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Move the end of a running vote (S5 extend: +30 s; or set a deadline on an open-ended one).
create or replace function public.ev_extend_vote(p_key text, p_vote bigint, p_secs int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  update ev_vote set closes_at = greatest(coalesce(closes_at, now()), now()) + make_interval(secs => least(greatest(p_secs, 1), 600))
   where id = p_vote and state = 'open';
  return jsonb_build_object('ok', found);
end $$;

-- The live tally: the launcher only (an early leader on a phone would snowball).
create or replace function public.ev_tally(p_key text, p_vote bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  return ev_counts(p_vote) || jsonb_build_object('state', (select state from ev_vote where id = p_vote),
    'now', floor(extract(epoch from now()) * 1000));
end $$;

-- Close: freeze the count, name the winner (a tie is reported, never broken here: the host says it out loud), and
-- stamp the reveal a few seconds out so every phone and the screen flip together.
create or replace function public.ev_close_vote(p_key text, p_vote bigint, p_reveal_ms int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c jsonb; best int := 0; win text; tied boolean := false; k text; n int; v_res jsonb;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  c := ev_counts(p_vote);
  for k, n in select key, value::int from jsonb_each_text(c->'counts') loop
    if n > best then best := n; win := k; tied := false; elsif n = best and n > 0 then tied := true; end if;
  end loop;
  v_res := c || jsonb_build_object('winner', case when tied then null else win end, 'tied', tied, 'top', best);
  update ev_vote set state = 'closed', closed_at = coalesce(closed_at, now()), result = v_res,
         reveal_at = now() + make_interval(secs => greatest(coalesce(p_reveal_ms, 4000), 0) / 1000.0)
   where id = p_vote;
  return jsonb_build_object('ok', found, 'result', v_res);
end $$;

-- A phone votes. One plain request, no account, no live connection.
create or replace function public.ev_vote_cast(p_vote bigint, p_device text, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v ev_vote;
begin
  if length(coalesce(p_device, '')) < 8 then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
  select * into v from ev_vote where id = p_vote;
  if not found or v.state <> 'open' or (v.closes_at is not null and now() > v.closes_at + interval '2 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if not (v.candidates ? p_choice) then return jsonb_build_object('ok', false, 'reason', 'choice'); end if;
  insert into ev_ballot (vote_id, device, choice) values (p_vote, left(p_device, 64), p_choice) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- What every audience phone polls (through the Netlify cache): the show's stage and its latest vote. Counts only
-- after the vote closes; the phone holds them until reveal_at by the server clock (`now`).
create or replace function public.ev_now(p_show text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ev_show; v ev_vote;
begin
  select * into s from ev_show where id = p_show;
  if not found then return jsonb_build_object('ok', false, 'now', floor(extract(epoch from now()) * 1000)); end if;
  select * into v from ev_vote where show_id = p_show order by id desc limit 1;
  return jsonb_build_object('ok', true, 'now', floor(extract(epoch from now()) * 1000), 'stage', s.stage,
    'vote', case when v.id is null then null else jsonb_build_object('id', v.id, 'game', v.game, 'prompt', v.prompt,
      'candidates', v.candidates, 'practice', v.practice, 'state', v.state,
      'closes_at', case when v.closes_at is null then null else floor(extract(epoch from v.closes_at) * 1000) end,
      'reveal_at', case when v.reveal_at is null then null else floor(extract(epoch from v.reveal_at) * 1000) end,
      'result', case when v.state = 'closed' then v.result end) end);
end $$;

revoke all on function public.ev_is_operator(text) from public, anon, authenticated;
grant execute on function public.ev_join(text, text, text), public.ev_ping(text, text, text),
  public.ev_vote_cast(bigint, text, text), public.ev_now(text) to anon, authenticated;
grant execute on function public.ev_setup_show(text, jsonb), public.ev_set_show(text, text, jsonb),
  public.ev_cast_status(text, text), public.ev_open_vote(text, text, text, text, jsonb, boolean, int),
  public.ev_extend_vote(text, bigint, int), public.ev_tally(text, bigint), public.ev_close_vote(text, bigint, int)
  to anon, authenticated;   -- callable by anyone, refused without the operator key

-- Clean up a show (test runs, a rehearsal) and everything under it. Operator only.
create or replace function public.ev_drop_show(p_key text, p_show text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  delete from ev_show where id = p_show;
  return jsonb_build_object('ok', found);
end $$;
grant execute on function public.ev_drop_show(text, text) to anon, authenticated;
