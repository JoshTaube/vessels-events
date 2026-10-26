// The Director (main/director.js): what each game state puts on screen, whether it's ready, what GO does, and when
// Auto takes GO. Then the Director inside the night (main/night.js): GO plays the game in a game cue, Manual waits,
// Auto moves on when it's time, Hold stops it, a second GO before the game has moved is ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../main/director.js');
const Night = require('../main/night.js');
const EV = require('../main/ev.js');
const Engine = require('../src/cue-engine.js');

const P = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }, { id: 'p3', name: 'Cleo' }];

test('Lesser Evil: lobby, picks, the podium, a speech, the ballot, the end', () => {
  const lobby = D.lesserEvil({ le: null }, P.map((p) => Object.assign({}, p, { le: { role: 'run', slogan: 'x' } })), null);
  assert.equal(lobby.ready, true); assert.equal(lobby.go.action, 'start'); assert.equal(lobby.manual, true, 'Auto never starts a race');
  const noSlogans = D.lesserEvil({ le: null }, P.map((p) => Object.assign({}, p, { le: { role: 'run' } })), null);
  assert.match(noSlogans.blocked, /3 slogans/);
  const now = 1e12;
  const pick = D.lesserEvil({ le: { phase: 'debates', stage_idx: 0, deadline: now + 20000, stage: { sub: 'pick', candidates: ['p1', 'p2'], picked: { p1: 'x' } } } }, P, null, { now });
  assert.equal(pick.ready, false); assert.match(pick.why, /1 position still to pick/); assert.equal(pick.clock, now + 20000);
  const picked = D.lesserEvil({ le: { phase: 'debates', stage_idx: 0, deadline: now + 20000, stage: { sub: 'pick', candidates: ['p1', 'p2'], picked: { p1: 'x', p2: 'y' } } } }, P, null, { now });
  assert.equal(picked.ready, true); assert.equal(picked.go.label, 'Start the speeches');
  const podium = D.lesserEvil({ le: { phase: 'debates', stage_idx: 0, stage: { sub: 'speech', speakOrder: ['p2', 'p1'], speakIdx: 0, speechPass: 'opening', speech: { started: false } } } }, P, null, { now });
  assert.equal(podium.title, 'Bram at the podium'); assert.equal(podium.go.label, 'Start Bram’s clock');
  const live = D.lesserEvil({ le: { phase: 'debates', stage_idx: 0, stage: { sub: 'speech', speakOrder: ['p2', 'p1'], speakIdx: 0, speechPass: 'opening', speech: { started: true, deadline: now + 30000 } } } }, P, null, { now });
  assert.equal(live.ready, false); assert.equal(live.clock, now + 30000); assert.notEqual(live.key, podium.key, 'starting the clock is a new screen');
  const ballot = D.lesserEvil({ le: { phase: 'debates', stage_idx: 0, stage: { sub: 'ballot', candidates: ['p1', 'p2'] } } }, P, { game: 'le', auto: true, state: 'open', total: 3, closesAt: now + 9000 }, { now });
  assert.equal(ballot.go.action, 'vote-close'); assert.match(ballot.detail, /3 votes in/);
  const end = D.lesserEvil({ le: { phase: 'results', winner: 'p3' } }, P, null);
  assert.equal(end.title, 'The race is over: Cleo wins'); assert.equal(end.go.action, 'cue'); assert.equal(end.end, true);
  assert.deepEqual(end.extra.map((e) => e.label), ['Race again, same cast']);
});

