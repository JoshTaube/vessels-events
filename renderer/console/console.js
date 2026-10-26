// Vessels Events: the operator console. Draws the show the main process sends and turns keys and clicks into
// commands: Space = GO (in a game cue: the game's next screen), Shift+Space = the next cue, 1-6 = safety cues,
// Esc = clear (or back to the live game), R / E = at a looping cue, another round or move on, Shift+Backspace = back
// (in a game cue: show the previous screen again), A = Manual / Auto, H = hold Auto, V = close the audience vote now.
// The music card and the Stream Deck sheet (Phase 4) send music and deck commands; the Stream Deck's own keys go
// straight to the main process. Nothing here decides anything; the main process, the cue engine and the night (main/night.js, main/director.js) do.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { esc, clock } = VesselsScreens;
  const send = (cmd) => window.vessels.send(cmd);
  let P = null, picker = null;   // the latest state; the open S4/S6 name picker
  let lastErr = null;            // the last refusal, {text, at}

  const SEG = [['1', 'Preshow'], ['2', 'Welcome'], ['3', 'Lesser Evil'], ['4', 'Intermission'], ['5', 'Vessels'], ['6', 'Finale']];
  const ASSET = '../assets/vessels-wordmark.png';
  const wm = (el, h) => { el.innerHTML = `<div class="wordmark" style="height:${h}px"><img src="${ASSET}" alt="VESSELS" onerror="this.outerHTML='&lt;span class=&quot;wm-text&quot; style=&quot;font-size:${Math.round(h * 0.7)}px&quot;&gt;VESSELS&lt;/span&gt;'"></div>`; };
  wm($('wm'), 30); wm($('wmBig'), 90);
  const coin = (p, size) => `<div class="coin" style="width:${size}px;height:${size}px">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="">` : `<span class="ini" style="font-size:${Math.round(size * 0.42)}px">${esc(p.name.charAt(0).toUpperCase())}</span>`}</div>`;
  const fill = (t, cue, st) => String(t || '').replace(/\{round\}/g, cue ? cue.round : 1).replace(/\{game\}/g, (st && st.games) || 1);

  // ---------------------------------------------------------------------------------------------
  function toast(text, bad) {
    const t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' err' : '');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), bad ? 3200 : 2200);
  }
  function status(text, kind) { const s = $('status'); s.textContent = text || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }

  // ---------------------------------------------------------------------------------------------
  function render(p) {
    P = p;
    const show = p.show, st = p.state, v = p.view;
    // problems from the show file: errors (it didn't load) and warnings (it did, but look)
    const pr = p.problems || { errors: [], warnings: [] };
    const pb = $('problems');
    if (pr.errors.length && show) { pb.className = 'problems bad'; pb.innerHTML = `<b>Show file not loaded</b>${pr.errors.map(esc).join(' · ')} <i>(still running the last good one)</i>`; }
    else if (pr.warnings.length && show) { pb.className = 'problems'; pb.innerHTML = `<b>Check</b>${pr.warnings.map(esc).join(' · ')}`; }
    else pb.className = 'problems hidden';
    renderProjector(p);
    if (!show) {
      $('board').classList.add('hidden'); $('empty').classList.remove('hidden');
      $('showName').textContent = 'No show loaded'; $('showMeta').textContent = '';
      const le = $('loadErrs');
      le.classList.toggle('hidden', !pr.errors.length);
      le.innerHTML = pr.errors.length ? `<b>${esc(pr.file || 'That file')} didn’t load:</b><br>${pr.errors.map(esc).join('<br>')}` : '';
      $('rail').innerHTML = '';
      return;
    }
    $('empty').classList.add('hidden'); $('board').classList.remove('hidden');
    $('showName').textContent = show.name;
    $('showMeta').textContent = [show.date, show.venue].filter(Boolean).join(' · ');
    const curSeg = v.current ? v.current.id.charAt(0) : '0';
    $('rail').innerHTML = SEG.map(([k, n]) => `<span class="${k === curSeg ? 'on' + (k === '3' ? ' le' : '') : k < curSeg ? 'done' : ''}">${n}</span>`).join('');

    // NOW
    const c = v.current;
    $('nowId').textContent = c ? c.id : '·';
    $('nowTitle').textContent = c ? fill(c.title, c, st) : 'Standing by';
    $('nowMeta').textContent = c ? [c.segment, c.round > 1 || c.loopTo ? `Round ${c.round}` : '', st.games > 1 && c.id.charAt(0) === '5' ? `Game ${st.games}` : '', (c.screen && c.screen.type) || ''].filter(Boolean).join(' · ') : 'Press GO to start the show';
    const say = c && c.say ? fill(c.say, c, st) : '';
    $('nowLine').textContent = say; $('nowSay').classList.toggle('empty', !say);
    $('timerBox').classList.toggle('hidden', !st.timer);

    // NEXT
    const n = v.next;
    $('nextId').textContent = n ? n.id : '·';
    $('nextTitle').textContent = n ? fill(n.title, n, st) : 'End of the cue list';
    $('nextMeta').textContent = n ? [n.segment, n.kind === 'loop' ? `Round ${n.round}` : '', n.say ? '“' + fill(n.say, n, st) + '”' : ''].filter(Boolean).join(' · ') : '';
    $('nextLock').classList.toggle('hidden', !(n && n.lock));
    $('nextLock').textContent = n && n.lock ? n.lock : '';
    // in a game cue GO plays the game: the next card says what it does there, and where Shift+Space goes
    const D = p.live && p.live.director, ds = D && D.screen;
    if (ds && !ds.end) {
      $('nextId').textContent = '▶';
      $('nextTitle').textContent = ds.go ? (ds.blocked ? ds.blocked : ds.go.label) : (ds.why || 'Waiting for the game');
      $('nextMeta').textContent = 'The game · Shift+Space: ' + (n ? 'next cue ' + n.id + ' ' + fill(n.title, n, st) : 'end of the cue list');
    }

    // a looping cue: the two ways out
    const b = v.branch;
    $('branch').classList.toggle('hidden', !b);
    if (b) {
      const way = b.armed || b.auto;
      $('wayLoop').classList.toggle('on', way === 'loop');
      $('wayLoop').querySelector('b').textContent = `${b.loop.label} · round ${b.loop.round}`;
      $('wayLoop').querySelector('span').textContent = `Back to ${b.loop.cue} ${fill(b.loop.title, { round: b.loop.round }, st)}${b.max != null ? ` (${b.done + 1} of ${b.max + 1} played)` : ''}`;
      $('wayExit').classList.toggle('on', way === 'exit');
      $('wayExit').classList.toggle('hidden', !b.exit);
      if (b.exit) { $('wayExit').querySelector('b').textContent = b.exit.label; $('wayExit').querySelector('span').textContent = `On to ${b.exit.cue} ${fill(b.exit.title, c, st)}`; }
    }

    // GO: red when something stops it
    const blocked = (st.safety && st.safety.full) ? `Clear ${st.safety.full} first (Esc)` : n && n.lock ? 'Locked' : !n ? 'End of the show' : '';
    $('goBtn').classList.toggle('blocked', !!blocked);
    // why GO (or N) was refused stays up for a few seconds: the games update the console several times a second
    if (p.error) lastErr = { text: p.error, at: Date.now() };
    if (lastErr && Date.now() - lastErr.at < 5000 && !(st.flash && st.flash.at > lastErr.at)) status(lastErr.text, 'err');
    else if (st.flash && p.now - st.flash.at < 4000) status(st.flash.text, 'ok');
    else status(blocked);

    // the audience QR in the projector's corner
    const qrOn = st.qr !== false;
    $('qrBtn').classList.toggle('off', !qrOn);
    $('qrBtn').firstChild.textContent = `Corner QR · ${qrOn ? 'on' : 'off'} `;
    $('audUrl').textContent = show.audience ? 'Audience: ' + show.audience.url.replace(/^https:\/\//, '') : '';
    renderCues(show, st, v);
    renderPad(p);
    renderSeats(show, st, p.live);
    renderGame(p);
    renderMusic(p);
    renderDeck(p);
    // host mirror
    $('hvCue').textContent = c ? `${c.id} · ${fill(c.title, c, st)}` : 'Standing by';
    $('hvLine').textContent = say || '';
    $('hvNext').textContent = n ? `Next: ${n.id} ${fill(n.title, n, st)}${n.say ? ' · “' + fill(n.say, n, st) + '”' : ''}` : '';
    // the host's own phone (/host): in or not, and where it goes
    const H = p.live && p.live.host, ago = H && H.seen ? Math.max(0, Math.round((p.now - H.seen) / 1000)) : 0;
    $('hvSt').textContent = !show.hostCode ? 'no host code' : !p.live || !p.live.online ? '' : H && H.live ? 'host phone live'
      : H && H.seen ? `host phone last seen ${ago < 90 ? ago + ' s' : Math.round(ago / 60) + ' min'} ago` : 'host phone not in yet';
    $('hvSt').className = 'hvst' + (H && H.live ? ' ok' : '');
    $('hvUrl').textContent = !show.hostCode ? 'Add "hostCode" to the show file to give the host their phone view'
      : show.audience ? `${show.audience.url.replace(/^https:\/\//, '').replace(/\/vote\/?$/, '')}/host · code ${show.hostCode}` : '';
    tick();
  }

  function renderProjector(p) {
    const sel = $('projSel'), ds = p.displays || [];
    const opts = [['auto', 'Automatic'], ...ds.filter((d) => !d.primary).map((d) => [String(d.id), `${d.label} · ${d.w}×${d.h}`]), ['none', 'No projector (preview window)']];
    const want = p.displayChoice == null ? 'auto' : String(p.displayChoice);
    const html = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    if (sel._html !== html) { sel.innerHTML = html; sel._html = html; }
    sel.value = opts.some(([v]) => v === want) ? want : 'auto';
    const pv = $('pvnote');
    pv.textContent = p.projector ? `Full screen on ${p.projector.label} (${p.projector.w}×${p.projector.h})` : 'No projector found: the audience display is a preview window on this screen. Plug the projector in and it moves there.';
    pv.classList.toggle('warn', !p.projector);
    const box = $('pvbox'), stage = $('pvstage');
    stage.style.transform = `scale(${box.clientWidth / 1920})`;
    if (p.show) VesselsScreens.render(stage, p);
  }

  function renderCues(show, st, v) {
    const ol = $('cues'), curI = st.started ? st.i : -1, nextId = v.next && v.next.id;
    const key = JSON.stringify([show.fingerprint, curI, nextId]);
    if (ol._key === key) return;
    ol._key = key;
    let seg = '', html = '';
    show.cues.forEach((q, i) => {
      const s = q.id.charAt(0);
      if (s !== seg) { seg = s; html += `<li class="seg${s === '3' ? ' le' : ''}">${s}00s · ${esc((SEG.find((x) => x[0] === s) || [0, 'Show'])[1])}</li>`; }
      const cls = ['q', i === curI ? 'cur' : i < curI ? 'past' : '', q.id === nextId && i !== curI ? 'nxt' : ''].join(' ');
      const tags = [q.loopTo ? `<i class="loop">↺ ${esc(q.loopTo)}</i>` : '', q.lock ? '<i class="lock">locked</i>' : '', q.timer ? `<i>${clock(q.timer * 1000)}</i>` : '', `<i>${esc((q.screen && q.screen.type) || 'black')}</i>`].join('');
      html += `<li class="${cls}" data-cue="${esc(q.id)}"><span class="n">${esc(q.id)}</span><span class="t">${esc(String(q.title).replace(/\{(round|game)\}/g, '#'))}</span><span class="tags">${tags}</span></li>`;
    });
    ol.innerHTML = html;
    const cur = ol.querySelector('.cur') || ol.querySelector('.nxt');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function renderPad(p) {
    const s = p.state.safety, defs = p.safety;
    const html = Object.values(defs).map((d) => {
      const on = (d.kind === 'full' && s.full === d.id) || (d.id === 'S4' && s.reconnecting.length);
      const sub = d.id === 'S4' && s.reconnecting.length ? s.reconnecting.join(', ') : d.desc;
      return `<button class="sbtn ${on ? 'on' : ''}" data-s="${d.id}"><b>${d.id} ${esc(d.label)}</b><span>${esc(sub)}</span><kbd>${d.key}</kbd></button>`;
    }).join('');
    if ($('pad')._html !== html) { $('pad').innerHTML = html; $('pad')._html = html; }
    renderPicker();
  }
  function renderPicker() {
    const pk = $('picker');
    if (!picker || !P || !P.show) { pk.classList.add('hidden'); return; }
    pk.classList.remove('hidden');
    const rec = P.state.safety.reconnecting;
    if (picker === 'S4') {
      $('pickTitle').textContent = 'S4 Reconnecting: who? (click again to take them off)';
      $('pickChips').innerHTML = P.show.cast.map((c) => `<button class="${rec.includes(c.name) ? 'on' : ''}" data-pick="${esc(c.name)}">${esc(c.name)}</button>`).join('') + '<button data-pick="__done">Done</button>';
    } else {
      $('pickTitle').textContent = 'S6 Redo name entry: for whom?';
      $('pickChips').innerHTML = '<button data-redo="all">Everyone</button>' + P.show.cast.map((c) => `<button data-redo="${esc(c.id)}">${esc(c.name)}</button>`).join('') + '<button data-redo="__cancel">Cancel</button>';
    }
  }

  // a seat is in by phone (the event database) or by hand; a phone that has gone quiet keeps its seat, dimmed
  function renderSeats(show, st, live) {
    const phones = (live && live.phones) || {}, ph = st.phones || {}, hand = st.checkedIn || {};
    const n = show.cast.filter((c) => hand[c.id] || ph[c.id]).length;
    $('ciCount').textContent = `${n} of ${show.cast.length}${n === show.cast.length ? ' · welcome unlocked' : ''}`;
    const html = show.cast.map((c) => {
      const byPhone = !!ph[c.id], quiet = byPhone && phones[c.id] && !phones[c.id].live, byHand = !!hand[c.id] && !byPhone;
      const tip = byPhone ? (quiet ? 'Checked in · phone quiet' : 'Checked in · phone live') : byHand ? 'Marked by hand' : 'Not in yet';
      return `<button class="seatb${byPhone || byHand ? ' in' : ''}${quiet ? ' quiet' : ''}${byHand ? ' hand' : ''}" data-ci="${esc(c.id)}" title="${esc(c.name + ': ' + tip)}">${coin(c, 46)}<span class="nm">${esc(c.name)}</span></button>`;
    }).join('');
    if ($('seats')._html !== html) { $('seats').innerHTML = html; $('seats')._html = html; }
  }

  // The game: where it is, the one step that moves it on (N), the Core Vessels suspects, and the live vote.
  function renderGame(p) {
    const L = p.live, card = $('gameCard');
    if (!L || !L.online) {
      card.className = 'card game';
      $('gName').textContent = 'The game'; $('gRoom').textContent = '';
      $('gNet').textContent = 'Offline'; $('gNet').className = 'net bad';
      $('gWhere').textContent = 'Offline: the games and votes need the event database';
      $('gHint').textContent = 'config/event.local.json is missing, or the launcher was started with --offline.';
      $('gStep').disabled = true; $('gStepTxt').textContent = 'Nothing to press'; $('gExtra').innerHTML = '';
      $('noms').classList.add('hidden'); $('vbox').classList.add('hidden');
      return;
    }
    const le = L.game === 'le', s = L.step || {}, D = L.director || {}, ds = D.screen;
    card.className = 'card game' + (le ? ' le' : '');
    // Manual / Auto / Hold
    $('gMode').querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === (D.mode || 'manual')));
    $('gHold').classList.toggle('held', !!D.held); $('gHold').disabled = D.mode !== 'auto';
    $('gHold').textContent = D.held ? 'Held' : 'Hold';
    $('gReplay').classList.toggle('hidden', !p.replay);
    if (p.replay) $('gReplay').innerHTML = `REPLAY on the projector: <b>${esc(p.replay.title)}</b> · Space or Esc returns to the live game`;
    $('gTrackBox').classList.toggle('hidden', !ds);
    $('gName').textContent = le ? 'Lesser Evil' : 'Vessels';
    $('gRoom').textContent = L.rooms ? L.rooms[L.game] + (L.made && !L.made[L.game] ? ' · not open yet' : '') : '';
    const net = $('gNet');
    if (L.db && L.db.err) { net.textContent = 'Network trouble'; net.className = 'net bad'; net.title = L.db.err; }
    else if (L.db && L.db.ok) { net.textContent = 'Online'; net.className = 'net ok'; net.title = ''; }
    else { net.textContent = 'Connecting'; net.className = 'net'; net.title = ''; }
    if (ds) {
      // a game cue: the screen on the projector, whether it's ready, its clock, what GO (and Auto) will do
      $('gWhere').textContent = ds.title;
      $('gHint').textContent = [ds.detail, !ds.ready && ds.why && ds.why !== ds.detail ? ds.why : ''].filter(Boolean).join(' · ');
      const st_ = $('gState');
      st_.textContent = ds.end ? 'Game over' : ds.ready ? 'Ready' : 'Waiting';
      st_.className = 'gstate ' + (ds.end ? 'done' : ds.ready ? 'ready' : 'wait');
      $('gClock').dataset.end = ds.clock || '';
      $('gStep').disabled = !ds.go; $('gStep').classList.toggle('blocked', !!ds.blocked);
      $('gStepTxt').textContent = ds.go ? (ds.blocked || ds.go.label) : (ds.why || 'Waiting for the game');
      $('gAuto').dataset.at = D.autoAt || '';
      $('gAuto').dataset.mode = D.mode === 'auto' ? (D.held ? 'held' : ds.manual || ds.end ? 'stop' : 'auto') : 'manual';
      const tr = (D.history || []).slice(-5).map((h) => `<li class="${p.replay && p.replay.title === h.title ? 'shown' : ''}">${esc(h.title)}</li>`).join('') + `<li class="cur">${esc(ds.title)}</li>`;
      if ($('gTrack')._html !== tr) { $('gTrack').innerHTML = tr; $('gTrack')._html = tr; }
    } else {
      // not in a game cue: where the game stands (GO plays it from its game cue)
      $('gWhere').textContent = !L.registered ? 'Setting up tonight’s rooms…' : s.where || '';
      $('gHint').textContent = s.pending ? `Waiting for the screen to take “${s.pending}”…` : (s.hint || '');
      $('gState').textContent = ''; $('gClock').dataset.end = ''; $('gAuto').dataset.at = ''; $('gAuto').dataset.mode = '';
      $('gStep').disabled = true; $('gStep').classList.remove('blocked');
      $('gStepTxt').textContent = 'GO plays the game from its game cue';
    }
    const ex = ((ds ? ds.extra : s.extra) || []).map((e) => `<button data-act="${esc(e.action)}">${esc(e.label)}</button>`).join('');
    if ($('gExtra')._html !== ex) { $('gExtra').innerHTML = ex; $('gExtra')._html = ex; }

    // Core Vessels: pick 2 or 3 suspects during the day, before GO into the vote
    const day = !le && L.phase === 'day';
    $('noms').classList.toggle('hidden', !day);
    if (day) {
      const alive = (L.players || []).filter((x) => !x.out);
      $('nomCount').textContent = L.nominees.length ? `(${L.nominees.length})` : '· pick 2 or 3';
      const nh = alive.map((x) => `<button class="${L.nominees.includes(String(x.id)) ? 'on' : ''}" data-nom="${esc(x.id)}">${esc(x.name)}${x.bot ? ' (bot)' : ''}</button>`).join('');
      if ($('nomChips')._html !== nh) { $('nomChips').innerHTML = nh; $('nomChips')._html = nh; }
    }

    // the vote: live counts for the operator only (the room never sees who's ahead)
    const v = L.vote, recent = v && (v.state !== 'closed' || !v.revealAt || p.now - v.revealAt < 60000);
    $('vbox').classList.toggle('hidden', !recent);
    if (recent) {
      const cast = (p.show && p.show.cast) || [];
      const name = (id) => (v.labels && v.labels[id]) || (cast.find((c) => c.id === id) || {}).name || id;
      const counts = v.counts || {}, total = v.total || 0, max = Math.max(1, ...v.candidates.map((id) => counts[id] || 0));
      const r = v.result || {};
      $('vbox').classList.toggle('closed', v.state === 'closed');
      $('vTitle').textContent = (v.practice ? 'Practice · ' : '') + (v.prompt || 'Audience vote');
      $('vRows').innerHTML = v.candidates.map((id) => `<div class="vrow${v.state === 'closed' && r.winner === id ? ' win' : ''}"><span class="vn">${esc(name(id))}</span><span class="vb"><i style="width:${Math.round(((counts[id] || 0) / max) * 100)}%"></i></span><span class="vc">${counts[id] || 0}</span></div>`).join('');
      const votes = (n) => `${n} vote${n === 1 ? '' : 's'}`;
      $('vTotal').textContent = v.state === 'open' ? `${total} in` : v.state === 'closing' ? 'Closing…' : r.tied ? `Tie · ${votes(total)}` : `Closed · ${votes(total)}`;
      $('vClose').disabled = v.state !== 'open'; $('vExtend').disabled = v.state !== 'open';
      $('vLeft').dataset.end = v.state === 'open' && v.closesAt ? v.closesAt : '';
    }

    // the Lesser Evil winner's prize: their own pick of Vessels role. Theirs to make on their phone; the operator can
    // pick for them (a dead phone). Private: the room never sees it.
    const z = L.prize, ROLE = { 'host-demon': 'Demon', priest: 'Priest', nun: 'Nun', anointed: 'Anointed', sage: 'Scholar', hunter: 'Vanquisher', townsfolk: 'Townsfolk' };
    $('prize').classList.toggle('hidden', !z && !L.prizeNobody);
    if (!z && L.prizeNobody) {   // a test bot won the race: nobody to give the prize to
      $('prize').classList.remove('done');
      $('prizeT').innerHTML = `<b>${esc(L.prizeNobody)}</b> won Lesser Evil · not in the cast, so no prize: Vessels deals at random`;
      if ($('prizeChips')._html !== '') { $('prizeChips').innerHTML = ''; $('prizeChips')._html = ''; }
    }
    if (z) {
      const pick = z.pick && z.pick.role;
      $('prize').classList.toggle('done', !!pick);
      $('prizeT').innerHTML = `Prize: <b>${esc(z.name)}</b> won Lesser Evil · ` + (z.used ? `dealt ${esc(ROLE[pick] || pick || 'at random')}`
        : pick ? `picked <b>${esc(ROLE[pick] || pick)}</b>${z.pick.by === 'operator' ? ' (by you)' : ''}${z.sent ? ' · with the game' : ''}` : 'choosing on their phone…');
      const ch = z.used ? '' : (z.roles || []).map((r) => `<button class="${pick === r ? 'on' : ''}" data-prize="${esc(r)}">${esc(ROLE[r] || r)}</button>`).join('')
        + (pick ? '<button data-prize="">Let them pick again</button>' : '');
      if ($('prizeChips')._html !== ch) { $('prizeChips').innerHTML = ch; $('prizeChips')._html = ch; }
    }
    // the MVP so far (shown to the room on the MVP cue)
    const m = L.mvp;
    $('mvpbox').classList.toggle('hidden', !m);
    if (m) $('mvpTxt').innerHTML = m.players.length ? m.players.map((x) => `<b>${esc(x.name)}</b> · ${x.skill} skill points`).join('<br>') + (m.games > 1 ? `<br>${m.games} games` : '') : 'Nobody has scored a skill point yet';
  }

  // the music card: the night's 8 tracks, what's playing, Fade / Duck / volume, the stingers
  function renderMusic(p) {
    const M = p.music;
    $('musicCard').classList.toggle('hidden', !M);
    if (!M) return;
    $('mOut').textContent = M.out ? 'Out: ' + M.out : '';
    const byBtn = {}; M.tracks.forEach((t) => { byBtn[t.button] = t; });
    const th = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
      const t = byBtn[n], on = M.track && M.track.button === n;
      return `<button class="mt${on ? ' on' : ''}${on && M.fading ? ' fading' : ''}${!t || t.missing ? ' miss' : ''}" data-track="${n}" title="${t ? esc(t.name) + (t.missing ? ': the file isn’t there' : t.loop ? ' (loops)' : ' (plays once)') : 'No track on this button'}"><i>${n}</i><span>${t ? esc(t.name) : '·'}</span></button>`;
    }).join('');
    if ($('mTracks')._html !== th) { $('mTracks').innerHTML = th; $('mTracks')._html = th; }
    $('mTracks').classList.toggle('ingame', !!M.gameOn);
    $('mNowT').textContent = M.track ? (M.fading ? 'Fading: ' : '') + M.track.name : 'Silence';
    $('mNowT').parentNode.parentNode.classList.toggle('on', !!M.track);
    $('mFade').disabled = !M.track || M.fading;
    $('mDuck').classList.toggle('on', !!M.duck);
    $('mDuck').textContent = M.duck ? 'Ducked' : 'Duck';
    $('mVol').textContent = M.db === 0 ? 'Full' : `${M.db} dB`;
    $('mUp').disabled = !!M.full; $('mDn').disabled = !!M.lowest;
    const sh = [1, 2, 3, 4].map((n) => {
      const s = M.stingers[n - 1];
      return `<button class="${!s || s.missing ? 'miss' : ''}" data-sting="${n}" title="${s ? esc(s.name) : 'No stinger'}">${s ? esc(s.name) : '·'}</button>`;
    }).join('');
    if ($('mStings')._html !== sh) { $('mStings').innerHTML = sh; $('mStings')._html = sh; }
    const hint = M.gameOn ? 'A game is on the projector: it plays its own music. Stingers, Duck and the volume still work.' : '';
    $('mHint').textContent = hint; $('mHint').classList.toggle('hidden', !hint);
  }

  // the Stream Deck and sound sheet: the 15-key pages with the night's names, test mode, keys another app holds
  function renderDeck(p) {
    const D = p.deck, M = p.music;
    if (!D) return;
    $('dOut').textContent = M && M.out ? M.out : 'the laptop’s main output';
    for (const [page, el] of [['main', $('dMain')], ['music', $('dMusic')]]) {
      const ks = D.keys.filter((k) => k.page === page).sort((a, b) => a.slot - b.slot);
      const h = ks.map((k) => k.id
        ? `<button class="dk${k.id === 'go' ? ' dkgo' : ''}${k.id === 'panic' ? ' panic' : ''}${D.failed.includes(k.key) ? ' bad' : ''}" data-id="${esc(k.id)}" title="${esc(D.actions[k.id] || '')}"><b>${esc(k.label)}</b><kbd>${esc(k.key)}</kbd></button>`
        : `<div class="dk nav"><b>${esc(k.folder ? 'Music folder' : 'Back')}</b></div>`).join('');
      if (el._html !== h) { el.innerHTML = h; el._html = h; }
    }
    $('dTestMode').checked = !!D.test;
    const note = $('dNote');
    if (D.failed.length) { note.className = 'dnote warn'; note.textContent = `Another app already uses ${D.failed.join(', ')}: those keys won’t reach the launcher until it lets go (close it, then restart the launcher).`; }
    else if (D.test) { note.className = 'dnote on'; note.textContent = 'Test mode: press each Stream Deck key. Its tile lights here; nothing happens in the show.'; }
    else { note.className = 'dnote'; note.textContent = 'Every key is ready.'; }
  }

  // timers and clocks between state updates
  function tick() {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (!P || !P.state) return;
    const st = P.state, first = (st.log || []).find((x) => x.a === 'go');
    $('runtime').textContent = st.started && first ? `Show time ${clock(Date.now() - first.t)}` : '';
    const t = st.timer, left = t ? t.start + t.secs * 1000 - Date.now() : 0;
    [$('timerTxt'), $('hvTimer')].forEach((el) => { el.textContent = t ? clock(left) : ''; el.classList.toggle('low', !!t && left < 10000); });
    VesselsScreens.tick($('pvstage'));
    const vl = $('vLeft'), end = +(vl.dataset.end || 0);
    vl.textContent = end ? clock(end - Date.now()) : '';
    const gc = $('gClock'), ge = +(gc.dataset.end || 0), gl = ge - Date.now();
    gc.textContent = ge ? clock(gl) : ''; gc.classList.toggle('low', !!ge && gl < 10000);
    const ga = $('gAuto'), at = +(ga.dataset.at || 0), md = ga.dataset.mode;
    ga.innerHTML = md === 'auto' ? (at ? `Auto moves on in <b>${clock(Math.max(0, at - Date.now()))}</b>` : 'Auto: waiting for the screen to be ready')
      : md === 'held' ? 'Held: Auto waits on this screen (H to resume)' : md === 'stop' ? 'Auto stops here: GO when you’re ready'
      : md === 'manual' ? 'Manual: the game waits for GO' : '';
    // the music's place in its track (the player says where it started; a looping bed wraps)
    const M = P.music, mt = M && M.track;
    if (mt && M.dur) {
      let pos = M.pos + (Date.now() - M.at) / 1000;
      if (mt.loop) pos %= M.dur; else pos = Math.min(pos, M.dur);
      $('mNowP').textContent = `${clock(pos * 1000)} / ${clock(M.dur * 1000)}`;
      $('mBar').style.width = (100 * pos / M.dur).toFixed(1) + '%';
    } else { $('mNowP').textContent = ''; $('mBar').style.width = '0%'; }
    // the Stream Deck sheet in test mode: the key just pressed lights for a moment
    const DK = P.deck;
    document.querySelectorAll('#deckSheet .dk').forEach((el) => el.classList.toggle('hit', !!(DK && DK.test && DK.last && DK.last.id === el.dataset.id && Date.now() - DK.last.at < 1500)));
  }
  setInterval(tick, 250);
  addEventListener('resize', () => { if (P) renderProjector(P); });

  // ---------------------------------------------------------------------------------------------
  // commands
  async function go(cueOnly) {
    $('goBtn').classList.add('hit'); setTimeout(() => $('goBtn').classList.remove('hit'), 120);
    const r = await send(cueOnly ? { type: 'go', cue: true } : { type: 'go' });
    if (r && r.error) toast(r.error, true);
  }
  const inGame = () => !!(P && P.live && P.live.director && P.live.director.screen);
  async function dir(cmd) { const r = await send(cmd); if (r && r.error) toast(r.error, true); }
  async function safety(id) {
    if (id === 'S4' || id === 'S6') { picker = picker === id ? null : id; renderPicker(); return; }
    const r = await send({ type: 'safety', id });
    if (r && r.error) toast(r.error, true);
  }
  $('goBtn').onclick = () => go();
  $('qrBtn').onclick = () => send({ type: 'qr' });
  $('backBtn').onclick = () => send({ type: 'back' });
  $('extendBtn').onclick = () => safety('S5');
  $('wayLoop').onclick = () => send({ type: 'arm', way: 'loop' });
  $('wayExit').onclick = () => send({ type: 'arm', way: 'exit' });
  $('pad').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) safety(b.dataset.s); };
  $('pickChips').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pick === '__done' || b.dataset.redo === '__cancel') { picker = null; renderPicker(); return; }
    if (b.dataset.pick) { await send({ type: 'safety', id: 'S4', name: b.dataset.pick }); return; }
    if (b.dataset.redo) { const r = await send({ type: 'safety', id: 'S6', who: b.dataset.redo }); picker = null; renderPicker(); if (r && r.error) toast(r.error, true); }
  };
  $('seats').onclick = (e) => { const b = e.target.closest('[data-ci]'); if (b) send({ type: 'checkin', id: b.dataset.ci }); };
  // the game
  async function engine(action) {
    const r = await send(action ? { type: 'engine', action } : { type: 'engine' });
    if (r && r.error) toast(r.error, true);
  }
  $('gStep').onclick = () => go();   // the game's next screen: the same as Space
  $('gMode').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) dir({ type: 'director-mode', mode: b.dataset.mode });
    else if (b.dataset.hold) dir({ type: 'director-hold' });
  };
  $('gBack').onclick = () => dir({ type: 'replay-back' });
  $('gExtra').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b) engine(b.dataset.act); };
  $('nomChips').onclick = (e) => { const b = e.target.closest('[data-nom]'); if (b) send({ type: 'nominee', id: b.dataset.nom }); };
  $('prizeChips').onclick = async (e) => {
    const b = e.target.closest('[data-prize]'); if (!b) return;
    const role = b.dataset.prize, who = P && P.live && P.live.prize && P.live.prize.name;
    if (role && !confirm(`Pick ${b.textContent} for ${who}? Their phone stops offering a choice.`)) return;
    const r = await send({ type: 'prize-pick', role }); if (r && r.error) toast(r.error, true);
  };
  const closeVote = async () => { const r = await send({ type: 'vote-close' }); if (r && r.error) toast(r.error, true); };
  $('vClose').onclick = closeVote;
  $('vExtend').onclick = () => safety('S5');
  // while a game is on the projector, the preview shows a picture of it (the game itself runs only there)
  window.vessels.onThumb((url) => { const im = $('pvthumb'); if (url) im.src = url; im.classList.toggle('hidden', !url); });
  $('cues').ondblclick = async (e) => {
    const li = e.target.closest('[data-cue]'); if (!li || !P) return;
    const id = li.dataset.cue, q = P.show.cues.find((x) => x.id === id);
    if (!confirm(`Jump to ${id} ${q.title}?`)) return;
    let r = await send({ type: 'jump', cue: id });
    if (r && r.error && /Locked/.test(r.error) && confirm(`${r.error}.\n\nJump there anyway?`)) r = await send({ type: 'jump', cue: id, force: true });
    if (r && r.error) toast(r.error, true);
  };
  $('projSel').onchange = () => { const v = $('projSel').value; send({ type: 'set-display', id: v === 'auto' ? null : v === 'none' ? 'none' : Number(v) }); };
  $('menuBtn').onclick = (e) => { e.stopPropagation(); $('menuPop').classList.toggle('hidden'); };
  document.addEventListener('click', () => $('menuPop').classList.add('hidden'));
  $('mOpen').onclick = () => send({ type: 'open-show' });
  $('openBtn').onclick = () => send({ type: 'open-show' });
  $('mReload').onclick = async () => { const r = await send({ type: 'reload-show' }); toast(r && r.ok ? 'Show file reloaded' : (r && r.error) || 'Couldn’t reload', !(r && r.ok)); };
  $('mReset').onclick = () => send({ type: 'reset-show' });

  // the music card
  const music = async (op, n) => { const r = await send({ type: 'music', op, n }); if (r && r.error) toast(r.error, true); };
  $('mTracks').onclick = (e) => { const b = e.target.closest('[data-track]'); if (b) music('play', +b.dataset.track); };
  $('mStings').onclick = (e) => { const b = e.target.closest('[data-sting]'); if (b) music('sting', +b.dataset.sting); };
  $('mFade').onclick = () => music('fade');
  $('mDuck').onclick = () => music('duck');
  $('mDn').onclick = () => music('vol', -1);
  $('mUp').onclick = () => music('vol', 1);
  // the Stream Deck and sound sheet: test mode goes off when it closes
  const sheetOpen = () => !$('deckSheet').classList.contains('hidden');
  const closeSheet = () => { $('deckSheet').classList.add('hidden'); if (P && P.deck && P.deck.test) send({ type: 'deck-test', on: false }); };
  $('mDeckBtn').onclick = () => $('deckSheet').classList.remove('hidden');
  $('deckClose').onclick = closeSheet;
  $('deckSheet').onclick = (e) => { if (e.target === $('deckSheet')) closeSheet(); };
  $('dTest').onclick = () => music('test');
  $('dTestMode').onchange = () => send({ type: 'deck-test', on: $('dTestMode').checked });
  document.querySelector('#deckSheet .decks').onclick = async (e) => {
    const b = e.target.closest('.dk[data-id]'); if (!b) return;
    const r = await send({ type: 'deck-press', id: b.dataset.id });
    if (r && r.error) toast(r.error, true);
  };

  // a clicked button or the projector menu keeps the keyboard otherwise, and Space would press it instead of GO
  document.addEventListener('click', (e) => { if (e.target.closest('button')) e.target.closest('button').blur(); }, true);
  $('projSel').addEventListener('change', () => $('projSel').blur());

  addEventListener('keydown', (e) => {
    // the setup sheet: Esc closes it, and the show's keys wait (the Stream Deck's keys still work)
    if (sheetOpen()) { if (e.key === 'Escape') closeSheet(); return; }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.target.tagName === 'SELECT' && e.code !== 'Space' && e.key !== 'Escape') return;
    if (e.target.tagName === 'SELECT') e.target.blur();
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    if (e.code === 'Space') { e.preventDefault(); go(e.shiftKey); return; }
    if (e.key === 'Escape') {
      if (picker) { picker = null; renderPicker(); return; }
      if (P && P.replay) { dir({ type: 'replay-live' }); return; }
      send({ type: 'clear' }).then((r) => r && r.error && status(r.error)); return;
    }
    if (/^[1-6]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); safety('S' + e.key); return; }
    if (e.key === 'Backspace' && e.shiftKey) { e.preventDefault(); if (inGame()) dir({ type: 'replay-back' }); else send({ type: 'back' }); return; }
    if ((e.key === 'a' || e.key === 'A') && P && P.live && P.live.online) { dir({ type: 'director-mode', mode: P.live.director && P.live.director.mode === 'auto' ? 'manual' : 'auto' }); return; }
    if ((e.key === 'h' || e.key === 'H') && P && P.live && P.live.online) { dir({ type: 'director-hold' }); return; }
    if ((e.key === 'q' || e.key === 'Q') && P && P.show) { send({ type: 'qr' }); return; }
    if ((e.key === 'v' || e.key === 'V') && P && P.show) { closeVote(); return; }
    if ((e.key === 'r' || e.key === 'R') && P && P.view && P.view.branch) { send({ type: 'arm', way: 'loop' }); return; }
    if ((e.key === 'e' || e.key === 'E') && P && P.view && P.view.branch) { send({ type: 'arm', way: 'exit' }); return; }
  });

  window.vessels.onState(render);
})();
