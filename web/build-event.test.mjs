// The build's transform logic.
//
// The dangerous failure here is silent: if a Supabase credential is missed, the
// event site boots pointed at the PRODUCTION database and a live audience votes
// into playvessels.com. So the rewrite refuses to be partial - it throws rather
// than emit a file it did not fully convert.
import test from 'node:test';
import assert from 'node:assert';
import './build-event.js';

const B = globalThis.VLBUILD;
const PROD = { ref: 'ecxolfosobzqvrkiukpd', key: 'prod-anon-key-xyz' };
const EV   = { url: 'https://eventref.supabase.co', anonKey: 'event-anon-key-abc' };

test('the prod project ref is replaced everywhere it appears', () => {
  const src = `var A='https://${PROD.ref}.supabase.co';var B='https://${PROD.ref}.supabase.co';`;
  const out = B.repoint(src, PROD, EV);
  assert.ok(!out.includes(PROD.ref), 'prod ref survived the rewrite');
  assert.strictEqual(out.split('eventref.supabase.co').length - 1, 2);
});

test('the prod anon key is replaced too', () => {
  const out = B.repoint(`const K="${PROD.key}";`, PROD, EV);
  assert.ok(!out.includes(PROD.key));
  assert.ok(out.includes(EV.anonKey));
});

test('a file with no credentials at all is refused, not silently shipped', () => {
  // This is the regression that matters: someone renames a variable in prod,
  // the pattern stops matching, and the build cheerfully emits a file still
  // pointing at production. Better to fail the build.
  assert.throws(
    () => B.repoint('var x = 1;', PROD, EV, { require: true }),
    /no supabase credentials/i
  );
});

test('a partial rewrite is impossible - any surviving ref throws', () => {
  const weird = `https://${PROD.ref}.supabase.co and ${PROD.ref.toUpperCase()}`;
  // The uppercase copy is not a real credential, but if anything that looks
  // like the prod ref survives we want to hear about it rather than guess.
  const out = B.repoint(weird, PROD, EV);
  assert.ok(!/ecxolfosobzqvrkiukpd/i.test(out));
});

test('injected scripts land before the first inline script, not appended', () => {
  // They define VLB / VLE, which the page's own inline script uses at parse
  // time. Appending them at the end of body would leave those undefined.
  const html = '<head><title>t</title></head><body><script>boot();</script></body>';
  const out = B.inject(html, ['audience-bridge.js', 'event-mode.js']);
  assert.ok(out.indexOf('audience-bridge.js') < out.indexOf('boot();'));
  assert.ok(out.indexOf('event-mode.js') < out.indexOf('boot();'));
});

test('injecting twice does not double the tags', () => {
  const html = '<head></head><body><script>boot();</script></body>';
  const once = B.inject(html, ['event-mode.js']);
  assert.strictEqual(B.inject(once, ['event-mode.js']), once);
});

test('the event build never carries a prod deploy script', () => {
  assert.strictEqual(B.shouldCopy('deploy.ps1'), false);
  assert.strictEqual(B.shouldCopy('cv-audience.sql'), false);
  assert.strictEqual(B.shouldCopy('lesser-evil-engine.test.mjs'), false);
  assert.strictEqual(B.shouldCopy('_probe_captions.html'), false);
  assert.strictEqual(B.shouldCopy('tv.html'), true);
  assert.strictEqual(B.shouldCopy('lesser-evil-host.js'), true);
});


// ---- The bug that would have failed at the venue -------------------------
// The build rewrote the project URL but left the anon KEY alone, because
// prodAnonKey was blank in the config. Every surface then pointed at the event
// project while presenting production's key, and Supabase answered every single
// request with "Invalid API key". Nothing in the build noticed, because the URL
// rewrite alone counted as a successful hit.
//
// A supabase anon key is a JWT whose payload names the project ref. The build
// can therefore find prod's key on its own, with no config entry to forget.

const PROD_JWT = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJpc3MiOiAic3VwYWJhc2UiLCAicmVmIjogImVjeG9sZm9zb2J6cXZya2l1a3BkIiwgInJvbGUiOiAiYW5vbiJ9.sig";

test('a JWT belonging to the prod project is replaced even when no key is configured', () => {
  const out = B.repoint(`const K="${PROD_JWT}";`, { ref: PROD.ref, key: '' }, EV);
  assert.ok(!out.includes(PROD_JWT), 'prod anon key survived the rewrite');
  assert.ok(out.includes(EV.anonKey));
});

test('a JWT for some OTHER project is left alone', () => {
  const other = PROD_JWT.replace(/\.[^.]+\./, '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWVvdGhlcnJlZiJ9.');
  const out = B.repoint('var x="' + other + '";', { ref: PROD.ref, key: '' }, EV);
  assert.ok(out.includes(other), 'an unrelated JWT must not be rewritten');
});

test('a file carrying only a prod JWT counts as having credentials', () => {
  // Otherwise the require:true check fires on a file that DID need rewriting.
  assert.doesNotThrow(() =>
    B.repoint(`var K="${PROD_JWT}";`, { ref: PROD.ref, key: '' }, EV, { require: true }));
});

// ---- The access gate ------------------------------------------------------
// access-gate.js locks every entry page behind a key in Supabase's access_codes
// table via the check_access_code RPC. The event project has neither and the
// gate fails CLOSED, so a real browser showed the logo and nothing else. Every
// headless run had missed it, because ?engine=1 is the gate's own bypass.

