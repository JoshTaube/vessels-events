// The night (main/night.js) against a fake event database: rooms are created once and joined after, the cast
// phones follow the show into a room only once it exists, Core Vessels' vote needs its shortlist, votes hand their
// counts to the games as the hand-count override, and Lesser Evil's own ballots are mirrored to /vote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Night = require('../main/night.js');
const EV = require('../main/ev.js');
const Engine = require('../src/cue-engine.js');

const CAST = [{ id: 'ava', name: 'Ava' }, { id: 'bram', name: 'Bram' }, { id: 'cleo', name: 'Cleo' }];
const SHOW = {
  id: 'test-night', name: 'Test', cast: CAST, lesserEvil: { prompts: [], voteSecs: 20 },
  cues: [
    { id: '101', title: 'Doors', screen: { type: 'menu-loop' } },
    { id: '230', title: 'Practice', timer: 30, screen: { type: 'practice-vote', title: 'Who goes first?' } },
    { id: '310', title: 'The race', engine: 'start', screen: { type: 'game', game: 'lesser-evil' } },
    { id: '401', title: 'Intermission', screen: { type: 'intermission' } },
    { id: '510', title: 'Vessels', screen: { type: 'game', game: 'vessels' } },
    { id: '560', title: 'Audience votes', timer: 30, screen: { type: 'vote', title: 'Who leaves the house?' } },
    { id: '570', title: 'Verdict', screen: { type: 'game', game: 'vessels' } },
    { id: '620', title: 'Take it home', screen: { type: 'download' } },
  ],
};

// a fake database: games and players per room, a scripted le_ballot, and a log of every call
function fakeDb() {
  const d = { calls: [], games: {}, players: {}, ballot: null, votes: [], counts: {}, cast: [], prize: null };
  const rec = (name, args, ret) => { d.calls.push([name, args]); return Promise.resolve(typeof ret === 'function' ? ret() : ret); };
  Object.assign(d, {
    registerShow: (show, rooms) => rec('registerShow', { show: show.id, rooms }, { ok: true }),
    control: (room, row) => rec('control', Object.assign({ room }, row), [{}]),
    game: (room) => rec('game', room, () => d.games[room] || null),
    players: (room) => rec('players', room, () => d.players[room] || []),
    castStatus: () => rec('castStatus', null, () => ({ now: Date.now(), cast: d.cast, prize: d.prize })),
    // ev_set_prize: keeps the winner's pick unless the patch carries one (the operator's)
    setPrize: (id, p) => rec('setPrize', p, () => {
      if (!p) { d.prize = null; return { ok: true, prize: null }; }
      d.prize = Object.assign({}, p, 'pick' in p ? {} : { pick: d.prize && d.prize.cast_id === p.cast_id ? d.prize.pick : null });
      return { ok: true, prize: d.prize };
    }),
    setShow: (id, patch) => rec('setShow', patch, { ok: true }),
    captain: (room, a) => rec('captain', { room, a }, null),
    openVote: (id, v) => rec('openVote', v, () => { d.votes.push(v); return { ok: true, id: d.votes.length }; }),
    tally: (id) => rec('tally', id, () => ({ counts: d.counts, total: Object.values(d.counts).reduce((a, b) => a + b, 0) })),
    closeVote: (id) => rec('closeVote', id, () => {
      const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
      const top = Math.max(0, ...Object.values(d.counts));
      const lead = Object.keys(d.counts).filter((k) => d.counts[k] === top && top > 0);
      return { ok: true, result: { counts: d.counts, total, winner: lead.length === 1 ? lead[0] : null, tied: lead.length > 1 } };
    }),
    extendVote: (id, s) => rec('extendVote', { id, s }, { ok: true }),
    leBallot: () => rec('leBallot', null, () => d.ballot),
  });
  d.named = (n) => d.calls.filter((c) => c[0] === n).map((c) => c[1]);
  return d;
}
function memStore() { const m = {}; return { read: (k, f) => (k in m ? JSON.parse(m[k]) : f), write: (k, v) => { m[k] = JSON.stringify(v); }, m }; }

