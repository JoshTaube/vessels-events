// Vessels Events: the music's player, in a hidden window. main/music.js sends what to do:
//   play {id, url, loop, ms}   a new bed; whatever is playing fades out under it over ms
//   fade {id, ms}              the bed fades out and stops ("stopped")
//   level {music, stingers, ms} the volume (and the duck) for the beds, and for the stingers
//   stinger {url, gain}        a one-shot over the bed
//   test {gain}                a two-note chime, to check the room can hear the laptop
// and hears back: ready, playing {pos, dur}, ended, stopped, error, out {label} (the output Windows plays to).
// Plain audio elements, their volume moved by a timer: no Web Audio graph, so a local file is never "cross-origin".
(function () {
  'use strict';
  const A = window.vessels.audio;
  const beds = [];           // {id, el, g (0..1 of the bed's own fade), iv, out}
  const shots = new Set();   // stingers still playing (kept so they aren't collected mid-sound)
  let music = 1, stings = 1, levelIv = null;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const setVol = (b) => { try { b.el.volume = clamp(b.g * music); } catch (e) {} };

  function ramp(b, to, ms, then) {
    clearInterval(b.iv);
    const from = b.g, t0 = performance.now();
    if (!ms) { b.g = to; setVol(b); if (then) then(); return; }
    b.iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      b.g = from + (to - from) * k; setVol(b);
      if (k >= 1) { clearInterval(b.iv); b.iv = null; if (then) then(); }
    }, 30);
  }
  function drop(b) {
    clearInterval(b.iv);
    try { b.el.pause(); b.el.removeAttribute('src'); b.el.load(); } catch (e) {}
    const i = beds.indexOf(b); if (i >= 0) beds.splice(i, 1);
  }

  function play(m) {
    for (const b of beds) if (!b.out) { b.out = true; ramp(b, 0, m.ms, () => drop(b)); }
    const el = new Audio();
    const b = { id: m.id, el, g: 0, iv: null, out: false };
    beds.push(b);
    el.loop = !!m.loop; el.preload = 'auto'; setVol(b);
    let told = false;
    const fail = (msg) => { if (told) return; told = true; A.report({ type: 'error', id: m.id, message: msg || 'the file couldn’t be read' }); drop(b); };
    el.addEventListener('playing', () => A.report({ type: 'playing', id: m.id, pos: el.currentTime || 0, dur: isFinite(el.duration) ? el.duration : 0 }), { once: true });
    el.addEventListener('ended', () => { if (!b.out) A.report({ type: 'ended', id: m.id }); drop(b); });
    el.addEventListener('error', () => fail(el.error && el.error.message ? el.error.message.replace(/^[A-Z_]+: ?/, '') : ''));
    el.src = m.url;
    el.play().then(() => ramp(b, 1, m.ms), (e) => fail(e && e.message));
  }

  function fade(m) {
    const b = beds.find((x) => x.id === m.id && !x.out);
    if (!b) { A.report({ type: 'stopped', id: m.id }); return; }
    b.out = true;
    ramp(b, 0, m.ms, () => { drop(b); A.report({ type: 'stopped', id: m.id }); });
  }

  function level(m) {
    stings = clamp(m.stingers);
    clearInterval(levelIv);
    const from = music, to = clamp(m.music), t0 = performance.now();
    if (!m.ms) { music = to; beds.forEach(setVol); return; }
    levelIv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / m.ms);
      music = from + (to - from) * k; beds.forEach(setVol);
      if (k >= 1) { clearInterval(levelIv); levelIv = null; }
    }, 30);
  }

  function stinger(m) {
    const el = new Audio(m.url);
    el.volume = clamp(m.gain != null ? m.gain : stings);
    shots.add(el);
    const done = () => shots.delete(el);
    el.addEventListener('ended', done);
    el.addEventListener('error', () => { done(); A.report({ type: 'stinger-error', message: 'the file couldn’t be read' }); });
    el.play().catch((e) => { done(); A.report({ type: 'stinger-error', message: e && e.message }); });
  }

  // the test: two soft notes, made here (no file needed)
  let ctx = null;
  function test(m) {
    try {
      ctx = ctx || new AudioContext();
      const g = clamp(m.gain != null ? m.gain : 1) * 0.35, t = ctx.currentTime + 0.02;
      [[880, 0], [1318.5, 0.18]].forEach(([f, dt]) => {
        const o = ctx.createOscillator(), v = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        v.gain.setValueAtTime(0, t + dt); v.gain.linearRampToValueAtTime(g, t + dt + 0.02); v.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.9);
        o.connect(v).connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 1);
      });
    } catch (e) {}
  }

  // which output Windows plays to (the launcher shows it, and says when it changes)
  async function out() {
    try {
      const ds = await navigator.mediaDevices.enumerateDevices();
      const outs = ds.filter((d) => d.kind === 'audiooutput');
      const d = outs.find((x) => x.deviceId === 'default') || outs[0];
      A.report({ type: 'out', label: d ? String(d.label || '').replace(/^Default - /, '') || 'the default output' : null });
    } catch (e) { A.report({ type: 'out', label: null }); }
  }
  try { navigator.mediaDevices.addEventListener('devicechange', () => setTimeout(out, 300)); } catch (e) {}

  A.on((m) => {
    if (!m) return;
    if (m.type === 'play') play(m);
    else if (m.type === 'fade') fade(m);
    else if (m.type === 'level') level(m);
    else if (m.type === 'stinger') stinger(m);
    else if (m.type === 'test') test(m);
    else if (m.type === 'out?') out();
  });
  out();
})();
