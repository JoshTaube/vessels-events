// Soul Purpose scoring rules (spec section 5). Run: node --test soul-purpose/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const data = require('../www/js/data.js');
const scoring = require('../www/js/scoring.js');
const { TUNING } = scoring;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A finished run where `darkIds` end up Dark and every decision took `ms`. */
function makeRun({ seed = 1, darkPick, ms = 2000, wobbles = 0, bounces = 0, swaps = 0 } = {}) {
  const souls = scoring.drawSouls(data.SOULS, seeded(seed));
  const dark = new Set(darkPick(souls));
  const records = {};
  const placement = {};
  souls.forEach((s, i) => {
    const side = dark.has(s.id) ? 'dark' : 'light';
    records[s.id] = { choice: side, decisionMs: ms, wobbles: i < wobbles ? 1 : 0, bounced: i < bounces };
    placement[s.id] = side;
  });
  return { souls, records, placement, swaps, universeDark: scoring.universeDark(souls) };
}
const allH = (souls) => souls.filter((s) => s.type === 'H').map((s) => s.id);
const allP = (souls) => souls.filter((s) => s.type === 'P').map((s) => s.id);
const fiveFive = (souls) => allP(souls).slice(0, 5).concat(allH(souls).slice(0, 5));

test('pool has 15 P and 15 H with unique ids and valid fields', () => {
  assert.equal(data.SOULS.length, 30);
  assert.equal(data.SOULS.filter((s) => s.type === 'P').length, 15);
  assert.equal(data.SOULS.filter((s) => s.type === 'H').length, 15);
  assert.equal(new Set(data.SOULS.map((s) => s.id)).size, 30);
  for (const s of data.SOULS) {
    assert.ok(s.badness >= 1 && s.badness <= 5, s.id);
    for (const k of ['name', 'confession', 'excuse', 'prop', 'propLabel']) assert.ok(s[k], `${s.id}.${k}`);
  }
});

test('each run draws exactly 10 P + 10 H, and replays differ', () => {
  const a = scoring.drawSouls(data.SOULS, seeded(1));
  const b = scoring.drawSouls(data.SOULS, seeded(2));
  assert.equal(a.length, 20);
  assert.equal(a.filter((s) => s.type === 'P').length, 10);
  assert.equal(a.filter((s) => s.type === 'H').length, 10);
  assert.equal(new Set(a.map((s) => s.id)).size, 20);
  assert.notDeepEqual(a.map((s) => s.id), b.map((s) => s.id));
});

test("universe's Dark 10 is the 10 highest badness, ties broken by the stored tiebreak", () => {
  for (let seed = 1; seed < 50; seed++) {
    const souls = scoring.drawSouls(data.SOULS, seeded(seed));
    const ud = scoring.universeDark(souls);
    assert.equal(ud.length, 10);
    const inSet = new Set(ud);
    const minIn = Math.min(...souls.filter((s) => inSet.has(s.id)).map((s) => s.badness));
    const maxOut = Math.max(...souls.filter((s) => !inSet.has(s.id)).map((s) => s.badness));
    assert.ok(minIn >= maxOut);
    assert.deepEqual(scoring.universeDark(souls), ud, 'stable for the same run');
  }
});

test('pettyScore: more P than H in Dark = Petty, an even split = Big Picture', () => {
  const petty = scoring.score(makeRun({ darkPick: allP }));
  assert.equal(petty.pettyScore, 1);
  assert.equal(petty.choices, 'petty');
  const big = scoring.score(makeRun({ darkPick: allH }));
  assert.equal(big.pettyScore, -1);
  assert.equal(big.choices, 'bigPicture');
  const even = scoring.score(makeRun({ darkPick: fiveFive }));
  assert.equal(even.pettyScore, 0);
  assert.equal(even.choices, 'bigPicture');
});

test('speed threshold: under 3.0s average = Snap, 3.0s or more = Ponder', () => {
  assert.equal(scoring.score(makeRun({ darkPick: allH, ms: TUNING.SNAP_MAX_AVG_MS - 1 })).speed, 'snap');
  assert.equal(scoring.score(makeRun({ darkPick: allH, ms: TUNING.SNAP_MAX_AVG_MS })).speed, 'ponder');
});

test('doubt = wobbles + swaps x 2 + bounces; 4 or under = Firm', () => {
  const s = scoring.score(makeRun({ darkPick: allH, wobbles: 1, bounces: 1, swaps: 1 }));
  assert.equal(s.doubt, 4);
  assert.equal(s.certainty, 'firm');
  const w = scoring.score(makeRun({ darkPick: allH, wobbles: 2, bounces: 1, swaps: 1 }));
  assert.equal(w.doubt, 5);
  assert.equal(w.certainty, 'wobbly');
});

test('all 8 archetypes are reachable from the table', () => {
  const seen = new Set();
  for (const pick of [allP, allH]) for (const ms of [1000, 5000]) for (const wob of [0, 6]) {
    seen.add(scoring.score(makeRun({ darkPick: pick, ms, wobbles: wob })).archetype);
  }
  assert.deepEqual([...seen].sort(), Object.keys(data.ARCHETYPES).sort());
  for (const [key, a] of Object.entries(data.ARCHETYPES)) {
    const k = scoring.archetypeFor(a.petty ? 'petty' : 'bigPicture', a.snap ? 'snap' : 'ponder', a.firm ? 'firm' : 'wobbly');
    assert.equal(k, key, 'data axes agree with the scoring table');
  }
});

test('all 16 homes exist', () => {
  for (const k of Object.keys(data.ARCHETYPES)) {
    for (const p of ['light', 'dark']) {
      assert.ok(data.HOMES[k][p].name && data.HOMES[k][p].description, `${k}.${p}`);
    }
  }
});

test('verdict: fairness x 8 + 10 Snap + 10 Firm, 60 or more = Light', () => {
  const perfect = scoring.score(makeRun({ darkPick: (souls) => scoring.universeDark(souls), ms: 1000 }));
  assert.equal(perfect.fairness, 10);
  assert.equal(perfect.verdictScore, 100);
  assert.equal(perfect.place, 'light');
  assert.equal(perfect.garyLine, 'perfectFairness');

  // Exactly 6 matches, slow and wobbly: 48 -> Dark. Same 6 matches, snap and firm: 68 -> Light.
  const six = (souls) => {
    const ud = scoring.universeDark(souls);
    const other = souls.map((s) => s.id).filter((id) => !ud.includes(id));
    return ud.slice(0, 6).concat(other.slice(0, 4));
  };
  const slow = scoring.score(makeRun({ darkPick: six, ms: 5000, wobbles: 5 }));
  assert.equal(slow.fairness, 6);
  assert.equal(slow.verdictScore, 48);
  assert.equal(slow.place, 'dark');
  const fast = scoring.score(makeRun({ darkPick: six, ms: 1000 }));
  assert.equal(fast.verdictScore, 68);
  assert.equal(fast.place, 'light');
  assert.equal(fast.garyLine, null);

  const opposite = (souls) => {
    const ud = scoring.universeDark(souls);
    return souls.map((s) => s.id).filter((id) => !ud.includes(id));
  };
  const opp = scoring.score(makeRun({ darkPick: opposite }));
  assert.equal(opp.fairness, 0);
  assert.equal(opp.garyLine, 'lowFairness');
});