test('Core Vessels: every screen, and the vote needs its suspects', () => {
  const now = 1e12, base = { round_number: 1, night_number: 2 };
  const s = (g, o) => D.vessels(Object.assign({}, base, g), P, (o && o.vote) || null, Object.assign({ now }, o));
  assert.equal(s({ phase: 'lobby' }).go.action, 'start');
  assert.equal(s({ phase: 'roles_assigned' }).go.action, 'begin');
  const intro = s({ phase: 'intro', floor: { playerId: 'p1', ts: 't1' } });
  assert.equal(intro.title, 'Ava introduces themselves'); assert.equal(intro.ready, false);
  assert.equal(s({ phase: 'intro', floor: { playerId: 'p1', ts: 't1', claimed_role: 'Priest' } }).ready, true);
  assert.equal(s({ phase: 'night' }).go.label, 'Open the action window');
  const win = s({ phase: 'night', pending_action_type: 'window', votes: { _winDeadline: now + 5000 } });
  assert.equal(win.clock, now + 5000); assert.equal(win.ready, false); assert.equal(win.go.label, 'End the night');
  assert.equal(s({ phase: 'night', pending_action_type: 'night_done' }).go.label, 'Reveal the dawn');
  assert.equal(s({ phase: 'day' }).go.label, 'Start the testimony');
  assert.equal(s({ phase: 'day', floor: { playerId: 'p2', ts: 't', status: 'armed' } }).title, 'Bram names their suspects');
  const disc = s({ phase: 'day', floor: { status: 'discussion' } });
  assert.equal(disc.go.action, 'vote-open'); assert.match(disc.blocked, /2 or 3 suspects/); assert.equal(disc.manual, true);
  assert.equal(s({ phase: 'day', floor: { status: 'discussion' } }, { nominees: ['p1', 'p2'] }).blocked, null);
  const vote = s({ phase: 'day', voting_open: true }, { vote: { game: 'cv', state: 'open', total: 1, closesAt: now + 1000 } });
  assert.equal(vote.go.action, 'vote-close');
  assert.equal(s({ phase: 'day', voting_open: true, coin_flip: { done: false } }).go.action, 'coincontinue');
  assert.equal(s({ phase: 'day', pending_action_type: 'vote_result', last_elimination: { name: 'Cleo' } }).title, 'The verdict: Cleo is out');
  assert.equal(s({ phase: 'day', final_accusation_target: 'p1' }).go.label, 'Reveal her verdict');
  const over = s({ phase: 'ended', winner: 'demons' });
  assert.equal(over.go.action, 'cue'); assert.deepEqual(over.extra.map((e) => e.action), ['rematch']);
});

test('Auto: read screens hold for their time, clocks run out, players get a beat after they finish, choices stop it', () => {
  const t0 = 1e12, T = D.TIMES;
  assert.equal(D.autoAt(D.vessels({ phase: 'night', night_number: 1 }, P, null, {}), t0, t0, {}), t0 + T.nightfall * 1000);
  assert.equal(D.autoAt({ go: { action: 'next' }, kind: 'speech', clock: t0 + 30000 }, t0, null, {}), t0 + 30000 + T.grace * 1000);
  assert.equal(D.autoAt({ go: { action: 'next' }, kind: 'pick', clock: t0 + 30000, ready: true }, t0, t0 + 5000, {}), t0 + 5000 + T.pickHold * 1000, 'everyone picked: a beat later, before the clock');
  assert.equal(D.autoAt({ go: { action: 'next' }, kind: 'intro', ready: false }, t0, null, {}), t0 + T.introMax * 1000, 'a silent speaker can’t stall the room');
  assert.equal(D.autoAt({ go: { action: 'next' }, kind: 'intro', ready: true }, t0, t0 + 2000, { introHold: 3 }), t0 + 5000, 'the show file’s times win');
  assert.equal(D.autoAt({ go: { action: 'start' }, manual: true }, t0, t0, {}), null);
  assert.equal(D.autoAt({ go: { action: 'vote-open' }, blocked: 'Pick', kind: 'read' }, t0, t0, {}), null);
});

