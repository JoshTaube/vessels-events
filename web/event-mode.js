// VLE - event mode's decision rules.
//
// Event mode is one inversion: stage players stop voting and the audience
// starts. These are the predicates that carry it, kept pure and apart from the
// surfaces that obey them so the inversion can be proved without a room,
// twelve phones and a projector.
//
// EVERY predicate here must return the pre-event behaviour when eventMode is
// false. Normal play on playvessels.com is not allowed to change, and this file
// is where that promise is actually kept.
(function (root) {
  'use strict';

  const VLE = {};

  // ---- Who votes ---------------------------------------------------------
  // In event mode the audience is the judging body. Players deliberate, argue
  // and defend themselves; they do not cast ballots in either game.
  VLE.playerMayVote = function (ctx) {
    return !(ctx && ctx.eventMode);
  };

  // ---- What a stage phone shows -----------------------------------------
  // Twelve phones go idle at the moment the room's attention is highest, so
  // they go dark rather than idle. No tally (bandwagon), no timer (pressure),
  // no input (they are not voting). Role stays reachable behind a deliberate
  // tap, so a player can re-check it without it being on screen while they
  // should be looking up at the room.
  VLE.playerScreen = function (ctx) {
    if (!ctx || !ctx.eventMode || !ctx.audienceWindowOpen) return { mode: 'normal' };
    return {
      mode: 'hold',
      showTally: false,
      showTimer: false,
      acceptsInput: false,
      roleReachable: true
    };
  };

  // ---- When a Lesser Evil ballot may close ------------------------------
  // Stock LE closes on a 30s deadline OR when every eligible player is in. In
  // event mode nobody is eligible, so that second condition would fire the
  // instant the ballot opened and the crowd would never vote at all. Both are
  // suppressed and the narrator becomes the only clock - which is the owner's
  // rule for the whole show, not a workaround.
  VLE.ballotShouldClose = function (ctx) {
    if (ctx && ctx.eventMode) return !!ctx.narratorClosed;
    return !!(ctx && (ctx.allPlayersIn || ctx.deadlinePassed));
  };

  // ---- Nomination --------------------------------------------------------
  // After Core Vessels deliberation the narrator names 2-3 suspects. This is a
  // judgment call, not a mechanic: there is no nomination vote anywhere.
  VLE.nominationValid = function (picked, alive) {
    const list = picked || [];
    if (list.length < 2) return { ok: false, reason: 'Pick at least 2 suspects' };
    if (list.length > 3) return { ok: false, reason: 'Pick at most 3 suspects' };
    if (new Set(list).size !== list.length) return { ok: false, reason: 'The same suspect twice is not two suspects' };
    const living = new Set(alive || []);
    for (const id of list) {
      if (!living.has(id)) return { ok: false, reason: id + ' is not in the game' };
    }
    return { ok: true };
  };

  // ---- The host's next step --------------------------------------------
  // Owner 2026-09-02: there is no narrator on the screen, so someone at the
  // back moves the show along, and the timers are fully off. The narrator page
  // writes games.captain_action, the column the captain's phone has always
  // written, and tv.html's autopilotTick performs the transition. This maps
  // the games row to the ONE button that makes sense right now so the operator
  // never needs the phase names. Returns {where, action, label, hint, extra,
  // pending}: action null means the game is moving on its own.
  VLE.hostStep = function (game, players) {
    const ps = players || [];
    const name = (id) => { const p = ps.find((x) => String(x.id) === String(id)); return p ? p.name : 'someone'; };
    const step = (where, action, label, o) => Object.assign(
      { where: where, action: action || null, label: label || null, hint: '', extra: [],
        pending: (game && game.captain_action) || null }, o || {});
    if (!game || !game.phase) return step('No room open on the screen yet');
    const ph = game.phase, pt = game.pending_action_type, floor = game.floor;
    const seated = ps.length, people = ps.filter((p) => !p.is_bot).length;
    const alive = ps.filter((p) => !p.is_eliminated).length;
    if (ph === 'lobby' || ph === 'lobby_closed') {
      return step('Lobby: ' + seated + ' seated, ' + people + ' people', 'start', 'Start the game',
        { hint: seated < 6 ? 'Fewer than six seated: bots fill the empty chairs.' : '',
          extra: [{ action: 'qrclose', label: 'Hide the join QR' }, { action: 'addbot', label: 'Add a bot' }] });
    }
    if (ph === 'roles_assigned') return step('Story prologue on screen', 'begin', 'Skip to the role reveal');
    if (ph === 'revealed') {
      const humans = ps.filter((p) => !p.is_bot && !p.is_eliminated);
      const looked = humans.filter((p) => p.has_revealed_once).length;
      return step('Roles dealt: ' + looked + ' of ' + humans.length + ' have looked', 'begin', 'Begin introductions');
    }
    if (ph === 'intro') {
      if (floor && floor.playerId) return step('Introductions: ' + name(floor.playerId) + ' has the floor', 'next', 'Next speaker');
      return step('Introductions starting', null, null, { hint: 'The floor passes on its own.' });
    }
    if (game.final_accusation_active) return step('Final Girl accusation: her phone drives it');
    if (ph === 'night') {
      const n = 'Night ' + (game.night_number || 1);
      if (pt === 'night_done') return step(n + ' is over', 'continue', 'Reveal the dawn');
      if (pt === 'window') return step(n + ': action window open', null, null, { hint: 'Resolves when the countdown ends.' });
      return step(n + ' falls', null, null, { hint: 'The action window opens on its own.' });
    }
    if (ph === 'day') {
      const n = 'Day ' + (game.night_number || 1);
      if (pt === 'vote_result') return step('Vote result on screen, ' + alive + ' alive', 'continue', 'Start the next night');
      if (game.voting_open) return step(n + ': the vote is open on screen', null, null,
        { hint: 'Nominate suspects and open the audience vote below.' });
      if (floor && floor.status === 'discussion') return step(n + ' discussion', 'openvote', 'Open the vote');
      if (floor && floor.playerId) return step(n + ': ' + name(floor.playerId) + ' has the floor', 'next', 'Next speaker');
      return step(n + ': night results on screen', 'continue', 'Start the discussion');
    }
    if (ph === 'ended') return step('Game over', 'rematch', 'Play another round');
    if (ph === 'terminated') return step('Room closed');
    return step('Phase: ' + ph);
  };

  root.VLE = VLE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
