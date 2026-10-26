// Vessels Events: THE DIRECTOR (Josh, 2026-10-26: "we need more control"). The launcher plays the games: in event
// mode neither game changes screen by itself (event patches hold every self-advance), and this decides when they do.
//
// screen(game, ...) reads a game's state and says, for the screen the room is looking at:
//   key      a stable id for this screen (a new key = a new screen: the console's track, the replay pictures)
//   title    what's on the projector, in a few words; detail: the line under it
//   ready    whether this screen's work is done (the players have done their part, or its clock has run out)
//   why      what it's waiting for, when it isn't ready
//   clock    the game's own deadline on this screen (ms), if it has one
//   go       what GO does here: {action, label} (action: a game step, 'vote-open', 'vote-close' or 'cue'), or null
//   blocked  why GO can't do it yet (Core Vessels' suspects)
//   kind     which time in director.times paces it on Auto; manual: Auto never takes this one (a game's start, its
//            end, choosing suspects)
// autoAt(screen, since, readySince, times) says when Auto takes GO (null: it doesn't).
'use strict';

// Every time Auto uses, in seconds. The show file's director.times overrides any of them.
const TIMES = {
  read: 8,          // a screen to be read: the line-ups, a reveal, between debates
  podium: 4,        // a speaker at the podium before Auto starts their clock
  pickHold: 3,      // after the last position is locked
  grace: 1.5,       // after a game clock runs out (the buzzer)
  story: 12,        // Vessels' story prologue
  rolesHold: 3, rolesMax: 40,          // the role reveal: after everyone has looked; the most it waits
  introHold: 8, introMax: 60,          // a speaker's introduction: after they claim a role; the most it waits
  nightfall: 5,     // "night falls" before the action window opens
  windowMax: 90,    // the night's action window, if the game hasn't published its clock
  nightDone: 4,     // "the night is over" before the dawn
  dawn: 10,         // the dawn's chronicle before the testimony
  testimonyHold: 5, testimonyMax: 60,  // a speaker naming suspects
  coin: 6,          // a tied vote's coin
  verdict: 10,      // the vote's result before night falls
  vote: 30,         // how long Core Vessels' audience vote stays open
};