test('the access gate script tag is removed from a surface', () => {
  const html = '<head>\n  <script src="access-gate.js"></script>\n</head><body>x</body>';
  const out = B.stripGate(html);
  assert.ok(!out.includes('access-gate.js'), 'the gate tag must not survive');
  assert.ok(out.includes('<head>') && out.includes('x'), 'and nothing else may be eaten');
});

test('stripping the gate is harmless when there is no gate', () => {
  assert.strictEqual(B.stripGate('<body>hi</body>'), '<body>hi</body>');
});

test('a script that merely mentions the gate in passing is left alone', () => {
  const html = '<script>var note="access-gate.js is stripped by the build";</script>';
  assert.strictEqual(B.stripGate(html), html);
});

// ---- Vessels Events (2026-10-26) --------------------------------------------
// Vessels Live's passcode doors are gone: the cast get private codes on /cast, the audience votes on /vote.

test('the runtime config carries the public key, the site and the night, never the operator key or prod creds', () => {
  const cfg = { supabaseUrl: 'https://eventref.supabase.co', anonKey: 'k', site: 'https://vessels-events.netlify.app/',
    operatorKey: 'SECRET-OP', prodRef: 'ecxolfosobzqvrkiukpd', prodAnonKey: 'prod-key', storeLinks: { ios: 'x' } };
  const rt = B.runtimeConfig(cfg, 'sample-night');
  assert.deepStrictEqual(Object.keys(rt).sort(), ['anonKey', 'show', 'site', 'storeLinks', 'url']);
  assert.strictEqual(rt.site, 'https://vessels-events.netlify.app');
  assert.strictEqual(rt.show, 'sample-night');
  assert.ok(!JSON.stringify(rt).includes('SECRET-OP'), 'the operator key leaked into event-config.js');
  assert.ok(!JSON.stringify(rt).includes('prod-key'), 'a prod credential leaked into event-config.js');
});

test('the runtime config refuses a missing key or a non-https site', () => {
  assert.throws(() => B.runtimeConfig({ supabaseUrl: 'https://e.supabase.co', site: 'https://x' }), /anonKey/);
  assert.throws(() => B.runtimeConfig({ supabaseUrl: 'https://e.supabase.co', anonKey: 'k', site: 'http://x' }), /site/);
});

test('the event-only files are the cast hub, the vote page and their modules', () => {
  for (const f of ['cast.html', 'vote.html', 'ev.js', 'ev.css']) assert.ok(B.LOCAL.includes(f), f + ' is not in LOCAL');
  for (const f of ['event-config.js', 'ev.js', 'event-mode.js']) assert.ok(B.EVENT_MODULES.includes(f), f + ' is not injected');
});

test('Netlify serves /cast and /vote, trailing slash included', () => {
  for (const p of ['cast', 'vote']) {
    assert.match(B.REDIRECTS, new RegExp('^/' + p + '\\s+/' + p + '\\.html\\s+200\\s*$', 'm'));
    assert.match(B.REDIRECTS, new RegExp('^/' + p + '/\\s+/' + p + '\\.html\\s+200\\s*$', 'm'));
  }
});

// ---- the asset sweep ----------------------------------------------------------
// Phones must get every file their page loads. 2026-10-26: player-2b.js (the Direction 2B design) was missing,
// because the sweep only knew media and CSS, so phones fell back to the old look.

const have = (...names) => (n) => names.includes(n);

test('the sweep picks up the page\'s own scripts, media and sub-folders', () => {
  const html = '<script src="player-2b.js"></script><script src="./ss-content.js?v=3"></script>'
    + '<img src="art/key.png"><audio src="sfx/bell.mp3"></audio><style>body{background:url(bg.webp)}</style>';
  const got = [...B.sweep(html, have('player-2b.js', 'ss-content.js', 'key.png', 'sfx/bell.mp3', 'bg.webp'))].sort();
  assert.deepStrictEqual(got, ['bg.webp', 'key.png', 'player-2b.js', 'sfx/bell.mp3', 'ss-content.js']);
});

test('the sweep never takes a denied file or one that is not there', () => {
  const html = '<script src="local-sb.js"></script><script src="access-gate.js"></script><script src="gone.js"></script>';
  assert.strictEqual(B.sweep(html, have('local-sb.js', 'access-gate.js')).size, 0);
});

test('scripts() lists only <script src> files: a TV\'s media stays on the laptop', () => {
  const html = '<script src="graveyard-engine.js"></script><video src="intro.mp4"></video>'
    + '<script src="https://cdn.example.com/x.js"></script><script>var a="fake.js"</script>';
  assert.deepStrictEqual([...B.scripts(html, () => true)], ['graveyard-engine.js']);
});

// ---- no Scholar at events (Josh, 2026-10-26) -----------------------------------
// The Scholar's power is a second vote; at an event the cast doesn't vote. Off in the deal, the TV's legend and the
// phone's list of roles in play.
test('the event build deals no Scholar, and says so in all three places', async () => {
  const P = (await import('./event-patches.js')).default || globalThis.VL_PATCHES;
  const names = (f) => P[f].map((p) => p.name);
  assert.ok(names('tv.html').includes('tv:no-scholar-deal') && names('tv.html').includes('tv:no-scholar-legend'));
  assert.ok(names('player.html').includes('player:no-scholar'));
  for (const [f, n] of [['tv.html', 'tv:no-scholar-deal'], ['tv.html', 'tv:no-scholar-legend'], ['player.html', 'player:no-scholar']]) {
    const p = P[f].find((x) => x.name === n);
    assert.match(p.find, /role_sage/);
    assert.doesNotMatch(p.replace, /out\.push\('sage'\)|legend\.push/, n + ' must not deal or list the Scholar');
  }
});
