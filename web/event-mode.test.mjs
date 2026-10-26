// Event mode's decision rules, kept apart from the surfaces that obey them.
//
// The whole mode is one inversion - stage players stop voting and the audience
// starts - and these are the predicates that carry it. They are pure so the
// inversion can be proved without a room, twelve phones, and a projector.
import test from 'node:test';
import assert from 'node:assert';
import './event-mode.js';

const VLE = globalThis.VLE;

// ---- Who votes -----------------------------------------------------------

test('a stage player cannot vote in event mode', () => {
  assert.strictEqual(VLE.playerMayVote({ eventMode: true }), false);
});

test('a normal room is completely unaffected', () => {
  // The entire point of the build separation: nothing here may change how the
  // games behave outside event mode.
  assert.strictEqual(VLE.playerMayVote({ eventMode: false }), true);
  assert.strictEqual(VLE.playerMayVote({}), true);
});

// ---- What a stage phone shows -------------------------------------------

test('a player phone holds dark while the audience decides', () => {
  const s = VLE.playerScreen({ eventMode: true, audienceWindowOpen: true });
  assert.strictEqual(s.mode, 'hold');
  assert.strictEqual(s.showTally, false);
  assert.strictEqual(s.showTimer, false);
  assert.strictEqual(s.acceptsInput, false);
});

test('the hold screen still lets a player re-check their own role', () => {
  // Deliberate tap, not on-screen by default: they should be looking up.
  assert.strictEqual(VLE.playerScreen({ eventMode: true, audienceWindowOpen: true }).roleReachable, true);
});

test('the hold screen never carries anything about the vote in progress', () => {
  const s = VLE.playerScreen({ eventMode: true, audienceWindowOpen: true, counts: { maya: 9 } });
  assert.strictEqual(s.counts, undefined);
});

test('outside an audience window a player phone behaves normally', () => {
  assert.strictEqual(VLE.playerScreen({ eventMode: true, audienceWindowOpen: false }).mode, 'normal');
});

// ---- When a Lesser Evil ballot may close ---------------------------------
// LE today closes a ballot on a 30s deadline OR when every eligible player is
// in. In event mode zero players are eligible, so that second condition fires
// INSTANTLY and the crowd never gets to vote. Both have to go: the narrator is
// the only clock, by design.

test('an LE ballot does not close just because no player voted', () => {
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: true, allPlayersIn: true, deadlinePassed: false, narratorClosed: false }),
    false
  );
});

test('an LE ballot does not close on the 30s deadline in event mode', () => {
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: true, allPlayersIn: true, deadlinePassed: true, narratorClosed: false }),
    false
  );
});

test('only the narrator closes an LE ballot in event mode', () => {
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: true, allPlayersIn: false, deadlinePassed: false, narratorClosed: true }),
    true
  );
});

test('outside event mode the existing close rule is untouched', () => {
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: false, allPlayersIn: true, deadlinePassed: false, narratorClosed: false }),
    true
  );
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: false, allPlayersIn: false, deadlinePassed: true, narratorClosed: false }),
    true
  );
  assert.strictEqual(
    VLE.ballotShouldClose({ eventMode: false, allPlayersIn: false, deadlinePassed: false, narratorClosed: false }),
    false
  );
});

// ---- Nomination ----------------------------------------------------------

test('the narrator may send two or three suspects to the crowd', () => {
  assert.strictEqual(VLE.nominationValid(['a', 'b'], ['a', 'b', 'c', 'd']).ok, true);
  assert.strictEqual(VLE.nominationValid(['a', 'b', 'c'], ['a', 'b', 'c', 'd']).ok, true);
});