// ---- the Director inside the night --------------------------------------------------------------------------
const SHOW = { id: 'test-night', name: 'T', cast: [{ id: 'ava', name: 'Ava' }, { id: 'bram', name: 'Bram' }, { id: 'cleo', name: 'Cleo' }],
  lesserEvil: { prompts: [] }, director: { times: { nightfall: 0, read: 0 } },
  cues: [{ id: '101', title: 'Doors', screen: { type: 'menu-loop' } }, { id: '501', title: 'Vessels', screen: { type: 'title' } },
    { id: '505', title: 'The game', screen: { type: 'game', game: 'vessels' } }, { id: '601', title: 'Curtain', screen: { type: 'card' } }] };
function setup() {
  const calls = [], games = {}, players = {}, m = {}, host = {};
  const rec = (n, a, r) => { calls.push([n, a]); return Promise.resolve(typeof r === 'function' ? r() : r); };
  const db = { registerShow: () => rec('reg', null, { ok: true }), control: (room, row) => rec('control', Object.assign({ room }, row), [{}]),
    game: (r) => rec('game', r, () => games[r] || null), players: (r) => rec('players', r, () => players[r] || []), castStatus: () => rec('cast', null, { cast: [] }),
    setShow: (id, p) => rec('setShow', p, { ok: true }), captain: (room, a) => rec('captain', { room, a }, null), leBallot: () => rec('leBallot', null, null),
    openVote: (id, v) => rec('openVote', v, { ok: true, id: 7 }), tally: () => rec('tally', null, { counts: {}, total: 0 }), setPrize: () => rec('setPrize', null, { ok: true }),
    // ev_set_host: the reply carries the host's last tap and when their phone last asked
    setHost: (id, st) => rec('setHost', st, () => Object.assign({ ok: true, cmd: null, seen: null, now: Date.now() }, host)),
    addLeBot: (room, name, slogan) => rec('addLeBot', { room, name, slogan }, () => { const p = { id: 'b' + (players[room] || []).length, name, is_bot: true, le: { role: 'run', voter: false, slogan } }; players[room] = (players[room] || []).concat(p); return p; }) };
  const store = { read: (k, f) => (k in m ? JSON.parse(m[k]) : f), write: (k, v) => { m[k] = JSON.stringify(v); } };
  let state = Engine.initial(SHOW, Date.now());
  const n = Night.make({ db, EV, store, manual: true, act: () => {}, onChange: () => {}, runInEngine: () => Promise.resolve('ok') });
  n.attach(SHOW);
  const at = (id) => Object.assign({}, SHOW.cues.find((c) => c.id === id), { round: 1 });
  const go = async (id) => { state = Engine.reduce(SHOW, state, { type: 'jump', cue: id, force: true }, Date.now()).state; await n.cueChanged(null, at(id), state); };
  return { n, calls, games, players, host, at, go, captains: () => calls.filter((c) => c[0] === 'captain').map((c) => c[1].a),
    hosts: () => calls.filter((c) => c[0] === 'setHost').map((c) => c[1]) };
}

test('in a game cue GO plays the game; outside one, or when the game is done, GO moves the cue list', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('501');
  assert.deepEqual(await t.n.directorGo(), { cue: true }, 'a title cue: GO is the cue list’s');
  await t.go('505');
  t.games[room] = { id: room, phase: 'night', night_number: 1, round_number: 1 };
  await t.n._tick();
  assert.equal(t.n.snapshot(null, t.at('505'), true).director.screen.title, 'Night 1 falls');
  const r = await t.n.directorGo();
  assert.equal(r.ok, true); assert.equal(r.flash, 'Open the action window');
  assert.deepEqual(t.captains(), ['continue']);
  assert.match((await t.n.directorGo()).error, /taking that step/, 'a second GO before the game moves is ignored');
  assert.deepEqual(t.captains(), ['continue']);
  t.games[room] = { id: room, phase: 'ended', winner: 'town', round_number: 1 };
  await t.n._tick();
  assert.deepEqual(await t.n.directorGo(), { cue: true }, 'game over: GO moves on to the next cue');
});

