// Vessels Events: the cue engine. Pure state, no Electron: the main process owns one, feeds it actions, saves what it
// returns and sends it to the windows. Same input, same output, so it's unit-tested and a crash can resume exactly.
//
// The cue sheet is a plain ordered list (show.cues). A cue can loop back to an earlier cue, the way a QLab GOTO does:
// that's how rounds repeat (one Lesser Evil round per prompt, Vessels night after night, a replay of the whole game
// with the same cast). At a looping cue GO takes the default branch; the operator can arm the other one first.
//
// Safety cues (S1-S6) sit on top of the show and never move it. S1-S3 take over the projector until cleared; S4 is a
// lower-third that can hold several names; S5 adds time to the running timer; S6 asks for names to be re-entered.
'use strict';

const SAFETY = {
  S1: { id: 'S1', key: '1', label: 'Hold', kind: 'full', desc: 'Branded hold loop on the projector' },
  S2: { id: 'S2', key: '2', label: 'Technical difficulties', kind: 'full', desc: 'Technical difficulties card' },
  S3: { id: 'S3', key: '3', label: 'Be right back', kind: 'full', desc: 'Be right back card' },
  S4: { id: 'S4', key: '4', label: 'Reconnecting', kind: 'lower', desc: 'Reconnecting [name] overlay' },
  S5: { id: 'S5', key: '5', label: 'Extend vote', kind: 'action', desc: 'Add time to the running vote or timer' },
  S6: { id: 'S6', key: '6', label: 'Redo name entry', kind: 'action', desc: 'Ask cast phones to enter names again' },
};
const SEGMENTS = { 1: 'Preshow', 2: 'Welcome', 3: 'Lesser Evil', 4: 'Intermission', 5: 'Vessels', 6: 'Finale' };
const GO_LOCKOUT_MS = 600;      // a second GO this soon after the last one is ignored (a bounced spacebar)
const EXTEND_SECS = 30;
const LOG_MAX = 400;

const segmentOf = (id) => SEGMENTS[String(id).charAt(0)] || 'Show';

// How many times a looping cue sends GO back (null = until the operator takes the exit).
function loopCount(show, cue) {
  if (!cue.loopTo) return 0;
  if (cue.loopTimes === 'prompts') return Math.max(0, ((show.lesserEvil && show.lesserEvil.prompts) || []).length - 1);
  if (typeof cue.loopTimes === 'number') return Math.max(0, cue.loopTimes);
  return null;
}

function initial(show, now) {
  return {
    v: 1,
    i: 0,                         // the cue that's live (index into show.cues)
    started: false,               // false until the first GO (cue 0 shows as "standing by")
    loops: {},                    // looping cue id -> times it has sent GO back so far
    games: 1,                     // core Vessels plays so far (a replay adds one)
    arm: null,                    // 'loop' | 'exit': the operator's pick for the next looping cue
    gates: { cast: false },       // locks; cast = all cast checked in
    checkedIn: {},                // cast id -> true: marked by hand on the board (a dead phone, a rehearsal)
    phones: {},                   // cast id -> true: checked in from their own phone (the event database)
    timer: null,                  // {cue, start, secs} while a cue's timer runs
    safety: { full: null, reconnecting: [] },
    qr: true,                     // the audience QR in the projector's corner
    lastGo: 0,
    flash: null,                  // a short note for the console {text, at}
    log: [{ t: now, a: 'load' }],
  };
}

const cueAt = (show, i) => show.cues[i] || null;
const indexOf = (show, id) => show.cues.findIndex((c) => c.id === String(id));

// Where GO goes from here, and why it can't (lock), without changing anything.
function nextStep(show, s) {
  if (!s.started) return { i: 0, kind: 'start' };
  const cue = cueAt(show, s.i);
  if (!cue) return null;
  if (cue.loopTo) {
    const max = loopCount(show, cue), done = s.loops[cue.id] || 0;
    const auto = max === null ? 'loop' : done < max ? 'loop' : 'exit';
    const way = s.arm || auto;
    const to = indexOf(show, cue.loopTo);
    if (way === 'loop' && to >= 0) return { i: to, kind: 'loop', via: cue.id, round: done + 2 };
    if (s.i + 1 < show.cues.length) return { i: s.i + 1, kind: 'exit', via: cue.id };
    return null;
  }
  if (s.i + 1 < show.cues.length) return { i: s.i + 1, kind: 'next' };
  return null;
}