test('one suspect is not a vote and four is not a shortlist', () => {
  assert.strictEqual(VLE.nominationValid(['a'], ['a', 'b', 'c', 'd']).ok, false);
  assert.strictEqual(VLE.nominationValid(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']).ok, false);
});

test('an eliminated player cannot be nominated', () => {
  // The roster the narrator taps is live, but a phone can lag a beat behind an
  // elimination and the narrator is working in the dark.
  const r = VLE.nominationValid(['a', 'gone'], ['a', 'b', 'c']);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /gone/);
});

test('the same suspect twice is not two suspects', () => {
  assert.strictEqual(VLE.nominationValid(['a', 'a'], ['a', 'b', 'c']).ok, false);
});

// ---- What the host's next step is ---------------------------------------
// The narrator page drives the game through games.captain_action, the same
// column the captain's phone writes. hostStep maps a games row to the one
// button that makes sense right now, so the operator never has to know the
// phase names. Owner 2026-09-02: timers fully off, so every hold has a button.
const P = (n, o) => Object.assign({ id: 'p' + n, name: 'P' + n, is_bot: false, is_eliminated: false }, o || {});
const six = [1, 2, 3, 4, 5, 6].map((n) => P(n));

test('hostStep: no room yet', () => {
  const s = VLE.hostStep(null, []);
  assert.strictEqual(s.action, null);
  assert.match(s.where, /no room/i);
});

test('hostStep: lobby starts the game and can add a bot', () => {
  const s = VLE.hostStep({ phase: 'lobby' }, [P(1), P(2), P(3, { is_bot: true })]);
  assert.strictEqual(s.action, 'start');
  assert.match(s.where, /3 seated/);
  assert.match(s.where, /2 people/);
  assert.deepStrictEqual(s.extra.map((e) => e.action), ['qrclose', 'addbot']);
  assert.strictEqual(VLE.hostStep({ phase: 'lobby_closed' }, six).action, 'start');
});

test('hostStep: story prologue and role reveal both take Begin', () => {
  assert.strictEqual(VLE.hostStep({ phase: 'roles_assigned' }, six).action, 'begin');
  const r = VLE.hostStep({ phase: 'revealed' }, six.map((p, i) => Object.assign({}, p, { has_revealed_once: i < 4 })));
  assert.strictEqual(r.action, 'begin');
  assert.match(r.where, /4 of 6/);
});

test('hostStep: introductions pass the floor with Next', () => {
  const s = VLE.hostStep({ phase: 'intro', floor: { playerId: 'p2', status: 'armed' } }, six);
  assert.strictEqual(s.action, 'next');
  assert.match(s.where, /P2/);
  assert.strictEqual(VLE.hostStep({ phase: 'intro', floor: null }, six).action, null);
});

test('hostStep: the night runs itself until it is done', () => {
  assert.strictEqual(VLE.hostStep({ phase: 'night', night_number: 1, pending_action_type: null }, six).action, null);
  const w = VLE.hostStep({ phase: 'night', night_number: 1, pending_action_type: 'window' }, six);
  assert.strictEqual(w.action, null);
  assert.match(w.where, /night 1/i);
  const d = VLE.hostStep({ phase: 'night', night_number: 2, pending_action_type: 'night_done' }, six);
  assert.strictEqual(d.action, 'continue');
  assert.match(d.where, /night 2/i);
});

test('hostStep: the day walks chronicle -> discussion -> vote -> result', () => {
  const g = { phase: 'day', night_number: 1, floor: null, voting_open: false, pending_action_type: null };
  assert.strictEqual(VLE.hostStep(g, six).action, 'continue');
  const disc = Object.assign({}, g, { floor: { status: 'discussion', ts: 'x' } });
  assert.strictEqual(VLE.hostStep(disc, six).action, 'openvote');
  const open = Object.assign({}, g, { voting_open: true });
  const o = VLE.hostStep(open, six);
  assert.strictEqual(o.action, null);
  assert.match(o.hint, /audience/i);
  const res = Object.assign({}, g, { pending_action_type: 'vote_result' });
  assert.strictEqual(VLE.hostStep(res, six).action, 'continue');
});

test('hostStep: a live Final Girl accusation has no host button', () => {
  assert.strictEqual(VLE.hostStep({ phase: 'day', final_accusation_active: true }, six).action, null);
});

test('hostStep: game over offers another round', () => {
  assert.strictEqual(VLE.hostStep({ phase: 'ended' }, six).action, 'rematch');
  assert.strictEqual(VLE.hostStep({ phase: 'terminated' }, six).action, null);
});

test('hostStep: a signal the TV has not consumed yet is reported', () => {
  const s = VLE.hostStep({ phase: 'lobby', captain_action: 'start' }, six);
  assert.strictEqual(s.pending, 'start');
});
