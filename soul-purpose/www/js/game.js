/* SOUL PURPOSE — screens, the swipe engine, the reorganize round and the results.
 * Build step 1-3: placeholder art (CSS beans), text-only results.
 */
(function () {
  'use strict';
  const { data, scoring, sfx } = window.SP;
  const T = scoring.TUNING;
  const CAP = T.SIDE_CAPACITY;
  const TOTAL = T.SOULS_PER_TYPE * 2;

  // Feel knobs (these change how it plays, not how it scores).
  const FEEL = {
    TYPE_MS_PER_CHAR: 18,    // confession typewriter speed; the decision clock starts when it finishes
    WOBBLE_DEADZONE: 0.08,   // fraction of arena width either side of center before a drag "points" at a side
    COMMIT_FRACTION: 0.28,   // drag past this fraction of the arena width to send the soul
    FLICK_SPEED: 0.6,        // or flick faster than this (px/ms) ...
    FLICK_MIN_PX: 40,        // ... after at least this far
    QUIP_MS: 2600,           // how long Gary's bubble stays up
    QUIP_GAP: [4, 5],        // Gary speaks every 4 or 5 souls
    FAST_MS: 1500,           // a "fast" decision, for picking quips
    SLOW_MS: 3500,           // a "slow" decision, for picking quips
    HESITATE_MS: 6000,       // over this, Gary calls out the soul by name
    VERDICT_PAUSE_MS: 1300,  // the drum roll before THE LIGHT/DARK PLACE
  };

  const LAST_KEY = 'soulPurpose.last';
  const DEBUG = new URLSearchParams(location.search).has('debug');

  const app = document.getElementById('app');
  const stage = document.getElementById('stage');
  let run = null;
  let cleanup = [];

  // ---------------- helpers ----------------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function go(screen, ...args) {
    cleanup.forEach((f) => f());
    cleanup = [];
    stage.innerHTML = '';
    screen(...args);
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    cleanup.push(() => clearTimeout(id));
    return id;
  }
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  }
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';
  const pad2 = (n) => String(n).padStart(2, '0');

  function loadLast() {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveLast(v) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }

  // ---------------- placeholder art ----------------
  function beanHTML(hue, cls = '') {
    return `<div class="bean ${cls}" style="--body:hsl(${hue} 75% 74%)"><i class="eye"></i><i class="eye"></i><i class="mouth"></i></div>`;
  }
  function garyHTML(cls = '') {
    return `<div class="gary ${cls}" role="img" aria-label="Gary, a tired grey cloud">
      <div class="gary-cloud"><i class="eye"></i><i class="eye"></i><i class="mouth"></i></div><i class="tie"></i><div class="mug"></div></div>`;
  }

  // ---------------- mute (every screen) ----------------
  const muteBtn = document.getElementById('mute');
  function paintMute() {
    muteBtn.classList.toggle('is-muted', sfx.muted);
    muteBtn.setAttribute('aria-label', sfx.muted ? 'Sound off. Tap to turn on' : 'Sound on. Tap to mute');
    muteBtn.setAttribute('aria-pressed', String(sfx.muted));
  }
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.setMuted(!sfx.muted);
    sfx.unlock();
    sfx.play('tap');
    paintMute();
  });
  paintMute();
  document.addEventListener('pointerdown', () => sfx.unlock(), { passive: true });

  // ---------------- run ----------------
  function newRun() {
    const souls = scoring.drawSouls(data.SOULS).map((s) => Object.assign(s, { hue: randInt(0, 359) }));
    return {
      souls,
      universeDark: scoring.universeDark(souls), // stored once, ties already broken
      records: {},
      counts: { light: 0, dark: 0 },
      index: 0,
      placement: null,
      swaps: 0,
      reorgMs: 0,
      quips: { next: randInt(...FEEL.QUIP_GAP), used: [], wobbleSaid: false },
    };
  }

  // ======================= TITLE =======================
  function titleScreen() {
    const last = loadLast();
    const lastLine = last && data.ARCHETYPES[last.archetype]
      ? `<p class="last-result">Last shift: ${esc(data.ARCHETYPES[last.archetype].name)}, headed to ${esc(data.PLACES[last.place].name)}</p>`
      : '';
    const node = el(`<section class="screen title-screen">
      <div class="title-ghosts">${beanHTML(190, 'bob')}${beanHTML(325, 'bob bob-2')}${beanHTML(48, 'bob bob-3')}</div>
      <h1 class="logo">SOUL<br>PURPOSE</h1>
      <p class="tagline">Afterlife Front Desk<br>New Clerk Orientation</p>
      <button class="btn btn-big" data-act="play">PLAY</button>
      ${lastLine}
      ${DEBUG ? '<button class="btn btn-small" data-act="auto">Debug: auto-sort 20 souls</button>' : ''}
    </section>`);
    stage.appendChild(node);
    node.querySelector('[data-act=play]').addEventListener('click', () => { sfx.play('tap'); go(introScreen); });
    const auto = node.querySelector('[data-act=auto]');
    if (auto) auto.addEventListener('click', () => { run = autoSortedRun(); go(reorgScreen); });
  }

  // ======================= INTRO =======================
  function introScreen() {
    const beats = data.GARY.intro;
    let i = 0;
    const node = el(`<section class="screen intro-screen">
      <button class="btn btn-small skip" data-act="skip">SKIP</button>
      ${garyHTML('gary-big bob')}
      <div class="speech"><p class="speech-text"></p></div>
      <p class="hint">tap to continue</p>
      <div class="beat-dots">${beats.map(() => '<i></i>').join('')}</div>
    </section>`);
    stage.appendChild(node);
    const text = node.querySelector('.speech-text');
    const dots = node.querySelectorAll('.beat-dots i');
    const show = () => {
      text.textContent = beats[i];
      dots.forEach((d, k) => d.classList.toggle('on', k <= i));
      text.parentElement.classList.remove('pop'); void text.offsetWidth; text.parentElement.classList.add('pop');
    };
    const start = () => { run = newRun(); go(sortScreen); };
    node.querySelector('[data-act=skip]').addEventListener('click', (e) => { e.stopPropagation(); sfx.play('tap'); start(); });
    node.addEventListener('click', () => {
      sfx.play('tap');
      i++;
      if (i >= beats.length) start(); else show();
    });
    show();
  }

  // ======================= SORTING ROUND =======================
  function sortScreen() {
    const node = el(`<section class="screen sort-screen">
      <header class="sort-top">
        <div class="counter counter-dark"><span>DARK</span><b data-count="dark">0/${CAP}</b></div>
        <div class="ticket"><small>NOW SERVING</small><b data-ticket>01</b></div>
        <div class="counter counter-light"><span>LIGHT</span><b data-count="light">0/${CAP}</b></div>
      </header>
      <div class="arena">
        <div class="door door-dark" data-door="dark"><span class="door-label">THE DARK PLACE</span><span class="full-sign">FULL</span></div>
        <div class="door door-light" data-door="light"><span class="door-label">THE LIGHT PLACE</span><span class="full-sign">FULL</span></div>
        <div class="card-slot"></div>
      </div>
      <div class="sort-buttons">
        <button class="btn btn-dark" data-act="dark" aria-label="Send to the Dark Place">&larr; DARK</button>
        <button class="btn btn-light" data-act="light" aria-label="Send to the Light Place">LIGHT &rarr;</button>
      </div>
      <div class="gary-dock">${garyHTML('gary-small')}<div class="gary-bubble" aria-live="polite"></div></div>
    </section>`);
    stage.appendChild(node);

    const arena = node.querySelector('.arena');
    const slot = node.querySelector('.card-slot');
    const ticket = node.querySelector('[data-ticket]');
    const doors = { light: node.querySelector('[data-door=light]'), dark: node.querySelector('[data-door=dark]') };
    const counters = { light: node.querySelector('[data-count=light]'), dark: node.querySelector('[data-count=dark]') };
    const buttons = { light: node.querySelector('[data-act=light]'), dark: node.querySelector('[data-act=dark]') };
    const bubble = node.querySelector('.gary-bubble');
    let cur = null;
    let sayTimer = null;

    function say(text) {
      bubble.textContent = text;
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      clearTimeout(sayTimer);
      sayTimer = later(() => bubble.classList.remove('pop'), FEEL.QUIP_MS);
    }

    function paintCounts() {
      for (const side of ['light', 'dark']) {
        counters[side].textContent = run.counts[side] + '/' + CAP;
        const full = run.counts[side] >= CAP;
        doors[side].classList.toggle('full', full);
        buttons[side].classList.toggle('is-full', full);
        buttons[side].innerHTML = full
          ? (side === 'dark' ? '&larr; FULL' : 'FULL &rarr;')
          : (side === 'dark' ? '&larr; DARK' : 'LIGHT &rarr;');
      }
    }

    function glow(frac) {
      const p = Math.max(0, Math.min(1, Math.abs(frac) / FEEL.COMMIT_FRACTION));
      doors.light.style.setProperty('--glow', frac > 0 ? p : 0);
      doors.dark.style.setProperty('--glow', frac < 0 ? p : 0);
    }

    function nextSoul() {
      const soul = run.souls[run.index];
      ticket.textContent = pad2(run.index + 1);
      const card = el(`<div class="card" role="group" aria-label="Soul ${run.index + 1} of ${TOTAL}: ${esc(soul.name)}">
        <div class="card-fig">${beanHTML(soul.hue, 'bob')}<span class="prop-tag">holding ${esc(soul.propLabel)}</span></div>
        <h2 class="soul-name">${esc(soul.name)}</h2>
        <div class="bubble"><p class="confession"></p></div>
        <p class="excuse">&ldquo;${esc(soul.excuse)}&rdquo;</p>
      </div>`);
      slot.appendChild(card);
      card.animate([{ transform: 'translateY(40px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });

      const c = { soul, card, wobbles: 0, bounced: false, lastSide: 0, appearAt: null, busy: false, typer: null };
      cur = c;
      c.typer = typewrite(card.querySelector('.confession'), soul.confession, () => {
        if (c.appearAt === null) c.appearAt = performance.now(); // the decision clock starts here
        card.querySelector('.excuse').classList.add('show');
      });
      cleanup.push(() => c.typer.cancel());

      attachSwipe(card, arena, {
        canDrag: () => cur === c && !c.busy,
        onDrag(frac) {
          // Wobble = the drag switches from pointing at one side to pointing at the other.
          const side = frac > FEEL.WOBBLE_DEADZONE ? 1 : frac < -FEEL.WOBBLE_DEADZONE ? -1 : 0;
          if (side !== 0) {
            if (c.lastSide !== 0 && side !== c.lastSide) c.wobbles++;
            c.lastSide = side;
          }
          glow(frac);
          const toward = frac > 0 ? 'light' : 'dark';
          doors[toward].classList.toggle('warn', Math.abs(frac) > FEEL.WOBBLE_DEADZONE && run.counts[toward] >= CAP);
        },
        onTap() { c.typer.finish(); },
        onRelease(dir) {
          if (dir) decide(dir);
          else { snapBack(card); glow(0); clearWarn(); }
        },
      });
    }

    function clearWarn() { doors.light.classList.remove('warn'); doors.dark.classList.remove('warn'); }

    function decide(dir) {
      const c = cur;
      if (!c || c.busy) return;
      const now = performance.now();
      glow(0); clearWarn();

      if (run.counts[dir] >= CAP) {
        // Full door: bounce back with a buzz. The forced change of direction isn't a wobble.
        c.bounced = true;
        c.lastSide = 0;
        bounceBack(c.card, dir);
        doors[dir].classList.remove('slam'); void doors[dir].offsetWidth; doors[dir].classList.add('slam');
        sfx.play('buzz');
        say(data.GARY.bounce);
        return;
      }

      c.busy = true;
      const decisionMs = c.appearAt === null ? 0 : Math.max(0, Math.round(now - c.appearAt));
      c.typer.finish();
      run.records[c.soul.id] = { choice: dir, decisionMs, wobbles: c.wobbles, bounced: c.bounced };
      run.counts[dir]++;
      const filled = run.counts[dir] === CAP;
      paintCounts();
      sfx.play(dir);
      flyOff(c.card, dir, arena.clientWidth).then(() => {
        c.card.remove();
        afterCommit(c, filled);
      });
    }

    function afterCommit(c, filled) {
      const rec = run.records[c.soul.id];
      const q = run.quips;
      run.index++;
      if (run.index >= TOTAL) { later(() => go(reorgScreen), 450); return; }

      if (filled) {
        sfx.play('full');
        say(data.GARY.doorFull);
        q.next = run.index + randInt(...FEEL.QUIP_GAP);
      } else if (rec.wobbles > 0 && !q.wobbleSaid) {
        q.wobbleSaid = true;
        say(data.GARY.wobble);
        q.next = run.index + randInt(...FEEL.QUIP_GAP);
      } else if (run.index >= q.next) {
        say(pickQuip(rec, c.soul));
        q.next = run.index + randInt(...FEEL.QUIP_GAP);
      }
      nextSoul();
    }

    function pickQuip(rec, soul) {
      if (rec.decisionMs > FEEL.HESITATE_MS) return data.GARY.hesitated.replace('{name}', soul.name);
      const speed = rec.decisionMs < FEEL.FAST_MS ? 'fast' : rec.decisionMs > FEEL.SLOW_MS ? 'slow' : 'mid';
      const fits = data.GARY.quips.filter((x) => !x.when || x.when === speed);
      let fresh = fits.filter((x) => !run.quips.used.includes(x.text));
      if (!fresh.length) { run.quips.used = []; fresh = fits; }
      const choice = pick(fresh);
      run.quips.used.push(choice.text);
      return choice.text;
    }

    buttons.light.addEventListener('click', () => decide('light'));
    buttons.dark.addEventListener('click', () => decide('dark'));
    listen(document, 'keydown', (e) => {
      if (e.key === 'ArrowRight') decide('light');
      else if (e.key === 'ArrowLeft') decide('dark');
    });

    paintCounts();
    nextSoul();
  }

  function typewrite(node, text, done) {
    // The untyped rest is laid out but invisible, so the bubble never changes size while typing.
    node.innerHTML = '<span class="typed"></span><span class="untyped"></span>';
    const typed = node.firstChild;
    const untyped = node.lastChild;
    untyped.textContent = text;
    let i = 0;
    let finished = false;
    const id = setInterval(() => {
      i++;
      typed.textContent = text.slice(0, i);
      untyped.textContent = text.slice(i);
      if (i >= text.length) finish();
    }, FEEL.TYPE_MS_PER_CHAR);
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(id);
      typed.textContent = text;
      untyped.textContent = '';
      done();
    }
    return { finish, cancel: () => clearInterval(id) };
  }

  // ---------------- swipe engine ----------------
  function attachSwipe(card, arena, h) {
    let id = null, x0 = 0, y0 = 0, dx = 0, dy = 0, lastX = 0, lastT = 0, vx = 0, moved = false;
    card.addEventListener('pointerdown', (e) => {
      if (id !== null || !h.canDrag()) return;
      id = e.pointerId;
      try { card.setPointerCapture(id); } catch (err) { /* ignore */ }
      x0 = lastX = e.clientX; y0 = e.clientY; lastT = e.timeStamp;
      dx = dy = vx = 0; moved = false;
      card.getAnimations().forEach((a) => a.cancel());
      card.classList.add('dragging');
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      dx = e.clientX - x0; dy = e.clientY - y0;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      const dt = e.timeStamp - lastT;
      if (dt > 0) vx = 0.7 * ((e.clientX - lastX) / dt) + 0.3 * vx;
      lastX = e.clientX; lastT = e.timeStamp;
      const w = arena.clientWidth || 1;
      card.style.transform = `translate(${dx}px, ${dy * 0.2}px) rotate(${(dx / w) * 18}deg)`;
      h.onDrag(dx / w);
    });
    const end = (e, cancelled) => {
      if (e.pointerId !== id) return;
      id = null;
      card.classList.remove('dragging');
      if (!moved) { h.onTap(); h.onRelease(null); return; }
      const w = arena.clientWidth || 1;
      let dir = null;
      if (!cancelled) {
        const far = Math.abs(dx) > w * FEEL.COMMIT_FRACTION;
        const flick = Math.abs(vx) > FEEL.FLICK_SPEED && Math.abs(dx) > FEEL.FLICK_MIN_PX && Math.sign(vx) === Math.sign(dx);
        if (far || flick) dir = dx > 0 ? 'light' : 'dark';
      }
      h.onRelease(dir);
    };
    card.addEventListener('pointerup', (e) => end(e, false));
    card.addEventListener('pointercancel', (e) => end(e, true));
  }

  function snapBack(card) {
    const from = card.style.transform || 'none';
    card.style.transform = '';
    card.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  }
  function bounceBack(card, dir) {
    const from = card.style.transform || 'none';
    const s = dir === 'light' ? 1 : -1;
    card.style.transform = '';
    card.animate([
      { transform: from },
      { transform: `translateX(${s * -24}px) rotate(${s * -4}deg)`, offset: 0.35 },
      { transform: `translateX(${s * 12}px) rotate(${s * 2}deg)`, offset: 0.6 },
      { transform: `translateX(${s * -5}px)`, offset: 0.8 },
      { transform: 'none' },
    ], { duration: 420, easing: 'ease-out' });
  }
  function flyOff(card, dir, w) {
    const from = card.style.transform || 'none';
    const s = dir === 'light' ? 1 : -1;
    const a = card.animate([
      { transform: from, opacity: 1 },
      { transform: `translate(${s * w * 1.25}px, ${dir === 'light' ? -60 : 60}px) rotate(${s * 28}deg)`, opacity: 0 },
    ], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    return a.finished.catch(() => {});
  }

  // ======================= REORGANIZE =======================
  function reorgScreen() {
    run.placement = {};
    run.swaps = 0;
    run.souls.forEach((s) => { run.placement[s.id] = run.records[s.id].choice; });
    const t0 = performance.now();
    const sel = { light: null, dark: null };

    const node = el(`<section class="screen reorg-screen">
      <header class="reorg-top">
        ${garyHTML('gary-small')}
        <div class="gary-bubble pop static">${esc(data.GARY.reorganize)}</div>
      </header>
      <p class="reorg-help">Tap one soul in each column to swap them.</p>
      <p class="reorg-detail" aria-live="polite">&nbsp;</p>
      <div class="cols">
        <div class="col col-dark"><h3>DARK</h3><div class="col-list" data-col="dark"></div></div>
        <div class="col col-light"><h3>LIGHT</h3><div class="col-list" data-col="light"></div></div>
      </div>
      <footer class="reorg-foot">
        <span class="swap-count">Swaps: <b>0</b></span>
        <button class="btn btn-big" data-act="lock">LOCK IT IN</button>
      </footer>
    </section>`);
    stage.appendChild(node);
    const lists = { light: node.querySelector('[data-col=light]'), dark: node.querySelector('[data-col=dark]') };
    const detail = node.querySelector('.reorg-detail');
    const swapCount = node.querySelector('.swap-count b');

    function paint(flash = []) {
      for (const side of ['dark', 'light']) {
        lists[side].innerHTML = run.souls
          .filter((s) => run.placement[s.id] === side)
          .map((s) => `<button class="mini${sel[side] === s.id ? ' selected' : ''}${flash.includes(s.id) ? ' just-swapped' : ''}" data-id="${s.id}">
              <i class="dot" style="--body:hsl(${s.hue} 75% 74%)"></i><b>${esc(s.name)}</b><span>${esc(s.confession)}</span></button>`)
          .join('');
      }
    }

    node.querySelector('.cols').addEventListener('click', (e) => {
      const b = e.target.closest('.mini');
      if (!b) return;
      const id = b.dataset.id;
      const soul = run.souls.find((s) => s.id === id);
      const side = run.placement[id];
      detail.innerHTML = `<b>${esc(soul.name)}:</b> ${esc(soul.confession)}`;
      sel[side] = sel[side] === id ? null : id;
      if (sel.light && sel.dark) {
        const a = sel.light, d = sel.dark;
        run.placement[a] = 'dark';
        run.placement[d] = 'light';
        run.swaps++;
        swapCount.textContent = run.swaps;
        sel.light = sel.dark = null;
        sfx.play('swap');
        paint([a, d]);
      } else {
        sfx.play('tap');
        paint();
      }
    });

    node.querySelector('[data-act=lock]').addEventListener('click', () => {
      run.reorgMs = Math.round(performance.now() - t0);
      sfx.play('reveal');
      go(resultsScreen, null);
    });

    paint();
  }

  // ======================= RESULTS =======================
  function resultsScreen(forced) {
    const s = scoring.score(run);
    const archetype = forced ? forced.archetype : s.archetype;
    const place = forced ? forced.place : s.place;
    if (!forced) saveLast({ archetype, place, at: Date.now() });
    const A = data.ARCHETYPES[archetype];
    const HOME = data.HOMES[archetype][place];
    const P = data.PLACES[place];
    const G = data.GARY;
    const axis = {
      petty: 'Petty', bigPicture: 'Big Picture', snap: 'Snap', ponder: 'Ponder', firm: 'Firm', wobbly: 'Wobbly',
    };
    const chips = forced
      ? [A.petty ? 'Petty' : 'Big Picture', A.snap ? 'Snap' : 'Ponder', A.firm ? 'Firm' : 'Wobbly']
      : [axis[s.choices], axis[s.speed], axis[s.certainty]];

    const steps = [
      {
        html: `<p class="kicker">Shift report</p>
          <p class="gary-says">&ldquo;${esc(G.resultsOpen)}&rdquo;</p>
          <dl class="stats">
            <div><dt>Average decision</dt><dd>${fmtSec(s.avgMs)}</dd></div>
            <div><dt>Wobbles</dt><dd>${s.totalWobbles}</dd></div>
            <div><dt>Swaps</dt><dd>${s.swaps}</dd></div>
            <div><dt>Bounces off a full door</dt><dd>${s.bounces}</dd></div>
          </dl>${forced ? '<p class="forced-note">Debug: forced result</p>' : ''}`,
      },
      {
        html: `<p class="kicker">You are...</p>
          <div class="title-card">
            <h2 class="arch-name">${esc(A.name)}</h2>
            <p class="arch-title">${esc(A.title)}</p>
          </div>
          <p class="arch-desc">${esc(A.description)}</p>
          <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>`,
      },
      {
        html: `<p class="gary-says">&ldquo;${esc(G.verdictLead)}&rdquo;</p>
          <h2 class="verdict verdict-${place}">${esc(P.shout)}</h2>
          ${!forced && s.garyLine ? `<p class="gary-says gary-extra">&ldquo;${esc(G[s.garyLine])}&rdquo;</p>` : ''}`,
        enter(view, step) {
          // Drum roll: the place appears after a pause (a tap shows it right away).
          step.busy = true;
          const v = view.querySelector('.verdict');
          const extra = view.querySelector('.gary-extra');
          const show = () => {
            if (!step.busy) return;
            step.busy = false;
            v.classList.add('show');
            if (extra) extra.classList.add('show');
            sfx.play(place);
          };
          step.skip = show;
          later(show, FEEL.VERDICT_PAUSE_MS);
        },
      },
      {
        html: `<p class="kicker">Your new home in ${esc(P.name)}</p>
          <div class="home-art home-${place}" aria-hidden="true"><span>illustration<br>coming in the art pass</span></div>
          <h2 class="home-name">${esc(HOME.name)}</h2>
          <p class="home-desc">${esc(HOME.description)}</p>`,
      },
      {
        last: true,
        html: `<div class="summary summary-${place}">
            <p class="kicker">Soul Purpose: clerk file</p>
            <h2 class="arch-name">${esc(A.name)}</h2>
            <p class="summary-line">is going to <b>${esc(P.name)}</b></p>
            <p class="summary-line">and will live in <b>${esc(HOME.name)}</b></p>
          </div>
          <button class="btn btn-big" data-act="again">PLAY AGAIN</button>
          <button class="btn btn-small" data-act="title">Back to title</button>`,
      },
    ];

    const node = el(`<section class="screen results-screen">
      <div class="results-gary">${garyHTML('gary-small bob')}</div>
      <div class="reveal" aria-live="polite"></div>
      <p class="hint">tap to continue</p>
      <div class="beat-dots">${steps.map(() => '<i></i>').join('')}</div>
    </section>`);
    stage.appendChild(node);
    const view = node.querySelector('.reveal');
    const hint = node.querySelector('.hint');
    const dots = node.querySelectorAll('.beat-dots i');
    let i = -1;

    function next() {
      const step = steps[i];
      if (step && step.busy) { step.skip(); return; }
      if (step && step.last) return;
      i++;
      const st = steps[i];
      view.innerHTML = st.html;
      view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
      dots.forEach((d, k) => d.classList.toggle('on', k <= i));
      hint.style.visibility = st.last ? 'hidden' : 'visible';
      if (st.enter) st.enter(view, st);
      if (i > 0) sfx.play('tap');
      if (st.last) {
        view.querySelector('[data-act=again]').addEventListener('click', (e) => { e.stopPropagation(); sfx.play('tap'); run = newRun(); go(sortScreen); });
        view.querySelector('[data-act=title]').addEventListener('click', (e) => { e.stopPropagation(); sfx.play('tap'); go(titleScreen); });
      }
    }
    node.addEventListener('click', next);

    // Hidden debug panel: tap Gary 5 times.
    let taps = 0, tapTimer = null;
    node.querySelector('.results-gary').addEventListener('click', (e) => {
      e.stopPropagation();
      const g = e.currentTarget.firstElementChild;
      g.classList.remove('poke'); void g.offsetWidth; g.classList.add('poke');
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 1500);
      if (taps >= 5) { taps = 0; openDebug(s, forced); }
    });

    next();
  }

  // ---------------- debug panel ----------------
  function openDebug(s, forced) {
    const universe = new Set(run.universeDark);
    const rows = run.souls.map((soul, k) => {
      const r = run.records[soul.id];
      const fin = run.placement[soul.id];
      return `<tr class="${fin}">
        <td>${k + 1}</td><td>${esc(soul.name)}</td><td>${soul.type}</td><td>${soul.badness}${universe.has(soul.id) ? '*' : ''}</td>
        <td>${r.choice[0].toUpperCase()}</td><td>${fin[0].toUpperCase()}${fin !== r.choice ? '!' : ''}</td>
        <td>${r.decisionMs}</td><td>${r.wobbles}</td><td>${r.bounced ? 'yes' : ''}</td></tr>`;
    }).join('');
    const kv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const archOptions = Object.keys(data.ARCHETYPES)
      .map((k) => `<option value="${k}"${k === (forced ? forced.archetype : s.archetype) ? ' selected' : ''}>${esc(data.ARCHETYPES[k].name)}</option>`).join('');
    const placeVal = forced ? forced.place : s.place;

    const panel = el(`<div class="debug" role="dialog" aria-label="Debug panel">
      <div class="debug-inner">
        <div class="debug-head"><b>DEBUG</b><button class="btn btn-small" data-act="close">Close</button></div>
        <dl class="debug-kv">
          ${kv('avg decisionMs', Math.round(s.avgMs))}
          ${kv('total decisionMs', s.totalMs)}
          ${kv('wobbles', s.totalWobbles)}
          ${kv('bounces', s.bounces)}
          ${kv('swaps', s.swaps)}
          ${kv('reorganize time', fmtSec(run.reorgMs))}
          ${kv('doubt = W + 2S + B', s.doubt + ' (firm if &le; ' + T.FIRM_MAX_DOUBT + ')')}
          ${kv('P sent Dark', s.pDark)}
          ${kv('H sent Dark', s.hDark)}
          ${kv('pettyScore', s.pettyScore.toFixed(2))}
          ${kv('choices', s.choices)}
          ${kv('speed', s.speed + ' (snap if &lt; ' + T.SNAP_MAX_AVG_MS + 'ms)')}
          ${kv('certainty', s.certainty)}
          ${kv('archetype', s.archetype)}
          ${kv('fairness', s.fairness + '/10')}
          ${kv('verdictScore', s.verdictScore + ' (light if &ge; ' + T.LIGHT_MIN_SCORE + ')')}
          ${kv('place', s.place)}
          ${kv('Gary line', s.garyLine || 'none')}
        </dl>
        <table class="debug-table">
          <thead><tr><th>#</th><th>soul</th><th>T</th><th>bad</th><th>swipe</th><th>final</th><th>ms</th><th>wob</th><th>bnc</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="debug-note">* = in the universe's Dark 10. ! = moved in the reorganize round.</p>
        <div class="debug-force">
          <b>Force a result</b>
          <select data-f="archetype">${archOptions}</select>
          <select data-f="place"><option value="light"${placeVal === 'light' ? ' selected' : ''}>The Light Place</option><option value="dark"${placeVal === 'dark' ? ' selected' : ''}>The Dark Place</option></select>
          <button class="btn btn-small" data-act="force">Show forced result</button>
          <button class="btn btn-small" data-act="real">Show real result</button>
        </div>
      </div>
    </div>`);
    app.appendChild(panel);
    const close = () => panel.remove();
    cleanup.push(close);
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('[data-act=close]').addEventListener('click', close);
    panel.querySelector('[data-act=force]').addEventListener('click', () => {
      const f = { archetype: panel.querySelector('[data-f=archetype]').value, place: panel.querySelector('[data-f=place]').value };
      go(resultsScreen, f);
    });
    panel.querySelector('[data-act=real]').addEventListener('click', () => go(resultsScreen, null));
  }

  // ---------------- debug: a random finished sorting round ----------------
  function autoSortedRun() {
    const r = newRun();
    const sides = scoring.shuffle(Array(CAP).fill('light').concat(Array(CAP).fill('dark')), Math.random);
    r.souls.forEach((soul, k) => {
      r.records[soul.id] = { choice: sides[k], decisionMs: randInt(700, 6000), wobbles: Math.random() < 0.15 ? 1 : 0, bounced: false };
    });
    r.counts = { light: CAP, dark: CAP };
    r.index = TOTAL;
    return r;
  }

  // Expose a little for automated playtests.
  window.SP.game = { get run() { return run; }, FEEL };

  go(titleScreen);
})();