// In: by phone or by hand.
const isIn = (s, id) => !!((s.checkedIn && s.checkedIn[id]) || (s.phones && s.phones[id]));
const gateCast = (show, s) => (show.cast || []).length > 0 && show.cast.every((x) => isIn(s, x.id));

function lockOf(show, s, i) {
  const cue = cueAt(show, i);
  if (!cue || !cue.lock) return null;
  if (cue.lock === 'cast' && !s.gates.cast) {
    const n = (show.cast || []).filter((p) => isIn(s, p.id)).length;
    return `Locked until all ${(show.cast || []).length} cast are checked in (${n} so far)`;
  }
  return null;
}

// The round a cue is in: one more than the times the nearest loop around it has sent GO back.
function roundOf(show, s, i) {
  for (let j = i; j < show.cues.length; j++) {
    const c = show.cues[j];
    if (c.loopTo && indexOf(show, c.loopTo) <= i) return (s.loops[c.id] || 0) + 1;
  }
  return 1;
}

function enter(show, s, i, now) {
  const cue = cueAt(show, i);
  s.i = i;
  s.timer = cue && cue.timer ? { cue: cue.id, start: now, secs: cue.timer } : null;
  return s;
}

const clone = (s) => JSON.parse(JSON.stringify(s));
const log = (s, entry) => { s.log.push(entry); if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX); };
const note = (s, text, now) => { s.flash = { text, at: now }; };

// One action in, the next state out (a new object; the old one is untouched). Refusals come back as {state, error}.
function reduce(show, state, action, now) {
  const s = clone(state);
  const fail = (error) => ({ state, error });
  switch (action.type) {
    case 'go': {
      if (s.safety.full) return fail(`Clear ${s.safety.full} (${SAFETY[s.safety.full].label}) before GO`);
      if (s.started && now - s.lastGo < GO_LOCKOUT_MS) return fail('GO ignored (pressed twice)');
      const step = nextStep(show, s);
      if (!step) return fail('End of the cue list');
      const lock = lockOf(show, s, step.i);
      if (lock) return fail(lock);
      if (step.kind === 'loop') {
        const via = cueAt(show, s.i);
        // a loop back over the whole game is a replay: the rounds inside it start again
        const from = step.i;
        show.cues.forEach((c, j) => { if (c.loopTo && j >= from && j < s.i) delete s.loops[c.id]; });
        s.loops[via.id] = (s.loops[via.id] || 0) + 1;
        if (via.replay) s.games += 1;
      } else if (step.kind === 'exit') {
        delete s.loops[cueAt(show, s.i).id];   // so coming back round to it (a replay) loops again from scratch
      }
      s.arm = null;
      s.started = true;
      s.lastGo = now;
      enter(show, s, step.i, now);
      log(s, { t: now, a: 'go', cue: show.cues[step.i].id, kind: step.kind });
      return { state: s };
    }
    case 'back': {
      if (!s.started || s.i === 0) return fail('Already at the first cue');
      enter(show, s, s.i - 1, now);
      log(s, { t: now, a: 'back', cue: show.cues[s.i].id });
      return { state: s };
    }
    case 'jump': {
      const i = indexOf(show, action.cue);
      if (i < 0) return fail(`No cue ${action.cue}`);
      if (!action.force) { const lock = lockOf(show, s, i); if (lock) return fail(lock); }
      s.started = true; s.arm = null;
      enter(show, s, i, now);
      log(s, { t: now, a: 'jump', cue: show.cues[i].id });
      return { state: s };
    }
    case 'arm': {   // pick the branch the next looping cue takes ('loop' | 'exit' | null for its default)
      s.arm = action.way === 'loop' || action.way === 'exit' ? action.way : null;
      return { state: s };
    }
    case 'safety': {
      const def = SAFETY[action.id];
      if (!def) return fail(`No safety cue ${action.id}`);
      if (def.kind === 'full') {
        s.safety.full = s.safety.full === def.id ? null : def.id;   // the same key again clears it
      } else if (def.kind === 'lower') {
        const name = String(action.name || '').trim();
        if (!name) return fail('Pick who is reconnecting');
        const r = s.safety.reconnecting;
        if (r.includes(name)) r.splice(r.indexOf(name), 1); else r.push(name);
      } else if (def.id === 'S5') {
        if (!s.timer) return fail('Nothing is timing right now');
        s.timer.secs += action.secs || EXTEND_SECS;
        note(s, `+${action.secs || EXTEND_SECS} s`, now);
      } else if (def.id === 'S6') {
        s.redoNames = { at: now, who: action.who || 'all' };   // Phase 2 sends this to the cast phones
        note(s, action.who && action.who !== 'all' ? `Name entry reopened for ${action.who}` : 'Name entry reopened for the cast', now);
      }
      log(s, { t: now, a: 'safety', id: def.id, on: def.kind === 'full' ? s.safety.full === def.id : undefined, name: action.name });
      return { state: s };
    }
    case 'clear': {   // Esc: take down the full-screen safety card and the reconnecting banner
      if (!s.safety.full && !s.safety.reconnecting.length) return fail('Nothing to clear');
      s.safety = { full: null, reconnecting: [] };
      log(s, { t: now, a: 'clear' });
      return { state: s };
    }
    case 'checkin': {   // by hand from the board (click again to take it off)
      const p = (show.cast || []).find((x) => x.id === action.id);
      if (!p) return fail('No such cast member');
      if (action.on === false || (action.on == null && s.checkedIn[p.id])) delete s.checkedIn[p.id]; else s.checkedIn[p.id] = true;
      s.gates.cast = gateCast(show, s);
      return { state: s };
    }
    case 'phones': {   // the cast who have checked in from their phones (the whole list, from the event database)
      const ids = new Set((action.ids || []).map(String));
      s.phones = {};
      (show.cast || []).forEach((p) => { if (ids.has(p.id)) s.phones[p.id] = true; });
      s.gates.cast = gateCast(show, s);
      return { state: s };
    }
    case 'qr': {   // the corner QR on or off (Q); a state saved before there was one counts as on
      s.qr = action.on != null ? !!action.on : s.qr === false;
      log(s, { t: now, a: 'qr', on: s.qr });
      return { state: s };
    }
    case 'reset': return { state: initial(show, now) };
    default: return fail(`Unknown action ${action.type}`);
  }
}

