// Vessels Events: the launcher's line to the event database (the Vessels Events Supabase project). Plain HTTPS
// requests, no live connection, no library. Used by the main process and the tools.
//
//   registerShow(show, rooms)    tonight's rooms and cast (codes leave this laptop only as salted hashes)
//   castStatus(showId)           the check-in board
//   setShow(showId, patch)       where the cast belong (live_game, live_room), the audience stage, S6 (redo)
//   openVote / extendVote / tally / closeVote      the audience vote (operator key)
//   control(room, row)           event_control: event mode, open/close vote commands, overrides (Vessels Live's path)
//   captain(room, action)        games.captain_action: the engine's next step (start, begin, next, openvote...)
//   game(room) / players(room)   what the engine is doing
//
// The operator key never leaves the main process: windows ask the main process, which asks the database.
'use strict';
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // the games' own room alphabet (tv.html genCode)
const newRoom = () => 'V-' + Array.from(crypto.randomBytes(5)).map((b) => ROOM_CHARS[b % ROOM_CHARS.length]).join('');
// What the database stores for a cast code: sha256(show id + ':' + CODE). ev_join hashes the typed code the same way.
const codeHash = (showId, code) => sha(showId + ':' + String(code).trim().toUpperCase());

function make(cfg, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 6000;
  const base = String(cfg.supabaseUrl).replace(/\/$/, '');
  const headers = { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' };
  const call = async (path, init) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(base + path, Object.assign({ signal: ctl.signal }, init, { headers: Object.assign({}, headers, (init && init.headers) || {}) }));
      const text = await r.text();
      let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!r.ok) { const e = new Error((data && data.message) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
      return data;
    } finally { clearTimeout(t); }
  };
  const rpc = (fn, args) => call('/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
  const K = cfg.operatorKey;

  return {
    rpc,
    registerShow: (show, rooms) => rpc('ev_setup_show', { p_key: K, p_show: {
      id: show.id, name: show.name, host_hash: show.hostCode ? sha(show.id + ':' + show.hostCode) : null,
      le_room: rooms && rooms.le, cv_room: rooms && rooms.cv,
      cast: show.cast.map((p, i) => ({ id: p.id, name: p.name, seat: i + 1, code_hash: codeHash(show.id, p.code) })) } }),
    castStatus: (showId) => rpc('ev_cast_status', { p_key: K, p_show: showId }),
    setShow: (showId, patch) => rpc('ev_set_show', { p_key: K, p_show: showId, p_patch: patch }),
    openVote: (showId, v) => rpc('ev_open_vote', { p_key: K, p_show: showId, p_game: v.game, p_prompt: v.prompt || '',
      p_candidates: v.candidates, p_practice: !!v.practice, p_secs: v.secs || 0, p_labels: v.labels || null }),
    extendVote: (voteId, secs) => rpc('ev_extend_vote', { p_key: K, p_vote: voteId, p_secs: secs }),
    tally: (voteId) => rpc('ev_tally', { p_key: K, p_vote: voteId }),
    closeVote: (voteId, revealMs) => rpc('ev_close_vote', { p_key: K, p_vote: voteId, p_reveal_ms: revealMs == null ? 4000 : revealMs }),
    dropShow: (showId) => rpc('ev_drop_show', { p_key: K, p_show: showId }),
    // the Lesser Evil winner's prize: {cast_id, name, roles, pick?} (pick: the operator picks for them), or null
    setPrize: (showId, prize) => rpc('ev_set_prize', { p_key: K, p_show: showId, p_prize: prize }),
    // event_control (open to anon, Vessels Live's trust model): one row per room
    control: (room, row) => call('/rest/v1/event_control?on_conflict=game_id', { method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(Object.assign({ game_id: room, updated_at: new Date().toISOString() }, row)) }),
    controlRow: (room) => call('/rest/v1/event_control?game_id=eq.' + encodeURIComponent(room) + '&select=*').then((r) => (r && r[0]) || null),
    captain: (room, action) => call('/rest/v1/games?id=eq.' + encodeURIComponent(room), { method: 'PATCH',
      headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ captain_action: action }) }),
    game: (room) => call('/rest/v1/games?id=eq.' + encodeURIComponent(room)
      + '&select=id,phase,mode,night_number,round_number,pending_action_type,voting_open,floor,captain_action,winner,final_accusation_active,score_log,last_elimination,le')
      .then((r) => (r && r[0]) || null),
    players: (room) => call('/rest/v1/players?game_id=eq.' + encodeURIComponent(room)
      + '&select=id,name,is_bot,is_eliminated,role,is_possessed,is_final_girl,has_revealed_once,last_seen,joined_at,le&order=joined_at.asc'),
    leBallot: (room) => call('/rest/v1/le_ballot?game_id=eq.' + encodeURIComponent(room) + '&select=*').then((r) => (r && r[0]) || null),
    cvBallot: (room) => call('/rest/v1/cv_ballot?game_id=eq.' + encodeURIComponent(room) + '&select=*').then((r) => (r && r[0]) || null)
  };
}

module.exports = { make, sha, codeHash, newRoom, ROOM_CHARS };
