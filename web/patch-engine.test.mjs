// The patch engine.
//
// build-event.js edits prod files it does not own. The only acceptable failure
// mode is LOUD: if prod changes shape and an anchor stops matching, the build
// must stop, not quietly emit a file that no longer does what event mode needs.
// A silently-skipped patch is a show that behaves like normal Vessels on stage.
import test from 'node:test';
import assert from 'node:assert';
import './patch-engine.js';

const P = globalThis.VLPATCH;

test('a patch replaces its anchor', () => {
  const out = P.apply('abc DEF ghi', [{ name:'t', find:'DEF', replace:'XYZ' }]);
  assert.strictEqual(out, 'abc XYZ ghi');
});

test('a missing anchor throws, naming the patch', () => {
  assert.throws(
    () => P.apply('abc', [{ name:'day-ballot', find:'NOPE', replace:'x' }]),
    /day-ballot/
  );
});

test('an anchor that appears twice throws rather than guessing', () => {
  // Prod files are 14k lines. If a short anchor matches in two places, picking
  // the first is a coin flip, and the wrong one is a bug nobody will find until
  // it is on stage.
  assert.throws(
    () => P.apply('X foo X', [{ name:'amb', find:'X', replace:'y' }]),
    /twice|2 times|ambiguous/i
  );
});

test('patches apply in order and can build on each other', () => {
  const out = P.apply('a b', [
    { name:'one', find:'a', replace:'A' },
    { name:'two', find:'A b', replace:'DONE' }
  ]);
  assert.strictEqual(out, 'DONE');
});

test('an already-applied patch is a no-op, not a failure', () => {
  // Re-running the build over its own output must not explode.
  const patches = [{ name:'t', find:'DEF', replace:'XYZ', applied:'XYZ' }];
  assert.strictEqual(P.apply('abc XYZ ghi', patches), 'abc XYZ ghi');
});

test('an optional patch may be absent without failing the build', () => {
  // For anchors that legitimately exist in only some of the target files.
  const out = P.apply('abc', [{ name:'maybe', find:'NOPE', replace:'x', optional:true }]);
  assert.strictEqual(out, 'abc');
});

test('the report says what applied and what was skipped', () => {
  const r = P.report('tv.html', 'a b', [
    { name:'one', find:'a', replace:'A' },
    { name:'two', find:'zz', replace:'x', optional:true }
  ]);
  assert.strictEqual(r.applied.length, 1);
  assert.deepStrictEqual(r.skipped, ['two']);
  assert.strictEqual(r.text, 'A b');
});