// What the windows need: the live cue, what GO does next, locks, the round, the timer.
function view(show, s, now) {
  const step = nextStep(show, s);
  const cur = s.started ? cueAt(show, s.i) : null;
  const nxt = step ? cueAt(show, step.i) : null;
  const t = s.timer ? Math.max(0, s.timer.start + s.timer.secs * 1000 - now) : null;
  return {
    current: cur && Object.assign({}, cur, { segment: segmentOf(cur.id), round: roundOf(show, s, s.i) }),
    next: nxt && Object.assign({}, nxt, { segment: segmentOf(nxt.id), kind: step.kind, round: step.kind === 'loop' ? step.round : roundOf(show, s, step.i),
      lock: lockOf(show, s, step.i) }),
    // at a looping cue: both ways, so the console can offer the other one
    branch: cur && cur.loopTo ? (() => {
      const max = loopCount(show, cur), done = s.loops[cur.id] || 0, back = indexOf(show, cur.loopTo);
      return { loop: { cue: cur.loopTo, title: cueAt(show, back).title, round: done + 2, label: cur.loopLabel || 'Another round' },
        exit: s.i + 1 < show.cues.length ? { cue: show.cues[s.i + 1].id, title: show.cues[s.i + 1].title, label: cur.exitLabel || 'Move on' } : null,
        auto: max === null ? 'loop' : done < max ? 'loop' : 'exit', armed: s.arm, done, max };
    })() : null,
    timerLeft: t,
    checkedIn: show.cast.filter((p) => isIn(s, p.id)).length,
  };
}

module.exports = { SAFETY, SEGMENTS, GO_LOCKOUT_MS, EXTEND_SECS, segmentOf, initial, reduce, view, nextStep, isIn };
