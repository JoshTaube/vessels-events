// Vessels Events: the whole night, online, played the way the operator plays it. Launches the real launcher (a
// throwaway data folder, fresh rooms, the event database) on a copy of the sample show with short Auto times, and
// drives it over the DevTools protocol with real phones (headless Chrome, phone-sized) on the live event site:
//   1. the launcher registers the night; the Lesser Evil TV it hosts creates its room; cast phones check in; the
//      host's phone (/host) takes the host code and the console sees it
//   2. the practice vote runs the whole vote pipe; the host's phone has the cue's line and the live count
//   3. Lesser Evil, played with Space alone (the Director, Manual): nothing moves on its own (a screen stays up, a
//      speech whose clock runs out stays up), each ballot goes to /vote with the game's own board on the
//      projector; the race is crowned; the winner picks their prize; Space at the results moves to the next cue
//   4. Core Vessels on Auto: the Director deals (on GO), then plays the screens by itself, stops for the suspects,
//      the host taps them on their phone, GO opens the audience vote, the game eliminates the audience's pick; Hold
//      stops Auto; Back shows an earlier screen again and Esc returns to the live game
// Screenshots: screenshots/night-*.png. Exit code 0 = all good. Takes several minutes.
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

// the sample night with short Auto times, so Core Vessels plays through in a few minutes
const showJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'shows/sample-show/show.json'), 'utf8'));
showJson.director = { mode: 'manual', times: { read: 3, story: 3, rolesHold: 1, rolesMax: 4, introHold: 2, introMax: 5, nightfall: 2, nightDone: 2,
  dawn: 3, testimonyHold: 2, testimonyMax: 5, verdict: 4, vote: 12, podium: 2, pickHold: 1 } };
const SHOWFILE = path.join(DATA, 'show.json');
fs.writeFileSync(SHOWFILE, JSON.stringify(showJson));

