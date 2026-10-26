-- Vessels Events (2026-10-26): Phase 3, THE HOST VIEW. The host (on the mic) runs /host on their phone with the
-- night's host code: the cue and their line, what's next, the clock, the game's screen, the vote's live counts
-- before the reveal, the Lesser Evil winner's pick, the MVP. And during Core Vessels' discussion they can tap the
-- suspects.
--
--   ev_show.host_state   what the host's phone shows: written by the launcher whenever it changes (operator key)
--   ev_show.host_cmd     the host's taps {n, at, list: the last 20 [{n, type, ...}]}: read back by the launcher, which
--                        acts on each n it hasn't seen (a list, so two quick taps between its reads both count)
--   ev_show.host_seen    when the host's phone last asked (the console shows "host phone live")
--   ev_show.host_pub     when the launcher last checked in (the phone shows "launcher offline" if that's long ago)
--
--   ev_set_host(key, show, state)        the launcher: publish; returns the host's last command and when they were seen
--   ev_host(show, code, device)          the host's phone: the state, if the code is the host's (salted hash, like
--                                        the cast codes: sha256(show id + ':' + CODE))
--   ev_host_cmd(show, code, device, cmd) the host's phone: a tap (choose a suspect)
-- Applied as migrations ve_08_host, ve_09_host_keep_state (a null state keeps the last one), ve_10_host_pub and
-- ve_11_host_cmd_queue (the list of taps).

alter table public.ev_show add column if not exists host_state jsonb;
alter table public.ev_show add column if not exists host_cmd jsonb;
alter table public.ev_show add column if not exists host_seen timestamptz;
alter table public.ev_show add column if not exists host_device text;
alter table public.ev_show add column if not exists host_pub timestamptz;

create or replace function public.ev_set_host(p_key text, p_show text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s ev_show;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  update ev_show set host_state = coalesce(p_state, host_state), host_pub = now() where id = p_show returning * into s;   -- null: no change
  if not found then return jsonb_build_object('ok', false, 'reason', 'show'); end if;
  return jsonb_build_object('ok', true, 'cmd', s.host_cmd, 'device', s.host_device,
    'seen', case when s.host_seen is null then null else floor(extract(epoch from s.host_seen) * 1000) end,
    'now', floor(extract(epoch from now()) * 1000));
end $$;

create or replace function public.ev_host(p_show text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s ev_show;
begin
  select * into s from ev_show where id = p_show;
  if not found or s.host_hash is null or s.host_hash <> ev_sha(p_show || ':' || upper(trim(coalesce(p_code, '')))) then
    return jsonb_build_object('ok', false, 'reason', 'code'); end if;
  update ev_show set host_seen = now(), host_device = left(p_device, 64) where id = p_show;
  return jsonb_build_object('ok', true, 'name', s.name, 'state', s.host_state, 'cmd_n', coalesce((s.host_cmd->>'n')::int, 0),
    'pub', case when s.host_pub is null then null else floor(extract(epoch from s.host_pub) * 1000) end,
    'now', floor(extract(epoch from now()) * 1000));
end $$;

create or replace function public.ev_host_cmd(p_show text, p_code text, p_device text, p_cmd jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s ev_show; n int; ms bigint; lst jsonb;
begin
  select * into s from ev_show where id = p_show for update;
  if not found or s.host_hash is null or s.host_hash <> ev_sha(p_show || ':' || upper(trim(coalesce(p_code, '')))) then
    return jsonb_build_object('ok', false, 'reason', 'code'); end if;
  if p_cmd is null or jsonb_typeof(p_cmd) <> 'object' or coalesce(p_cmd->>'type', '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'cmd'); end if;
  n := coalesce((s.host_cmd->>'n')::int, 0) + 1;
  ms := floor(extract(epoch from now()) * 1000);
  lst := coalesce(s.host_cmd->'list', '[]'::jsonb) || jsonb_build_array(p_cmd || jsonb_build_object('n', n, 'at', ms));
  if jsonb_array_length(lst) > 20 then
    lst := (select jsonb_agg(e order by i) from jsonb_array_elements(lst) with ordinality t(e, i) where i > jsonb_array_length(lst) - 20);
  end if;
  update ev_show set host_cmd = jsonb_build_object('n', n, 'at', ms, 'list', lst),
    host_seen = now(), host_device = left(p_device, 64) where id = p_show;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

grant execute on function public.ev_host(text, text, text), public.ev_host_cmd(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.ev_set_host(text, text, jsonb) to anon, authenticated;   -- refused without the operator key
