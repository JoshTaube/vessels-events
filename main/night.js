// Vessels Events: the night's online side. The cue engine (src/cue-engine.js) knows where the show is; this knows
// what that means for the two games and the room full of phones:
//
//   rooms       one Lesser Evil room and one Vessels room per night, made by the TVs the display hosts, kept across
//               restarts (a room code is never created twice: the TVs wipe a room's players when told to create it)
//   check-in    the cast phones' check-ins and heartbeats, from the event database, onto the board
//   the cast    which room the cast phones belong in (they follow on their own): Lesser Evil in the 300s, Vessels
//               from the intermission on, only once that room exists
//   the engine  what each game is waiting for and the one step that moves it on (N on the console). Core Vessels
//               takes steps through games.captain_action (Vessels Live's path); Lesser Evil through the host
//               buttons its own TV exposes (LE_HOST.hostActions), run inside the TV page
//   votes       the audience votes on /vote (ev_vote). The practice vote and Core Vessels' votes open on their cues;
//               Lesser Evil opens its own ballots, which are mirrored to /vote as they appear. Closing freezes the
//               count, stamps a shared reveal time and hands the counts to the game as Vessels Live's hand count
//               (event_control close_vote + override), so the game resolves exactly as if the room had voted.
//
// Everything online goes through `db` (main/ev.js) and is retried by the next tick when it fails: the show never
// waits on the network, and a dropped write converges once the venue's internet is back.
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'web', 'event-mode.js'));
require(path.join(__dirname, '..', 'web', 'audience-bridge.js'));
const VLE = globalThis.VLE;

const TICK_MS = 500;
const REVEAL_MS = 4000;      // phones and the projector flip to the result this long after a close (the practice vote)
// a game's vote: the game itself reveals ~5 to 7 s after the close (it sees the close on its 1.5 s poll, then holds
// 4.4 s), so the phones and the vote panel wait as long, and everyone sees the result together
const GAME_REVEAL_MS = 6000;
const LIVE_MS = 15000;       // a cast phone that hasn't pinged for this long shows as dropped
const LE_VOTE_SECS = 30;

const segOf = (cue) => (cue ? +String(cue.id).charAt(0) : 0);
// which game a cue belongs to: its screen says so, or its segment does (300s Lesser Evil, 400s on Vessels)
function gameOf(cue) {
  if (!cue) return null;
  const g = cue.screen && cue.screen.game;
  if (g === 'lesser-evil' || g === 'le') return 'le';
  if (g === 'vessels' || g === 'cv') return 'cv';
  const s = segOf(cue);
  return s === 3 ? 'le' : s >= 4 ? 'cv' : null;
}
const screenOf = (cue) => (cue && cue.screen && cue.screen.type) || 'black';
const norm = (s) => String(s || '').trim().toLowerCase();

// Lesser Evil's state in one line, and what N does there.
function leStep(game, players, voteOpen) {
  if (!game) return { where: 'No Lesser Evil room yet' };
  const le = game.le, ps = players || [];
  const racers = ps.filter((p) => !(p.le && p.le.isHost));
  const name = (id) => { const p = ps.find((x) => String(x.id) === String(id)); return p ? p.name : 'someone'; };
  if (voteOpen) return { where: 'The audience is voting', action: 'close-vote', label: 'Close the vote' };
  if (!le) {
    // prod's rule: the race starts once every seat has chosen and every candidate has a campaign slogan
    const unsure = racers.filter((p) => !(p.le && p.le.role)).length;
    const noSlogan = racers.filter((p) => !(p.le && p.le.voter) && !String((p.le && p.le.slogan) || '').trim()).length;
    const waiting = racers.length < 3 ? `needs ${3 - racers.length} more` : unsure ? `${unsure} still choosing` : noSlogan ? `waiting for ${noSlogan} slogan${noSlogan === 1 ? '' : 's'}` : 'ready';
    return { where: `Lobby: ${racers.length} seated · ${waiting}`, action: 'start', label: 'Start the race',
      hint: waiting === 'ready' ? '' : 'It starts once everyone is in and every candidate has typed a slogan on their phone.',
      extra: [{ action: 'skipIntro', label: 'Start, skip the intro' }] };
  }
  if (le.phase === 'results' || le.phase === 'complete') return { where: 'The race is over: results on screen', action: 'next', label: 'Next' };
  const st = le.stage;
  if (!st) return { where: 'Between stages', action: 'next', label: 'Next stage' };
  const kind = { room_vote: 'Room vote', sudden_death: 'Sudden death', final: 'The final' }[st.type] || ('Round ' + ((le.stage_idx || 0) + 1));
  const sub = { pick: 'picking positions', speech: st.holder ? `${name(st.holder)} has the floor` : 'speeches', ballot: 'ballot',
    reveal: 'the reveal', rps: 'rock paper scissors', endorse: 'the kingmaker decides', assign: 'teams choose sides' }[st.sub] || st.sub || '';
  // (no +30 s here: in Lesser Evil only a speaker can buy their own extra time, and it counts in a tiebreak)
  const extra = [{ action: 'startTimer', label: 'Start the speech clock' }, { action: 'skip', label: 'Skip the clock' }];
  return { where: kind + (sub ? ': ' + sub : ''), action: 'next', label: 'Next', extra };
}
// The roles tv.html deals to a table of n (classicSpecials, with the device options left at their defaults): the
// Lesser Evil winner's menu. No Scholar at events (Josh, 2026-10-26): their power is a second vote and the cast
// doesn't vote (event patch tv:no-scholar-deal). The Final Girl is never dealt, so never offered.
function dealFor(n) {
  const out = ['host-demon', 'priest', 'nun'];
  if (n >= 7) out.push('anointed');
  if (n >= 12) out.push('hunter');
  return out.concat('townsfolk');
}