const app = spawn(electronPath, ['.', `--show=${SHOWFILE}`, `--user-data=${DATA}`, `--remote-debugging-port=${PORT}`, '--display=none', '--fresh'],
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
const screenTitle = () => text('#gWhere');
const key = async (k, mods) => { if (mods) await con.keyboard.down(mods); await con.keyboard.press(k); if (mods) await con.keyboard.up(mods); await sleep(700); };
const nowId = () => text('#nowId');
const jump = async (id) => { await (await con.$(`[data-cue="${id}"]`)).click({ clickCount: 2 }); await sleep(1200); };
const space = () => key('Space');
const voteOpen = () => con.$eval('#vbox', (e) => !e.classList.contains('hidden') && !e.classList.contains('closed')).catch(() => false);
// the fan votes for the first face on /vote (once the ballot is up)
async function fanVotes(fan, k) {
  const opts = await waitFor(async () => { const up = await fan.$eval('#vBallot', (e) => !e.classList.contains('hidden')); return up ? fan.$$eval('#faces .face', (f) => f.map((x) => x.dataset.id)) : null; }, 9000);
  if (opts && opts.length) { await fan.click(`[data-id="${opts[(k || 0) % opts.length]}"]`).catch(() => {}); await fan.click('#cast').catch(() => {}); }
  return opts;
}

try {
  // ---------------------------------------------------------------------------------------------
  // 1. online, rooms, check-in
  ok('the launcher goes online', await waitFor(async () => /Online/.test(await text('#gNet')), 25000), await text('#gNet'));
  const leSrc = await waitFor(() => dis.$eval('#engines iframe', (f) => f.src), 25000);
  ok('the display hosts the Lesser Evil TV from the laptop', /^http:\/\/127\.0\.0\.1:\d+\/lesser-evil-tv\.html\?code=V-/.test(leSrc || ''), leSrc);
  const LE = new URL(leSrc).searchParams.get('code');
  ok('the Lesser Evil TV creates its room in event mode', !!(await waitFor(() => db.game(LE), 30000, 1000)) && (await db.controlRow(LE)).event_mode === true);
  const CAST = [['ava', null, 'Ava'], ['bram', null, 'Bram'], ['cleo', null, 'Cleo'], ['dex', null, 'Dex']];
  for (const c of CAST) c[1] = showJson.cast.find((x) => x.id === c[0]).code;
  const phones = {};
  for (const [id, code] of CAST) {
    const p = phones[id] = await phone(id);
    await p.goto(`${SITE}/cast?s=${SHOW}`, { waitUntil: 'networkidle2' });
    await p.type('#code', code); await p.click('#go');
  }
  ok('four cast phones check in and light their seats', !!(await waitFor(async () => (await con.$$eval('#seats .seatb.in', (b) => b.length)) >= 4, 15000)), await text('#ciCount'));
  for (let k = 0; k < 12; k++) {
    const id = await con.$eval('#seats .seatb:not(.in)', (b) => b.dataset.ci).catch(() => null);
    if (!id) break;
    await con.click(`#seats [data-ci="${id}"]`); await sleep(250);
  }
  ok('the rest are marked by hand', /12 of 12/.test(await text('#ciCount')), await text('#ciCount'));
  // the host's phone
  const host = await phone('host');
  const htext = (sel) => host.$eval(sel, (e) => e.textContent.trim()).catch(() => '');
  const hshown = (sel) => host.$eval(sel, (e) => !e.classList.contains('hidden')).catch(() => false);
  await host.goto(`${SITE}/host?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await host.type('#code', 'NOPE-1'); await host.click('#go');
  ok('/host refuses a wrong code', !!(await waitFor(async () => /isn’t tonight’s/.test(await htext('#err')), 8000)), await htext('#err'));
  await host.$eval('#code', (e) => { e.value = ''; });
  await host.type('#code', showJson.hostCode); await host.click('#go');
  ok('/host takes the host code and follows the show (standing by, the first cue next)', !!(await waitFor(async () => await hshown('#vLive')
    && /Standing by/.test(await htext('#cueT')) && /Next · 101/.test(await htext('#nextLbl')) && /\bok\b/.test(await host.$eval('#dot', (d) => d.className)), 12000)),
    `${await htext('#cueT')} · ${await htext('#nextLbl')}`);
  ok('the console sees the host’s phone', !!(await waitFor(async () => /host phone live/.test(await text('#hvSt')), 12000)), await text('#hvSt'));

  // 2. the practice vote
  for (let k = 0; k < 7; k++) await space();   // 101 110 120 201 210 220 230
  ok('GO reaches the practice vote', (await nowId()) === '230', await nowId());
  const fan = await phone('fan');
  await fan.goto(`${SITE}/vote?s=${SHOW}`, { waitUntil: 'networkidle2' });
  await fanVotes(fan, 3);
  ok('the console counts the practice vote', !!(await waitFor(async () => /1 in/.test(await text('#vTotal')), 8000)), await text('#vTotal'));
  const say230 = showJson.cues.find((c) => c.id === '230').say;
  ok('the host’s phone has the cue and the line to say', !!(await waitFor(async () => /230/.test(await htext('#cueLbl')) && (await htext('#say')) === say230, 8000)), `${await htext('#cueLbl')} · ${await htext('#say')}`);
  ok('the host’s phone sees the count before the room does', !!(await waitFor(async () => await hshown('#voteC') && /^1 vote$/.test(await htext('#voteTotal')) && await hshown('#votePractice'), 8000)), await htext('#voteTotal'));
  await shot(host, 'host-practice');
  await space();
  ok('the host knows who won', !!(await waitFor(async () => /wins|tie/.test(await htext('#voteState')), 8000)), await htext('#voteState'));
  ok('leaving the cue closes it', !!(await waitFor(async () => /Closed · 1 vote/.test(await text('#vTotal')), 8000)), await text('#vTotal'));

  // ---------------------------------------------------------------------------------------------
  // 3. Lesser Evil, Manual, Space only
  await space(); await space(); await space();   // 301 305 310
  ok('GO reaches the race cue', (await nowId()) === '310', await nowId());
  ok('the race cue shows the game track: the lobby', /Lobby/.test(await screenTitle()), await screenTitle());
  ok('the host’s phone turns red, white and blue with the race’s screen on it', !!(await waitFor(async () =>
    (await host.$eval('body', (b) => b.classList.contains('le'))) && (await htext('#gameLbl')) === 'Lesser Evil' && /Lobby/.test(await htext('#gameT')), 8000)), await htext('#gameT'));
  const leSeats = await waitFor(async () => { const ps = await db.players(LE); return CAST.every((c) => ps.some((p) => p.name === c[2])) ? ps : null; }, 30000, 1500);
  ok('the cast follow into the race and take their seats by name', !!leSeats, leSeats && leSeats.map((p) => p.name).join(', '));
  await space();
  ok('GO is refused until the race can start, and says why', (await nowId()) === '310' && /slogan|choosing|more in the race/i.test(await text('#status')), await text('#status'));
  for (const [id] of CAST) {
    const p = phones[id], box = await waitFor(() => p.$('#lepSlogan'), 15000);
    if (box) { await box.click({ clickCount: 3 }); await p.keyboard.type(`${id} for president`); await p.keyboard.press('Enter'); await p.$eval('#lepSlogan', (e) => e.blur()).catch(() => {}); }
  }
  ok('the lobby is ready', !!(await waitFor(async () => /Ready/i.test(await text('#gState')), 20000)), await text('#gState'));
  await space();
  ok('GO plays the intro', /intro/i.test(await screenTitle()), await screenTitle());
  await space();   // skip the film
  const lineups = await waitFor(async () => /line-ups/i.test(await screenTitle()) ? await screenTitle() : null, 40000, 1000);
  ok('the race starts: the line-ups', !!lineups, await screenTitle());
  await shot(dis, 'le-lineups');
  await sleep(7000);
  ok('Manual: the line-ups stay up until GO (7 s later)', /line-ups/i.test(await screenTitle()), await screenTitle());
  // the race, screen by screen, with Space; the first speech is left to run out to prove it waits
  let ballots = 0, crowned = null, ranOut = false;
  const leFrame = () => dis.frames().find((f) => /lesser-evil-tv\.html/.test(f.url()));
  for (let k = 0; k < 140 && !crowned; k++) {
    const g = await db.game(LE).catch(() => null);
    if (g && g.le && (g.le.phase === 'results' || g.le.phase === 'complete') && g.le.winner != null) { crowned = g.le; break; }
    const title = await screenTitle();
    if (await voteOpen()) {
      if (!ballots) {
        ok('a ballot keeps the game’s own board on the projector, with the vote panel beside it',
          (await dis.$eval('body', (b) => b.classList.contains('gameon'))) && !!(await dis.$('#stage .votepanel .tile .qr')), title);
        await shot(dis, 'le-ballot');
        ok('the host’s phone has the ballot', !!(await waitFor(async () => await hshown('#voteC') && (await htext('#voteLbl')) === 'Audience ballot', 6000)), await htext('#voteLbl'));
        await shot(host, 'host-le-ballot');
      }
      await fanVotes(fan, k); await sleep(1200);
      await space(); ballots++;
      await sleep(6500);
      continue;
    }
    if (!ranOut && / is speaking$/.test(title)) {
      // the speaker's clock runs out (moved to now inside the TV): the buzzer, but the screen stays up, READY
      await leFrame().evaluate(() => window.LE_HOST.leWrite('test-clock', (s) => { s.deadline = Date.now() - 1000; if (s.stage && s.stage.speech) s.stage.speech.deadline = s.deadline; return s; }));
      await sleep(6000);
      ok('Manual: a speech whose clock has run out stays up until GO', (await screenTitle()) === title && /Ready/i.test(await text('#gState')), `${await screenTitle()} · ${await text('#gState')}`);
      ranOut = true;
    }
    await space();
    await sleep(1600);
  }
  ok('Space alone plays the race to its end, a ballot on /vote each round', !!crowned && ballots > 0, `${ballots} ballots · ${await screenTitle()}`);
  await shot(dis, 'le-results');
  let winner = null;
  if (crowned) {
    const wp = (await db.players(LE)).find((p) => String(p.id) === String(crowned.winner));
    winner = CAST.find((c) => wp && c[2] === wp.name);
    ok('the console offers the winner their prize', !!(await waitFor(async () => /won Lesser Evil/.test(await text('#prizeT')), 12000)), await text('#prizeT'));
    await space();
    ok('at the results GO moves on to the next cue (one GO)', (await nowId()) === '390', await nowId());
    await sleep(1200); await shot(dis, 'le-winner-card');
  }
  if (winner) {
    const wph = phones[winner[0]];
    const offer = await waitFor(() => wph.$('[data-role="host-demon"]'), 15000);
    if (offer) {
      await wph.click('[data-role="host-demon"]'); await sleep(300);
      await wph.click('[data-x="lock"]'); await sleep(300);
      await wph.click('[data-x="lock"]');
    }
    ok('the winner locks in the Demon on their phone', !!(await waitFor(async () => /picked Demon/.test(await text('#prizeT')), 12000)), await text('#prizeT'));
    ok('the host’s phone keeps the pick behind a button', !!(await waitFor(async () => /locked in/.test(await htext('#prizeT')) && await hshown('#peek')
      && (await host.$eval('#peek', (b) => b.dataset.role)) === 'Demon' && !/Demon/.test(await htext('#prizeC')), 8000)), await htext('#prizeT'));
  }

  // ---------------------------------------------------------------------------------------------
  // 4. Core Vessels on Auto
  await jump('401');
  const cvSrc = await waitFor(async () => { const s = await dis.$$eval('#engines iframe', (fs_) => fs_.map((f) => f.src)); return s.find((x) => /\/tv\.html/.test(x)); }, 20000);
  const CV = cvSrc && new URL(cvSrc).searchParams.get('code');
  ok('intermission: the Vessels TV creates its room and the cast follow', !!(await waitFor(async () => { const ps = await db.players(CV); return CAST.every((c) => ps.some((p) => p.name === c[2])); }, 45000, 1500)));
  if (winner) ok('the prize goes to the Vessels room before its deal', !!(await waitFor(async () => /with the game/.test(await text('#prizeT')), 15000)), await text('#prizeT'));
  await space(); await space(); await space();   // 410 501 505
  ok('GO reaches the game cue: the lobby', (await nowId()) === '505' && /Lobby/.test(await screenTitle()), await screenTitle());
  await key('a');
  ok('A turns Auto on', /Auto/i.test(await text('#gAuto')) && /on/.test(await con.$eval('[data-mode="auto"]', (b) => b.className)), await text('#gAuto'));
  ok('Auto never starts a game by itself', /Auto stops here/i.test(await text('#gAuto')), await text('#gAuto'));
  await space();
  const dealt = await waitFor(async () => { const g = await db.game(CV); return g && g.phase !== 'lobby' ? g.phase : null; }, 20000, 1000);
  ok('GO deals the roles', !!dealt, dealt);
  if (winner) {
    const me = await waitFor(async () => { const p = (await db.players(CV)).find((x) => x.name === winner[2]); return p && p.role ? p : null; }, 15000, 1000);
    ok('the Lesser Evil winner is dealt the role they picked', me && me.role === 'host-demon', me && me.role);
  }
  // Auto plays the screens by itself, up to the suspects
  const seen = new Set();
  const disc = await waitFor(async () => { seen.add(await screenTitle()); return /discussion/i.test(await screenTitle()) ? true : null; }, 300000, 1000);
  ok('Auto plays the game screen by screen up to the day’s discussion', !!disc, [...seen].join(' → ').slice(0, 220));
  await shot(con, 'console-auto');
  // Back: an earlier screen again, then live
  ok('the game can’t take the projector full screen (the launcher’s layers stay on top)', await dis.evaluate(() => !document.fullscreenElement));
  await key('Backspace', 'Shift');
  const onTop = await dis.evaluate(() => { const t = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return t && t.tagName !== 'IFRAME'; });
  ok('Back shows an earlier screen on the projector again, over the live game', onTop && (await dis.$eval('body', (b) => b.classList.contains('replaying'))) && /REPLAY/.test(await text('#gReplay')), await text('#gReplay'));
  await shot(dis, 'cv-replay');
  await key('Escape');
  ok('Esc returns to the live game', !(await dis.$eval('body', (b) => b.classList.contains('replaying'))));
  ok('Auto stops at the suspects', /discussion/i.test(await screenTitle()) && /2 or 3 suspects/i.test(await text('#gStepTxt')), await text('#gStepTxt'));
  // the host picks the suspects on their phone
  ok('the host’s phone has the suspects to tap, and the roles in play', !!(await waitFor(async () => await hshown('#susC') && (await host.$$('#sus button')).length >= 3
    && /Demon/.test(await htext('#roles')), 10000)), await htext('#roles'));
  await shot(host, 'host-suspects');
  // the host might use a tablet: the same page in two columns
  await host.setViewport({ width: 1180, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(500);
  ok('on a tablet the host page goes two columns, the suspects beside the cue', await host.evaluate(() =>
    document.getElementById('susC').getBoundingClientRect().left > document.querySelector('.cue').getBoundingClientRect().right));
  await shot(host, 'host-suspects-tablet');
  await host.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await sleep(300);
  // two suspects who aren't the Demon, so the audience can't end the game on day 1 (the verdict and Hold come next)
  const roleOf = Object.fromEntries((await db.players(CV)).map((p) => [String(p.id), p.role]));
  const hn = (await host.$$eval('#sus button', (b) => b.filter((x) => !x.querySelector('small')).map((x) => x.dataset.id))).filter((id) => roleOf[id] !== 'host-demon');
  for (const id of hn.slice(0, 2)) { await host.click(`#sus [data-id="${id}"]`); await sleep(400); }
  ok('the host’s taps reach the console', !!(await waitFor(async () => (await con.$$eval('#nomChips button.on', (b) => b.map((x) => x.dataset.nom))).sort().join() === hn.slice(0, 2).sort().join(), 10000)),
    await con.$$eval('#nomChips button.on', (b) => b.map((x) => x.textContent).join(', ')).catch(() => ''));
  ok('the host’s phone shows them chosen', !!(await waitFor(async () => (await host.$$('#sus button.on:not(.wait)')).length === 2 && /Ready/.test(await htext('#susWhy')), 8000)), await htext('#susWhy'));
  await space();
  ok('GO opens the audience vote on the suspects', !!(await waitFor(voteOpen, 8000)), await screenTitle());
  ok('the vote screen covers the game on the projector', !(await dis.$eval('body', (b) => b.classList.contains('gameon'))) && !!(await dis.$('#stage .scr.vote')));
  await shot(dis, 'cv-vote');
  const cands = await fanVotes(fan, 0);
  ok('/vote shows the two suspects', cands && cands.length === 2, cands && cands.join(','));
  ok('the host’s phone drops the suspects and shows the vote', !!(await waitFor(async () => !(await hshown('#susC')) && await hshown('#voteC') && (await htext('#voteLbl')) === 'Audience vote', 8000)), await htext('#voteLbl'));
  await shot(host, 'host-cv-vote');
  const want = cands && showJson.cast.find((c) => c.id === cands[0]);
  const out = await waitFor(async () => { const g = await db.game(CV); return g && g.last_elimination && g.last_elimination.name ? g.last_elimination : null; }, 40000, 1000);
  ok('the vote closes on its clock and the game eliminates the audience’s pick', out && want && out.name === want.name, out && out.name);
  const verdict = await waitFor(async () => /verdict/i.test(await screenTitle()) ? await screenTitle() : null, 15000);
  ok('the verdict is on screen', !!verdict, await screenTitle());
  await key('h');
  const held = await screenTitle();
  await sleep(8000);
  ok('Hold keeps Auto on the verdict', (await screenTitle()) === held && /Held/.test(await text('#gAuto')), `${await screenTitle()} · ${await text('#gAuto')}`);
  await key('h');
  ok('releasing Hold lets Auto move on', !!(await waitFor(async () => (await screenTitle()) !== held, 15000)), await screenTitle());
  await shot(dis, 'cv-after');
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