function setup(opts) {
  const db = fakeDb(), store = (opts && opts.store) || memStore();
  let state = Engine.initial(SHOW, Date.now());
  const ran = [];
  const n = Night.make({ db, EV, store, manual: true, act: (a) => { const r = Engine.reduce(SHOW, state, a, Date.now()); if (!r.error) state = r.state; },
    onChange: () => {}, runInEngine: (g, js) => { ran.push([g, js]); return Promise.resolve('ok'); } });
  n.attach(SHOW);
  const at = (id) => Object.assign({}, SHOW.cues.find((c) => c.id === id), { round: 1 });
  const go = async (id) => { const before = state.started ? at(SHOW.cues[state.i].id) : null; state = Engine.reduce(SHOW, state, { type: 'jump', cue: id, force: true }, Date.now()).state; await n.cueChanged(before, at(id), state); };
  return { n, db, store, ran, at, go, get state() { return state; } };
}

test('a fresh night registers its two rooms in event mode, then looks them up before any TV loads', async () => {
  const t = setup();
  assert.deepEqual(t.n.engines(t.state, null, 'http://127.0.0.1:1'), [], 'no TV before the rooms are known');
  await t.n._tick();
  const reg = t.db.named('registerShow')[0];
  assert.match(reg.rooms.le, /^V-[A-Z2-9]{5}$/); assert.match(reg.rooms.cv, /^V-[A-Z2-9]{5}$/);
  assert.deepEqual(t.db.named('control').map((c) => [c.room, c.event_mode, c.game]), [[reg.rooms.le, true, 'le'], [reg.rooms.cv, true, 'cv']]);
  await t.n._tick();
  const e = t.n.engines(t.state, null, 'http://127.0.0.1:1');
  assert.equal(e.length, 1);
  assert.equal(e[0].url, `http://127.0.0.1:1/lesser-evil-tv.html?code=${reg.rooms.le}`, 'before the show: the Lesser Evil TV, creating its room');
  assert.equal(e[0].visible, false);
});

test('a room that exists is joined, never created again (a restart must not wipe its players)', async () => {
  const store = memStore();
  const t1 = setup({ store });
  await t1.n._tick(); await t1.n._tick();
  const rooms = t1.n._saved().rooms;
  const t2 = setup({ store });
  t2.db.games[rooms.le] = { id: rooms.le, phase: 'le', le: null };
  t2.n._saved().registered = true;
  await t2.n._tick();
  assert.equal(t2.n._saved().rooms.le, rooms.le, 'same rooms after a restart');
  assert.equal(t2.n.engines(t2.state, null, 'http://x').find((e) => e.game === 'le').url, `http://x/lesser-evil-tv.html?game=${rooms.le}`);
});

test('the cast phones follow the show into a room only once it exists, and /vote flips to download at the end', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const rooms = t.n._saved().rooms;
  await t.go('310');
  assert.deepEqual(t.db.named('setShow').pop(), { live_game: null, live_room: null, stage: 'waiting' }, 'no room yet: phones wait');
  t.db.games[rooms.le] = { id: rooms.le, phase: 'le', le: null };
  await t.n._tick();
  assert.deepEqual(t.db.named('setShow').pop(), { live_game: 'le', live_room: rooms.le, stage: 'waiting' });
  assert.equal(t.n.engines(t.state, t.at('310'), 'http://x')[0].visible, true, 'the game cue uncovers the TV');
  await t.go('401');
  assert.equal(t.n.engines(t.state, t.at('401'), 'http://x')[0].game, 'cv', 'intermission: the Vessels TV takes over');
  t.db.games[rooms.cv] = { id: rooms.cv, phase: 'lobby' };
  await t.n._tick();
  assert.deepEqual(t.db.named('setShow').pop(), { live_game: 'cv', live_room: rooms.cv, stage: 'waiting' });
  await t.go('620');
  assert.equal(t.db.named('setShow').pop().stage, 'download');
});

test('the first game cue starts the race only when the game is waiting for it', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  t.db.games[t.n._saved().rooms.le] = { id: 'x', phase: 'le', le: null };
  await t.n._tick();
  await t.go('310');
  assert.equal(t.ran.length, 1);
  assert.match(t.ran[0][1], /leIntroStart/);
  t.ran.length = 0;
  t.db.games[t.n._saved().rooms.le].le = { phase: 'race', stage: { type: 'round', sub: 'speech' } };
  await t.n._tick();
  await t.go('101'); await t.go('310');
  assert.equal(t.ran.length, 0, 'mid-race, the start cue sends nothing');
});

