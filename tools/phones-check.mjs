// Vessels Events: the phone side against the LIVE site and database, in real Chrome with phone-sized screens.
//   1. a cast phone enters its code on /cast and is checked in
//   2. a TV (headless, from the live site) creates the Vessels room
//   3. the show sends the cast into it: the phone joins its seat by name, no typing; a second cast member too
//   4. an audience phone votes on /vote: ballot, one vote per phone, the result after the shared reveal time
// Screenshots in screenshots/phones-*.png. Uses the sample night (node tools/ev-cli.mjs register ... first).
//   node tools/phones-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8'));
const EV = require(path.join(ROOT, 'main', 'ev.js'));
const db = EV.make(cfg);
const SITE = cfg.site, SHOW = 'sample-night', SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (n, c, d) => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' · ' + d : ''}`); };
const waitFor = async (fn, ms, step) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step || 500); } };

const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const errs = [];
const phone = async (name) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  return p;
};
try {
  // a fresh Vessels room for this run, and the night pointed nowhere yet
  const room = EV.newRoom();
  await db.registerShow({ id: SHOW, name: 'Vessels Live · Sample Night', hostCode: 'HOST-9KX',
    cast: JSON.parse(fs.readFileSync(path.join(ROOT, 'shows/sample-show/show.json'))).cast }, { le: EV.newRoom(), cv: room });
  await db.setShow(SHOW, { live_game: null, live_room: null, stage: 'waiting' });

  // 1. Ava checks in
  const ava = await phone('ava');
  await ava.goto(`${SITE}/cast?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await ava.screenshot({ path: path.join(SHOTS, 'phones-cast-code.png') });
  await ava.type('#code', 'nope99'); await ava.click('#go'); await sleep(1500);
  ok('a wrong code is refused on /cast', /isn.t on tonight/.test(await ava.$eval('#err', (e) => e.textContent)));
  await ava.click('#code', { clickCount: 3 }); await ava.type('#code', 'ash-7q2'); await ava.click('#go');
  const inName = await waitFor(() => ava.$eval('#who', (e) => e.textContent), 6000);
  ok('Ava\'s code checks her in on /cast', inName === 'Ava', inName);
  await ava.screenshot({ path: path.join(SHOTS, 'phones-cast-in.png') });
  const st = await db.castStatus(SHOW);
  ok('the launcher\'s board sees Ava in', st.cast.find((c) => c.id === 'ava').checked_in_at != null);

  // 2. a TV creates the Vessels room (the launcher will host it on the laptop; here, the live site)
  const tv = await (await b.createBrowserContext()).newPage();
  await tv.setViewport({ width: 1280, height: 720 });
  tv.on('pageerror', (e) => errs.push('tv: ' + e.message));
  await tv.goto(`${SITE}/tv.html?create=1&code=${room}&theme=classic`, { waitUntil: 'domcontentloaded' });
  const g = await waitFor(() => db.game(room), 20000, 1000);
  ok('the TV creates the Vessels room in the event database', g && g.phase === 'lobby', g && g.phase);
  await db.control(room, { event_mode: true, game: 'cv' });

  // 3. the show moves into the room: Ava's phone follows and takes her seat by name; Bram joins straight from /cast
  await db.setShow(SHOW, { live_game: 'cv', live_room: room });
  const url = await waitFor(async () => { const u = ava.url(); return /player\.html/.test(u) ? u : null; }, 15000);
  ok('Ava\'s phone follows the show into the Vessels room', !!url, url);
  const seated = await waitFor(async () => { const ps = await db.players(room); return ps.find((p) => p.name === 'Ava') ? ps : null; }, 15000, 1000);
  ok('Ava is seated in the room under her exact name, no typing', !!seated, seated && seated.map((p) => p.name).join(','));
  await sleep(2500);
  await ava.screenshot({ path: path.join(SHOTS, 'phones-player-lobby.png') });
  const bram = await phone('bram');
  await bram.goto(`${SITE}/cast?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await bram.type('#code', 'BONE-4T8'); await bram.click('#go');
  const bramIn = await waitFor(async () => { const ps = await db.players(room); return ps.find((p) => p.name === 'Bram'); }, 20000, 1000);
  ok('Bram goes from /cast straight into the room', !!bramIn);
  // a reload (or a new phone with the same code) gives back the same seat
  const before = (await db.players(room)).find((p) => p.name === 'Ava').id;
  await ava.reload({ waitUntil: 'networkidle2' }); await sleep(4000);
  const after = (await db.players(room)).filter((p) => p.name === 'Ava');
  ok('a reload keeps Ava in her own seat (one seat, same id)', after.length === 1 && after[0].id === before);

  // 4. the audience votes on /vote
  const fan = await phone('fan');
  await fan.goto(`${SITE}/vote?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('/vote waits for a vote', !(await fan.$eval('#vWait', (e) => e.classList.contains('hidden'))));
  await fan.screenshot({ path: path.join(SHOTS, 'phones-vote-wait.png') });
  const v = await db.openVote(SHOW, { game: 'cv', prompt: 'Who leaves the house?', candidates: ['ava', 'bram', 'cleo'], secs: 30 });
  const ballot = await waitFor(() => fan.$eval('#vBallot', (e) => !e.classList.contains('hidden')), 10000);
  ok('the ballot appears within a few seconds', !!ballot);
  await sleep(800);
  await fan.screenshot({ path: path.join(SHOTS, 'phones-vote-ballot.png') });
  await fan.click('[data-id="bram"]'); await sleep(200);
  ok('tapping a face arms the vote button', /VOTE FOR BRAM/.test(await fan.$eval('#cast', (e) => e.textContent)));
  await fan.click('#cast');
  const done = await waitFor(() => fan.$eval('#vDone', (e) => !e.classList.contains('hidden')), 6000);
  ok('the vote goes in', !!done);
  await fan.screenshot({ path: path.join(SHOTS, 'phones-vote-done.png') });
  const t = await db.tally(v.id);
  ok('the launcher\'s tally counts it', t.counts.bram === 1 && t.total === 1, JSON.stringify(t.counts));
  const fan2 = await phone('fan2');
  await fan2.goto(`${SITE}/vote?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await waitFor(() => fan2.$eval('#vBallot', (e) => !e.classList.contains('hidden')), 10000);
  await fan2.click('[data-id="cleo"]'); await fan2.click('#cast'); await sleep(1500);
  await fan2.reload({ waitUntil: 'networkidle2' }); await sleep(3500);
  ok('a reloaded phone stays "voted" (one vote per phone)', !(await fan2.$eval('#vDone', (e) => e.classList.contains('hidden'))));
  await db.closeVote(v.id, 4000);
  const held = await waitFor(() => fan.$eval('#doneH', (e) => /votes are in/i.test(e.textContent)), 8000, 300);
  ok('closing holds phones on "the votes are in" until the reveal', !!held);
  const shown = await waitFor(() => fan.$eval('#vResult', (e) => !e.classList.contains('hidden')), 12000, 300);
  ok('then every phone shows the result together', !!shown, await fan.$eval('#resH', (e) => e.textContent).catch(() => ''));
  await fan.screenshot({ path: path.join(SHOTS, 'phones-vote-result.png') });
  await db.setShow(SHOW, { stage: 'download' });
  await waitFor(() => fan.$eval('#vDownload', (e) => !e.classList.contains('hidden')), 8000);
  await fan.screenshot({ path: path.join(SHOTS, 'phones-vote-download.png') });
  ok('the end of the night flips /vote to the download screen', !(await fan.$eval('#vDownload', (e) => e.classList.contains('hidden'))));
  ok('no page errors on the phones', errs.filter((e) => !/^tv:/.test(e)).length === 0, errs.join(' | '));
} finally {
  await db.setShow(SHOW, { live_game: null, live_room: null, stage: 'waiting' }).catch(() => {});
  await b.close();
}
console.log(bad ? `\n${bad} checks failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
