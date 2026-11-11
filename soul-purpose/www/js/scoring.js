/* SOUL PURPOSE — run setup and scoring. Pure functions, no DOM, so they can be tested in Node.
 * Tuning knobs are at the top. Change them after playtesting; nothing else needs to move.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SP = root.SP || {}; root.SP.scoring = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------- Tuning ----------------
  const TUNING = {
    SOULS_PER_TYPE: 10,      // each run draws this many P and this many H souls
    SIDE_CAPACITY: 10,       // each door takes exactly this many
    SNAP_MAX_AVG_MS: 3000,   // average decision under this = Snap, otherwise Ponder
    FIRM_MAX_DOUBT: 4,       // doubt at or under this = Firm, otherwise Wobbly
    SWAP_DOUBT_WEIGHT: 2,    // doubt = wobbles + swaps * this + bounces
    FAIRNESS_POINTS: 8,      // verdictScore = fairness * this ...
    SNAP_BONUS: 10,          // ... + this if Snap
    FIRM_BONUS: 10,          // ... + this if Firm
    LIGHT_MIN_SCORE: 60,     // verdictScore at or above this = The Light Place
    LOW_FAIRNESS_MAX: 2,     // fairness at or under this gets Gary's "exact opposite" line
  };

  // Choices x Speed x Certainty -> archetype key (see data.js ARCHETYPES)
  const ARCHETYPE_TABLE = {
    'petty|snap|firm': 'hallMonitor',
    'petty|snap|wobbly': 'hotTake',
    'petty|ponder|firm': 'hoaPresident',
    'petty|ponder|wobbly': 'stickyNote',
    'bigPicture|snap|firm': 'bouncer',
    'bigPicture|snap|wobbly': 'goldenRetriever',
    'bigPicture|ponder|firm': 'supremeCourt',
    'bigPicture|ponder|wobbly': 'overthinkingAngel',
  };

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Draw 10 P + 10 H at random, shuffled together. Each soul gets a stored random tiebreak. */
  function drawSouls(pool, rng = Math.random) {
    const n = TUNING.SOULS_PER_TYPE;
    const p = shuffle(pool.filter((s) => s.type === 'P'), rng).slice(0, n);
    const h = shuffle(pool.filter((s) => s.type === 'H'), rng).slice(0, n);
    if (p.length < n || h.length < n) throw new Error('Soul pool needs at least ' + n + ' of each type');
    return shuffle(p.concat(h), rng).map((s) => Object.assign({}, s, { tiebreak: rng() }));
  }

  /** The universe's Dark 10: highest badness, ties broken by the tiebreak stored at the start of the run. */
  function universeDark(souls) {
    return souls
      .slice()
      .sort((a, b) => b.badness - a.badness || a.tiebreak - b.tiebreak)
      .slice(0, TUNING.SIDE_CAPACITY)
      .map((s) => s.id);
  }

  function archetypeFor(choices, speed, certainty) {
    return ARCHETYPE_TABLE[choices + '|' + speed + '|' + certainty];
  }

  /**
   * Score a finished run.
   * run.souls        — the 20 souls in the order shown
   * run.records[id]  — { choice, decisionMs, wobbles, bounced } from the sorting round
   * run.placement[id]— 'light' | 'dark' after reorganizing
   * run.swaps        — swaps made in the reorganize round
   * run.universeDark — ids stored at the start of the run
   */
  function score(run) {
    const souls = run.souls;
    const recs = souls.map((s) => run.records[s.id]);
    const n = souls.length;

    const totalMs = recs.reduce((t, r) => t + r.decisionMs, 0);
    const avgMs = n ? totalMs / n : 0;
    const totalWobbles = recs.reduce((t, r) => t + r.wobbles, 0);
    const bounces = recs.filter((r) => r.bounced).length;
    const swaps = run.swaps || 0;
    const doubt = totalWobbles + swaps * TUNING.SWAP_DOUBT_WEIGHT + bounces;

    const dark = souls.filter((s) => run.placement[s.id] === 'dark');
    const pDark = dark.filter((s) => s.type === 'P').length;
    const hDark = dark.filter((s) => s.type === 'H').length;
    const per = TUNING.SOULS_PER_TYPE;
    const pettyScore = pDark / per - hDark / per;

    const choices = pettyScore > 0 ? 'petty' : 'bigPicture';
    const speed = avgMs < TUNING.SNAP_MAX_AVG_MS ? 'snap' : 'ponder';
    const certainty = doubt <= TUNING.FIRM_MAX_DOUBT ? 'firm' : 'wobbly';
    const archetype = archetypeFor(choices, speed, certainty);

    const universe = new Set(run.universeDark);
    const fairness = dark.filter((s) => universe.has(s.id)).length;
    const verdictScore =
      fairness * TUNING.FAIRNESS_POINTS +
      (speed === 'snap' ? TUNING.SNAP_BONUS : 0) +
      (certainty === 'firm' ? TUNING.FIRM_BONUS : 0);
    const place = verdictScore >= TUNING.LIGHT_MIN_SCORE ? 'light' : 'dark';

    let garyLine = null;
    if (fairness === TUNING.SIDE_CAPACITY) garyLine = 'perfectFairness';
    else if (fairness <= TUNING.LOW_FAIRNESS_MAX) garyLine = 'lowFairness';

    return {
      avgMs, totalMs, totalWobbles, bounces, swaps, doubt,
      pDark, hDark, pettyScore,
      choices, speed, certainty, archetype,
      fairness, verdictScore, place, garyLine,
    };
  }

  return { TUNING, ARCHETYPE_TABLE, shuffle, drawSouls, universeDark, archetypeFor, score };
});