test('practice vote: all the cast, flagged practice, closed by leaving its cue, never handed to a game', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  await t.go('230');
  const v = t.db.named('openVote')[0];
  assert.deepEqual(v.candidates, ['ava', 'bram', 'cleo']);
  assert.equal(v.practice, true); assert.equal(v.secs, 30);
  t.db.counts = { bram: 3, ava: 1 };
  await t.go('310');
  assert.equal(t.db.named('closeVote').length, 1);
  assert.equal(t.db.named('control').filter((c) => c.cmd === 'close_vote').length, 0);
  assert.equal(t.n._live.vote.result.winner, 'bram');
});

test('Core Vessels: GO into the vote needs 2 or 3 suspects and the game at its vote; the counts go back by player id', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('510');
  t.db.games[room] = { id: room, phase: 'day', night_number: 1, voting_open: false, floor: { status: 'discussion' } };
  t.db.players[room] = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }, { id: 'p3', name: 'Cleo' }, { id: 'b1', name: 'Bot Bob', is_bot: true }];
  await t.n._tick();
  assert.match(t.n.preflight(t.at('560')), /Pick at least 2 suspects/);
  t.n.toggleNominee('p1'); t.n.toggleNominee('b1');
  assert.equal(t.n.preflight(t.at('560')), null);
  await t.go('560');
  assert.deepEqual(t.db.named('captain').pop(), { room, a: 'openvote' }, 'opens the game’s own vote first');
  const ctl = t.db.named('control').find((c) => c.cmd === 'open_vote');
  assert.deepEqual(ctl.nominees, ['p1', 'b1']);
  const v = t.db.named('openVote').pop();
  assert.deepEqual(v.candidates, ['ava', 'o-b1'], 'a cast member by cast id; a bot by its own id');
  assert.deepEqual(v.labels, { 'o-b1': 'Bot Bob' });
  t.db.counts = { ava: 7, 'o-b1': 2 };
  await t.n.closeVote('operator');
  const close = t.db.named('control').find((c) => c.cmd === 'close_vote');
  assert.deepEqual(close.override, { p1: 7, b1: 2 }, 'the game gets its own player ids');
  assert.equal(close.room, room);
  assert.deepEqual(t.n._live.nominees, [], 'the shortlist clears for the next day');
});

test('Lesser Evil: a ballot the game opens is mirrored to /vote; closing hands the counts back; the command is cleared after', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.le;
  t.db.games[room] = { id: room, phase: 'le', le: { phase: 'race', stage: { type: 'round', sub: 'ballot' } } };
  t.db.players[room] = [{ id: 'u1', name: 'Ava' }, { id: 'u2', name: 'cleo' }];
  await t.go('310');
  t.db.ballot = { seq: 1003, open: true, kind: 'vote', pick: 1, prompt: 'Who made the best case?', options: [{ id: 'u1', label: 'Ava' }, { id: 'u2', label: 'cleo' }] };
  await t.n._tick();
  const reset = t.db.named('control').find((c) => c.cmd === 'open_vote');
  assert.equal(reset.room, room); assert.equal(reset.override, null);
  const v = t.db.named('openVote').pop();
  assert.equal(v.game, 'le'); assert.deepEqual(v.candidates, ['ava', 'cleo']); assert.equal(v.secs, 20); assert.equal(v.labels, null);
  assert.equal(t.n._live.vote.auto, true);
  assert.equal(t.n.engines(t.state, t.at('310'), 'http://x')[0].visible, false, 'the vote takes the projector while it’s open');
  await t.n._tick();
  assert.equal(t.db.named('openVote').length, 1, 'the same ballot is mirrored once');
  // N during an open Lesser Evil vote closes it
  t.db.counts = { cleo: 4, ava: 4 };
  const r = await t.n.engineStep('le');
  assert.equal(r.ok, true);
  assert.deepEqual(t.db.named('control').find((c) => c.cmd === 'close_vote').override, { u1: 4, u2: 4 });
  assert.equal(t.n._live.vote.result.tied, true);
  t.db.ballot = Object.assign({}, t.db.ballot, { open: false, result: { counts: { u1: 4, u2: 4 } } });
  await t.n._tick();
  assert.ok(t.db.named('control').some((c) => c.cmd === 'idle' && c.override === null), 'the close is cleared once the game took it');
});

