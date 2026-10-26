import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/cue-engine.js');

const cast = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + (i + 1), name: 'Cast ' + (i + 1) }));
// a small night: preshow, a locked welcome, three Lesser Evil rounds (one per prompt), Vessels nights until the
// operator calls it, a replay of the game, the finale
const SHOW = {
  cast,
  lesserEvil: { prompts: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
  cues: [
    { id: '101', title: 'Doors' },
    { id: '201', title: 'Welcome', lock: 'cast' },
    { id: '310', title: 'LE round' },
    { id: '320', title: 'LE vote' },
    { id: '330', title: 'LE result', loopTo: '310', loopTimes: 'prompts' },
    { id: '401', title: 'Intermission', timer: 900 },
    { id: '505', title: 'Roles dealt' },
    { id: '520', title: 'Night' },
    { id: '540', title: 'Day vote', loopTo: '520' },
    { id: '570', title: 'Game over', loopTo: '505', loopTimes: 0, replay: true, loopLabel: 'Play again' },
    { id: '610', title: 'MVP' },
  ],
};
let now = 1000;
const step = (s, a) => { now += 1000; const r = E.reduce(SHOW, s, a, now); return r; };
const go = (s) => { const r = step(s, { type: 'go' }); assert.equal(r.error, undefined, r.error); return r.state; };
const cur = (s) => SHOW.cues[s.i].id;
const checkInAll = (s) => cast.reduce((st, p) => step(st, { type: 'checkin', id: p.id }).state, s);

test('GO runs the cues in order; the first GO starts the show on the first cue', () => {
  let s = E.initial(SHOW, now);
  assert.equal(E.view(SHOW, s, now).current, null, 'standing by');
  s = go(s); assert.equal(cur(s), '101');
  assert.equal(E.view(SHOW, s, now).next.id, '201');
});

test('a second GO within the lockout is ignored', () => {
  let s = go(E.initial(SHOW, now));
  const r = E.reduce(SHOW, s, { type: 'go' }, now + 100);
  assert.match(r.error, /twice/);
  assert.equal(cur(r.state), '101');
});

test('the welcome stays locked until all 12 cast are checked in', () => {
  let s = go(E.initial(SHOW, now));
  const r = step(s, { type: 'go' });
  assert.match(r.error, /Locked until all 12 cast are checked in \(0 so far\)/);
  s = step(s, { type: 'checkin', id: 'p1' }).state;
  assert.match(E.view(SHOW, s, now).next.lock, /\(1 so far\)/);
  s = checkInAll(step(s, { type: 'checkin', id: 'p1' }).state);   // p1 off again, then everyone on
  assert.equal(s.gates.cast, true);
  s = go(s); assert.equal(cur(s), '201');
});

test('Lesser Evil loops once per prompt, then moves on; rounds count up', () => {
  let s = go(checkInAll(go(E.initial(SHOW, now))));   // 101 -> 201
  const seen = [];
  for (let k = 0; k < 9; k++) { s = go(s); seen.push(cur(s) + ':' + E.view(SHOW, s, now).current.round); }
  assert.deepEqual(seen, ['310:1', '320:1', '330:1', '310:2', '320:2', '330:2', '310:3', '320:3', '330:3']);
  assert.equal(E.view(SHOW, s, now).next.id, '401', 'after the last prompt GO leaves the loop');
  s = go(s); assert.equal(cur(s), '401');
  assert.equal(s.timer.secs, 900);
});

test('Vessels nights repeat until the operator arms the exit; a replay starts the rounds again', () => {
  let s = E.reduce(SHOW, E.initial(SHOW, now), { type: 'jump', cue: '505', force: true }, now).state;
  s = go(s); s = go(s);                     // 520, 540
  s = go(s); assert.equal(cur(s), '520');   // loops by default
  assert.equal(E.view(SHOW, s, now).current.round, 2);
  s = go(s);                                // 540, night 2
  const b = E.view(SHOW, s, now).branch;
  assert.equal(b.auto, 'loop'); assert.equal(b.exit.cue, '570');
  s = step(s, { type: 'arm', way: 'exit' }).state;
  assert.equal(E.view(SHOW, s, now).next.id, '570');
  s = go(s); assert.equal(cur(s), '570');
  assert.equal(s.arm, null, 'the arm is used up');
  // game over: by default the show moves on to the finale; arming loop replays the game with the same cast
  assert.equal(E.view(SHOW, s, now).next.id, '610');
  s = step(s, { type: 'arm', way: 'loop' }).state;
  s = go(s); assert.equal(cur(s), '505'); assert.equal(s.games, 2);
  s = go(s); assert.equal(E.view(SHOW, s, now).current.round, 1, 'the new game starts at night 1');
});

test('safety cues never move the show; GO waits while a full-screen one is up', () => {
  let s = go(E.initial(SHOW, now));
  s = step(s, { type: 'safety', id: 'S1' }).state;
  assert.equal(s.safety.full, 'S1');
  assert.match(step(s, { type: 'go' }).error, /Clear S1/);
  s = step(s, { type: 'safety', id: 'S2' }).state; assert.equal(s.safety.full, 'S2', 'another full card replaces it');
  s = step(s, { type: 'safety', id: 'S2' }).state; assert.equal(s.safety.full, null, 'the same key again clears it');
  s = step(s, { type: 'safety', id: 'S4', name: 'Cast 3' }).state;
  s = step(s, { type: 'safety', id: 'S4', name: 'Cast 7' }).state;
  assert.deepEqual(s.safety.reconnecting, ['Cast 3', 'Cast 7']);
  assert.match(step(s, { type: 'safety', id: 'S4' }).error, /Pick who/);
  s = step(s, { type: 'clear' }).state;
  assert.deepEqual(s.safety, { full: null, reconnecting: [] });
  assert.equal(cur(s), '101', 'still on the same cue');
});

test('S5 adds 30 s to a running timer and refuses when nothing is timing; S6 records a name-entry redo', () => {
  let s = E.reduce(SHOW, E.initial(SHOW, now), { type: 'jump', cue: '401', force: true }, now).state;
  s = step(s, { type: 'safety', id: 'S5' }).state;
  assert.equal(s.timer.secs, 930);
  s = go(s);
  assert.match(step(s, { type: 'safety', id: 'S5' }).error, /Nothing is timing/);
  s = step(s, { type: 'safety', id: 'S6', who: 'p4' }).state;
  assert.equal(s.redoNames.who, 'p4');
});

test('back and jump; a locked cue needs force to jump to', () => {
  let s = go(E.initial(SHOW, now));
  assert.match(step(s, { type: 'jump', cue: '201' }).error, /Locked/);
  s = step(s, { type: 'jump', cue: '320', force: true }).state; assert.equal(cur(s), '320');
  s = step(s, { type: 'back' }).state; assert.equal(cur(s), '310');
  assert.match(step(s, { type: 'jump', cue: '999' }).error, /No cue/);
});

test('the reducer never changes the state it was given', () => {
  const s0 = go(E.initial(SHOW, now)), copy = JSON.stringify(s0);
  step(s0, { type: 'safety', id: 'S1' }); step(s0, { type: 'checkin', id: 'p2' }); step(s0, { type: 'go' });
  assert.equal(JSON.stringify(s0), copy);
});

test('Q turns the corner QR off and on; a state saved before there was one counts as on', () => {
  let s = E.initial(SHOW, now);
  assert.equal(s.qr, true);
  s = step(s, { type: 'qr' }).state; assert.equal(s.qr, false);
  s = step(s, { type: 'qr' }).state; assert.equal(s.qr, true);
  s = step(s, { type: 'qr', on: false }).state; assert.equal(s.qr, false);
  const old = E.initial(SHOW, now); delete old.qr;
  assert.equal(step(old, { type: 'qr' }).state.qr, false, 'an old save toggles from on to off');
});
