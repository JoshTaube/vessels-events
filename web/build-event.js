// build-event.js - generate the Vessels Events site from the prod sources.
//
//   node web/build-event.js --show shows/<night>/show.json     build web/_site/ for that night
//   node web/build-event.js --list                             show what would be staged, write nothing
//
// Adapted for Vessels Events (2026-10-26) from Vessels Live's build-event.js (F:\VESSELS\Vessels Live, 2026-09),
// which got the hard parts right and is kept here: the event build is GENERATED, never forked. It reads the
// surfaces the show needs out of ..\..\Vessels_6_12\, repoints them at the event Supabase project, applies the
// anchored event patches, and writes web/_site/. Re-run it and the show picks up every prod fix for free.
//
// What's new for Vessels Events:
//   - the cast hub (/cast: one private code per cast member, follows the show between the two games), the audience
//     vote page (/vote) and its cached "current vote" function (/api/now), instead of Vessels Live's doors,
//     audience.html and narrator.html (the launcher is the narrator now)
//   - the phone pages' assets (art, sounds, fonts) are swept in, so phones look like the real game (the TV runs on
//     the operator's laptop and reads its 380 MB of media from the prod folder directly)
//   - the night's roster and 300 px cast photos go out as static files the vote page preloads
//
// THE FAILURE THIS FILE EXISTS TO PREVENT (Vessels Live's words, still true): a surface shipped to the event site
// still pointing at the production database, so a live audience votes into playvessels.com. Every credential
// rewrite is checked, and a file that should carry credentials and doesn't FAILS THE BUILD.
(function (root) {
  'use strict';

  const B = {};

  // Prod files the show uses. Everything else in that folder stays out.
  B.SURFACES = [
    'tv.html',
    'player.html',
    'lesser-evil-tv.html',
    'lesser-evil-player.html',
    'lesser-evil-host.js',
    'lesser-evil-engine.js',
    'lesser-evil-prompts.js',
    'lesser-evil.css'
  ];
  // The pages phones load: their referenced assets are swept into the site.
  B.PHONE_SURFACES = ['player.html', 'lesser-evil-player.html', 'lesser-evil.css'];

  // Never copied, whatever else happens.
  const DENY = [
    /^deploy\.ps1$/i,
    /\.sql$/i,
    /\.test\.mjs$/i,
    /^local-sb\.js$/i,            // its shim would take the site offline on any host but playvessels.com / netlify
    /^access-gate\.js$/i,
    /^_probe/i, /^_smoke/i, /^_clprobe/i, /^_ssprobe/i, /^_vpprobe/i, /^_graveyard/i, /^_lsmp/i,
    /\.(zip|7z|psd|ai|mov|mkv|avi|mxf|aab|apk|bak.*)$/i
  ];
  B.denied = function (name) { return DENY.some(function (rx) { return rx.test(name.split(/[\\/]/).pop()); }); };
  B.shouldCopy = function (name) { return !B.denied(name) && B.SURFACES.indexOf(name) >= 0; };

  // Point a file at the event project (Vessels Live, verbatim): the prod ref in every supabase.co URL, the prod anon
  // key if configured, and ANY JWT whose payload names the prod project.
  B.repoint = function (src, prod, ev, opts) {
    const evRef = String(ev.url).replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
    let out = src;
    let hits = 0;
    const refRx = new RegExp(prod.ref, 'gi');
    out = out.replace(refRx, function () { hits++; return evRef; });
    if (prod.key) {
      const keyRx = new RegExp(prod.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      out = out.replace(keyRx, function () { hits++; return ev.anonKey; });
    }
    out = out.replace(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g, function (tok, payload) {
      let claims = null;
      try { claims = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')); } catch (e) { return tok; }
      if (!claims || claims.ref !== prod.ref) return tok;
      hits++;
      return ev.anonKey;
    });
    if (opts && opts.require && hits === 0) {
      throw new Error('no supabase credentials found to rewrite - the prod file '
        + 'probably changed shape, and shipping it unrewritten would point the '
        + 'event site at production');
    }
    if (new RegExp(prod.ref, 'i').test(out)) throw new Error('prod project ref survived the rewrite');
    return out;
  };

  // Put the event modules in front of the page's own inline script (Vessels Live, verbatim).
  B.inject = function (html, files) {
    const need = files.filter(function (f) { return html.indexOf('src="' + f + '"') < 0; });
    if (!need.length) return html;
    const tags = need.map(function (f) { return '<script src="' + f + '"></script>'; }).join('\n');
    const at = html.search(/<script(?![^>]*\bsrc=)/i);
    if (at >= 0) return html.slice(0, at) + tags + '\n' + html.slice(at);
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, tags + '\n</head>');
    return tags + '\n' + html;
  };

  // Remove script tags for files the event site doesn't ship (access-gate.js, local-sb.js). Left in, they 404.
  B.stripGate = function (html) {
    return html.replace(/[ \t]*<script[^>]*\bsrc=["'][^"']*(access-gate|local-sb)\.js["'][^>]*>\s*<\/script>[ \t]*\r?\n?/gi, '');
  };

  // Event-only files, from web/site/ (or web/ for the modules shared with Vessels Live).
  B.LOCAL = ['cast.html', 'vote.html', 'ev.js', 'ev.css', 'audience-bridge.js', 'event-mode.js'];
  // Injected ahead of every prod surface's own inline script.
  B.EVENT_MODULES = ['audience-bridge.js', 'event-mode.js', 'event-config.js', 'ev.js'];

  // The runtime config every page loads: the event project's URL and PUBLIC key, the site's own address, the store
  // links. Never the operator key, never the prod ref.
  B.runtimeConfig = function (cfg, showId) {
    if (!cfg || !cfg.supabaseUrl || !cfg.anonKey) throw new Error('config needs supabaseUrl and anonKey');
    if (!/^https:\/\//.test(String(cfg.site || ''))) throw new Error('config needs site (the event site, https://...)');
    return { url: cfg.supabaseUrl, anonKey: cfg.anonKey, site: String(cfg.site).replace(/\/$/, ''), storeLinks: cfg.storeLinks || {},
      show: showId || null };   // tonight (the site is built per night): /cast and /vote fall back to it
  };

  // Netlify routing: the cast hub and the vote page at short addresses. (/api/now is the function's own path.)
  B.REDIRECTS = '/cast  /cast.html  200\n/cast/  /cast.html  200\n/vote  /vote.html  200\n/vote/  /vote.html  200\n';
  // Cast photos and the roster change only between nights; the current-vote function sets its own cache.
  B.HEADERS = '/shows/*\n  Cache-Control: public, max-age=300\n';

  // Every asset a page refers to that exists in the prod folder (quoted names, url(...), sub-folders), recursing
  // into CSS. Missing files are fine (the page has its own fallbacks); only files that exist are copied.
  B.sweep = function (text, exists) {
    const hits = new Set();
    const take = function (raw) {
      let n = raw; try { n = decodeURIComponent(raw); } catch (e) {}
      n = n.replace(/^\.?\//, '');
      if (n && !B.denied(n) && exists(n)) hits.add(n);
    };
    const rxFile = /["'(\/]([A-Za-z0-9_][A-Za-z0-9_ .%-]*\.(?:png|jpe?g|webp|svg|gif|mp3|wav|ogg|m4a|mp4|webm|woff2?|ttf|otf|css|json))["')?#]/g;
    const rxDir = /["'(]\.?\/?((?:fonts|vendor|img|images|sfx|audio)\/[A-Za-z0-9_ .%-]+)["')]/g;
    let m;
    while ((m = rxFile.exec(text))) take(m[1]);
    while ((m = rxDir.exec(text))) take(m[1]);
    B.scripts(text, exists).forEach(function (s) { hits.add(s); });
    return hits;
  };
  // The page's own scripts (<script src>). player-2b.js is the Direction 2B player design: miss it and phones fall
  // back to the old look. Found 2026-10-26: Vessels Live's build never copied these. The TVs need theirs too
  // (graveyard-engine.js, prison-map.js...), but not their media, which the launcher serves from the prod folder.
  B.scripts = function (text, exists) {
    const hits = new Set();
    const rx = /<script[^>]*\bsrc=["']\.?\/?([^"'?#:]+\.js)(?:[?#][^"']*)?["']/gi;
    let m;
    while ((m = rx.exec(text))) {
      let n = m[1]; try { n = decodeURIComponent(n); } catch (e) {}
      if (!B.denied(n) && exists(n)) hits.add(n);
    }
    return hits;
  };

  root.VLBUILD = B;
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ---------------------------------------------------------------------------
// CLI. Only runs when this file is executed directly, so importing it in tests never touches the disk.
// ---------------------------------------------------------------------------
if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const B = module.exports;

  const HERE = __dirname;
  const ROOT = path.resolve(HERE, '..');
  const PROD = path.resolve(ROOT, '..', 'Vessels_6_12');
  const OUT = path.join(HERE, '_site');
  const SITE_SRC = path.join(HERE, 'site');
  const LIST_ONLY = process.argv.includes('--list');
  const argShow = (function () { const i = process.argv.indexOf('--show'); return i > 0 ? process.argv[i + 1] : null; })();

  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8')); }
  catch (e) { console.error('\n  config/event.local.json is missing (the event project URL, public key, site).\n'); process.exit(1); }
  if (!cfg.prodRef) { console.error('config needs prodRef (so the build can prove nothing points at production).'); process.exit(1); }
  if (String(cfg.supabaseUrl).indexOf(cfg.prodRef) >= 0) { console.error('config points at the PRODUCTION project. Refusing to build.'); process.exit(1); }
  const prod = { ref: cfg.prodRef, key: cfg.prodAnonKey || '' };
  const PATCH = require('./patch-engine.js');
  const PATCHES = require('./event-patches.js');
  if (!fs.existsSync(PROD)) { console.error('cannot find the prod tree at ' + PROD); process.exit(1); }
  // tonight's show file (its id goes in the runtime config; its roster and photos ship in step 6)
  let SHOW = null;
  if (argShow) {
    const ShowFile = require(path.join(ROOT, 'src', 'show-file.js'));
    const r = ShowFile.load(path.resolve(ROOT, argShow));
    if (!r.show) { console.error('show file: ' + r.errors.join(' | ')); process.exit(1); }
    SHOW = r.show;
  }

  const staged = [];
  const patchLog = [];
  function emit(rel, buf) {
    staged.push([rel, buf.length]);
    if (LIST_ONLY) return;
    const dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, buf);
  }
  if (!LIST_ONLY) fs.rmSync(OUT, { recursive: true, force: true });

  // 1. prod surfaces, repointed, patched and injected
  const sweepFrom = [], tvScripts = [];
  for (const name of B.SURFACES) {
    const src = path.join(PROD, name);
    if (!fs.existsSync(src)) { console.error('MISSING in prod: ' + name); process.exit(1); }
    let text = fs.readFileSync(src, 'latin1');
    const mustHaveCreds = /^(tv|player|lesser-evil-tv|lesser-evil-player)\.html$/.test(name);
    text = B.repoint(text, prod, { url: cfg.supabaseUrl, anonKey: cfg.anonKey }, { require: mustHaveCreds });
    if (PATCHES[name]) {
      const rep = PATCH.report(name, text, PATCHES[name]);
      text = rep.text;
      const bits = [];
      if (rep.applied.length) bits.push(rep.applied.length + ' patched');
      if (rep.already.length) bits.push(rep.already.length + ' already');
      if (rep.skipped.length) bits.push(rep.skipped.length + ' skipped: ' + rep.skipped.join(','));
      patchLog.push('  ' + name + ': ' + bits.join(', '));
    }
    if (name.endsWith('.html')) text = B.inject(B.stripGate(text), B.EVENT_MODULES);
    if (B.PHONE_SURFACES.indexOf(name) >= 0) sweepFrom.push(text);
    else if (name.endsWith('.html')) tvScripts.push(text);
    emit(name, Buffer.from(text, 'latin1'));
  }

  // 2. the phone pages' assets (recursing into the CSS they pull in)
  const exists = (rel) => { try { return fs.statSync(path.join(PROD, rel)).isFile(); } catch (e) { return false; } };
  const assets = new Set();
  const scripts = new Map();   // name -> repointed text (a script can carry credentials like any page)
  const takeScript = (a) => {
    const text = B.repoint(fs.readFileSync(path.join(PROD, a), 'latin1'), prod, { url: cfg.supabaseUrl, anonKey: cfg.anonKey });
    scripts.set(a, text);
    return text;
  };
  const queue = sweepFrom.slice();
  while (queue.length) {
    for (const a of B.sweep(queue.shift(), exists)) {
      if (assets.has(a) || scripts.has(a) || B.SURFACES.indexOf(a) >= 0) continue;
      if (/\.js$/i.test(a)) { if (!/^vendor\//.test(a)) queue.push(takeScript(a)); continue; }   // vendor/ ships whole in step 5
      assets.add(a);
      if (/\.css$/i.test(a)) queue.push(fs.readFileSync(path.join(PROD, a), 'latin1'));
    }
  }
  // the TVs' scripts only (their media stays on the laptop)
  for (const t of tvScripts) for (const a of B.scripts(t, exists)) {
    if (!scripts.has(a) && B.SURFACES.indexOf(a) < 0 && !/^vendor\//.test(a)) takeScript(a);
  }
  for (const a of assets) emit(a, fs.readFileSync(path.join(PROD, a)));
  for (const [a, text] of scripts) emit(a, Buffer.from(text, 'latin1'));

  // 3. event-only pages and modules, and their own assets and fonts
  for (const name of B.LOCAL) {
    const p = fs.existsSync(path.join(SITE_SRC, name)) ? path.join(SITE_SRC, name) : path.join(HERE, name);
    emit(name, fs.readFileSync(p));
  }
  for (const dir of ['assets', 'fonts']) {
    const d = path.join(SITE_SRC, dir);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) emit(path.join('ev', dir, f), fs.readFileSync(path.join(d, f)));
  }

  // 4. the runtime config (public key and site only), routing, headers
  emit('event-config.js', Buffer.from('// generated by web/build-event.js - do not edit\n'
    + '(function(r){r.VL_CONFIG=' + JSON.stringify(B.runtimeConfig(cfg, SHOW && SHOW.id), null, 2)
    + ';})(typeof globalThis!=="undefined"?globalThis:this);\n', 'utf8'));
  emit('_redirects', Buffer.from(B.REDIRECTS, 'utf8'));
  emit('_headers', Buffer.from(B.HEADERS, 'utf8'));

  // 4b. the cached current-vote function, with the event project's URL and PUBLIC key filled in (web/_functions/)
  if (!LIST_ONLY) {
    const FN_OUT = path.join(HERE, '_functions');
    fs.rmSync(FN_OUT, { recursive: true, force: true });
    fs.mkdirSync(FN_OUT, { recursive: true });
    const fn = fs.readFileSync(path.join(HERE, 'functions', 'now.mjs'), 'utf8')
      .split('__SUPABASE_URL__').join(cfg.supabaseUrl).split('__ANON_KEY__').join(cfg.anonKey);   // every one, comments too
    if (/__SUPABASE_URL__|__ANON_KEY__/.test(fn)) { console.error('the now function still has placeholders'); process.exit(1); }
    fs.writeFileSync(path.join(FN_OUT, 'now.mjs'), fn);
  }

  // 5. vendored libraries the surfaces load
  const vend = path.join(PROD, 'vendor');
  if (fs.existsSync(vend)) for (const f of fs.readdirSync(vend)) emit(path.join('vendor', f), fs.readFileSync(path.join(vend, f)));

  // 6. tonight's roster and 300 px photos, for /vote (names + faces; ballots carry cast ids only)
  if (SHOW) {
    const show = SHOW, id = show.id;
    let sharp = null;
    try { sharp = require(path.join(ROOT, 'node_modules', 'sharp')); } catch (e) {
      try { sharp = require('F:/Squeeze/node_modules/sharp'); } catch (e2) { sharp = null; }
    }
    const roster = { id: id, name: show.name, cast: [] };
    const jobs = [];
    for (const p of show.cast) {
      const out = { id: p.id, name: p.name, photo: null };
      if (p.photo) {
        const rel = 'shows/' + id + '/' + p.id + '.webp';
        out.photo = rel + '?v=' + crypto.createHash('sha1').update(fs.readFileSync(p.photo)).digest('hex').slice(0, 8);
        if (sharp) jobs.push(sharp(p.photo).resize(300, 300, { fit: 'cover' }).webp({ quality: 80 }).toBuffer().then((buf) => emit(rel, buf)));
        else if (/\.webp$/i.test(p.photo)) emit(rel, fs.readFileSync(p.photo));
        else out.photo = null;
      }
      roster.cast.push(out);
    }
    Promise.all(jobs).then(() => { emit('shows/' + id + '/roster.json', Buffer.from(JSON.stringify(roster), 'utf8')); finish(); });
  } else finish();

  function finish() {
    // 7. a final sweep: nothing emitted may mention the prod project (Vessels Live's rule)
    if (!LIST_ONLY) {
      const bad = [];
      (function walk(dir) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, f.name);
          if (f.isDirectory()) { walk(p); continue; }
          if (!/\.(html|js|css|json)$/i.test(f.name)) continue;
          if (fs.readFileSync(p, 'latin1').indexOf(prod.ref) >= 0) bad.push(path.relative(OUT, p));
        }
      })(OUT);
      if (bad.length) {
        console.error('\n  BUILD FAILED - these still point at production:\n');
        bad.forEach(function (f) { console.error('    ' + f); });
        process.exit(1);
      }
    }
    const total = staged.reduce(function (n, r) { return n + r[1]; }, 0);
    if (process.argv.includes('--verbose')) { staged.sort(); for (const [rel, n] of staged) console.log('  ' + String(Math.round(n / 1024)).padStart(6) + ' KB  ' + rel); }
    if (patchLog.length) { console.log('\n  event patches:'); patchLog.forEach((l) => console.log(l)); }
    console.log('\n  ' + staged.length + ' files (' + assets.size + ' prod assets, ' + scripts.size + ' prod scripts), ' + (total / 1048576).toFixed(1) + ' MB'
      + (LIST_ONLY ? '  (--list, nothing written)' : '  -> web/_site/'));
    if (!LIST_ONLY) console.log('  verified: no file mentions the prod project ref.\n');
  }
}