test('Lesser Evil sudden death: FOR and AGAINST go to /vote with their words', () => {
  const m = Night.mapOptions([{ id: 'for', label: 'FOR: Cereal is soup' }, { id: 'against', label: 'AGAINST: Cereal is soup' }], [], CAST);
  assert.deepEqual(m.candidates, ['o-for', 'o-against']);
  assert.deepEqual(m.labels, { 'o-for': 'FOR: Cereal is soup', 'o-against': 'AGAINST: Cereal is soup' });
  assert.deepEqual(m.map, { 'o-for': 'for', 'o-against': 'against' });
});

test('N steps Core Vessels through captain_action, and refuses while the screen hasn’t taken the last one', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const room = t.n._saved().rooms.cv;
  await t.go('510');
  t.db.games[room] = { id: room, phase: 'lobby' };
  t.db.players[room] = [{ id: 'p1', name: 'Ava' }];
  await t.n._tick();
  assert.equal(t.n.snapshot(t.state, t.at('510'), true).step.action, 'start');
  assert.equal((await t.n.engineStep('cv')).ok, true);
  assert.deepEqual(t.db.named('captain').pop(), { room, a: 'start' });
  t.db.games[room] = { id: room, phase: 'lobby', captain_action: 'start' };
  await t.n._tick();
  assert.match((await t.n.engineStep('cv')).error, /Waiting for the screen/);
});

test('phones: the database’s check-ins light the board and the cast lock', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  t.db.cast = CAST.map((c) => ({ id: c.id, checked_in_at: c.id === 'cleo' ? null : new Date().toISOString(), last_seen: new Date().toISOString() }));
  await t.n._tick();
  assert.deepEqual(t.state.phones, { ava: true, bram: true });
  assert.equal(t.state.gates.cast, false);
  t.db.cast[2].checked_in_at = new Date().toISOString();
  await t.n._tick();
  assert.equal(t.state.gates.cast, true);
});

test('S6 sends a numbered redo once per press', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const st = Object.assign({}, t.state, { redoNames: { at: Date.now() + 5, who: 'bram' } });
  t.n.setContext(st, null);
  await t.n._tick(); await t.n._tick();
  const redos = t.db.named('setShow').filter((p) => p.redo);
  assert.deepEqual(redos, [{ redo: { n: 1, who: 'bram' } }]);
});

test('leStep says where the race is and what N does', () => {
  assert.equal(Night.leStep(null).where, 'No Lesser Evil room yet');
  assert.equal(Night.leStep({ le: null }, [{ id: 'a', name: 'A' }]).action, 'start');
  assert.equal(Night.leStep({ le: { phase: 'race', stage: null } }).action, 'next');
  assert.equal(Night.leStep({ le: { phase: 'race', stage: { type: 'round', sub: 'ballot' } } }, [], true).action, 'close-vote');
  assert.match(Night.leStep({ le: { phase: 'race', stage_idx: 1, stage: { type: 'round', sub: 'speech', holder: 'a' } } }, [{ id: 'a', name: 'Ava' }]).where, /Round 2: Ava has the floor/);
});

test('the prize: Lesser Evil crowns its winner, their phone gets this deal, the pick reaches the first Vessels deal only', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const { le, cv } = t.n._saved().rooms;
  await t.go('310');
  t.db.players[le] = [{ id: 'u1', name: 'Ava' }, { id: 'u2', name: 'Bram' }];
  t.db.games[le] = { id: le, phase: 'le', le: { phase: 'results', winner: 'u2' } };
  await t.n._tick(); await t.n._tick();
  const offer = t.db.named('setPrize').pop();
  assert.deepEqual(offer, { cast_id: 'bram', name: 'Bram', roles: ['host-demon', 'priest', 'nun', 'townsfolk'] }, 'a table of six: the core trio and townsfolk');
  // the Vessels room opens; the first deal waits for the pick
  await t.go('401');
  t.db.games[cv] = { id: cv, phase: 'lobby' };
  t.db.players[cv] = [{ id: 'p1', name: 'Ava' }, { id: 'p2', name: 'Bram' }];
  await t.n._tick();
  const deal = { id: '505', title: 'Roles', engine: 'start', screen: { type: 'game', game: 'vessels' } };
  assert.match(t.n.preflight(deal), /Bram hasn’t picked their role yet/);
  assert.match((await t.n.engineStep('cv', 'start')).error, /hasn’t picked/);
  // Bram locks in the Demon on their phone
  t.db.prize = Object.assign({}, t.db.prize, { pick: { role: 'host-demon', at: Date.now() } });
  await t.n._tick(); await t.n._tick();
  assert.deepEqual(t.db.named('control').find((c) => c.role_pick), { room: cv, role_pick: { name: 'Bram', role: 'host-demon' } });
  assert.match(t.n.preflight(deal), /One moment/, 'a beat for the game to read it');
  t.n._saved().pickSent.at -= 5000;
  assert.equal(t.n.preflight(deal), null);
  assert.equal(t.n.snapshot(t.state, t.at('401'), true).prize.pick.role, 'host-demon');
  assert.equal(t.n.snapshot(t.state, t.at('401'), false).prize, undefined, 'the projector never gets the pick');
  // dealt: the pick is taken back, so a replay deals at random
  t.db.games[cv] = { id: cv, phase: 'roles_assigned' };
  await t.n._tick(); await t.n._tick();
  assert.ok(t.db.named('control').some((c) => c.role_pick === null), 'cleared after the first deal');
  assert.equal(t.n._saved().pickUsed, true);
  assert.equal(t.n.preflight(deal), null);
});

