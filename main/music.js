// Vessels Events: the music (Phase 4). One bed at a time from the show file's 8 tracks (a new one crossfades over the
// last), one-shot stingers over it, a duck for the host's mic and a volume. A hidden window plays it
// (renderer/audio) through the laptop's main output; this is the model the console, the Stream Deck and the tests
// talk to.
//
// The games keep their own music (Josh, 2026-10-26): a track fades out when a game goes on the projector, and a track
// can't start while one is up. The duck and the volume reach the games too, as their TV master volume (0 to 100).
'use strict';
const path = require('path');

const DUCK_DB = -12;        // the host's mic: everything under it
const STEP_DB = 3;          // one volume step
const MIN_DB = -30;         // the lowest the volume goes (full is 0 dB: the files as they are)
const CROSS_MS = 2000;      // a new track over the last
const FADE_MS = 3000;       // Fade
const GAME_FADE_MS = 2500;  // a game takes the projector
const START_MS = 150;       // a first track (no click)
const gainOf = (db) => Math.pow(10, db / 20);
const fmtDb = (db) => (db === 0 ? 'full' : `${db} dB`);

function make(o) {
  // o: { send(msg): to the audio window, onChange(), onLevel(level): the games' master volume, notice(text, bad),
  //      url(file): the file's address for the audio window }
  let tracks = [], stingers = [];
  let seq = 0;   // each play is numbered: what the audio window says about an older one is ignored
  const st = { track: null, fading: false, duck: false, db: 0, gameOn: false, out: null, pos: 0, dur: 0, at: 0 };
  const change = () => o.onChange && o.onChange();
  const musicGain = () => gainOf(st.db + (st.duck ? DUCK_DB : 0));
  const gameLevel = () => Math.max(0, Math.min(100, Math.round(100 * musicGain())));
  const level = (ms) => {
    o.send({ type: 'level', music: musicGain(), stingers: gainOf(st.db), ms });
    if (o.onLevel) o.onLevel(gameLevel());
  };

  function setBank(music) {
    tracks = ((music && music.tracks) || []).slice().sort((a, b) => a.button - b.button);
    stingers = ((music && music.stingers) || []).slice(0, 4);
    change();
  }

  function play(button) {
    const t = tracks.find((x) => x.button === +button);
    if (!t) return { error: `No track on button ${button}` };
    if (t.missing || !t.file) return { error: `${t.name || 'Track ' + t.button}: its file isn’t there (${t.file ? path.basename(t.file) : 'none set'})` };
    if (st.gameOn) return { error: 'A game is on the projector: it plays its own music' };
    if (st.track && st.track.button === t.button && !st.fading) return { ok: true, flash: `${t.name} is already playing` };
    const id = ++seq;
    o.send({ type: 'play', id, url: o.url(t.file), loop: t.loop !== false, ms: st.track ? CROSS_MS : START_MS });
    st.track = { button: t.button, name: t.name || `Track ${t.button}`, id, loop: t.loop !== false };
    Object.assign(st, { fading: false, pos: 0, dur: 0, at: Date.now() });
    change();
    return { ok: true, flash: `Playing ${st.track.name}` };
  }

  function fade(ms, why) {
    if (!st.track) return { error: 'No music playing' };
    if (st.fading) return { ok: true, flash: `${st.track.name} is already fading` };
    st.fading = true;
    o.send({ type: 'fade', id: st.track.id, ms: ms || FADE_MS });
    change();
    return { ok: true, flash: why || `Fading out ${st.track.name}` };
  }

  function duck(on) {
    st.duck = on == null ? !st.duck : !!on;
    level(st.duck ? 300 : 700);
    change();
    return { ok: true, flash: st.duck ? `Ducked (${DUCK_DB} dB) for the mic` : 'Duck off' };
  }

  function vol(dir) {
    const db = Math.max(MIN_DB, Math.min(0, st.db + STEP_DB * Math.sign(+dir || 0)));
    if (db === st.db) return { ok: true, flash: dir > 0 ? 'The volume is at full' : 'The volume is at its lowest' };
    st.db = db;
    level(120);
    change();
    return { ok: true, flash: `Volume ${fmtDb(db)}` };
  }

  function stinger(n) {
    const s = stingers[+n - 1];
    if (!s) return { error: `No stinger ${n}` };
    if (s.missing || !s.file) return { error: `${s.name || 'Stinger ' + n}: its file isn’t there` };
    o.send({ type: 'stinger', url: o.url(s.file), gain: gainOf(st.db) });
    return { ok: true, flash: s.name || `Stinger ${n}` };
  }

  function test() {
    o.send({ type: 'test', gain: gainOf(st.db) });
    return { ok: true, flash: 'Test sound' + (st.out ? ` on ${st.out}` : '') };
  }

  // a game on the projector or not: one going up fades the track out (the game plays its own music)
  function gameOn(on) {
    const was = st.gameOn;
    st.gameOn = !!on;
    if (on && !was && st.track && !st.fading) return fade(GAME_FADE_MS, `${st.track.name} faded out: the game plays its own music`);
    if (was !== st.gameOn) change();
    return null;
  }

  // what the audio window says
  function report(m) {
    if (!m) return;
    if (m.type === 'ready' || m.type === 'gone') {
      // a fresh audio window (first start, or after a crash): it has no track; give it the levels
      if (st.track) { const name = st.track.name; st.track = null; st.fading = false; if (m.type === 'gone') o.notice(`The music stopped (${name}): the audio restarted`, true); }
      if (m.type === 'ready') o.send({ type: 'level', music: musicGain(), stingers: gainOf(st.db), ms: 0 });
      change();
      return;
    }
    if (m.type === 'out') {
      const before = st.out;
      st.out = m.label || null;
      if (before !== st.out) { change(); if (before && st.out) o.notice(`The sound output is now ${st.out}`); }
      return;
    }
    if (m.type === 'stinger-error') { o.notice(`A stinger wouldn’t play: ${m.message || 'the file couldn’t be read'}`, true); return; }
    if (!st.track || m.id !== st.track.id) return;
    if (m.type === 'playing') { st.pos = +m.pos || 0; st.dur = +m.dur || 0; st.at = Date.now(); change(); }
    else if (m.type === 'stopped' || m.type === 'ended') { st.track = null; st.fading = false; change(); }
    else if (m.type === 'error') {
      const name = st.track.name;
      st.track = null; st.fading = false; change();
      o.notice(`${name} wouldn’t play: ${m.message || 'the file couldn’t be read'}`, true);
    }
  }

  function status() {
    return {
      track: st.track && { button: st.track.button, name: st.track.name, loop: st.track.loop }, fading: st.fading,
      duck: st.duck, db: st.db, full: st.db === 0, lowest: st.db === MIN_DB, gameOn: st.gameOn, out: st.out,
      pos: st.pos, dur: st.dur, at: st.at, level: gameLevel(),
      tracks: tracks.map((t) => ({ button: t.button, name: t.name || `Track ${t.button}`, missing: !!t.missing || !t.file, loop: t.loop !== false })),
      stingers: stingers.map((s, i) => ({ n: i + 1, name: s.name || `Stinger ${i + 1}`, missing: !!s.missing || !s.file })),
    };
  }

  return { setBank, play, fade, duck, vol, stinger, test, gameOn, report, status, gameLevel };
}

module.exports = { make, gainOf, DUCK_DB, STEP_DB, MIN_DB, CROSS_MS, FADE_MS, GAME_FADE_MS };
