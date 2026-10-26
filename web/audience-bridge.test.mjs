// The pure logic behind the audience vote: what a pile of ballot rows adds up
// to, who wins, and when every phone in the room is allowed to look.
//
// This is the half of event mode that must not be wrong in front of an
// audience, and it is the half that can be tested without a network, a
// Supabase project, or a phone. The surfaces are thin wrappers over it.
import test from 'node:test';
import assert from 'node:assert';
import './audience-bridge.js';

const VLB = globalThis.VLB;

test('tally counts one ballot per voter per option', () => {
  const rows = [
    { voter_uid: 'a', choice: ['maya'] },
    { voter_uid: 'b', choice: ['maya'] },
    { voter_uid: 'c', choice: ['sam'] }
  ];
  assert.deepStrictEqual(VLB.tally(rows, ['maya', 'sam']), { maya: 2, sam: 1 });
});

test('tally ignores options the ballot did not offer', () => {
  // A row is untrusted input: anon can write anything into cv_votes.choice.
  const rows = [{ voter_uid: 'a', choice: ['maya', 'the-demon-is-sam'] }];
  assert.deepStrictEqual(VLB.tally(rows, ['maya', 'sam']), { maya: 1, sam: 0 });
});

test('winner is the plurality option', () => {
  assert.deepStrictEqual(
    VLB.winner({ maya: 5, sam: 2, priya: 1 }),
    { id: 'maya', count: 5, tied: false }
  );
});

test('winner reports a tie rather than silently picking', () => {
  // The narrator has to be told, because on stage a coin flip needs saying out
  // loud. Resolving it silently is how a room ends up confused about who went.
  const w = VLB.winner({ maya: 3, sam: 3, priya: 1 });
  assert.strictEqual(w.tied, true);
  assert.deepStrictEqual(w.between.sort(), ['maya', 'sam']);
});

test('winner of an empty tally is nobody, not a crash', () => {
  // No crowd, dead network, or a window nobody voted in.
  assert.deepStrictEqual(VLB.winner({ maya: 0, sam: 0 }), { id: null, count: 0, tied: false });
});

// ---- The synchronized reveal -------------------------------------------
// Every phone polls on its own timer, so a naive reveal lands seconds apart
// across the room and kills the collective moment. The host stamps reveal_at a
// few seconds out; everyone holds until it. The trap is that a phone's own
// clock cannot be trusted - skew has already caused a live timer bug in this
// codebase - so the hold is computed against SERVER time.

test('clock offset is the gap between server and device time', () => {
  // Device is two minutes fast.
  assert.strictEqual(VLB.clockOffset(1000000, 1120000), -120000);
});

test('a phone with a fast clock still waits for the reveal', () => {
  const revealAt = 1000000 + 5000;   // server says reveal in 5s
  const offset = VLB.clockOffset(1000000, 1120000); // device is 2min ahead
  // Without the offset this phone computes a hold of -115000 and reveals now,
  // spoiling the result for whoever is sitting next to it.
  assert.strictEqual(VLB.holdMs(revealAt, 1120000, offset), 5000);
});

test('a reveal already past holds for nothing', () => {
  assert.strictEqual(VLB.holdMs(1000000, 1008000, 0), 0);
});

test('a pathological clock cannot freeze a phone on the held card', () => {
  // Device 10 minutes SLOW with a bad offset would otherwise hold ~10min.
  assert.strictEqual(VLB.holdMs(1000000 + 600000, 1000000, 0), VLB.MAX_HOLD_MS);
});

// ---- Manual override ----------------------------------------------------
// The show cannot stop to debug a connection in front of an audience. The
// narrator does a hand count and types it in, and it must enter through the
// SAME path the network votes use so nothing downstream can tell the
// difference. That is the only way to be confident it works at 8:40pm.

test('an override produces the same shape a real harvest does', () => {
  const live = VLB.tally([{ voter_uid: 'a', choice: ['maya'] }], ['maya', 'sam']);
  const manual = VLB.override({ maya: 12, sam: 30 }, ['maya', 'sam']);
  assert.deepStrictEqual(Object.keys(manual).sort(), Object.keys(live).sort());
  assert.deepStrictEqual(manual, { maya: 12, sam: 30 });
});

test('an override REPLACES the network tally rather than adding to it', () => {
  // A partial harvest plus a hand count would double-count whoever managed to
  // get their vote through before the network died.
  const res = VLB.resolve({
    rows: [{ voter_uid: 'a', choice: ['maya'] }],
    keys: ['maya', 'sam'],
    override: { maya: 12, sam: 30 }
  });
  assert.deepStrictEqual(res.counts, { maya: 12, sam: 30 });
  assert.strictEqual(res.source, 'override');
  assert.strictEqual(res.winner.id, 'sam');
});

test('with no override the network harvest decides', () => {
  const res = VLB.resolve({
    rows: [{ voter_uid: 'a', choice: ['maya'] }, { voter_uid: 'b', choice: ['maya'] }],
    keys: ['maya', 'sam'],
    override: null
  });
  assert.deepStrictEqual(res.counts, { maya: 2, sam: 0 });
  assert.strictEqual(res.source, 'audience');
  assert.strictEqual(res.winner.id, 'maya');
});

test('an override ignores names that were never on the ballot', () => {
  assert.deepStrictEqual(VLB.override({ maya: 4, ghost: 99 }, ['maya', 'sam']), { maya: 4, sam: 0 });
});

test('a negative or junk override count reads as zero', () => {
  // Typed on a phone, in the dark, under stage lights.
  assert.deepStrictEqual(VLB.override({ maya: -3, sam: 'x' }, ['maya', 'sam']), { maya: 0, sam: 0 });
});

// ---- Which table, which ballot ------------------------------------------
// One room code runs the whole show, so the audience surface has to know which
// game is live. Core Vessels and Lesser Evil keep SEPARATE ballot tables on
// purpose (a stale ballot harvested into the wrong game is a silent wrong vote
// at a live event, which is the worst place to find that bug).

test('the live game selects the ballot table pair', () => {
  assert.deepStrictEqual(VLB.tables('cv'), { ballot: 'cv_ballot', votes: 'cv_votes' });
  assert.deepStrictEqual(VLB.tables('le'), { ballot: 'le_ballot', votes: 'le_votes' });
});

test('an unknown game selects no table at all', () => {
  // Better to show the waiting card than to poll a table that is not this game.
  assert.strictEqual(VLB.tables('sinking_ship'), null);
  assert.strictEqual(VLB.tables(null), null);
});

// ---- Narrator command nonce ---------------------------------------------
// The narrator's phone writes a command; tv.html polls for it. Polling means
// the same command is read many times, and "open the vote" must happen once.

test('a command runs once even though the poll sees it repeatedly', () => {
  const seen = VLB.commandGate();
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 7 }), true);
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 7 }), false);
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 7 }), false);
});

test('the same command issued again with a new nonce runs again', () => {
  // The narrator reopening a window is a real thing that happens on stage.
  const seen = VLB.commandGate();
  seen.shouldRun({ cmd: 'open_vote', nonce: 7 });
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 8 }), true);
});

test('a stale command from before this surface booted is not replayed', () => {
  // tv.html restarting mid-show must not re-fire the last command it finds
  // sitting in the row - that would reopen a window the narrator had closed.
  const seen = VLB.commandGate(12);
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 12 }), false);
  assert.strictEqual(seen.shouldRun({ cmd: 'open_vote', nonce: 13 }), true);
});
