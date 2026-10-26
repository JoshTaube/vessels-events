// Vessels Events: the whole Phase 2 night, online. Launches the real launcher (a throwaway data folder, fresh rooms,
// the event database) and drives it like an operator over the DevTools protocol, with real phones (headless Chrome,
// phone-sized) on the live event site:
//   1. the launcher registers the night; the Lesser Evil TV it hosts creates its room
//   2. cast phones check in on /cast and light their seats; the rest are marked by hand
//   3. the practice vote runs the whole vote pipe (a phone votes on /vote, the console counts it, leaving closes it)
//   4. Lesser Evil: the cast follow into the room and take their seats by name; slogans; the race starts on its cue;
//      N steps it to its first ballot, which is mirrored to /vote; a phone votes; V closes it; the game takes it
//   5. intermission: the Vessels TV creates its room, the cast follow; the game starts on its cue; N steps it to the
//      day's discussion; two suspects; GO into the vote; a phone votes; V closes it; the game eliminates
// Screenshots: screenshots/night-*.png. Exit code 0 = all good. Takes a few minutes.
//   node tools/launcher-check.mjs [--keep]      (--keep leaves the launcher open at the end)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const electronPath = require('electron');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8'));
const EV = require(path.join(ROOT, 'main', 'ev.js'));
const db = EV.make(cfg);
const SHOW = 'sample-night', SITE = cfg.site, SHOTS = path.join(ROOT, 'screenshots');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vessels-events-night-'));
const PORT = 9334;
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (n, c, d) => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' · ' + String(d).replace(/\s+/g, ' ').slice(0, 220) : ''}`); return !!c; };
const note = (t) => console.log('     ' + t);
const waitFor = async (fn, ms, step) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step || 500); } };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `night-${name}.png`) }).catch(() => {});

const app = spawn(electronPath, ['.', '--show=shows/sample-show/show.json', `--user-data=${DATA}`, `--remote-debugging-port=${PORT}`, '--display=none', '--fresh'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const mainLog = [];
app.stdout.on('data', (d) => mainLog.push(String(d).trim()));
app.stderr.on('data', (d) => { const t = String(d); if (/error/i.test(t) && !/DevTools|GPU|gpu|cache|Autofill/i.test(t)) mainLog.push('ERR ' + t.trim()); });
let electron = null;
for (let k = 0; k < 60 && !electron; k++) { await sleep(500); try { electron = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch (e) { /* starting */ } }
if (!electron) { console.error('the launcher did not start'); process.exit(1); }
let pages = [];
for (let k = 0; k < 40; k++) { pages = await electron.pages(); if (pages.filter((p) => /\/(console|display)\//.test(p.url())).length >= 2) break; await sleep(250); }
const con = pages.find((p) => p.url().includes('/console/')), dis = pages.find((p) => p.url().includes('/display/'));
const pageErrs = [];
con.on('pageerror', (e) => pageErrs.push('console: ' + e.message));
dis.on('pageerror', (e) => pageErrs.push('display: ' + e.message));
await con.evaluate(() => { window.confirm = () => true; });

const chrome = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
const phoneErrs = [];
const phone = async (name) => {
  const p = await (await chrome.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => phoneErrs.push(name + ': ' + e.message));
  return p;
};
const text = (sel) => con.$eval(sel, (e) => e.textContent.trim()).catch(() => '');
const where = () => text('#gWhere');
const key = async (k) => { await con.keyboard.press(k); await sleep(700); };
const nowId = () => text('#nowId');
const jump = async (id) => { await (await con.$(`[data-cue="${id}"]`)).click({ clickCount: 2 }); await sleep(1200); };
const go = async () => { await key('Space'); };
const stepN = async () => { const dis_ = await con.$eval('#gStep', (b) => b.disabled); if (!dis_) await key('n'); return !dis_; };

try {
  // ---------------------------------------------------------------------------------------------
  // 1. online, rooms, the Lesser Evil TV
  ok('the launcher goes online', await waitFor(async () => /Online/.test(await text('#gNet')), 25000), await text('#gNet'));
  const leSrc = await waitFor(() => dis.$eval('#engines iframe', (f) => f.src), 25000);
  ok('the display hosts the Lesser Evil TV from the laptop', /^http:\/\/127\.0\.0\.1:\d+\/lesser-evil-tv\.html\?code=V-/.test(leSrc || ''), leSrc);
  const LE = new URL(leSrc).searchParams.get('code');
  const leGame = await waitFor(() => db.game(LE), 30000, 1000);
  ok('the Lesser Evil TV creates its room in the event database', leGame && leGame.phase === 'le', leGame && leGame.phase);
  const ctl = await db.controlRow(LE);
  ok('the room is in event mode before anyone joins', ctl && ctl.event_mode === true && ctl.game === 'le');
  ok('the console reads the Lesser Evil lobby', await waitFor(async () => /Lobby/.test(await where()), 15000), await where());

  // 2. check-in
  const CAST = [['ava', 'ASH-7Q2', 'Ava'], ['bram', 'BONE-4T8', 'Bram'], ['cleo', null, 'Cleo'], ['dex', null, 'Dex']];
  const show = JSON.parse(fs.readFileSync(path.join(ROOT, 'shows/sample-show/show.json'), 'utf8'));
  for (const c of CAST) c[1] = show.cast.find((x) => x.id === c[0]).code;
  const phones = {};
  for (const [id, code] of CAST) {
    const p = phones[id] = await phone(id);
    await p.goto(`${SITE}/cast?s=${SHOW}`, { waitUntil: 'networkidle2' });
    await p.type('#code', code); await p.click('#go');
  }
  const lit = await waitFor(async () => (await con.$$eval('#seats .seatb.in', (b) => b.length)) >= 4 ? true : null, 15000);
  ok('four cast phones check in and light their seats', !!lit, await text('#ciCount'));
  await shot(con, 'console-checkin');
  for (let k = 0; k < 12; k++) {   // the board redraws on every click: find the next empty seat afresh
    const id = await con.$eval('#seats .seatb:not(.in)', (b) => b.dataset.ci).catch(() => null);
    if (!id) break;
    await con.click(`#seats [data-ci="${id}"]`); await sleep(250);
  }
  ok('the rest are marked by hand', /12 of 12/.test(await text('#ciCount')), await text('#ciCount'));

  // 3. the practice vote
  await go(); await go(); await go(); await go(); await go(); await go();   // 101 110 120 201 210 220
  await go();
  ok('GO reaches the practice vote', (await nowId()) === '230', await nowId());
  const fan = await phone('fan');
  await fan.goto(`${SITE}/vote?s=${SHOW}`, { waitUntil: 'networkidle2' });
  ok('/vote shows the practice ballot', !!(await waitFor(() => fan.$eval('#vBallot', (e) => !e.classList.contains('hidden')), 12000)));
  ok('…with every cast member', (await fan.$$eval('#faces .face', (f) => f.length)) === 12);
  await fan.click('[data-id="dex"]'); await fan.click('#cast');
  ok('the console counts the vote', !!(await waitFor(async () => /1 in/.test(await text('#vTotal')), 8000)), await text('#vTotal'));
  await shot(dis, 'practice-vote'); await shot(con, 'console-practice');
  await go();
  ok('leaving the cue closes it', !!(await waitFor(async () => /Closed · 1 votes?/.test(await text('#vTotal')), 8000)), await text('#vTotal'));

  // 4. Lesser Evil
  await go();
  ok('GO reaches Lesser Evil', (await nowId()) === '301');
  const leSeats = await waitFor(async () => { const ps = await db.players(LE); return CAST.every((c) => ps.some((p) => p.name === c[2])) ? ps : null; }, 30000, 1500);
  ok('the cast phones follow into the Lesser Evil room and take their seats by name', !!leSeats, leSeats && leSeats.map((p) => p.name).join(', '));
  for (const [id] of CAST) {
    const p = phones[id];
    const box = await waitFor(() => p.$('#lepSlogan'), 15000);
    if (box) { await box.click({ clickCount: 3 }); await p.keyboard.type(`${id} for president`); await p.keyboard.press('Enter'); await p.$eval('#lepSlogan', (e) => e.blur()).catch(() => {}); }
  }
  await shot(phones.ava, 'phone-le-lobby');
  ok('every candidate has a slogan', !!(await waitFor(async () => /ready/.test(await where()), 20000)), await where());
  await go(); await go();
  ok('GO reaches the race', (await nowId()) === '310');
  ok('the race cue uncovers the Lesser Evil TV', !!(await waitFor(() => dis.$eval('body', (b) => b.classList.contains('gameon')), 10000)));
  const started = await waitFor(async () => { const g = await db.game(LE); return g && g.le ? g.le : null; }, 60000, 2000);
  ok('the race cue starts the race (after its intro)', !!started, started && started.phase);
  await shot(dis, 'le-race');
  // N steps the race to its first ballot
  let leVote = null;
  for (let k = 0; k < 45 && !leVote; k++) {
    leVote = await con.$eval('#vbox', (e) => !e.classList.contains('hidden') && !e.classList.contains('closed')).catch(() => false);
    if (leVote) break;
    if (!(await stepN())) await sleep(1500);
    await sleep(1800);
  }
  ok('N steps the race to its first ballot, mirrored to /vote', leVote, await where());
  if (leVote) {
    // the game's own ballot screen (positions, slogans, its clock) stays on the projector, the vote panel beside it
    ok('the projector keeps the game’s own ballot screen up, with the vote panel beside it',
      (await dis.$eval('body', (b) => b.classList.contains('gameon'))) && !!(await dis.$('#stage .votepanel .tile .qr')), await where());
    const leFrame = dis.frames().find((f) => /lesser-evil-tv\.html/.test(f.url()));
    const board = leFrame && await leFrame.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).catch(() => '');
    ok('…which shows the candidates’ positions, and no cast "still to vote" line', /THE PEOPLE DECIDE/i.test(board || '') && !/Still to vote|Voters \d/i.test(board || ''), (board || '').slice(0, 160));
    await shot(dis, 'le-ballot');
    const opts = await waitFor(async () => { const ok_ = await fan.$eval('#vBallot', (e) => !e.classList.contains('hidden')); return ok_ ? fan.$$eval('#faces .face', (f) => f.map((x) => x.dataset.id)) : null; }, 12000);
    ok('/vote shows the Lesser Evil ballot in its colours', opts && (await fan.$eval('body', (b) => b.classList.contains('le'))), opts && opts.join(','));
    await shot(fan, 'vote-le');
    if (opts) { await fan.click(`[data-id="${opts[0]}"]`); await fan.click('#cast'); }
    ok('the console counts it', !!(await waitFor(async () => /1 in/.test(await text('#vTotal')), 8000)), await text('#vTotal'));
    const aud = await waitFor(async () => { const t_ = leFrame && await leFrame.evaluate(() => (document.getElementById('leAudCount') || {}).textContent); return t_ === '1' ? t_ : null; }, 8000);
    ok('the game’s own "from the audience" count follows /vote', !!aud, aud);
    await shot(dis, 'le-ballot-voted');
    await key('v');
    const taken = await waitFor(async () => { const b = await db.leBallot(LE); return b && !b.open && b.result ? b : null; }, 15000, 1000);
    ok('V closes it and the race takes the audience’s count', !!taken && taken.result.source === 'override', taken && JSON.stringify(taken.result.counts));
    await sleep(5000);
    await shot(dis, 'le-after-vote');
  }

  // the rest of the race: N moves it, the audience votes each ballot, V closes it, until a winner is crowned
  let crowned = null, ballots = leVote ? 1 : 0;
  for (let k = 0; k < 160 && !crowned; k++) {
    const g = await db.game(LE).catch(() => null);
    if (g && g.le && (g.le.phase === 'results' || g.le.phase === 'complete') && g.le.winner != null) { crowned = g.le; break; }
    const open = await con.$eval('#vbox', (e) => !e.classList.contains('hidden') && !e.classList.contains('closed')).catch(() => false);
    if (open) {
      const opts = await waitFor(async () => { const up = await fan.$eval('#vBallot', (e) => !e.classList.contains('hidden')); return up ? fan.$$eval('#faces .face', (f) => f.map((x) => x.dataset.id)) : null; }, 8000);
      if (opts && opts.length) { await fan.click(`[data-id="${opts[k % opts.length]}"]`).catch(() => {}); await fan.click('#cast').catch(() => {}); await sleep(1500); }
      await shot(dis, `le-ballot-${ballots + 1}`);
      await key('v'); ballots++;
      await sleep(1500); await shot(dis, `le-closed-${ballots}`);   // the game's clock stopped, the panel says closed
      await sleep(5500); await shot(dis, `le-reveal-${ballots}`);   // the game's own reveal
      continue;
    }
    if (!(await stepN())) await sleep(1500);
    await sleep(1600);
  }
  ok('the race runs to its end on N and the audience’s votes', !!crowned, `${ballots} ballots · ${await where()}`);
  await shot(dis, 'le-results');
  let winner = null;
  if (crowned) {
    const wp = (await db.players(LE)).find((p) => String(p.id) === String(crowned.winner));
    winner = CAST.find((c) => wp && c[2] === wp.name);
    ok('the console names the winner and offers their prize', !!(await waitFor(async () => /won Lesser Evil/.test(await text('#prizeT')), 12000)), await text('#prizeT'));
    await jump('390');
    await sleep(1500); await shot(dis, 'le-winner-card');
    ok('the winner card shows the champion', winner && (await dis.$eval('#stage .champ .nm', (e) => e.textContent).catch(() => '')) === winner[2], winner && winner[2]);
  }
  if (winner) {
    const wph = phones[winner[0]];
    const offer = await waitFor(() => wph.$('[data-role="host-demon"]'), 15000);
    ok('only the winner’s phone offers the roles, Demon included', !!offer && !(await phones[CAST.find((c) => c !== winner)[0]].$('[data-role]')));
    await shot(wph, 'phone-prize');
    if (offer) {
      await wph.click('[data-role="host-demon"]'); await sleep(300);
      await wph.click('[data-x="lock"]'); await sleep(300);
      await wph.click('[data-x="lock"]');
      ok('they lock in the Demon', !!(await waitFor(() => wph.$eval('body', (b) => /LOCKED IN/.test(b.innerText)), 8000)));
      await shot(wph, 'phone-prize-locked');
      ok('the console sees the pick (privately)', !!(await waitFor(async () => /picked Demon/.test(await text('#prizeT')), 10000)), await text('#prizeT'));
    }
  }

  // 5. Vessels
  await jump('401');
  const cvSrc = await waitFor(async () => { const s = await dis.$$eval('#engines iframe', (fs_) => fs_.map((f) => f.src)); return s.find((x) => /\/tv\.html/.test(x)); }, 20000);
  ok('intermission: the display hosts the Vessels TV', /\/tv\.html\?create=1&code=V-/.test(cvSrc || ''), cvSrc);
  const CV = new URL(cvSrc).searchParams.get('code');
  const cvGame = await waitFor(() => db.game(CV), 30000, 1000);
  ok('the Vessels TV creates its room', cvGame && cvGame.phase === 'lobby', cvGame && cvGame.phase);
  const cvSeats = await waitFor(async () => { const ps = await db.players(CV); return CAST.every((c) => ps.some((p) => p.name === c[2])) ? ps : null; }, 40000, 1500);
  ok('the cast phones follow into the Vessels room and take their seats', !!cvSeats, cvSeats && cvSeats.map((p) => p.name).join(', '));
  await sleep(2000); await shot(phones.ava, 'phone-cv-lobby');
  if (winner) ok('the pick is handed to the Vessels room before its deal', !!(await waitFor(async () => /with the game/.test(await text('#prizeT')), 15000)), await text('#prizeT'));
  await go(); await go(); await go();   // 410 501 505 (engine: start)
  if ((await nowId()) !== '505') { await sleep(3500); await go(); }   // the prize hold: a beat for the game to read the pick
  ok('GO reaches Roles dealt', (await nowId()) === '505', await text('#status'));
  const dealt = await waitFor(async () => { const g = await db.game(CV); return g && g.phase !== 'lobby' ? g.phase : null; }, 20000, 1000);
  ok('the Roles dealt cue starts the game', !!dealt, dealt);
  if (winner) {
    const me = await waitFor(async () => { const ps = await db.players(CV); const p = ps.find((x) => x.name === winner[2]); return p && p.role ? p : null; }, 15000, 1000);
    ok('the Lesser Evil winner is dealt the role they picked', me && me.role === 'host-demon', me && me.role);
    ok('and the pick is taken back for any replay', !!(await waitFor(async () => { const c = await db.controlRow(CV); return c && c.role_pick == null; }, 15000, 1000)));
  }
  await shot(dis, 'cv-started');
  // N steps the game to the day's discussion (the night's action window runs its own clock)
  let atVote = null;
  for (let k = 0; k < 90 && !atVote; k++) {
    const g = await db.game(CV);
    if (g && g.phase === 'day' && (g.voting_open || (g.floor && g.floor.status === 'discussion'))) { atVote = g; break; }
    if (g && g.phase === 'ended') break;
    if (!(await stepN())) await sleep(1500);
    await sleep(1500);
  }
  ok('N steps the game to the day’s discussion', !!atVote, await where());
  if (atVote) {
    await shot(dis, 'cv-day');
    await jump('550');
    const chips = await waitFor(async () => { const c = await con.$$('#nomChips button'); return c.length >= 2 ? c : null; }, 8000);
    ok('the console offers the living as suspects', !!chips, chips && chips.length);
    await go();
    ok('GO into the vote is held without suspects', (await nowId()) === '550' && /suspect/i.test(await text('#status')), await text('#status'));
    const names = await con.$$eval('#nomChips button', (b) => b.map((x) => x.textContent));
    const pick = names.map((n, i) => [n, i]).filter(([n]) => !/bot/.test(n)).slice(0, 2);
    while (pick.length < 2) pick.push([names[pick.length + 2], pick.length + 2]);
    for (const [, i] of pick) { await (await con.$$('#nomChips button'))[i].click(); await sleep(250); }
    await go();
    ok('with two suspects, GO opens the audience vote', (await nowId()) === '560', await text('#status'));
    const cands = await waitFor(async () => { await fan.reload({ waitUntil: 'networkidle2' }); await sleep(2500); return fan.$$eval('#faces .face', (f) => f.map((x) => x.dataset.id)); }, 15000, 3000);
    ok('/vote shows the two suspects', cands && cands.length === 2, cands && cands.join(','));
    await shot(dis, 'cv-vote'); await shot(fan, 'vote-cv');
    if (cands) { await fan.click(`[data-id="${cands[0]}"]`); await fan.click('#cast'); }
    ok('the console counts it', !!(await waitFor(async () => /1 in/.test(await text('#vTotal')), 8000)), await text('#vTotal'));
    await key('v');
    // the game names who goes (games.last_elimination) as the reveal lands; the seat is marked at the verdict
    const want = show.cast.find((c) => c.id === cands[0]);
    const out = await waitFor(async () => { const g = await db.game(CV); return g && g.last_elimination && g.last_elimination.name ? g.last_elimination : null; }, 20000, 1000);
    ok('V closes it and the game eliminates the audience’s pick', out && want && out.name === want.name, out && out.name);
    await sleep(3000); await shot(dis, 'cv-verdict'); await shot(con, 'console-verdict');
  }
  ok('no page errors in the launcher', pageErrs.length === 0, pageErrs.join(' | '));
  ok('no page errors on the phones', phoneErrs.length === 0, phoneErrs.join(' | '));
} catch (e) {
  bad++; console.log('FAIL the run stopped: ' + (e && e.stack || e));
} finally {
  const tail = mainLog.filter((l) => /night|ERR/.test(l)).slice(-15);
  if (tail.length) { note('launcher log:'); tail.forEach((l) => note(l.slice(0, 200))); }
  await chrome.close().catch(() => {});
  if (!process.argv.includes('--keep')) {
    await electron.disconnect().catch(() => {});
    try { execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { app.kill('SIGKILL'); }
    await db.setShow(SHOW, { live_game: null, live_room: null, stage: 'waiting' }).catch(() => {});
    fs.rmSync(DATA, { recursive: true, force: true });
  }
}
console.log(bad ? `\n${bad} checks failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