test('the operator can pick for the winner (a dead phone), only from tonight’s deal', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const { le } = t.n._saved().rooms;
  await t.go('310');
  t.db.players[le] = [{ id: 'u1', name: 'Ava' }];
  t.db.games[le] = { id: le, phase: 'le', le: { phase: 'complete', winner: 'u1' } };
  await t.n._tick(); await t.n._tick();
  assert.match((await t.n.pickFor('hunter')).error, /isn’t in tonight’s deal/);
  assert.equal((await t.n.pickFor('priest')).ok, true);
  assert.equal(t.db.prize.pick.role, 'priest');
  assert.equal(t.db.prize.pick.by, 'operator');
  assert.equal((await t.n.pickFor(null)).ok, true);
  assert.equal(t.db.prize.pick, null, 'and can hand the choice back');
});

test('MVP: the best skill total across the night’s Vessels games (Played and Team won don’t count); a tie is co-MVPs', async () => {
  const t = setup();
  await t.n._tick(); await t.n._tick();
  const { cv } = t.n._saved().rooms;
  await t.go('510');
  const line = (label, pts) => ({ label, pts });
  t.db.games[cv] = { id: cv, phase: 'ended', winner: 'town', score_log: [
    { pid: 'p1', name: 'Ava', total: 45, items: [line('Played', 10), line('Team won', 20), line('Read the Demon', 15)] },
    { pid: 'p2', name: 'Bram', total: 30, items: [line('Played', 10), line('Shielded a target', 20)] },
  ] };
  await t.n._tick();
  let m = t.n.snapshot(t.state, t.at('510'), false).mvp;
  assert.deepEqual(m.players.map((x) => [x.name, x.cast_id, x.skill]), [['Bram', 'bram', 20]]);
  assert.deepEqual(m.players[0].lines, [{ label: 'Shielded a target', pts: 20 }]);
  // a replay: the game wipes score_log; the night keeps adding
  t.db.games[cv] = { id: cv, phase: 'ended', winner: 'demons', score_log: [
    { pid: 'p1', name: 'Ava', total: 15, items: [line('Played', 10), line('Evaded the vote', 5)] },
    { pid: 'p2', name: 'Bram', total: 10, items: [line('Played', 10)] },
  ] };
  await t.n._tick(); await t.n._tick();
  m = t.n.snapshot(t.state, t.at('510'), false).mvp;
  assert.equal(m.games, 2);
  assert.deepEqual(m.players.map((x) => [x.name, x.skill]).sort(), [['Ava', 20], ['Bram', 20]], 'co-MVPs');
});

test('the prize menu follows the table size, with no Scholar at events (the cast doesn’t vote)', () => {
  assert.deepEqual(Night.dealFor(6), ['host-demon', 'priest', 'nun', 'townsfolk']);
  assert.deepEqual(Night.dealFor(10), ['host-demon', 'priest', 'nun', 'anointed', 'townsfolk']);
  assert.deepEqual(Night.dealFor(12), ['host-demon', 'priest', 'nun', 'anointed', 'hunter', 'townsfolk']);
  assert.ok(!Night.dealFor(12).includes('sage'));
});
