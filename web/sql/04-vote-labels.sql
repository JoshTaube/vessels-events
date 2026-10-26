-- Vessels Events (2026-10-26): votes on things that aren't people. Lesser Evil's sudden death asks the audience
-- which SIDE made the better case (FOR or AGAINST), so a vote can carry its own words for an option:
-- labels = {"for": "FOR: Pineapple on pizza", "against": "AGAINST: ..."}. Cast options need none (the phones have the
-- roster). Applied as migration ve_06_vote_labels.

alter table public.ev_vote add column if not exists labels jsonb;   -- {option id: words}, only for non-cast options

drop function if exists public.ev_open_vote(text, text, text, text, jsonb, boolean, int);
create or replace function public.ev_open_vote(p_key text, p_show text, p_game text, p_prompt text, p_candidates jsonb,
                                               p_practice boolean, p_secs int, p_labels jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not ev_is_operator(p_key) then raise exception 'not the operator' using errcode = '28000'; end if;
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'no candidates'); end if;
  if p_labels is not null and jsonb_typeof(p_labels) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'labels'); end if;
  update ev_vote set state = 'closed', closed_at = now() where show_id = p_show and state = 'open';
  insert into ev_vote (show_id, game, prompt, candidates, practice, closes_at, labels)
  values (p_show, p_game, left(p_prompt, 120), p_candidates, coalesce(p_practice, false),
          case when coalesce(p_secs, 0) > 0 then now() + make_interval(secs => least(p_secs, 600)) end, p_labels)
  returning id into v_id;
  update ev_show set stage = 'vote', updated_at = now() where id = p_show;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.ev_now(p_show text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s ev_show; v ev_vote;
begin
  select * into s from ev_show where id = p_show;
  if not found then return jsonb_build_object('ok', false, 'now', floor(extract(epoch from now()) * 1000)); end if;
  select * into v from ev_vote where show_id = p_show order by id desc limit 1;
  return jsonb_build_object('ok', true, 'now', floor(extract(epoch from now()) * 1000), 'stage', s.stage,
    'vote', case when v.id is null then null else jsonb_build_object('id', v.id, 'game', v.game, 'prompt', v.prompt,
      'candidates', v.candidates, 'labels', v.labels, 'practice', v.practice, 'state', v.state,
      'closes_at', case when v.closes_at is null then null else floor(extract(epoch from v.closes_at) * 1000) end,
      'reveal_at', case when v.reveal_at is null then null else floor(extract(epoch from v.reveal_at) * 1000) end,
      'result', case when v.state = 'closed' then v.result end) end);
end $$;

grant execute on function public.ev_open_vote(text, text, text, text, jsonb, boolean, int, jsonb) to anon, authenticated;
grant execute on function public.ev_now(text) to anon, authenticated;
