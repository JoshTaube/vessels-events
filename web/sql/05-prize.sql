-- Vessels Events (2026-10-26): the Lesser Evil winner's prize. They pick their own role for Vessels.
--
--   ev_show.prize           {cast_id, name, roles:[...], pick:{role, at}|null}: set by the launcher when Lesser Evil
--                           crowns its winner (roles: the night's deal for the table size, Demon included, never
--                           the Final Girl, who isn't dealt). Only the winner's phone ever sees it (ev_ping/ev_join).
--   ev_pick_role(...)       the winner's phone locks one in (once)
--   ev_set_prize(...)       the launcher: who won and the menu (keeps their pick), or the operator picks for them
--   event_control.role_pick {name, role}: handed to the Vessels room, read by tv.html's deal (event patch
--                           tv:role-pick), cleared by the launcher once the first deal is done (a replay is random)
-- Applied as migration ve_07_prize.

alter table public.ev_show add column if not exists prize jsonb;
alter table public.event_control add column if not exists role_pick jsonb;

create or replace function public.ev_set_prize(p_key text, p_show text, p_prize jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur jsonb;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  select prize into cur from ev_show where id = p_show;
  if not found then return jsonb_build_object('ok', false, 'reason', 'show'); end if;
  if p_prize is null or jsonb_typeof(p_prize) <> 'object' then
    update ev_show set prize = null, updated_at = now() where id = p_show;
    return jsonb_build_object('ok', true, 'prize', null);
  end if;
  -- the same winner keeps the pick they made, unless the operator sets one ("pick" in the patch)
  if not (p_prize ? 'pick') then
    p_prize := p_prize || jsonb_build_object('pick',
      case when cur is not null and cur->>'cast_id' = p_prize->>'cast_id' then cur->'pick' else null end);
  end if;
  update ev_show set prize = p_prize, updated_at = now() where id = p_show;
  return jsonb_build_object('ok', true, 'prize', p_prize);
end $$;

create or replace function public.ev_pick_role(p_show text, p_cast text, p_device text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r ev_cast; s ev_show;
begin
  select * into r from ev_cast where show_id = p_show and cast_id = p_cast;
  if not found or r.device is distinct from left(p_device, 64) then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
  select * into s from ev_show where id = p_show;
  if s.prize is null or s.prize->>'cast_id' <> p_cast then return jsonb_build_object('ok', false, 'reason', 'not yours'); end if;
  if s.prize->'pick' is not null and jsonb_typeof(s.prize->'pick') = 'object' then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'pick', s.prize->'pick'); end if;
  if not ((s.prize->'roles') ? p_role) then return jsonb_build_object('ok', false, 'reason', 'role'); end if;
  update ev_show set prize = prize || jsonb_build_object('pick', jsonb_build_object('role', p_role, 'at', floor(extract(epoch from now()) * 1000))),
    updated_at = now() where id = p_show;
  return jsonb_build_object('ok', true, 'role', p_role);
end $$;

-- the prize rides on the winner's own heartbeat and check-in (nobody else's phone ever gets it)
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
    'live_game', s.live_game, 'live_room', s.live_room, 'redo', s.redo, 'now', floor(extract(epoch from now()) * 1000),
    'prize', case when s.prize->>'cast_id' = r.cast_id then s.prize end);
end $$;

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
    'redo', s.redo, 'checked_in_at', r.checked_in_at, 'now', floor(extract(epoch from now()) * 1000),
    'prize', case when s.prize->>'cast_id' = p_cast then s.prize end);
end $$;

-- the launcher's board also learns the prize (who won, what they picked: the operator sees it, the room doesn't)
create or replace function public.ev_cast_status(p_key text, p_show text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  return jsonb_build_object('now', floor(extract(epoch from now()) * 1000),
    'prize', (select prize from ev_show where id = p_show),
    'cast', coalesce((
      select jsonb_agg(jsonb_build_object('id', cast_id, 'name', name, 'checked_in_at', checked_in_at, 'last_seen', last_seen) order by seat, cast_id)
        from ev_cast where show_id = p_show), '[]'::jsonb));
end $$;

grant execute on function public.ev_pick_role(text, text, text, text) to anon, authenticated;
grant execute on function public.ev_set_prize(text, text, jsonb) to anon, authenticated;   -- refused without the operator key
