// Vessels Events: the load test (Phase 5). A full room against the real stack: 500 audience phones (Josh, 2026-10-26)
// doing exactly what /vote does against the event database, while the 12 cast phones keep their check-in heartbeat
// and a live (Realtime) connection open, the host's phone polls /host's state, and a stand-in for the launcher opens
// each vote, polls the tally once a second and closes it on its clock.
//
// It runs on a throwaway show (load-test), never tonight's, and deletes it at the end. Each round:
//   - every phone polls the database's current vote, every 2.5 to 3 s while a vote is open or its result is on its
//     way and every 5 to 6 s between votes, falling back to the site's /api/now for 30 s after two misses (the page's
//     own timing and fallback)
//   - the vote opens; each phone votes after reading it (a short delay, spread over the round's window), some tap
//     twice (the second must be refused), some vote after it closed (refused), a few never vote
//   - the vote closes on its clock; every phone must see the result
// Then it checks nothing was lost or counted twice (the database's tally = the ballots accepted, choice by choice)
// and reports latency, errors, how fast the room saw the vote open and close.
//
//   node tools/load-test.mjs [--phones 500] [--rounds 2] [--secs 20] [--window 6,2] [--show load-test] [--cache]
//   (--window: seconds over which the room votes, per round: 6 is a real room, 2 is everyone at once;
//    --cache: the old way, every phone on the site's cached /api/now first. At 500 phones from one address Netlify
//    cuts that address off for several minutes (2026-10-26), this laptop included: don't run it the day of a show)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8'));
const EV = require(path.join(ROOT, 'main', 'ev.js'));
const db = EV.make(cfg, { timeoutMs: 15000 });
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const N = +opt('phones', 500), ROUNDS = +opt('rounds', 2), SECS = +opt('secs', 20), SHOW = opt('show', 'load-test');
const WINDOWS = String(opt('window', '6,2')).split(',').map(Number);
const CACHE = argv.includes('--cache');
const SITE = String(cfg.site).replace(/\/$/, ''), SUPA = String(cfg.supabaseUrl).replace(/\/$/, ''), KEY = cfg.anonKey;
const POLL_MS = 2500, IDLE_MS = 5000;                // /vote's own pace: a vote open; between votes
const READ_MS = 1500;                                // a phone reads the ballot before it can vote
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const r0 = (x) => (x == null ? '-' : Math.round(x));

// the anon calls a phone makes (the public key; never the operator's)
async function rpc(fn, args) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + (text ? ' ' + text.slice(0, 80) : ''));
  return text ? JSON.parse(text) : null;
}

// ---- the night ------------------------------------------------------------------------------------------------
const CAST = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + (i + 1), name: 'Load ' + (i + 1), code: 'LOAD-' + String(i + 1).padStart(2, '0') }));
const HOST_CODE = 'LOADHOST-1';
const stats = {
  poll: [], pollErr: {}, fallback: 0, viaSite: 0, cache: {}, runs: new Set(),   // runs: each time /api/now's function ran (X-Ev-Run)
  vote: [], tally: [], tallyErr: 0, ping: [], pingErr: 0, host: [], hostErr: 0,
  rt: { opened: 0, joined: 0, closed: 0, errors: 0 },
  rounds: [],
};
let stopAll = false, round = null;   // round: {id, openAt, closesAt, closeAt, window, candidates, accepted:{}, ...}

