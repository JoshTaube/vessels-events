-- Vessels Events: part 2 of 3. The three RPCs the game pages call, verbatim from prod
-- (Vessels_6_12\audit-migrations.sql: add_bot; Vessels_6_12_devdocs\MIGRATION_atomic_votes.sql: cast_vote,
-- clear_vote), plus prod's one-name-per-room backstop that makes "same name = same seat" safe.

create unique index if not exists players_game_id_name_key on public.players (game_id, name);

create or replace function public.add_bot(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_names text[] := array[
    'Agatha','Bram','Cordelia','Dorian','Edith','Felix','Greta','Hugh','Imogen','Jasper',
    'Klara','Lior','Maeve','Nico','Olen','Petra','Quinn','Rowan','Silas','Talia',
    'Ulla','Viv','Wren','Yara','Zane','Briar','Cass','Dax','Esme','Finn',
    'Gale','Hale','Ivy','June','Knox','Lena','Mads','Nadia','Orin','Pia',
    'Reva','Soren','Tess','Uri','Vera','Wade','Xander','Yusuf','Zelda','Asa',
    'Bo','Coral','Dove','Elke','Frey','Gwen','Halle','Nora','Jove','Kit','Nafan'];
  v_phase text; v_count int; v_name text;
begin
  perform pg_advisory_xact_lock(hashtext(p_code));
  select phase into v_phase from games where id = p_code;
  if v_phase is null then return jsonb_build_object('added', false, 'reason', 'not_found'); end if;
  if v_phase <> 'lobby' then return jsonb_build_object('added', false, 'reason', 'not_lobby'); end if;
  select count(*) into v_count from players where game_id = p_code;
  if v_count >= 12 then return jsonb_build_object('added', false, 'reason', 'full', 'count', v_count); end if;
  select n into v_name from unnest(v_names) as n
   where n not in (select name from players where game_id = p_code) order by random() limit 1;
  if v_name is null then v_name := 'Guest ' || (v_count + 1); end if;
  insert into players (game_id, name, is_bot, bot_suspicion) values (p_code, v_name, true, '{}'::jsonb);
  return jsonb_build_object('added', true, 'name', v_name, 'count', v_count + 1);
end; $$;
grant execute on function public.add_bot(text) to anon;

create or replace function public.cast_vote(p_game_id text, p_voter text, p_target jsonb)
returns void language sql as $$
  update public.games set votes = coalesce(votes, '{}'::jsonb) || jsonb_build_object(p_voter, p_target) where id = p_game_id;
$$;
create or replace function public.clear_vote(p_game_id text, p_voter text)
returns void language sql as $$
  update public.games set votes = coalesce(votes, '{}'::jsonb) - p_voter where id = p_game_id;
$$;
grant execute on function public.cast_vote(text, text, jsonb) to anon, authenticated;
grant execute on function public.clear_vote(text, text)        to anon, authenticated;
