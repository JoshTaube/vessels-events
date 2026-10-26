// VLB - the audience bridge.
//
// Pure logic only: no network, no DOM, no Supabase. Every surface in the show
// (audience.html, narrator.html, the patched tv.html) imports this and wraps it.
// Keeping it pure is what makes the vote path testable without a venue.
(function (root) {
  'use strict';

  const VLB = {};

  // Count ballots. `keys` is the set of options this ballot is allowed to be
  // counted under; anything else in a row is dropped rather than trusted.
  VLB.tally = function (rows, keys) {
    const counts = {};
    for (const k of keys) counts[k] = 0;
    for (const row of (rows || [])) {
      for (const choice of (row.choice || [])) {
        if (choice in counts) counts[choice]++;
      }
    }
    return counts;
  };

  // Plurality. A tie is REPORTED, never resolved here: on a stage the narrator
  // has to say out loud that it was tied and how it got broken, so the decision
  // belongs to whoever is holding the microphone.
  VLB.winner = function (counts) {
    let best = null, bestN = 0, between = [];
    for (const id of Object.keys(counts || {})) {
      const n = counts[id] || 0;
      if (n > bestN) { best = id; bestN = n; between = [id]; }
      else if (n === bestN && n > 0) { between.push(id); }
    }
    if (bestN === 0) return { id: null, count: 0, tied: false };
    if (between.length > 1) return { id: null, count: bestN, tied: true, between: between };
    return { id: best, count: bestN, tied: false };
  };

  // ---- The synchronized reveal ------------------------------------------
  // Longest a client will ever sit on a held result. A phone whose clock is
  // wildly wrong would otherwise stare at the holding card for minutes while
  // the rest of the room moved on; better to reveal a little early than to
  // strand someone.
  VLB.MAX_HOLD_MS = 15000;

  // How far the device clock is from the server's, in ms. Add this to a device
  // reading to get server time. Every poll carries a server timestamp, so this
  // is refreshed continuously and costs nothing extra.
  VLB.clockOffset = function (serverMs, deviceMs) {
    return serverMs - deviceMs;
  };

  // How long this client must wait before showing the result. Never negative,
  // never longer than MAX_HOLD_MS.
  VLB.holdMs = function (revealAtMs, deviceNowMs, offsetMs) {
    const serverNow = deviceNowMs + (offsetMs || 0);
    const wait = revealAtMs - serverNow;
    if (!(wait > 0)) return 0;
    return Math.min(wait, VLB.MAX_HOLD_MS);
  };

  // ---- Manual override ----------------------------------------------------
  // Hand-counted numbers, normalised into exactly the shape tally() returns so
  // that nothing downstream can tell a hand count from a harvest.
  VLB.override = function (raw, keys) {
    const counts = {};
    for (const k of keys) {
      const n = Math.floor(Number((raw || {})[k]));
      counts[k] = (isFinite(n) && n > 0) ? n : 0;
    }
    return counts;
  };

  // The single place a ballot becomes a result. Both the network path and the
  // hand-count path come through here, so the reveal, the tally card and the
  // engine action are identical either way.
  //
  // An override REPLACES the harvest. It never adds: a partial harvest plus a
  // hand count would double-count everyone who got their vote in before the
  // network died.
  VLB.resolve = function (opts) {
    const keys = opts.keys || [];
    const hasOverride = !!opts.override && Object.keys(opts.override).length > 0;
    const counts = hasOverride
      ? VLB.override(opts.override, keys)
      : VLB.tally(opts.rows, keys);
    return {
      counts: counts,
      winner: VLB.winner(counts),
      source: hasOverride ? 'override' : 'audience',
      voters: hasOverride
        ? Object.keys(counts).reduce((n, k) => n + counts[k], 0)
        : (opts.rows || []).length
    };
  };

  // ---- Which table, which ballot ------------------------------------------
  // Core Vessels and Lesser Evil keep separate ballot tables deliberately. Every
  // mode mints room codes from the same generator, so a shared table would let a
  // stale ballot be harvested into the wrong game - a silent wrong vote, at a
  // live event. Separate pairs cost one extra create and remove the whole class.
  const TABLES = {
    cv: { ballot: 'cv_ballot', votes: 'cv_votes' },
    le: { ballot: 'le_ballot', votes: 'le_votes' }
  };
  VLB.tables = function (game) {
    return TABLES[game] || null;
  };

  // ---- Narrator command nonce ---------------------------------------------
  // The narrator writes a command into event_control; tv.html polls it. Polling
  // reads the same row over and over, so every command carries a nonce and runs
  // exactly once. Seeding the gate with the nonce already in the row at boot is
  // what stops a restarted TV from replaying the last command mid-show.
  VLB.commandGate = function (seedNonce) {
    let last = (seedNonce === undefined || seedNonce === null) ? -Infinity : seedNonce;
    return {
      shouldRun: function (cmd) {
        if (!cmd || cmd.nonce === undefined || cmd.nonce === null) return false;
        if (cmd.nonce <= last) return false;
        last = cmd.nonce;
        return true;
      },
      seen: function () { return last; }
    };
  };

  root.VLB = VLB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
