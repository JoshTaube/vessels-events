// ev.js - Vessels Events on the phones. Injected ahead of every game page (player.html, lesser-evil-player.html, the
// TVs) and loaded by /cast and /vote. Pure plumbing; the pages decide what to show.
//
//   EV.rpc(fn, args)     one plain request to the event database (no live connection)
//   EV.device()          a random id kept on this phone (votes, check-in)
//   EV.me()              who this cast phone is ({show, cast_id, name}), set by /cast after the private code
//   EV.gate(room)        on a game page: no cast identity? back to /cast (stops the audience wandering into a seat)
//   EV.joinName()        the exact name a cast phone joins with, so the game's same-name reclaim keeps their seat
//   EV.follow(room)      every 5 s: "I'm here; where's the show?" Moves the phone on when the launcher moves the night
//                        to the other game, and back to /cast when the operator asks for codes again (S6) or another
//                        phone takes this seat over
(function (root) {
  'use strict';
  const cfg = function () { return root.VL_CONFIG || {}; };
  const KEY_ME = 'ev_cast', KEY_DEV = 'ev_device';
  const store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const EV = {};

  EV.rpc = function (fn, args) {
    const c = cfg();
    return fetch(c.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status)); return j; }); });
  };

  EV.device = function () {
    let d = store.get(KEY_DEV);
    if (!d || String(d).length < 16) {
      d = 'd-' + Array.from((root.crypto || {}).getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : [Math.random() * 1e9])
        .map(function (b) { return (b % 256).toString(16).padStart(2, '0'); }).join('') + Date.now().toString(36);
      store.set(KEY_DEV, d);
    }
    return d;
  };

  EV.me = function () { const m = store.get(KEY_ME); return m && m.show && m.cast_id && m.name ? m : null; };
  // redo: the S6 counter this phone joined under (a counter, not a time: phone clocks drift)
  EV.setMe = function (m) { store.set(KEY_ME, { show: m.show, cast_id: m.cast_id, name: m.name, redo: (m.redo && m.redo.n) || 0 }); };
  EV.clearMe = function () { store.del(KEY_ME); };
  EV.joinName = function () { const m = EV.me(); return m ? m.name : null; };

  // Where /cast lives, carrying this phone's show so it never has to ask.
  EV.hub = function (extra) {
    const m = EV.me(), q = [];
    if (m) q.push('s=' + encodeURIComponent(m.show));
    if (extra) q.push(extra);
    return '/cast' + (q.length ? '?' + q.join('&') : '');
  };

  // A game page with no cast identity sends the phone to /cast. Throws to stop the page's own script there.
  EV.gate = function (room) {
    if (EV.me()) return true;
    try { location.replace(EV.hub(room ? 'room=' + encodeURIComponent(room) : '')); } catch (e) {}
    throw new Error('ev-gate: no cast code on this phone, sent to /cast');
  };

  // The heartbeat and the follow. Runs on the game pages; /cast runs its own copy of the same ping.
  let _following = null;
  EV.follow = function (room, page) {
    const m = EV.me();
    if (!m || _following) return;
    _following = setInterval(function () { EV.pingOnce(room, page); }, 5000);
    EV.pingOnce(room, page);
  };
  EV.pingOnce = function (room, page) {
    const m = EV.me();
    if (!m) return Promise.resolve(null);
    return EV.rpc('ev_ping', { p_show: m.show, p_cast: m.cast_id, p_device: EV.device() }).then(function (r) {
      if (!r) return r;
      if (r.ok === false) {                                            // another phone took this seat, or the roster changed
        EV.clearMe(); location.replace(EV.hub(r.reason === 'replaced' ? 'why=replaced' : 'why=unknown')); return r;
      }
      const redo = r.redo, me = EV.me();
      if (redo && redo.n && me && redo.n > (me.redo || 0) && (redo.who === 'all' || redo.who === me.cast_id)) {
        EV.clearMe(); location.replace(EV.hub('why=redo')); return r;  // S6: enter your code again
      }
      if (room && r.live_room && r.live_room !== room) { location.replace(EV.hub()); return r; }   // the show moved on
      EV.prize(r.prize);
      return r;
    }, function () { return null; });                                  // offline: stay put, the game keeps going
  };

  // ---------------------------------------------------------------------------------------------
  // THE PRIZE (Josh, 2026-10-26): whoever wins Lesser Evil picks their own role for Vessels. Only their phone gets
  // the prize (ev_ping / ev_join), with the night's deal: Demon allowed, never the Final Girl (she isn't dealt).
  // They tap a role and lock it in, once. The words are the 2B player screens' own duty lines (player.html PD_DUTY).
  const ROLES = {
    'host-demon': ['Demon', 'Possess one player each night'],
    priest: ['Priest', 'Reveal one player’s nature each night'],
    nun: ['Nun', 'Protect one player each night'],
    anointed: ['Anointed', 'Survive one attempt on your life'],
    sage: ['Scholar', 'Vote twice every day'],
    hunter: ['Vanquisher', 'Strike one player, once per game'],
    townsfolk: ['Townsfolk', 'No ability. Just your wits'],
  };
  EV.ROLES = ROLES;   // /host names the roles in play the same way
  let _prize = { el: null, hideUntil: 0, sel: null, armed: false, done: false };
  const css = 'position:fixed;inset:0;z-index:2147483000;overflow-y:auto;background:radial-gradient(120% 70% at 50% 0%,rgba(176,127,224,.22),rgba(4,4,10,0) 60%),#04040A;'
    + 'color:#f4f0fa;font-family:Inter,system-ui,sans-serif;padding:max(22px,env(safe-area-inset-top)) 20px 28px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;-webkit-user-select:none;user-select:none';
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  const slab = 'width:100%;max-width:420px;height:58px;border:0;border-radius:16px;font:700 17px Cinzel,serif;letter-spacing:.12em;color:#17091F;background:linear-gradient(#D4A8F5,#B07FE0 45%,#7A4AA8);box-shadow:0 10px 30px rgba(122,74,168,.4)';
  EV.prize = function (prize) {
    if (!prize || !Array.isArray(prize.roles) || !prize.roles.length) { if (_prize.el && !_prize.done) { _prize.el.remove(); _prize.el = null; } return; }
    const locked = prize.pick && typeof prize.pick === 'object' && prize.pick.role;
    if (locked && !_prize.el) return;                      // already chosen: never put it on screen again
    if (!locked && Date.now() < _prize.hideUntil) return;  // "not now"
    if (!_prize.el) { _prize.el = document.createElement('div'); _prize.el.setAttribute('style', css); document.body.appendChild(_prize.el); }
    const el = _prize.el;
    if (locked) {
      _prize.done = true;
      const r = ROLES[prize.pick.role] || [prize.pick.role, ''];
      el.innerHTML = '<div style="font:700 11px Inter,sans-serif;letter-spacing:.3em;color:#B07BFF;margin-top:12vh">LOCKED IN</div>'
        + '<div style="font:600 40px/1.1 Cinzel,serif;letter-spacing:.06em">' + esc(r[0]) + '</div>'
        + '<div style="font:italic 20px/1.35 \'EB Garamond\',Georgia,serif;color:#cfc6dc;max-width:340px">' + esc(r[1]) + '.<br>Keep it to yourself. It’s yours when the roles are dealt.</div>'
        + '<button data-x="done" style="' + slab + ';margin-top:18px">DONE</button>';
      return;
    }
    const sig = JSON.stringify([prize.roles, _prize.sel, _prize.armed]);
    if (el._sig === sig) return;
    el._sig = sig;
    const pick = _prize.sel && ROLES[_prize.sel] ? ROLES[_prize.sel][0] : null;
    el.innerHTML = '<div style="font:700 11px Inter,sans-serif;letter-spacing:.3em;color:#B07BFF;margin-top:4px">YOUR PRIZE</div>'
      + '<div style="font:600 30px/1.12 Cinzel,serif;letter-spacing:.05em">You won Lesser Evil</div>'
      + '<div style="font:italic 19px/1.35 \'EB Garamond\',Georgia,serif;color:#cfc6dc;max-width:360px">Pick your role for Vessels. Only you and the operator will know.</div>'
      + '<div style="display:grid;gap:10px;width:100%;max-width:420px;margin-top:4px">'
      + prize.roles.map(function (k) {
        const r = ROLES[k] || [k, ''], on = _prize.sel === k;
        return '<button data-role="' + esc(k) + '" style="text-align:left;padding:14px 16px;border-radius:16px;border:0;color:#f4f0fa;background:' + (on ? 'rgba(176,123,255,.16)' : 'rgba(255,255,255,.04)')
          + ';box-shadow:inset 0 0 0 ' + (on ? '2px #B07BFF' : '1px rgba(255,255,255,.1)') + '"><div style="font:700 19px Cinzel,serif;letter-spacing:.06em' + (k === 'host-demon' ? ';color:#ff8f8c' : '') + '">' + esc(r[0])
          + '</div><div style="font:500 13px Inter,sans-serif;color:#a99fb8;margin-top:3px">' + esc(r[1]) + '</div></button>';
      }).join('')
      + '</div>'
      + '<button data-x="lock" ' + (pick ? '' : 'disabled ') + 'style="' + slab + (pick ? '' : ';opacity:.45') + ';margin-top:6px">'
      + (pick ? (_prize.armed ? 'TAP AGAIN TO LOCK IN' : 'LOCK IN ' + esc(pick.toUpperCase())) : 'TAP A ROLE') + '</button>'
      + '<div data-x="err" style="min-height:18px;font-size:13px;color:#ff8f8c"></div>'
      + '<button data-x="later" style="border:0;background:none;color:#8d84a0;font:600 12px Inter,sans-serif;letter-spacing:.14em">NOT NOW</button>';
    el.onclick = function (e) {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.role) { _prize.sel = b.dataset.role; _prize.armed = false; EV.prize(prize); return; }
      if (b.dataset.x === 'later') { _prize.hideUntil = Date.now() + 45000; el.remove(); _prize.el = null; return; }
      if (b.dataset.x === 'done') { el.remove(); _prize.el = null; return; }
      if (b.dataset.x === 'lock' && _prize.sel) {
        if (!_prize.armed) { _prize.armed = true; EV.prize(prize); return; }
        const m = EV.me(); if (!m) return;
        b.disabled = true;
        EV.rpc('ev_pick_role', { p_show: m.show, p_cast: m.cast_id, p_device: EV.device(), p_role: _prize.sel }).then(function (r) {
          if (r && (r.ok || r.reason === 'locked')) EV.prize(Object.assign({}, prize, { pick: r.ok ? { role: _prize.sel } : r.pick }));
          else { b.disabled = false; el.querySelector('[data-x="err"]').textContent = 'That didn’t go through. Try again'; }
        }, function () { b.disabled = false; el.querySelector('[data-x="err"]').textContent = 'No connection. Try again'; });
      }
    };
  };

  root.EV = EV;
})(typeof globalThis !== 'undefined' ? globalThis : this);
