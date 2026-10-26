// Vessels Events: what the audience sees. One function draws the projector's 1920x1080 stage from the show state;
// the audience display window calls it full screen, and the operator console calls it again into a small live
// preview, so the operator always sees exactly what the room sees.
//
// Two looks, as in production: Vessels (Direction 2B, purple) for the night, and Lesser Evil's own red, white and blue
// for its cues (the 300s, or any cue with screen.theme "lesser-evil"). The safety cards follow whichever is on.
//
// Screens per cue type (title, card, check-in, votes, game, intermission, MVP, download) and the safety layer (S1 hold
// loop, S2 technical difficulties, S3 be right back, S4 reconnecting banner). Phase 2: a "game" cue uncovers the game
// TV running underneath (renderer/display); the card drawn here only shows while it loads, or offline. Votes are live
// (p.live.vote): the faces, how many have voted (never who's ahead: a lead snowballs), the countdown, and the result
// at the shared reveal time. Lesser Evil opens its own ballots, which take over the projector while they're open.
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const fill = (text, v) => String(text || '').replace(/\{round\}/g, v.round || 1).replace(/\{game\}/g, v.game || 1);

  const ASSET = (document.currentScript && document.currentScript.src || '').replace(/shared\/screens\.js.*$/, 'assets/');
  // the VESSELS wordmark (production art, Cinzel if it's missing) and the Lesser Evil logo
  const wordmark = (h) => `<div class="wordmark" style="height:${h}px"><img src="${ASSET}vessels-wordmark.png" alt="VESSELS"
      onerror="this.outerHTML='&lt;span class=&quot;wm-text&quot; style=&quot;font-size:${Math.round(h * 0.72)}px&quot;&gt;VESSELS&lt;/span&gt;'"></div>`;
  const leLogo = (h) => `<div class="lelogo" style="height:${h}px"><img src="${ASSET}lesser_evil_logo.svg" alt="Lesser Evil"></div>`;
  const brand = (le, h) => (le ? leLogo(Math.round(h * 0.9)) : wordmark(h));
  const coin = (p, size) => `<div class="coin" style="width:${size}px;height:${size}px">${p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="">`
      : `<span class="ini" style="font-size:${Math.round(size * 0.42)}px">${esc((p.name || '?').charAt(0).toUpperCase())}</span>`}</div>`;
  // Lesser Evil's frame: the flag stripe top and bottom, the LIVE badge (lesser-evil-tv.html)
  const leFrame = '<div class="le-stripe top"></div><div class="le-stripe bot"></div><div class="le-live"><i></i>LIVE</div>';
  const isLE = (cue) => !!cue && ((cue.screen && cue.screen.theme) ? cue.screen.theme === 'lesser-evil' : String(cue.id).charAt(0) === '3');
  const scr = (cls, le, inner) => `<div class="scr ${cls}${le ? ' le' : ''}">${le ? leFrame : ''}${inner}</div>`;

  // The hold loop: the night's menu loop video if the show file has one, else drifting smoke behind the wordmark.
  // In Lesser Evil it's the navy stage with the logo breathing instead.
  const loop = (show, line, le) => le
    ? scr('loop', true, `<div class="loopmark">${leLogo(150)}${line ? `<div class="tagline">${esc(line)}</div>` : ''}</div>`)
    : `<div class="scr loop">${show && show.media && show.media.menuLoop
      ? `<video class="bgvid" src="${esc(show.media.menuLoop)}" autoplay muted loop playsinline></video>`
      : '<div class="smoke s1"></div><div class="smoke s2"></div><div class="smoke s3"></div>'}
      <div class="loopmark">${wordmark(230)}${line ? `<div class="tagline">${esc(line)}</div>` : ''}</div></div>`;

  // A live vote. Before it closes: the faces, how many have voted and the clock. Closed: "the votes are in" until
  // the shared reveal time, then the bars and the winner (or the tie). No live vote (offline): the faces of the cast.
  const vleft = (lv, now) => (lv && lv.state === 'open' && lv.closesAt ? lv.closesAt - now : null);
  function voteHTML(p, lv, o) {
    const show = p.show, cast = show.cast || [];
    const cands = lv ? lv.candidates : cast.slice(0, 3).map((c) => c.id);
    const label = (id) => (lv && lv.labels && lv.labels[id] != null ? lv.labels[id] : null);
    const kick = (t) => (t ? `<div class="kick">${esc(t)}</div>` : '');
    const revealed = !!(lv && lv.state === 'closed' && lv.result && (!lv.revealAt || p.now >= lv.revealAt));
    const r = (lv && lv.result) || {}, counts = r.counts || {}, total = r.total || 0;
    const sides = cands.some((id) => label(id) != null && !cast.find((c) => c.id === id));
    const face = (id) => {
      const c = cast.find((x) => x.id === id), n = counts[id] || 0, pct = total ? Math.round((n / total) * 100) : 0;
      const win = revealed && !r.tied && r.winner === id, lose = revealed && r.winner && !r.tied && r.winner !== id;
      const bar = revealed ? `<div class="bar"><i style="width:${pct}%"></i></div><div class="pct">${pct}%</div>` : '';
      const cls = 'face' + (c ? '' : ' side') + (win ? ' win' : '') + (lose ? ' lose' : '');
      if (!c) return `<div class="${cls}"><div class="nm">${esc(label(id) || id)}</div>${bar}</div>`;
      return `<div class="${cls}">${coin(c, cands.length > 4 ? 120 : 170)}<div class="nm">${esc(label(id) || c.name)}</div>${bar}</div>`;
    };
    const open = !lv || lv.state === 'open';
    const kickTxt = open ? (o.kicker || (o.practice ? 'Practice vote · it doesn’t count' : o.le ? 'Lesser Evil · the audience decides' : 'The audience decides'))
      : revealed ? (r.tied ? 'Too close to call' : total ? 'The audience has spoken' : 'Voting closed') : 'Voting closed';
    const head = !open && !revealed ? 'The votes are in' : revealed && r.tied ? 'It’s a tie' : revealed && !total ? 'No votes' : (lv && lv.prompt) || o.title;
    const left = vleft(lv, p.now), n = lv ? (open ? lv.total || 0 : total) : 0;
    const count = lv ? `<div class="vcount"><b>${n}</b> ${n === 1 ? 'vote' : 'votes'}${open ? ' in' : ''}</div>` : '';
    const clockEl = left != null ? `<div class="timer" data-vote-end="${lv.closesAt}">${clock(left)}</div>` : (lv ? '' : o.timer);
    const qr = show.audience && show.audience.qr && open
      ? `<div class="bigqr"><div class="tile">${show.audience.qr}</div><div class="cap">Scan to vote</div><div class="url">${esc(shortUrl(show.audience.url))}</div></div>` : '';
    return scr('vote' + (sides ? ' sides' : ''), o.le, `${kick(kickTxt)}<h2>${esc(head)}</h2>${o.sub && open ? `<div class="sub">${esc(o.sub)}</div>` : ''}
      <div class="voterow"><div class="faces n${Math.min(cands.length, 6)}">${cands.map(face).join('')}</div>${qr}</div>
      ${count}${clockEl}`);
  }
  // Lesser Evil's own ballots (mirrored to /vote): the game's ballot screen stays up (each candidate's position, its
  // clock, its audience count) and the vote panel sits beside it, until the shared reveal time
  const gameVote = (p) => { const lv = p.live && p.live.vote; return lv && lv.auto && (lv.state !== 'closed' || (lv.revealAt && p.now < lv.revealAt)) ? lv : null; };

  function screenHTML(p) {
    const show = p.show, v = p.view || {}, cue = v.current, st = p.state || {};
    if (!cue) return '<div class="scr black"></div>';   // standing by: the projector stays dark until the first GO
    const sc = cue.screen || { type: 'black' }, r = { round: cue.round, game: st.games }, le = isLE(cue);
    const kicker = fill(sc.kicker, r), title = fill(sc.title != null ? sc.title : cue.title, r), sub = fill(sc.subtitle, r);
    const timer = st.timer ? `<div class="timer" data-timer>${clock(st.timer.start + st.timer.secs * 1000 - p.now)}</div>` : '';
    const kick = (t) => (t ? `<div class="kick">${esc(t)}</div>` : '');
    switch (sc.type) {
      case 'menu-loop': return loop(show, sc.tagline, le);
      case 'title': {
        // screen.winner "le": Lesser Evil's champion, face and name, once the race has crowned one
        const w = sc.winner === 'le' && p.live && p.live.leWinner, wc = w && (show.cast || []).find((c) => c.id === w.cast_id);
        const champ = w ? `<div class="champ">${wc ? coin(wc, 260) : ''}<div class="nm">${esc(w.name)}</div></div>` : '';
        return scr('title' + (w ? ' crowned' : ''), le, `${sc.logo || sc.wordmark ? brand(le, 190) : ''}${kick(kicker)}
          ${sc.logo && sc.title == null ? '' : `<h1>${esc(title)}</h1>`}${champ}${sub && !w ? `<div class="sub">${esc(sub)}</div>` : ''}${timer}`);
      }
      case 'card':
        return scr('card', le, `${kick(kicker)}<h2>${esc(title)}</h2>${sc.body ? `<p>${esc(fill(sc.body, r))}</p>` : ''}${timer}`);
      case 'checkin': {
        const isIn = (id) => !!((st.checkedIn && st.checkedIn[id]) || (st.phones && st.phones[id]));
        const n = (show.cast || []).filter((c) => isIn(c.id)).length;
        return scr('checkin', le, `${kick(kicker || 'Tonight’s vessels')}<h2>${esc(title)}</h2>
          <div class="cast">${show.cast.map((c) => `<div class="seat ${isIn(c.id) ? 'in' : ''}">${coin(c, 150)}<div class="nm">${esc(c.name)}</div></div>`).join('')}</div>
          <div class="gathered"><span class="sig"></span>${n === show.cast.length ? `All ${n} have gathered` : `${n} of ${show.cast.length} have gathered`}</div>`);
      }
      case 'practice-vote':
      case 'vote': {
        const lv = p.live && p.live.vote, mine = lv && (lv.cue === cue.id || (le && lv.game === 'le')) ? lv : null;
        return voteHTML(p, mine, { le, practice: sc.type === 'practice-vote', kicker, title, sub, timer });
      }
      case 'game':
        return scr('game', le, `${kick((kicker || (le ? 'Lesser Evil' : 'Vessels')) + (cue.round > 1 || sc.showRound ? ` · Round ${cue.round}` : ''))}
          <h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${timer}`);
      case 'intermission':
        return scr('inter', le, `${brand(le, 120)}${kick(kicker || 'Intermission')}<h2>${esc(title)}</h2>
          ${st.timer ? `<div class="big" data-timer>${clock(st.timer.start + st.timer.secs * 1000 - p.now)}</div>` : ''}
          ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`);
      case 'mvp': {
        // the night's best Vessels player by skill points (main/night.js mvp()); a tie: co-MVPs, side by side
        const m = p.live && p.live.mvp, ps = (m && m.players) || [];
        if (!ps.length) {
          return scr('mvp', le, `${kick(kicker || 'Most valuable player')}<h2>${esc(title)}</h2>
            <div class="sub">${m ? 'Nobody scored a skill point tonight' : 'The points are being counted'}</div>`);
        }
        const one = ps.length === 1;
        const card = (x) => {
          const c = (show.cast || []).find((y) => y.id === x.cast_id) || { name: x.name };
          const lines = one ? `<ul class="lines">${x.lines.slice(0, 4).map((l) => `<li><span>${esc(l.label)}</span><b>+${l.pts}</b></li>`).join('')}</ul>` : '';
          return `<div class="mvpc">${coin(c, one ? 300 : 220)}<div class="nm">${esc(x.name)}</div><div class="pts">${x.skill} points</div>${lines}</div>`;
        };
        return scr('mvp' + (one ? '' : ' co'), le, `${kick(kicker || (one ? 'Most valuable player' : 'Co-MVPs'))}<h2>${esc(title)}</h2>
          <div class="mvps">${ps.map(card).join('')}</div>${m.games > 1 ? `<div class="note">Across tonight’s ${m.games} games of Vessels</div>` : ''}`);
      }
      case 'download': {
        const games = sc.games || ['Lesser Evil', 'Vessels'], more = sc.more || ['Sinking Ship'];
        const tile = (g) => /lesser/i.test(g) ? `<div class="g le-g">${leLogo(64)}</div>` : /vessels/i.test(g) ? `<div class="g">${wordmark(92)}</div>` : `<div class="g"><b>${esc(g)}</b></div>`;
        return scr('download', false, `${kick(kicker || 'Take it home')}<h2>${esc(title)}</h2>
          <div class="games">${games.map(tile).join('')}</div>
          <div class="more"><span class="lbl">Also on the app</span>${more.map((g) => /sinking/i.test(g) ? `<img class="ss" src="${ASSET}sinking_ship_logo.png" alt="${esc(g)}">` : `<b>${esc(g)}</b>`).join('')}</div>
          <div class="stores"><span>App Store</span><span>Google Play</span></div>`);
      }
      default: return '<div class="scr black"></div>';
    }
  }

  function safetyHTML(p) {
    const s = (p.state && p.state.safety) || {}, show = p.show, le = isLE(p.view && p.view.current);
    let out = '';
    if (s.full === 'S1') out += `<div class="safe full">${loop(show, '', le)}</div>`;
    if (s.full === 'S2') out += `<div class="safe full">${scr('card td', le, `${brand(le, 120)}<div class="kick">One moment</div><h2>Technical difficulties</h2><p>Stay in your seats. ${le ? 'The candidates will be right back.' : 'The spirits are being difficult.'}</p>`)}</div>`;
    if (s.full === 'S3') out += `<div class="safe full">${scr('card brb', le, `${brand(le, 120)}<div class="kick">Hold that thought</div><h2>Be right back</h2>`)}</div>`;
    if (s.reconnecting && s.reconnecting.length) {
      const names = s.reconnecting, who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      out += `<div class="safe lower${le ? ' le' : ''}"><span class="pulse"></span><span class="kick">Reconnecting</span><b>${esc(who)}</b></div>`;
    }
    return out;
  }

  // The audience QR in the bottom-left corner, all night, so anyone can (re)join the vote: small, soft, themed. It
  // stays up over the safety cards (people rejoin during a hold) and steps aside before the show starts, on a black
  // cue, on vote screens (they show it big) and on the download screen (that QR is for the app). Q turns it off.
  const BIG_QR = ['vote', 'practice-vote', 'download', 'black'];
  function cornerHTML(p) {
    const st = p.state || {}, cue = p.view && p.view.current, aud = p.show && p.show.audience;
    if (!cue || !aud || !aud.qr) return '';
    // a game's own ballot is up: the corner grows into the vote panel (whatever Q says: people need to vote)
    const gv = gameVote(p);
    if (gv) {
      const open = gv.state === 'open', n = open ? gv.total || 0 : ((gv.result && gv.result.total) || gv.total || 0);
      return `<div class="votepanel${gv.game === 'le' ? ' le' : ''}"><div class="vp-k">${open ? 'Vote now' : 'Voting closed'}</div>`
        + `<div class="tile">${aud.qr}</div><div class="cap">Scan to vote</div>`
        + `<div class="vp-n"><b>${n}</b> ${n === 1 ? 'vote' : 'votes'}${open ? ' in' : ''}</div></div>`;
    }
    if (st.qr === false || BIG_QR.includes((cue.screen && cue.screen.type) || 'black')) return '';
    return `<div class="cornerqr${isLE(cue) ? ' le' : ''}"><div class="tile">${aud.qr}</div><div class="cap">Scan to vote</div></div>`;
  }
  const shortUrl = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  const voteKey = (p) => { const v = p.live && p.live.vote; return v ? [v.id, v.state, v.total, v.closesAt, v.revealAt, !!v.revealAt && p.now >= v.revealAt] : null; };
  // Draw into a stage element (1920x1080). Only redraws when something on screen changed, so videos and the smoke
  // keep running; the timers are refreshed by tick().
  function render(stage, p) {
    const st = p.state || {}, v = p.view || {};
    const key = JSON.stringify([v.current && v.current.id, v.current && v.current.round, st.games, st.started, st.safety, st.checkedIn, st.qr,
      st.timer && st.timer.secs, p.show && p.show.fingerprint, p.show && p.show.audience && p.show.audience.url,
      p.show && p.show.cast && p.show.cast.map((c) => c.name + c.photoUrl), st.phones, voteKey(p), p.live && p.live.leWinner, p.live && p.live.mvp]);
    stage._p = p;
    if (stage._key === key) return tick(stage);
    stage._key = key;
    stage.innerHTML = `<div class="layer show">${screenHTML(p)}</div><div class="layer top">${safetyHTML(p)}</div><div class="layer qrl">${cornerHTML(p)}</div>`;
    stage.classList.toggle('held', !!(st.safety && st.safety.full));
  }
  function tick(stage) {
    const p = stage._p, t = p && p.state && p.state.timer;
    stage.querySelectorAll('[data-vote-end]').forEach((el) => { const l = +el.dataset.voteEnd - Date.now(), txt = clock(l); if (el.textContent !== txt) el.textContent = txt; el.classList.toggle('low', l < 10000); });
    // a closed vote's reveal time passing redraws it with the bars and the winner
    const lv = p && p.live && p.live.vote;
    if (lv && lv.state === 'closed' && lv.revealAt && Date.now() >= lv.revealAt && stage._shownReveal !== lv.id) {
      stage._shownReveal = lv.id; render(stage, Object.assign({}, p, { now: Date.now() })); return;
    }
    if (!t) return;
    const left = t.start + t.secs * 1000 - Date.now();
    stage.querySelectorAll('[data-timer]').forEach((el) => { const txt = clock(left); if (el.textContent !== txt) el.textContent = txt; el.classList.toggle('low', left < 10000); });
  }
  window.VesselsScreens = { render, tick, clock, esc, isLE };
})();
