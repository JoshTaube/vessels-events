/* SOUL PURPOSE — sound. Tiny WebAudio blips made in code; no audio files.
 * Placeholder set for now (the sound pass replaces these with the harp twinkle, the bass "bwomp", etc.).
 * Mute state is remembered in localStorage.
 */
(function (root) {
  'use strict';
  const KEY = 'soulPurpose.muted';
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage blocked: default on */ }

  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(c, { freq, to = freq, dur = 0.12, type = 'sine', gain = 0.18, delay = 0 }) {
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    tap:   (c) => tone(c, { freq: 660, to: 880, dur: 0.06, type: 'triangle', gain: 0.12 }),
    light: (c) => { tone(c, { freq: 880, to: 1320, dur: 0.18, type: 'sine' }); tone(c, { freq: 1320, to: 1760, dur: 0.2, delay: 0.07, gain: 0.1 }); },
    dark:  (c) => tone(c, { freq: 220, to: 70, dur: 0.28, type: 'sawtooth', gain: 0.12 }),
    buzz:  (c) => tone(c, { freq: 110, to: 100, dur: 0.25, type: 'square', gain: 0.09 }),
    full:  (c) => { tone(c, { freq: 160, to: 60, dur: 0.3, type: 'square', gain: 0.12 }); },
    swap:  (c) => tone(c, { freq: 500, to: 700, dur: 0.1, type: 'triangle', gain: 0.12 }),
    reveal:(c) => { tone(c, { freq: 523, dur: 0.12 }); tone(c, { freq: 659, dur: 0.12, delay: 0.1 }); tone(c, { freq: 784, dur: 0.2, delay: 0.2 }); },
  };

  root.SP = root.SP || {};
  root.SP.sfx = {
    /** Call from a user gesture so mobile browsers allow audio. */
    unlock() { if (!muted) audio(); },
    play(name) {
      if (muted || !SOUNDS[name]) return;
      const c = audio();
      if (c) { try { SOUNDS[name](c); } catch (e) { /* never let sound break the game */ } }
    },
    get muted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    },
  };
})(typeof self !== 'undefined' ? self : this);