// ---- an audience phone ----------------------------------------------------------------------------------------
function phone(i) {
  const p = { i, device: 'lt-' + crypto.randomBytes(10).toString('hex'), misses: 0, siteUntil: 0, offset: 0, last: null, seen: new Set(), seenClosed: new Set() };
  const viaSite = async () => {
    stats.viaSite++;
    const t0 = performance.now();
    const r = await fetch(`${SITE}/api/now?s=${encodeURIComponent(SHOW)}`, { signal: AbortSignal.timeout(10000) });
    const cs = r.headers.get('cache-status') || '(none)', age = +(r.headers.get('age') || 0);
    stats.poll.push(performance.now() - t0);
    stats.cache[cs] = (stats.cache[cs] || 0) + 1;
    if (r.headers.get('x-ev-run')) stats.runs.add(r.headers.get('x-ev-run'));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json(); d._age = age; return d;
  };
  const viaDb = async () => { const t0 = performance.now(); const d = await rpc('ev_now', { p_show: SHOW }); stats.poll.push(performance.now() - t0); return d; };
  p.loop = (async () => {
    await sleep(rand(0, IDLE_MS));   // phones arrive at different moments
    while (!stopAll) {
      let d = null;
      // the page: the database first; two misses in a row, the site for 30 s. --cache: the old way round
      const first = CACHE ? (p.misses < 2 ? 'site' : 'db') : (Date.now() >= p.siteUntil ? 'db' : 'site');
      try {
        d = first === 'site' ? await viaSite() : await viaDb();
        if (first === (CACHE ? 'site' : 'db')) p.misses = 0; else stats.fallback++;
      } catch (e) {
        p.misses++;
        if (!CACHE && first === 'db' && p.misses >= 2) { p.misses = 0; p.siteUntil = Date.now() + 30000; }
        const k = String(e && (e.name === 'TimeoutError' ? 'timeout' : e.message) || e).slice(0, 40);
        stats.pollErr[k] = (stats.pollErr[k] || 0) + 1;
      }
      if (d && d.now) p.offset = d.now + (d._age || 0) * 1000 - Date.now();
      if (d) p.last = d;
      if (d && d.vote && round && d.vote.id === round.id) see(p, d.vote);
      // the page's pace: quick while a vote is open or its result is on its way, slower between votes
      const v = p.last && p.last.vote, busy = v && (v.state === 'open' || (v.reveal_at && v.reveal_at > Date.now() + p.offset));
      await sleep(busy ? POLL_MS + Math.random() * 500 : IDLE_MS + Math.random() * 1000);
    }
  })();
  return p;
}

// what a phone does with the vote it sees
function see(p, v) {
  const R = round;
  if (v.state === 'open' && !p.seen.has(v.id)) {
    p.seen.add(v.id);
    R.seenOpen.push(Date.now() - R.openAt);
    const roll = Math.random(), choice = v.candidates[Math.floor(Math.random() * v.candidates.length)];
    if (roll < 0.03) { R.abstain++; return; }                                                   // never votes
    if (roll < 0.08) {                                                                           // votes after the close
      const at = v.closes_at - p.offset + rand(3500, 5000);
      setTimeout(() => cast(p, v.id, choice, 'closed'), Math.max(0, at - Date.now()));
      return;
    }
    const when = READ_MS + Math.random() * R.window * 1000;
    setTimeout(async () => {
      const first = await cast(p, v.id, choice, 'ok');
      if (roll < 0.18) { await sleep(rand(150, 1200)); await cast(p, v.id, choice, 'already'); }   // a double tap
      void first;
    }, when);
  }
  if (v.state === 'closed' && !p.seenClosed.has(v.id)) {
    p.seenClosed.add(v.id);
    R.seenClosed.push(Date.now() - (R.closeAt || Date.now()));
    if (!v.result || v.result.total == null || !v.reveal_at) R.badResult++;
  }
}

// one vote, as the page sends it; a network failure is tapped again once (the page says "Try again")
async function cast(p, voteId, choice, expect, retry) {
  const t0 = performance.now(), at = Date.now();
  let reason;
  try {
    const r = await rpc('ev_vote_cast', { p_vote: voteId, p_device: p.device, p_choice: choice });
    reason = r && r.ok ? 'ok' : (r && r.reason) || 'bad';
  } catch (e) { reason = 'error: ' + String(e && (e.name === 'TimeoutError' ? 'timeout' : e.message) || e).slice(0, 40); }
  const ms = performance.now() - t0;
  // sent at or after the close (a phone that only just saw it, or its retry): refused is right
  const late = round && round.id === voteId && at >= round.closesAt - 500;
  const exp = retry && reason === 'already' ? 'already' : (expect === 'ok' && late && reason === 'closed') ? 'closed' : expect;
  stats.vote.push({ ms, at, reason, expect: exp, round: round && round.n });
  if (reason === 'ok' && round && round.id === voteId) round.accepted[choice] = (round.accepted[choice] || 0) + 1;
  if (/^error/.test(reason) && !retry) { await sleep(1000); return cast(p, voteId, choice, expect, true); }
  return reason;
}