test('Manual waits; Auto moves a ready screen on after its time; Hold stops Auto', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('505');
  t.games[room] = { id: room, phase: 'night', night_number: 1, round_number: 1 };
  await t.n._tick(); await t.n._tick();
  assert.deepEqual(t.captains(), [], 'Manual: nothing moves');
  t.n.setDirMode('auto'); t.n.holdDir();
  await t.n._tick();
  assert.deepEqual(t.captains(), [], 'Held: nothing moves');
  t.n.holdDir();
  await t.n._tick();
  assert.deepEqual(t.captains(), ['continue'], 'Auto: "night falls" (0 s in this show) moves on');
  t.games[room] = { id: room, phase: 'day', night_number: 1, round_number: 1, floor: { status: 'discussion' } };
  await t.n._tick(); await t.n._tick();
  assert.deepEqual(t.captains(), ['continue'], 'Auto stops at the suspects');
});

test('Core Vessels’ vote from the Director: GO at the discussion opens it on the console’s suspects', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('505');
  t.players[room] = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }, { id: 'p3', name: 'Cleo' }];
  t.games[room] = { id: room, phase: 'day', night_number: 1, round_number: 1, floor: { status: 'discussion' } };
  await t.n._tick();
  assert.match((await t.n.directorGo()).error, /2 or 3 suspects/);
  t.n.toggleNominee('p1'); t.n.toggleNominee('p3');
  const r = await t.n.directorGo();
  assert.equal(r.ok, true);
  assert.deepEqual(t.captains(), ['openvote'], 'the game’s own day vote opens first');
  const v = t.calls.filter((c) => c[0] === 'openVote').pop()[1];
  assert.deepEqual(v.candidates, ['ava', 'cleo']); assert.equal(v.auto, true); assert.equal(v.secs, 30);
  assert.equal(t.n.engines(t.n._state ? null : { started: true }, t.at('505'), 'http://x')[0].visible, false, 'the vote screen covers the game');
});

test('test bots in the Lesser Evil lobby: seated ready to run, distinct names, lobby only; a bot winning has no prize', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.le;
  t.games[room] = { id: room, phase: 'le', le: null };
  await t.n._tick();
  const lobby = D.lesserEvil(t.games[room], [], null);
  assert.ok(lobby.extra.some((e) => e.action === 'addbot' && e.label === 'Add a bot'), 'the lobby offers it');
  for (let k = 0; k < 3; k++) assert.equal((await t.n.engineStep('le', 'addbot')).ok, true);
  const bots = t.calls.filter((c) => c[0] === 'addLeBot').map((c) => c[1]);
  assert.deepEqual(bots.map((b) => b.name), ['Bot Basil', 'Bot Juniper', 'Bot Rook']);
  assert.ok(bots.every((b) => b.room === room && b.slogan), 'each with a slogan, in the race room');
  const ready = D.lesserEvil(t.games[room], t.players[room], null);
  assert.equal(ready.ready, true, 'three bots make a race that can start'); assert.match(ready.detail, /3 bots/);
  t.games[room] = { id: room, phase: 'le', le: { phase: 'race', stage: null } };
  await t.n._tick();
  assert.match((await t.n.engineStep('le', 'addbot')).error, /bots join in the lobby/);
  t.games[room] = { id: room, phase: 'le', le: { phase: 'results', winner: 'b1' } };
  await t.n._tick();
  const snap = t.n.snapshot(null, t.at('505'), true);
  assert.equal(snap.prize, null); assert.equal(snap.prizeNobody, 'Bot Juniper', 'the console says a bot won: no prize');
});