const nameOf = (players, id) => { const p = (players || []).find((x) => String(x.id) === String(id)); return p ? p.name : 'someone'; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const S = (o) => Object.assign({ key: '', title: '', detail: '', ready: true, why: '', clock: null, go: null, blocked: null, kind: 'read', manual: false, extra: [] }, o);

// ---------------------------------------------------------------------------------------------
// Lesser Evil (games.le, the race's whole state; the TV's own Next, leNext, knows what to do on every screen)
function lesserEvil(game, players, vote, opts) {
  const o = opts || {}, now = o.now || Date.now();
  if (!game) return S({ key: 'le:none', title: 'Opening the Lesser Evil room', ready: false, why: 'The TV is creating the room' });
  const le = game.le, ps = players || [];
  if (!le) {
    const racers = ps.filter((p) => !(p.le && p.le.isHost));
    if (o.starting) return S({ key: 'le:intro', title: 'The race’s intro film', detail: 'The race starts when it ends', go: { action: 'skipIntro', label: 'Skip the intro' }, manual: true });
    const unsure = racers.filter((p) => !(p.le && p.le.role)).length;
    const noSlogan = racers.filter((p) => !(p.le && p.le.voter) && !String((p.le && p.le.slogan) || '').trim()).length;
    const why = racers.length < 3 ? `Needs ${3 - racers.length} more in the race` : unsure ? `${unsure} still choosing` : noSlogan ? `Waiting for ${plural(noSlogan, 'slogan')}` : '';
    const bots = racers.filter((p) => p.is_bot).length;
    return S({ key: 'le:lobby', title: `Lobby: ${racers.length} in the race`, detail: bots ? `${plural(bots, 'bot')} among them` : '', ready: !why, why,
      go: { action: 'start', label: 'Play the intro and start the race' }, blocked: why || null, manual: true,
      // a test bot (night.js addLeBot): seated ready to run, it never has to act
      extra: (racers.length < 12 ? [{ action: 'addbot', label: 'Add a bot' }] : []).concat(why ? [] : [{ action: 'skipIntro', label: 'Start, skip the intro' }]) });
  }
  const g = le.game_no || 0, idx = le.stage_idx || 0, base = `le:${g}:${idx}`;
  if (le.phase === 'results' || le.phase === 'complete') {
    return S({ key: `le:${g}:results`, title: `The race is over: ${le.winner != null ? nameOf(ps, le.winner) + ' wins' : 'results'}`,
      go: { action: 'cue', label: 'On to the next cue' }, manual: true, end: true, extra: [{ action: 'next', label: 'Race again, same cast' }] });
  }
  const st = le.stage;
  if (!st) {
    const first = idx === 0 && !(le.history && le.history.length);
    return S({ key: `${base}:between`, title: first ? 'The line-ups' : 'Between debates', go: { action: 'next', label: first ? 'Begin the first debate' : 'Begin the next debate' }, kind: 'read' });
  }
  const round = { room_vote: 'The vote', sudden_death: 'Sudden death', final: 'The final' }[st.type] || `Debate ${idx + 1}`;
  const deadline = +le.deadline || null;
  if (st.sub === 'pick') {
    const left = (st.candidates || []).filter((id) => st.picked && st.picked[id] == null).length;
    const out = deadline && now >= deadline;
    return S({ key: `${base}:pick`, title: `${round}: picking positions`, detail: left ? `${plural(left, 'position')} still to pick` : 'Every position is locked',
      ready: !left || !!out, why: left ? `${plural(left, 'position')} still to pick` : '', clock: deadline,
      go: { action: 'next', label: left ? 'Start the speeches (unpicked get a random position)' : 'Start the speeches' }, kind: 'pick' });
  }
  if (st.sub === 'assign') {
    const set = st.roles && st.roles.for && st.roles.against;
    return S({ key: `${base}:assign`, title: 'Sudden death: the teams choose their speakers', ready: !!set, why: set ? '' : 'The teams are choosing',
      go: { action: 'next', label: 'Start the speeches' }, kind: 'pick', clock: deadline });
  }
  if (st.sub === 'speech') {
    const who = st.type === 'sudden_death' ? `Team ${String(st.speakOrder && st.speakOrder[st.speakIdx] || '').toUpperCase()}` : nameOf(ps, st.speakOrder && st.speakOrder[st.speakIdx]);
    const pass = st.speechPass === 'closing' ? 'closing' : 'opening', sk = `${base}:speech:${pass}:${st.speakIdx}`;
    if (!(st.speech && st.speech.started)) {
      return S({ key: `${sk}:podium`, title: `${who} at the podium`, detail: `${pass === 'closing' ? 'Closing' : 'Opening'} statement`,
        go: { action: 'next', label: `Start ${who}’s clock` }, kind: 'podium' });
    }
    const dl = +(st.speech && st.speech.deadline) || deadline;
    const out = dl && now >= dl;
    return S({ key: `${sk}:live`, title: `${who} is speaking`, detail: `${pass === 'closing' ? 'Closing' : 'Opening'} statement`, clock: dl,
      ready: !!out, why: out ? '' : 'Their clock is running', go: { action: 'next', label: 'End the speech' }, kind: 'speech' });
  }
  if (st.sub === 'ballot' || (st.type === 'room_vote' && !st.closed)) {
    const v = vote && vote.game === 'le' && vote.auto ? vote : null;
    if (v && v.state === 'open') {
      return S({ key: `${base}:ballot`, title: st.type === 'room_vote' ? 'The vote: the audience brings candidates back' : 'The audience votes', detail: `${plural(v.total || 0, 'vote')} in`,
        clock: v.closesAt, ready: false, why: 'The vote is open', go: { action: 'vote-close', label: 'Close the vote' }, kind: 'ballot' });
    }
    return S({ key: `${base}:ballot`, title: 'The audience votes', detail: v ? 'The votes are in' : 'The ballot is opening', ready: false, why: v ? 'The race is counting' : 'Opening the ballot on /vote' });
  }
  if (st.sub === 'reveal') return S({ key: `${base}:reveal`, title: `${round}: the verdict`, go: { action: 'next', label: 'Close the round' }, kind: 'read' });
  if (st.sub === 'rps') {
    const r = st.rps || {}, out = deadline && now >= deadline;
    return S({ key: `${base}:rps:${r.round || 1}`, title: 'A tie: rock, paper, scissors', clock: deadline, ready: !!out, why: out ? '' : 'They’re throwing',
      go: { action: 'next', label: 'Settle the throw' }, kind: 'duel' });
  }
  if (st.sub === 'endorse') {
    const out = deadline && now >= deadline;
    return S({ key: `${base}:endorse`, title: 'A tie: the kingmaker decides', clock: deadline, ready: !!out, why: out ? '' : 'The kingmaker is choosing',
      go: { action: 'next', label: 'Settle it' }, kind: 'duel' });
  }
  return S({ key: `${base}:${st.sub || 'stage'}`, title: round, go: { action: 'next', label: 'Next' } });
}

// ---------------------------------------------------------------------------------------------
// Core Vessels (the games row; steps go to tv.html as games.captain_action)
function vessels(game, players, vote, opts) {
  const o = opts || {}, now = o.now || Date.now(), noms = o.nominees || [];
  if (!game) return S({ key: 'cv:none', title: 'Opening the Vessels room', ready: false, why: 'The TV is creating the room' });
  const ps = players || [], ph = game.phase, n = game.night_number || 1, rn = game.round_number || 1, base = `cv:${rn}:${n}`;
  const alive = ps.filter((p) => !p.is_eliminated);
  if (ph === 'lobby' || ph === 'lobby_closed') {
    return S({ key: `cv:${rn}:lobby`, title: `Lobby: ${ps.length} seated`, detail: ps.length < 6 ? 'Bots fill the table to six' : '',
      go: { action: 'start', label: 'Deal the roles' }, manual: true, extra: [{ action: 'addbot', label: 'Add a bot' }] });
  }
  if (ph === 'ended') {
    const w = game.winner === 'town' || game.winner === 'villagers' ? 'The village wins' : game.winner ? 'The demons win' : 'Game over';
    return S({ key: `cv:${rn}:ended`, title: `Game over: ${w}`, go: { action: 'cue', label: 'On to the next cue' }, manual: true, end: true,
      extra: [{ action: 'rematch', label: 'Play again, same cast' }] });
  }
  if (ph === 'roles_assigned') return S({ key: `cv:${rn}:story`, title: 'The story', go: { action: 'begin', label: 'Deal the roles to the phones' }, kind: 'story' });
  if (ph === 'revealed') {
    const humans = ps.filter((p) => !p.is_bot && !p.is_eliminated), looked = humans.filter((p) => p.has_revealed_once).length;
    const all = humans.length > 0 && looked === humans.length;
    return S({ key: `cv:${rn}:roles`, title: 'The roles are dealt', detail: `${looked} of ${humans.length} have looked`, ready: all, why: all ? '' : 'Not everyone has looked',
      go: { action: 'begin', label: 'Begin the introductions' }, kind: 'roles' });
  }
  const f = game.floor || null;
  if (game.final_accusation_active) return S({ key: `${base}:fg`, title: 'The Final Girl accuses', detail: 'Her phone drives this', ready: false, why: 'She’s choosing' });
  if (game.final_accusation_target && !game.final_accusation_active && !game.winner) {
    return S({ key: `${base}:fgverdict`, title: 'The Final Girl has chosen', go: { action: 'continue', label: 'Reveal her verdict' }, kind: 'read' });
  }
  if (ph === 'intro') {
    if (f && f.status === 'complete') return S({ key: `cv:${rn}:intro:done`, title: 'Introductions are done', go: { action: 'continue', label: 'Night falls' }, kind: 'read' });
    if (f && f.playerId) {
      const said = !!f.claimed_role || f.status === 'locked' || f.status === 'passed';
      return S({ key: `cv:${rn}:intro:${f.playerId}:${f.ts || ''}`, title: `${nameOf(ps, f.playerId)} introduces themselves`, detail: f.claimed_role ? `Claims ${f.claimed_role}` : '',
        ready: said, why: said ? '' : 'They haven’t claimed a role yet', go: { action: 'next', label: 'Next speaker' }, kind: 'intro' });
    }
    return S({ key: `cv:${rn}:intro`, title: 'Introductions are starting', ready: false, why: 'Passing the floor' });
  }
  if (ph === 'night') {
    const pt = game.pending_action_type;
    if (pt === 'window') {
      const dl = +((game.votes || {})._winDeadline) || null, out = dl && now >= dl;
      return S({ key: `${base}:window`, title: `Night ${n}: the action window`, clock: dl, ready: !!out, why: out ? '' : 'The night’s clock is running',
        go: { action: 'continue', label: 'End the night' }, kind: 'window' });
    }
    if (pt === 'night_done') return S({ key: `${base}:nightdone`, title: `Night ${n} is over`, go: { action: 'continue', label: 'Reveal the dawn' }, kind: 'nightDone' });
    return S({ key: `${base}:nightfall`, title: `Night ${n} falls`, go: { action: 'continue', label: 'Open the action window' }, kind: 'nightfall' });
  }
  if (ph === 'day') {
    if (game.pending_action_type === 'vote_result') {
      const e = game.last_elimination || {};
      return S({ key: `${base}:verdict`, title: e.name ? `The verdict: ${e.name} is out` : 'The verdict', go: { action: 'continue', label: `Night ${n + 1} falls` }, kind: 'verdict' });
    }
    if (game.voting_open) {
      const c = game.coin_flip;
      if (c && !c.done) return S({ key: `${base}:coin`, title: 'A tie: the coin', go: { action: 'coincontinue', label: 'Continue past the coin' }, kind: 'coin' });
      const v = vote && vote.game === 'cv' ? vote : null;
      if (v && v.state === 'open') {
        return S({ key: `${base}:vote`, title: 'The audience votes', detail: `${plural(v.total || 0, 'vote')} in`, clock: v.closesAt, ready: false, why: 'The vote is open',
          go: { action: 'vote-close', label: 'Close the vote' }, kind: 'vote' });
      }
      return S({ key: `${base}:vote`, title: 'The audience votes', detail: v ? 'The votes are in' : '', ready: false, why: v ? 'The game is counting' : 'Opening the vote' });
    }
    if (f && f.status === 'discussion') {
      const ok = noms.length >= 2 && noms.length <= 3;
      return S({ key: `${base}:discussion`, title: `Day ${n}: discussion`, detail: ok ? `Suspects: ${noms.map((id) => nameOf(ps, id)).join(', ')}` : 'The console or the host’s phone picks them',
        ready: ok, why: ok ? '' : 'Pick 2 or 3 suspects', go: { action: 'vote-open', label: 'Open the audience vote' }, blocked: ok ? null : 'Pick 2 or 3 suspects first', manual: true });
    }
    if (f && f.playerId) {
      const said = f.status === 'locked' || f.status === 'passed';
      return S({ key: `${base}:testimony:${f.playerId}:${f.ts || ''}`, title: `${nameOf(ps, f.playerId)} names their suspects`, ready: said, why: said ? '' : 'They’re choosing',
        go: { action: 'next', label: 'Next speaker' }, kind: 'testimony' });
    }
    return S({ key: `${base}:dawn`, title: `Day ${n}: the dawn`, detail: `${alive.length} still living`, go: { action: 'continue', label: 'Start the testimony' }, kind: 'dawn' });
  }
  return S({ key: `cv:${rn}:${ph}`, title: `Phase: ${ph}` });
}

// When Auto takes GO on this screen (ms), or null. since: when the screen came up; readySince: when it became ready.
function autoAt(s, since, readySince, times) {
  const t = Object.assign({}, TIMES, times || {}), ms = (k) => (+t[k] || 0) * 1000;
  if (!s || !s.go || s.manual || s.blocked) return null;
  switch (s.kind) {
    case 'read': return since + ms('read');
    case 'story': return since + ms('story');
    case 'podium': return since + ms('podium');
    case 'nightfall': return since + ms('nightfall');
    case 'nightDone': return since + ms('nightDone');
    case 'dawn': return since + ms('dawn');
    case 'coin': return since + ms('coin');
    case 'verdict': return since + ms('verdict');
    case 'speech': case 'duel': return s.clock ? s.clock + ms('grace') : null;
    case 'window': return s.clock ? s.clock + ms('grace') : since + ms('windowMax');
    case 'pick': {   // when the clock runs out, or a beat after everyone has picked, whichever is first
      const a = s.clock ? s.clock + ms('grace') : null, b = s.ready && readySince ? readySince + ms('pickHold') : null;
      return a && b ? Math.min(a, b) : a || b;
    }
    case 'roles': return s.ready && readySince ? readySince + ms('rolesHold') : since + ms('rolesMax');
    case 'intro': return s.ready && readySince ? readySince + ms('introHold') : since + ms('introMax');
    case 'testimony': return s.ready && readySince ? readySince + ms('testimonyHold') : since + ms('testimonyMax');
    case 'ballot': case 'vote': return null;   // the vote closes on its own clock (night.js)
    default: return null;
  }
}

function screen(g, game, players, vote, opts) { return g === 'le' ? lesserEvil(game, players, vote, opts) : vessels(game, players, vote, opts); }

module.exports = { screen, lesserEvil, vessels, autoAt, TIMES };
