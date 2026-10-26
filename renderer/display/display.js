// Vessels Events: the audience display window. Fits the 1920x1080 stage to whatever the projector is (letterboxed,
// never stretched) and draws whatever the main process says is live. When it's the preview window on the laptop
// (no projector), the show keys work here too, so focus can't strand the operator.
//
// Phase 2: the game TVs (tv.html, lesser-evil-tv.html) run here, full window, underneath the launcher's own screens,
// from the laptop's web server. A game cue uncovers its TV; everything else (titles, votes, safety cards, the corner
// QR) draws on top. A TV is created once per room and never reloaded by a state update, so a game is never restarted
// by accident; it goes when the show moves past its game.
(function () {
  'use strict';
  const stage = document.getElementById('stage'), pv = document.getElementById('pv'), box = document.getElementById('engines');
  function fit() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }
  addEventListener('resize', fit); fit();

  const frames = {};   // game:room -> iframe
  let shown = null;
  function engines(list) {
    const want = new Set();
    shown = null;
    for (const e of list || []) {
      const key = e.game + ':' + e.room;
      want.add(key);
      let f = frames[key];
      if (!f) {
        f = document.createElement('iframe');
        f.src = e.url;   // set once: the TV rewrites its own address, and a room must never be created twice
        // autoplay, but NOT fullscreen: a full-screen element sits in the browser's top layer, above everything the
        // launcher draws (the safety cards, the vote screens, Back's pictures). The projector window is full screen
        // already. (Core Vessels' TV asks for it when its game starts; found 2026-10-26.)
        f.allow = 'autoplay';
        f.dataset.game = e.game;
        f.addEventListener('load', () => { f.dataset.ready = '1'; sync(); });
        box.appendChild(f);
        frames[key] = f;
      }
      f.classList.toggle('on', !!e.visible);
      if (e.visible) shown = f;
    }
    for (const k of Object.keys(frames)) if (!want.has(k)) { frames[k].remove(); delete frames[k]; }
    sync();
  }
  // the game cue uncovers its TV once it has loaded (until then the launcher's game card holds the room)
  function sync() { document.body.classList.toggle('gameon', !!(shown && shown.dataset.ready)); }

  window.vessels.onState((p) => {
    engines(p.engines);
    VesselsScreens.render(stage, p);
    document.body.classList.toggle('preview', !p.onProjector);
    pv.classList.toggle('hidden', !!p.onProjector);
  });
  // and if anything takes the page full screen anyway, take it back: the launcher's layers must stay on top
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
  // Back: an earlier screen of the game shown again; null returns to the live game
  const rp = document.getElementById('replay');
  window.vessels.onReplay((url) => { if (url) rp.src = url; else rp.removeAttribute('src'); document.body.classList.toggle('replaying', !!url); });
  setInterval(() => VesselsScreens.tick(stage), 250);
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); window.vessels.send({ type: 'go' }); }
    else if (e.key === 'Escape') window.vessels.send({ type: 'clear' });
    else if (/^[1-3]$/.test(e.key)) window.vessels.send({ type: 'safety', id: 'S' + e.key });
  });
})();