// ---- the cast phones and the host's phone ---------------------------------------------------------------------
function castPhone(c) {
  const device = 'lt-cast-' + crypto.randomBytes(8).toString('hex');
  // the live connection a cast phone keeps to its game (Realtime), to see it holds through the vote's burst
  try {
    const ws = new WebSocket(`${SUPA.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
    let ref = 0, hb = null;
    ws.onopen = () => {
      stats.rt.opened++;
      ws.send(JSON.stringify({ topic: `realtime:loadtest-${SHOW}`, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' } } }, ref: String(++ref) }));
      hb = setInterval(() => ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })), 25000);
    };
    ws.onmessage = (m) => { try { const j = JSON.parse(m.data); if (j.event === 'phx_reply' && j.ref === '1' && j.payload && j.payload.status === 'ok') stats.rt.joined++; } catch (e) {} };
    ws.onerror = () => { stats.rt.errors++; };
    ws.onclose = () => { clearInterval(hb); if (!stopAll) stats.rt.closed++; };
    c.ws = ws;
  } catch (e) { stats.rt.errors++; }
  c.loop = (async () => {
    let me = null;
    try { me = await rpc('ev_join', { p_show: SHOW, p_code: c.code, p_device: device }); } catch (e) { stats.pingErr++; }
    while (!stopAll) {
      await sleep(5000);
      const t0 = performance.now();
      try { await rpc('ev_ping', { p_show: SHOW, p_cast: (me && me.cast_id) || c.id, p_device: device }); stats.ping.push(performance.now() - t0); }
      catch (e) { stats.pingErr++; }
    }
  })();
}
function hostPhone() {
  return (async () => {
    const device = 'lt-host-' + crypto.randomBytes(8).toString('hex');
    while (!stopAll) {
      const t0 = performance.now();
      try { const r = await rpc('ev_host', { p_show: SHOW, p_code: HOST_CODE, p_device: device }); if (!r || !r.ok) stats.hostErr++; else stats.host.push(performance.now() - t0); }
      catch (e) { stats.hostErr++; }
      await sleep(1100);
    }
  })();
}

// ---- the operator (what the launcher does) --------------------------------------------------------------------
async function runRound(n) {
  const window = WINDOWS[Math.min(n - 1, WINDOWS.length - 1)];
  const candidates = n % 2 ? ['c1', 'c2', 'c3'] : CAST.map((c) => c.id);   // 3 suspects; then all 12 (a practice-style vote)
  round = { n, id: null, window, candidates, accepted: {}, seenOpen: [], seenClosed: [], abstain: 0, badResult: 0, openAt: 0, closeAt: 0 };
  const t0 = Date.now();
  const o = await db.openVote(SHOW, { game: 'cv', prompt: `Load test, round ${n}`, candidates, practice: false, secs: SECS });
  if (!o || !o.ok) throw new Error('the vote did not open: ' + JSON.stringify(o));
  round.id = o.id; round.openAt = (t0 + Date.now()) / 2; round.closesAt = round.openAt + SECS * 1000;
  console.log(`round ${n}: vote ${o.id} open, ${candidates.length} options, ${SECS} s, the room votes over ${window} s`);
  // the tally once a second, as the console does, until the clock runs out
  while (Date.now() < round.closesAt) {
    const t = performance.now();
    try { await db.tally(round.id); stats.tally.push(performance.now() - t); } catch (e) { stats.tallyErr++; }
    await sleep(Math.max(0, 1000 - (performance.now() - t)));
  }
  const c0 = Date.now();
  const closed = await db.closeVote(round.id, 4000);
  round.closeAt = (c0 + Date.now()) / 2;
  round.result = closed && closed.result;
  // late voters (and the room seeing the result) after the close
  await sleep(9000);
  round.final = await db.tally(round.id);
  stats.rounds.push(round);
}

// ---- the run ---------------------------------------------------------------------------------------------------
console.log(`Load test: ${N} audience phones, 12 cast phones, the host's phone; ${ROUNDS} rounds of ${SECS} s on "${SHOW}" (${CACHE ? 'the old way: ' + SITE + '/api/now first' : 'polling the database, as /vote does'})`);
await db.dropShow(SHOW).catch(() => {});
const reg = await db.registerShow({ id: SHOW, name: 'Load test', hostCode: HOST_CODE, cast: CAST }, { le: null, cv: null });
if (!reg || !reg.ok) { console.error('could not set up the test show', reg); process.exit(1); }
await db.setShow(SHOW, { stage: 'waiting' }).catch(() => {});
const T0 = Date.now();
const phones = Array.from({ length: N }, (_, i) => phone(i));
CAST.forEach(castPhone);
const hostLoop = hostPhone();
let bad = 0;
try {
  await sleep(IDLE_MS + 1000 + 2500);   // everyone has polled at least once
  for (let n = 1; n <= ROUNDS; n++) await runRound(n);
} catch (e) {
  bad++; console.log('FAIL the run stopped: ' + (e && e.stack || e));
} finally {
  stopAll = true;
  CAST.forEach((c) => { try { c.ws && c.ws.close(); } catch (e) {} });
  await Promise.race([Promise.all(phones.map((p) => p.loop).concat(CAST.map((c) => c.loop), [hostLoop])), sleep(15000)]);
  await db.dropShow(SHOW).catch(() => {});
}
const secs = (Date.now() - T0) / 1000;

// ---- the report ------------------------------------------------------------------------------------------------
const ok = (name, cond, detail) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail != null ? ' · ' + detail : ''}`); return cond; };
const line = (label, a) => `${label}: n=${a.length}, p50 ${r0(pct(a, 50))} ms, p95 ${r0(pct(a, 95))} ms, p99 ${r0(pct(a, 99))} ms, max ${r0(pct(a, 100))} ms`;
const pollErrs = Object.values(stats.pollErr).reduce((a, b) => a + b, 0);
const fnRuns = stats.runs.size, hits = stats.viaSite - fnRuns;
console.log(CACHE ? '\n=== polling (/api/now first, the database after two misses) ===' : '\n=== polling (the database first, /api/now after two misses) ===');
console.log(line('latency', stats.poll));
console.log(`requests ${stats.poll.length + pollErrs} in ${r0(secs)} s (${(stats.poll.length / secs).toFixed(0)}/s), errors ${pollErrs} ${JSON.stringify(stats.pollErr)}, on the fallback ${stats.fallback}, via the site ${stats.viaSite}`);
if (stats.viaSite) {
  console.log(`the site's polls served from its cache ${(100 * hits / Math.max(1, stats.viaSite)).toFixed(1)}% · its function ran ${fnRuns} times (${(fnRuns / secs).toFixed(2)}/s)`);
  console.log('cache-status seen: ' + Object.entries(stats.cache).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v}× ${k}`).join(' | '));
}
// the database's traffic for a whole night at this size and pace (the egress the free plan counts: ~1.3 KB a poll)
const perSec = stats.poll.length / secs;
console.log(`at this pace a 2.5-hour night is about ${(perSec * 9000 / 1e6).toFixed(2)} million polls, ~${(perSec * 9000 * 1.3e3 / 1e9).toFixed(1)} GB (an upper bound: this run was mostly votes)`);
const votes = stats.vote, wrong = votes.filter((v) => v.reason !== v.expect);
console.log('\n=== votes (ev_vote_cast) ===');
console.log(line('latency', votes.map((v) => v.ms)));
const by = {}; votes.forEach((v) => { by[v.reason] = (by[v.reason] || 0) + 1; });
console.log('answers: ' + JSON.stringify(by));
for (const R of stats.rounds) {
  const rv = votes.filter((v) => v.round === R.n), okAt = rv.filter((v) => v.reason === 'ok').map((v) => v.at);
  let peak = 0; for (const t of okAt) peak = Math.max(peak, okAt.filter((u) => u >= t && u < t + 1000).length);
  const acc = Object.values(R.accepted).reduce((a, b) => a + b, 0), fin = R.final || {};
  console.log(`\n--- round ${R.n} (vote ${R.id}, window ${R.window} s) ---`);
  console.log(line('saw the vote open, after it opened', R.seenOpen));
  console.log(line('saw the result, after the close', R.seenClosed));
  console.log(`accepted ${acc}, peak ${peak} votes/s, abstained ${R.abstain}; database tally ${fin.total} ${JSON.stringify(fin.counts || {})}`);
  ok(`round ${R.n}: every phone saw the vote open`, R.seenOpen.length === N, `${R.seenOpen.length} of ${N}, slowest ${r0(pct(R.seenOpen, 100))} ms`);
  ok(`round ${R.n}: every phone saw it close, with the result`, R.seenClosed.length === N && R.badResult === 0, `${R.seenClosed.length} of ${N}, slowest ${r0(pct(R.seenClosed, 100))} ms`);
  ok(`round ${R.n}: the tally is exactly the ballots accepted, choice by choice`, fin.total === acc && R.candidates.every((c) => ((fin.counts || {})[c] || 0) === (R.accepted[c] || 0)), `${fin.total} vs ${acc}`);
  ok(`round ${R.n}: the close's result matches`, R.result && R.result.total === acc, R.result && R.result.total);
}
console.log('\n=== the rest of the room ===');
console.log(line('tally (operator, 1/s)', stats.tally) + `, errors ${stats.tallyErr}`);
console.log(line('cast check-in pings (12 phones, every 5 s)', stats.ping) + `, errors ${stats.pingErr}`);
console.log(line('host phone (every 1.1 s)', stats.host) + `, errors ${stats.hostErr}`);
console.log(`cast phones' live connections: opened ${stats.rt.opened}, joined ${stats.rt.joined}, dropped mid-test ${stats.rt.closed}, errors ${stats.rt.errors}`);
console.log('');
ok('no vote answered wrong (lost, counted twice, or let in late)', wrong.length === 0, wrong.length ? JSON.stringify(wrong.slice(0, 5).map((v) => [v.expect, v.reason])) : `${votes.length} answers as expected`);
ok('polling errors under 0.5%', pollErrs / Math.max(1, stats.poll.length + pollErrs) < 0.005, `${pollErrs} of ${stats.poll.length + pollErrs}`);
ok('votes p95 under 1.5 s', pct(votes.map((v) => v.ms), 95) < 1500, `${r0(pct(votes.map((v) => v.ms), 95))} ms`);
if (CACHE) ok('the database sees under 10 reads a second from the whole room', fnRuns / secs < 10, `${(fnRuns / secs).toFixed(2)}/s`);
ok('the cast phones and the host kept working', stats.pingErr === 0 && stats.hostErr === 0, `${stats.pingErr} ping errors, ${stats.hostErr} host errors`);
ok('the cast phones’ live connections held', stats.rt.joined === CAST.length && stats.rt.closed === 0, `${stats.rt.joined} of ${CAST.length} joined, ${stats.rt.closed} dropped`);
const out = path.join(ROOT, 'reports');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `load-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${N}.json`);
fs.writeFileSync(file, JSON.stringify({ cache: CACHE, phones: N, rounds: ROUNDS, secs: SECS, windows: WINDOWS, site: SITE, ranFor: secs, fnRuns, stats: Object.assign({}, stats, { runs: undefined,
  poll: { n: stats.poll.length, p50: pct(stats.poll, 50), p95: pct(stats.poll, 95), p99: pct(stats.poll, 99), max: pct(stats.poll, 100) },
  vote: { n: votes.length, by, p50: pct(votes.map((v) => v.ms), 50), p95: pct(votes.map((v) => v.ms), 95), p99: pct(votes.map((v) => v.ms), 99), max: pct(votes.map((v) => v.ms), 100) },
  tally: { n: stats.tally.length, p95: pct(stats.tally, 95) }, ping: { n: stats.ping.length, p95: pct(stats.ping, 95) }, host: { n: stats.host.length, p95: pct(stats.host, 95) },
  rounds: stats.rounds.map((R) => ({ n: R.n, id: R.id, window: R.window, accepted: R.accepted, final: R.final, abstain: R.abstain,
    seenOpen: { n: R.seenOpen.length, p50: pct(R.seenOpen, 50), p95: pct(R.seenOpen, 95), max: pct(R.seenOpen, 100) },
    seenClosed: { n: R.seenClosed.length, p50: pct(R.seenClosed, 50), p95: pct(R.seenClosed, 95), max: pct(R.seenClosed, 100) } })) }) }, null, 1));
console.log(`\n${bad ? bad + ' checks failed' : 'all checks passed'} · report: ${path.relative(ROOT, file)}`);
process.exit(bad ? 1 : 0);