test('the host’s phone: the cue, the game’s screen, the suspects and the deal; its taps choose suspects, each tap once', async () => {
  const t = setup();
  t.host.cmd = { n: 4, type: 'nominee', id: 'p2' };   // a tap from before this launcher started: not acted on
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('505');
  t.players[room] = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }, { id: 'p3', name: 'Cleo', is_bot: true }];
  t.games[room] = { id: room, phase: 'day', night_number: 1, round_number: 1, floor: { status: 'discussion' } };
  const ends = Date.now() + 30000;
  t.n.setHostCue({ started: true, cue: { id: '505', title: 'The game', say: 'Here we go', segment: 'Vessels' }, next: null, timer: { endsAt: ends }, safety: 'Hold', reconnecting: ['Ava'] });
  t.host.now = Date.now() + 5000;   // the database's clock runs 5 s ahead of this laptop
  t.host.seen = Date.now() - 1000;
  await t.n._tick();
  let st = t.hosts().filter(Boolean).pop();
  assert.equal(st.cue.say, 'Here we go'); assert.equal(st.safety, 'Hold'); assert.deepEqual(st.reconnecting, ['Ava']);
  assert.equal(st.game.name, 'Vessels'); assert.match(st.game.title, /discussion/); assert.equal(st.game.blocked, true);
  assert.deepEqual(st.suspects.map((s) => [s.id, s.on, s.bot]), [['p1', false, false], ['p2', false, false], ['p3', false, true]], 'the old tap was not acted on');
  assert.deepEqual(st.roles, ['host-demon', 'priest', 'nun', 'townsfolk']);
  await t.n._tick();
  st = t.hosts().filter(Boolean).pop();
  assert.ok(Math.abs(st.timer.endsAt - (ends + 5000)) < 200, 'times go out in the database’s clock');
  assert.equal(t.n.snapshot(null, t.at('505'), true).host.live, true, 'the console sees the host’s phone');
  await t.n._tick();
  assert.equal(t.hosts().pop(), null, 'nothing changed: only asks for taps');

  t.host.cmd = { n: 5, type: 'nominee', id: 'p1' };
  await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, ['p1']);
  await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, ['p1'], 'the same tap twice counts once');
  st = t.hosts().filter(Boolean).pop();
  assert.equal(st.suspects.find((s) => s.id === 'p1').on, true, 'the phone sees its tap land');
  t.host.cmd = { n: 6, type: 'nominee', id: 'p3' }; await t.n._tick();
  t.host.cmd = { n: 7, type: 'nominee', id: 'p1' }; await t.n._tick();
  t.host.cmd = { n: 8, type: 'nominee', id: 'zz' }; await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, ['p3'], 'a second tap drops them; someone not alive is ignored');
  t.host.cmd = { n: 9, type: 'nominee', id: 'p2' }; await t.n._tick();
  assert.equal((await t.n.directorGo()).ok, true, 'two suspects from the host: GO opens the vote');

  t.games[room] = { id: room, phase: 'night', night_number: 2, round_number: 2 };
  await t.n._tick();
  t.host.cmd = { n: 10, type: 'nominee', id: 'p1' }; await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, [], 'no suspects outside the discussion');
  assert.equal(t.hosts().filter(Boolean).pop().suspects, null);
});

test('the host’s phone: two quick taps between the launcher’s reads both land; a tap says on or off', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('505');
  t.players[room] = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }, { id: 'p3', name: 'Cleo' }];
  t.games[room] = { id: room, phase: 'day', night_number: 1, round_number: 1, floor: { status: 'discussion' } };
  await t.n._tick();   // the first reply: no taps yet
  t.host.cmd = { n: 2, at: 0, list: [{ n: 1, type: 'nominee', id: 'p1', on: true }, { n: 2, type: 'nominee', id: 'p3', on: true }] };
  await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, ['p1', 'p3']);
  t.n.toggleNominee('p3');   // the operator drops Cleo on the console...
  t.host.cmd = { n: 3, at: 0, list: t.host.cmd.list.concat({ n: 3, type: 'nominee', id: 'p1', on: true }) };
  await t.n._tick();   // ...and a tap from a screen a moment behind still says "Ava on": nothing flips
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, ['p1']);
  t.host.cmd = { n: 4, at: 0, list: t.host.cmd.list.concat({ n: 4, type: 'nominee', id: 'p1', on: false }) };
  await t.n._tick();
  assert.deepEqual(t.n.snapshot(null, t.at('505'), true).nominees, []);
});