// what each Lesser Evil step runs inside its TV
const LE_ACTIONS = { start: 'leIntroStart', skipIntro: 'leIntroSkip', next: 'leNext', startTimer: 'leStartSpeech', skip: 'leSkip' };

// A ballot's options -> what /vote shows. People become cast ids (their faces and names are on the site); anything
// else (a bot, FOR / AGAINST) gets an id of its own and its words in labels. map: vote option -> the game's option id.
function mapOptions(options, players, cast) {
  const candidates = [], labels = {}, map = {};
  for (const o of options || []) {
    const p = (players || []).find((x) => String(x.id) === String(o.id));
    const nm = norm(p ? p.name : o.label);
    const c = (cast || []).find((x) => norm(x.name) === nm);
    let id = c ? c.id : 'o-' + String(o.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    while (map[id] != null) id += '_';
    candidates.push(id); map[id] = String(o.id);
    if (!c) labels[id] = String(o.label || (p && p.name) || o.id);
  }
  return { candidates, labels: Object.keys(labels).length ? labels : null, map };
}

function make(o) {
  const db = o.db, EV = o.EV, store = o.store;
  const log = o.log || (() => {});
  let show = null, saved = null, timer = null, busy = {};
  const live = {
    db: { ok: db ? null : false, err: db ? null : 'offline (no config/event.local.json)', at: 0 },
    checked: false,                     // the rooms have been looked up (until then no TV loads: it might create one twice)
    phones: {}, games: { le: null, cv: null }, players: { le: [], cv: [] }, ballot: { le: null },
    vote: null, nominees: [], written: null,
  };
  const at = {};   // when each poll last ran
  // o.manual (the tests): no timer, every poll due on every _tick()
  const due = (k, ms) => { if (o.manual) return true; const now = Date.now(); if (now - (at[k] || 0) < ms) return false; at[k] = now; return true; };
  const changed = () => { try { o.onChange(); } catch (e) { /* the windows catch up on the next change */ } };
  const ok = () => { if (live.db.ok !== true || live.db.err) { live.db = { ok: true, err: null, at: Date.now() }; changed(); } else live.db.at = Date.now(); };
  const fail = (what, e) => {
    const err = `${what}: ${(e && e.message) || e}`;
    if (live.db.err !== err) { live.db = { ok: false, err, at: Date.now() }; log(err); changed(); }
  };
  // one call of each kind at a time; a failure is noted and the next tick tries again
  const run = async (k, fn) => {
    if (!db || busy[k]) return null;
    busy[k] = true;
    try { const r = await fn(); ok(); return r; } catch (e) { fail(k, e); return null; } finally { busy[k] = false; }
  };
  const file = () => 'night.json';
  const persist = () => { try { store.write(file(), saved); } catch (e) { log('night save failed: ' + e.message); } };
  const freshRooms = () => ({ le: EV.newRoom(), cv: EV.newRoom() });

  // ---------------------------------------------------------------------------------------------
  // the show: rooms, registration
  function attach(sh) {
    show = sh;
    const prev = store.read(file(), null);
    saved = prev && prev.show === sh.id && prev.rooms ? prev
      : { show: sh.id, rooms: freshRooms(), made: { le: false, cv: false }, registered: false, redoN: 0, redoAt: 0, voted: false };
    live.checked = false; live.vote = null; live.nominees = []; live.written = null;
    live.games = { le: null, cv: null }; live.players = { le: [], cv: [] }; live.ballot = { le: null };
    persist();
    if (o.manual) return;
    if (!timer) timer = setInterval(tick, TICK_MS);
    tick();
  }
  function reset() {   // start the show over: fresh rooms (the old games stay as they were), registered again
    if (!show) return;
    saved = { show: show.id, rooms: freshRooms(), made: { le: false, cv: false }, registered: false, redoN: saved.redoN || 0, redoAt: Date.now(), voted: false };
    live.checked = false; live.vote = null; live.nominees = []; live.written = null; live.phones = {}; live.prize = null;
    live.games = { le: null, cv: null }; live.players = { le: [], cv: [] }; live.ballot = { le: null };
    persist(); changed();
    run('prize-reset', () => db.setPrize(show.id, null));   // last run's winner loses the prize
  }
  async function register() {
    const r = await run('register', async () => {
      const res = await db.registerShow(show, saved.rooms);
      if (!res || !res.ok) throw new Error((res && res.reason) || 'refused');
      // both rooms in event mode before their TVs boot: the cast don't vote, the operator is the clock
      await db.control(saved.rooms.le, { event_mode: true, game: 'le' });
      await db.control(saved.rooms.cv, { event_mode: true, game: 'cv' });
      return res;
    });
    if (r) { saved.registered = true; persist(); changed(); }
  }
  async function lookUpRooms() {   // after a restart: a room that already exists is joined, never created again
    const r = await run('rooms', async () => ({ le: await db.game(saved.rooms.le), cv: await db.game(saved.rooms.cv) }));
    if (!r) return;
    for (const g of ['le', 'cv']) if (r[g]) saved.made[g] = true;
    persist(); live.checked = true; changed();
  }

  // ---------------------------------------------------------------------------------------------
  // the TVs the display should host: [{game, room, url, visible}]
  function engines(state, cue, origin) {
    if (!show || !saved || !live.checked || !origin || !db) return [];
    const seg = state && state.started ? segOf(cue) : 1;
    const want = seg <= 3 ? ['le'] : ['cv'];
    // a game cue shows its game, Lesser Evil's ballots included (its own ballot screen has each candidate's position;
    // the launcher's vote QR sits beside it)
    const showing = screenOf(cue) === 'game' ? gameOf(cue) : null;
    return want.map((g) => {
      const room = saved.rooms[g], made = saved.made[g];
      const url = g === 'le'
        ? `${origin}/lesser-evil-tv.html?${made ? 'game' : 'code'}=${encodeURIComponent(room)}`
        : `${origin}/tv.html?${made ? 'game=' + encodeURIComponent(room) : 'create=1&code=' + encodeURIComponent(room) + '&theme=classic'}`;
      return { game: g, room, url, visible: showing === g };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // the loop
  let lastCtx = { state: null, cue: null };
  function setContext(state, cue) { lastCtx = { state, cue }; }
  async function tick() {
    if (!show || !db) return;
    if (!saved.registered) { if (due('reg', 3000)) await register(); return; }
    if (!live.checked) { if (due('rooms', 2000)) await lookUpRooms(); return; }
    const { state, cue } = lastCtx;
    const seg = state && state.started ? segOf(cue) : 1;
    const active = seg <= 3 ? 'le' : 'cv';
    const jobs = [];   // side by side; each kind of call is one at a time (run), so overlapping ticks never double up
    if (due('cast', 2500)) jobs.push(pollCast());
    if (due('game', 1500)) jobs.push(pollGame(active));
    if (active === 'le' && saved.made.le && due('ballot', 1200)) jobs.push(pollLeBallot());
    if (live.vote && live.vote.state === 'open') {
      if (due('tally', 1000)) jobs.push(pollTally());
      if (live.vote.closesAt && Date.now() >= live.vote.closesAt) jobs.push(closeVote('time'));
    }
    await Promise.all(jobs);
    // then, on what the polls just learned (a room that has just opened): where the phones go, S6, the prize
    await Promise.all([writeLive(state, cue), redo(state), prize()]);
  }

  async function pollCast() {
    const r = await run('cast', () => db.castStatus(show.id));
    if (!r || !Array.isArray(r.cast)) return;
    const now = r.now || Date.now(), phones = {};
    for (const c of r.cast) phones[c.id] = { in: !!c.checked_in_at, live: !!c.last_seen && now - Date.parse(c.last_seen) < LIVE_MS };
    if (JSON.stringify(r.prize || null) !== JSON.stringify(live.prize || null)) { live.prize = r.prize || null; changed(); }
    if (JSON.stringify(phones) !== JSON.stringify(live.phones)) {
      live.phones = phones;
      o.act({ type: 'phones', ids: Object.keys(phones).filter((id) => phones[id].in) });
      changed();
    }
  }
  async function pollGame(g) {
    const room = saved.rooms[g];
    const r = await run('game-' + g, async () => ({ game: await db.game(room), players: await db.players(room) }));
    if (!r) return;
    if (r.game && !saved.made[g]) { saved.made[g] = true; persist(); }
    const sig = JSON.stringify([r.game, r.players]);
    if (sig !== JSON.stringify([live.games[g], live.players[g]])) { live.games[g] = r.game; live.players[g] = r.players || []; changed(); }
    if (g === 'le') crown(r.game, r.players);
    if (g === 'cv') keepScore(r.game);
  }

  // ---------------------------------------------------------------------------------------------
  // THE PRIZE (Josh, 2026-10-26): the Lesser Evil winner picks their Vessels role. When the race crowns its winner,
  // their phone is offered this night's deal (the table size decides it, as the game does; Demon allowed, never
  // the Final Girl). Their pick goes to the Vessels room before its first deal, and is taken back after it, so a
  // replay deals at random.
  function crown(game, players) {
    const le = game && game.le;
    if (!le || !(le.phase === 'results' || le.phase === 'complete') || le.winner == null) return;
    const p = (players || []).find((x) => String(x.id) === String(le.winner));
    const nm = p ? p.name : (le.players && le.players[le.winner] && le.players[le.winner].name);
    const c = show.cast.find((x) => norm(x.name) === norm(nm));
    if (!c || (saved.leWinner && saved.leWinner.cast_id === c.id)) return;
    saved.leWinner = { cast_id: c.id, name: c.name }; saved.prizeRoles = null; persist();
    log(`Lesser Evil winner: ${c.name}`);
    changed();
  }
  async function prize() {
    const w = saved.leWinner;
    if (!w || saved.pickUsed) return;
    // the menu: this deal for the table the Vessels room will have (bots fill it to six)
    const seated = (live.players.cv || []).length, n = Math.max(6, seated || show.cast.length);
    const roles = dealFor(n);
    if (JSON.stringify(roles) !== JSON.stringify(saved.prizeRoles)) {
      const r = await run('prize', () => db.setPrize(show.id, { cast_id: w.cast_id, name: w.name, roles }));
      if (r && r.ok) { saved.prizeRoles = roles; live.prize = r.prize; persist(); changed(); }
      return;
    }
    const pick = live.prize && live.prize.cast_id === w.cast_id && live.prize.pick && live.prize.pick.role;
    const g = live.games.cv;
    if (pick && saved.made.cv && (!saved.pickSent || saved.pickSent.role !== pick) && (!g || g.phase === 'lobby')) {
      const r = await run('prize-send', () => db.control(saved.rooms.cv, { role_pick: { name: w.name, role: pick } }));
      if (r) { saved.pickSent = { role: pick, at: Date.now() }; persist(); changed(); }
    } else if (saved.pickSent && g && g.phase && g.phase !== 'lobby') {
      // the first deal is done: take the pick back so a replay deals at random
      const r = await run('prize-clear', () => db.control(saved.rooms.cv, { role_pick: null }));
      if (r) { saved.pickUsed = true; persist(); changed(); }
    }
  }
  // GO into the first Vessels deal (or N on it) waits for the prize: picked, and in the game's hands
  function prizeHold() {
    const w = saved.leWinner;
    if (!w || saved.pickUsed || !saved.prizeRoles) return null;
    const pick = live.prize && live.prize.cast_id === w.cast_id && live.prize.pick && live.prize.pick.role;
    if (!pick) return `${w.name} hasn’t picked their role yet (the Lesser Evil prize). Wait for them, or pick for them on the console`;
    if (!saved.pickSent || saved.pickSent.role !== pick || Date.now() - saved.pickSent.at < 3000) return `Handing ${w.name}’s pick to the game. One moment`;
    return null;
  }
  // the operator picks for the winner (a dead phone), or takes a pick back (role null)
  async function pickFor(role) {
    const w = saved.leWinner;
    if (!w) return { error: 'Lesser Evil hasn’t crowned a winner yet' };
    if (saved.pickUsed) return { error: 'The roles have been dealt' };
    if (role && !(saved.prizeRoles || []).includes(role)) return { error: 'That role isn’t in tonight’s deal' };
    const r = await run('prize', () => db.setPrize(show.id, { cast_id: w.cast_id, name: w.name, roles: saved.prizeRoles || dealFor(Math.max(6, show.cast.length)),
      pick: role ? { role, at: Date.now(), by: 'operator' } : null }));
    if (!r || !r.ok) return { error: 'Couldn’t save the pick: ' + (live.db.err || 'try again') };
    live.prize = r.prize; changed();
    return { ok: true, flash: role ? `Picked for ${w.name}` : `${w.name} can pick again` };
  }

  // ---------------------------------------------------------------------------------------------
  // MVP (Josh, 2026-10-26: "our points system"): Vessels scores everyone when a game ends (tv.html
  // computeGameScores, games.score_log), and its MVP is the best SKILL subtotal: every line but Played and Team won,
  // either team. A replay wipes score_log, so each finished game is kept here and the night adds them up. A tie
  // means co-MVPs.
  function keepScore(game) {
    if (!game || game.phase !== 'ended' || !Array.isArray(game.score_log) || !game.score_log.length) return;
    const sig = JSON.stringify(game.score_log.map((s) => [s.pid, s.total]));
    saved.scoreLogs = saved.scoreLogs || [];
    if (saved.scoreLogs.some((x) => x.sig === sig)) return;
    saved.scoreLogs.push({ sig, at: Date.now(), log: game.score_log });
    persist(); changed();
  }
  function mvp() {
    const logs = (saved && saved.scoreLogs) || [];
    if (!logs.length) return null;
    const by = {};
    for (const g of logs) for (const s of g.log) {
      const k = norm(s.name);
      const e = by[k] = by[k] || { name: s.name, skill: 0, total: 0, lines: {} };
      e.total += s.total || 0;
      for (const it of s.items || []) {
        if (it.label === 'Played' || it.label === 'Team won') continue;
        e.skill += it.pts || 0;
        e.lines[it.label] = (e.lines[it.label] || 0) + (it.pts || 0);
      }
    }
    const all = Object.values(by), top = Math.max(0, ...all.map((e) => e.skill));
    if (!(top > 0)) return { games: logs.length, players: [] };
    const players = all.filter((e) => e.skill === top).map((e) => {
      const c = show.cast.find((x) => norm(x.name) === norm(e.name));
      return { name: e.name, cast_id: c ? c.id : null, skill: e.skill, total: e.total,
        lines: Object.entries(e.lines).map(([label, pts]) => ({ label, pts })).sort((a, b) => b.pts - a.pts) };
    });
    return { games: logs.length, top, players };
  }

  // where the cast phones belong, and what /vote shows; written only when it changes, retried until it lands
  function wantLive(state, cue) {
    const started = state && state.started;
    let game = started ? (cue && cue.cast !== undefined ? (cue.cast === 'none' ? null : cue.cast) : gameOf(cue)) : null;
    if (game && !saved.made[game]) game = null;   // its room isn't there yet: the phones wait on /cast
    const stage = started && screenOf(cue) === 'download' ? 'download' : saved.voted ? 'vote' : 'waiting';
    return { live_game: game, live_room: game ? saved.rooms[game] : null, stage };
  }
  async function writeLive(state, cue) {
    const want = wantLive(state, cue);
    if (live.written && JSON.stringify(want) === JSON.stringify(live.written)) return;
    const r = await run('live', () => db.setShow(show.id, want));
    if (r) { live.written = want; changed(); }
  }
  async function redo(state) {   // S6: the cast phones (one, or all) go back to the code screen
    const rq = state && state.redoNames;
    if (!rq || !(rq.at > (saved.redoAt || 0))) return;
    const n = (saved.redoN || 0) + 1;
    const r = await run('redo', () => db.setShow(show.id, { redo: { n, who: rq.who || 'all' } }));
    if (r) { saved.redoN = n; saved.redoAt = rq.at; persist(); }
  }

  // ---------------------------------------------------------------------------------------------
  // the engines
  function step(g) {
    if (g === 'le') return leStep(live.games.le, live.players.le, !!(live.vote && live.vote.game === 'le' && live.vote.state === 'open'));
    const s = VLE.hostStep(live.games.cv, live.players.cv);
    return Object.assign({}, s, { extra: s.extra || [] });
  }
  // N on the console (action omitted: whatever the game is waiting for), or one of the step's extra buttons
  async function engineStep(g, action) {
    if (!show || !db) return { error: 'Offline: the games need the event database' };
    if (!saved.made[g]) return { error: 'That game’s room isn’t open yet' };
    const s = step(g);
    const a = action || s.action;
    if (!a) return { error: s.where + (s.hint ? '. ' + s.hint : '') };
    if (s.pending && g === 'cv') return { error: `Waiting for the screen to take “${s.pending}”` };
    if (g === 'cv' && a === 'start') { const h = prizeHold(); if (h) return { error: h }; }
    if (a === 'close-vote') return closeVote('operator');
    if (g === 'le') {
      const fn = LE_ACTIONS[a];
      if (!fn) return { error: 'Unknown Lesser Evil step ' + a };
      try { await o.runInEngine('le', `(function(){var h=window.LE_HOST&&LE_HOST.hostActions;if(!h||!h.${fn})return 'no-host';h.${fn}();return 'ok';})()`).then((r) => { if (r !== 'ok') throw new Error('the Lesser Evil screen isn’t ready'); }); }
      catch (e) { return { error: e.message || String(e) }; }
      return { ok: true, flash: (s.label && !action ? s.label : a) };
    }
    const r = await run('captain', () => db.captain(saved.rooms.cv, a));
    if (r === null && live.db.err) return { error: 'Couldn’t reach the game: ' + live.db.err };
    if (live.games.cv) live.games.cv.captain_action = a;
    changed();
    return { ok: true, flash: (s.label && !action ? s.label : a) };
  }

  // the Core Vessels shortlist: 2 or 3 of the living, picked on the console
  function toggleNominee(id) {
    const i = live.nominees.indexOf(String(id));
    if (i >= 0) live.nominees.splice(i, 1); else live.nominees.push(String(id));
    changed();
    return { ok: true };
  }
  const alive = () => (live.players.cv || []).filter((p) => !p.is_eliminated);

  // Can GO enter this cue? (Core Vessels' vote needs its shortlist, and the game at its vote.)
  function preflight(cue) {
    if (!cue || !db || !show) return null;
    if (gameOf(cue) === 'cv' && cue.engine === 'start' && live.games.cv && live.games.cv.phase === 'lobby') { const h = prizeHold(); if (h) return h; }
    if (screenOf(cue) === 'vote' && gameOf(cue) === 'cv') {
      const v = VLE.nominationValid(live.nominees, alive().map((p) => String(p.id)));
      if (!v.ok) return v.reason + ' on the console before the vote';
      const g = live.games.cv, s = step('cv');
      if (!g || !(g.voting_open || s.action === 'openvote')) return `The game isn’t at its vote yet (${s.where}). Step it on with N`;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // votes
  async function openVote(v) {
    const r = await run('vote-open', () => db.openVote(show.id, v));
    if (!r || !r.ok) { if (r) fail('vote-open', r.reason); return null; }
    live.vote = Object.assign({ id: r.id, state: 'open', counts: {}, total: 0, result: null, revealAt: null,
      opensAt: Date.now(), closesAt: v.secs ? Date.now() + v.secs * 1000 : null }, v);
    if (!saved.voted) { saved.voted = true; persist(); }
    live.written = live.written && Object.assign({}, live.written, { stage: 'vote' });   // ev_open_vote set it
    changed();
    return live.vote;
  }
  async function closeVote(why) {
    const v = live.vote;
    if (!v || v.state !== 'open') return { error: 'No vote is open' };
    v.state = 'closing'; changed();
    const hold = v.game === 'cv' || v.game === 'le' ? GAME_REVEAL_MS : REVEAL_MS;
    const r = await run('vote-close', () => db.closeVote(v.id, hold));
    if (!r || !r.ok) { v.state = 'open'; if (v.closesAt) v.closesAt = Date.now() + 2000; changed(); return { error: 'Couldn’t close the vote: ' + (live.db.err || 'try again') }; }
    v.result = r.result || {}; v.counts = v.result.counts || v.counts; v.total = v.result.total || 0;
    v.state = 'closed'; v.revealAt = Date.now() + hold; v.closedBy = why; v.closedAt = Date.now();
    changed(); feedAudience(v);   // the TV's "from the audience" ends on the final count
    if (v.game === 'le') {
      // closed early (V, or leaving the cue): stop the game's ballot clock where the room can see it. Only this
      // ballot's clock (its seq), and only while it's still the ballot, so a write that lands late can't touch the next
      o.runInEngine('le', `(function(){var h=window.LE_HOST;if(!h||!h.leWrite)return 0;h.leWrite('vl-close',function(s){`
        + `if(!s||!s.stage||s.deadline==null||((s.game_no||0)*1000+(s.stage_idx||0))!==${+v.leSeq || 0})return null;`
        + `if(!(s.stage.sub==='ballot'||s.stage.type==='room_vote'))return null;var n=Date.now();if(s.deadline<=n)return null;s.deadline=n;return s;});return 1;})()`).catch(() => {});
    }
    if (v.game === 'cv' || v.game === 'le') {
      // the audience's counts ARE the tally: handed over as Vessels Live's hand count, keyed by the game's options
      const override = {};
      for (const c of v.candidates) override[v.map[c]] = (v.counts && v.counts[c]) || 0;
      await run('vote-hand', () => db.control(v.room, { cmd: 'close_vote', nonce: Date.now(), override }));
    }
    return { ok: true, flash: v.total ? `Vote closed · ${v.total} votes` : 'Vote closed · no votes' };
  }
  async function extendVote(secs) {
    const v = live.vote;
    if (!v || v.state !== 'open') return;
    const r = await run('vote-extend', () => db.extendVote(v.id, secs));
    if (r) { v.closesAt = Math.max(v.closesAt || Date.now(), Date.now()) + secs * 1000; changed(); }
    // Lesser Evil's ballot clock is on the projector: move it too (the game has no host +30 s for a ballot, so the
    // deadline is written through the TV's own guarded write)
    if (r && v.game === 'le') o.runInEngine('le', `(function(){var h=window.LE_HOST;if(!h||!h.leWrite)return 0;`
      + `h.leWrite('vl-extend',function(s){if(!s||s.deadline==null||!s.stage)return null;s.deadline+=${secs * 1000};return s;});return 1;})()`).catch(() => {});
  }
  // Lesser Evil's own ballot screen says how many in the audience have voted: tell it (event patch le-tv:audience-count)
  const feedAudience = (v) => { if (v && v.game === 'le') o.runInEngine('le', `window.__VL_EVENT&&(window.__VL_EVENT.audTotal=${+v.total || 0})`).catch(() => {}); };
  async function pollTally() {
    const v = live.vote;
    const r = await run('tally', () => db.tally(v.id));
    if (!r || live.vote !== v || v.state !== 'open') return;
    if (JSON.stringify(r.counts) !== JSON.stringify(v.counts) || r.total !== v.total) { v.counts = r.counts || {}; v.total = r.total || 0; changed(); }
    feedAudience(v);
  }
  // Lesser Evil opens its own ballots. Each new one goes to /vote; once the game has taken a close, its command
  // is cleared so the next ballot can't close the moment it opens.
  async function pollLeBallot() {
    const room = saved.rooms.le;
    const b = await run('le-ballot', () => db.leBallot(room));
    live.ballot.le = b;
    const v = live.vote;
    if (b && b.open && !(v && v.game === 'le' && v.leSeq === b.seq)) {
      if (v && v.state === 'open') await closeVote('replaced');
      await run('le-reset', () => db.control(room, { cmd: 'open_vote', nonce: Date.now(), override: null, nominees: [] }));
      const m = mapOptions(b.options, live.players.le, show.cast);
      // close on the ballot clock the room is watching on the projector (the TV runs on this laptop: same clock),
      // else after voteSecs
      const g = await run('le-deadline', () => db.game(room));
      const dl = +(g && g.le && g.le.deadline) || 0;
      const secs = dl - Date.now() > 5000 ? Math.round((dl - Date.now()) / 1000) : ((show.lesserEvil && show.lesserEvil.voteSecs) || LE_VOTE_SECS);
      const opened = await openVote({ game: 'le', room, auto: true, leSeq: b.seq, prompt: b.prompt || 'Who made the best case?', pick: b.pick || 1,
        candidates: m.candidates, labels: m.labels, map: m.map, secs });
      feedAudience(opened);
      log(`Lesser Evil ballot ${b.seq} mirrored to /vote (${m.candidates.length} options)`);
    } else if (v && v.game === 'le' && v.state === 'closed' && !v.ctlCleared && b && !b.open && b.seq === v.leSeq && (b.result || Date.now() - (v.closedAt || 0) > 8000)) {
      const r = await run('le-clear', () => db.control(room, { cmd: 'idle', nonce: Date.now(), override: null }));
      if (r) v.ctlCleared = true;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // the cue changed (GO, a jump, back, a reset): open or close what that cue means
  async function cueChanged(prev, cue, state) {
    setContext(state, cue);
    if (!db || !show) return;
    const v = live.vote;
    // leaving a vote's cue closes it (GO out of the vote means "that's time")
    if (v && v.state === 'open' && v.cue && (!cue || cue.id !== v.cue)) await closeVote('cue');
    if (!cue || (prev && prev.id === cue.id && prev.round === cue.round)) { await tick(); return; }
    const type = screenOf(cue), g = gameOf(cue);
    if (type === 'practice-vote') {
      const ids = Array.isArray(cue.screen.candidates) ? cue.screen.candidates : show.cast.map((c) => c.id);
      await openVote({ game: 'practice', practice: true, cue: cue.id, prompt: cue.screen.title || cue.title, candidates: ids, labels: null, map: {}, secs: cue.timer || 0 });
    } else if (type === 'vote' && g === 'cv') {
      const room = saved.rooms.cv, g0 = live.games.cv;
      if (g0 && !g0.voting_open && step('cv').action === 'openvote') await run('captain', () => db.captain(room, 'openvote'));
      const noms = live.nominees.slice();
      await run('vote-cv', () => db.control(room, { event_mode: true, game: 'cv', cmd: 'open_vote', nonce: Date.now(), nominees: noms, override: null }));
      const ps = live.players.cv.filter((p) => noms.includes(String(p.id)));
      const m = mapOptions(ps.map((p) => ({ id: p.id, label: p.name })), live.players.cv, show.cast);
      const opened = await openVote({ game: 'cv', room, cue: cue.id, prompt: (cue.screen && cue.screen.title) || 'Who leaves the house?',
        candidates: m.candidates, labels: m.labels, map: m.map, secs: cue.timer || 0 });
      if (opened) { live.nominees = []; changed(); }
    }
    // a cue may start its game (the first game cue: engine "start"), only if that's what the game is waiting for
    if (cue.engine && g && saved.made[g]) {
      const s = step(g), want = String(cue.engine);
      if (s.action === want || (s.extra || []).some((x) => x.action === want)) await engineStep(g, want);
      else log(`cue ${cue.id}: the game is at "${s.where}", so "${want}" wasn't sent`);
    }
    await tick();
  }

  // ---------------------------------------------------------------------------------------------
  // what the windows get
  function snapshot(state, cue, forConsole) {
    if (!show || !saved) return null;
    const v = live.vote && Object.assign({}, live.vote, { map: undefined, room: undefined });
    // the room sees who won Lesser Evil and the MVP; only the console sees the prize pick
    const out = { online: !!db, db: live.db, vote: v, leWinner: saved.leWinner || null, mvp: mvp() };
    if (!forConsole) return out;
    const g = gameOf(cue) || (state && state.started && segOf(cue) >= 4 ? 'cv' : 'le');
    return Object.assign(out, {
      rooms: saved.rooms, made: saved.made, registered: saved.registered, phones: live.phones,
      game: g, step: step(g), phase: live.games[g] && (live.games[g].phase || null),
      players: (live.players[g] || []).map((p) => ({ id: p.id, name: p.name, bot: !!p.is_bot, out: !!p.is_eliminated })),
      nominees: live.nominees, written: live.written,
      prize: saved.leWinner ? { name: saved.leWinner.name, cast_id: saved.leWinner.cast_id, roles: saved.prizeRoles || [],
        pick: (live.prize && live.prize.cast_id === saved.leWinner.cast_id && live.prize.pick) || null,
        sent: !!saved.pickSent, used: !!saved.pickUsed } : null,
    });
  }

  function stop() { clearInterval(timer); timer = null; }

  const voteOpen = () => !!(live.vote && live.vote.state === 'open');

  return { attach, reset, engines, cueChanged, setContext, preflight, engineStep, toggleNominee, closeVote, extendVote, voteOpen, snapshot, stop, pickFor,
    // for the tests
    _live: live, _saved: () => saved, _tick: tick };
}

module.exports = { make, leStep, mapOptions, gameOf, dealFor, LE_ACTIONS, REVEAL_MS };
