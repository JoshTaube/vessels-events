// Vessels Events smoke test: launches the real app on the sample show (in a throwaway data folder), drives the
// console like an operator over the DevTools protocol, checks the projector window follows, and saves screenshots to
// screenshots/. Then restarts it to prove the show resumes on the same cue.
//   node tools/smoke.mjs            (exit code 0 = all good)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const electronPath = require('electron');   // in plain Node this is the path to the Electron binary
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
// read a QR out of a screenshot, the way a phone would (null if nothing scans)
const scan = (buf) => { const png = PNG.sync.read(buf); const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height); return r ? r.data : null; };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'screenshots');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vessels-events-smoke-'));
const PORT = 9333;
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };

async function launch(extra) {
  // --offline: this is the launcher on its own (no event database, no games); tools/launcher-check.mjs runs it online
  const child = spawn(electronPath, ['.', '--show=shows/sample-show/show.json', `--user-data=${DATA}`, `--remote-debugging-port=${PORT}`, '--display=none', '--offline', ...extra], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const errs = [];
  child.stderr.on('data', (d) => { const t = String(d); if (/error/i.test(t) && !/DevTools listening|GPU|gpu|cache|Autofill/i.test(t)) errs.push(t.trim()); });
  let browser = null;
  for (let k = 0; k < 60 && !browser; k++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }); } catch (e) { /* not up yet */ } }
  if (!browser) throw new Error('Electron did not start');
  let pages = [];
  for (let k = 0; k < 40; k++) { pages = await browser.pages(); if (pages.length >= 2) break; await sleep(250); }
  const byUrl = (s) => pages.find((p) => p.url().includes(s));
  const con = byUrl('/console/'), dis = byUrl('/display/');
  const pageErrs = [];
  [con, dis].forEach((p, i) => p.on('pageerror', (e) => pageErrs.push((i ? 'display: ' : 'console: ') + e.message)));
  await sleep(1200);
  return { child, browser, con, dis, errs, pageErrs };
}
function kill(child) { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { child.kill('SIGKILL'); } }

const app = await launch(['--fresh']);
const { con, dis } = app;
const text = (p, sel) => p.$eval(sel, (el) => el.textContent.trim()).catch(() => null);
const stageText = () => dis.$eval('#stage', (el) => el.innerText.replace(/\s+/g, ' ').trim());
const key = async (k, mods) => { if (mods) await con.keyboard.down(mods); await con.keyboard.press(k); if (mods) await con.keyboard.up(mods); await sleep(750); };
try {
  check('console shows the sample show', (await text(con, '#showName')) === 'Vessels Live · Sample Night', await text(con, '#showName'));
  check('standing by before the first GO', (await text(con, '#nowTitle')) === 'Standing by');
  check('projector stays black before the first GO', (await dis.$('#stage .scr.black')) !== null);
  await con.screenshot({ path: path.join(SHOTS, 'console-standby.png') });

  await key('Space');
  check('GO starts on cue 101', (await text(con, '#nowId')) === '101', await text(con, '#nowTitle'));
  check('the projector plays the menu loop', (await dis.$('#stage .scr.loop')) !== null);
  await dis.screenshot({ path: path.join(SHOTS, 'display-101-menu-loop.png') });

  // the check-in screen lights seats as the cast arrives; the welcome stays locked until all 12 are in
  await key('Space');
  check('110 shows the check-in screen', (await dis.$('#stage .scr.checkin')) !== null);
  const seats = await con.$$eval('[data-ci]', (b) => b.map((x) => x.dataset.ci));
  for (const id of seats.slice(0, 7)) { await con.click(`[data-ci="${id}"]`); await sleep(80); }
  await sleep(500);
  check('seats light on the projector as the cast checks in', (await dis.$$('#stage .seat.in')).length === 7, await text(dis, '.gathered'));
  await dis.screenshot({ path: path.join(SHOTS, 'display-110-checkin.png') });
  await key('Space');
  check('next is the welcome, locked', (await text(con, '#nextId')) === '201' && !(await con.$eval('#nextLock', (e) => e.classList.contains('hidden'))), await text(con, '#nextLock'));
  await con.screenshot({ path: path.join(SHOTS, 'console-locked.png') });
  await key('Space');
  check('GO refused while locked', (await text(con, '#nowId')) === '120', await text(con, '#toast'));
  for (const id of seats.slice(7)) { await con.click(`[data-ci="${id}"]`); await sleep(80); }
  await sleep(500);
  check('all 12 seats checked in', (await text(con, '#ciCount')).startsWith('12 of 12'), await text(con, '#ciCount'));
  await key('Space');
  check('welcome runs once everyone is in', (await text(con, '#nowId')) === '201');
  await dis.screenshot({ path: path.join(SHOTS, 'display-201-welcome.png') });
  await con.screenshot({ path: path.join(SHOTS, 'console-welcome.png') });
  await key('Space');
  await dis.screenshot({ path: path.join(SHOTS, 'display-210-meet-the-cast.png') });

  // safety cues: S1 hold over the show, GO waits, Esc clears, the show is where it was
  await key('1');
  check('S1 puts the hold loop up', (await dis.$('#stage .safe.full .scr.loop')) !== null);
  await key('Space');
  check('GO waits while S1 is up', (await text(con, '#nowId')) === '210');
  await con.screenshot({ path: path.join(SHOTS, 'console-s1-hold.png') });
  await key('Escape');
  check('Esc clears it, same cue', (await dis.$('#stage .safe.full')) === null && (await text(con, '#nowId')) === '210');
  await key('2'); await dis.screenshot({ path: path.join(SHOTS, 'display-s2-technical.png') }); await key('2');
  await key('4'); await (await con.$('[data-pick]')).click(); await sleep(500);
  check('S4 reconnecting banner names the cast member', /Reconnecting/i.test(await stageText()), await stageText());
  await dis.screenshot({ path: path.join(SHOTS, 'display-s4-reconnecting.png') });
  await key('Escape'); await key('Escape');

  // Lesser Evil: one game cue holds the race (its engine runs the rounds); offline, its card holds the screen
  for (let k = 0; k < 20 && (await text(con, '#nowId')) !== '310'; k++) await key('Space');
  check('GO reaches the Lesser Evil race', (await text(con, '#nowId')) === '310', await text(con, '#nowTitle'));
  check('Lesser Evil cues use the Lesser Evil look', (await dis.$('#stage .scr.le .le-stripe')) !== null);
  check('offline, the game panel says so', /Offline/.test(await text(con, '#gWhere')), await text(con, '#gWhere'));
  await dis.screenshot({ path: path.join(SHOTS, 'display-310-lesser-evil.png') });
  await key('1'); await dis.screenshot({ path: path.join(SHOTS, 'display-s1-lesser-evil.png') }); await key('1');

  // Core Vessels' nights loop; the branch box offers the way out
  await con.evaluate(() => { window.confirm = () => true; });   // the jump asks first
  await (await con.$('[data-cue="570"]')).click({ clickCount: 2 }); await sleep(900);
  const branch = await text(con, '#branch');
  const branchUp = await con.$eval('#branch', (e) => !e.classList.contains('hidden'));
  check('at the verdict GO offers another night', branchUp && /Next night · round 2/.test(branch), branch.replace(/\s+/g, ' '));
  await con.screenshot({ path: path.join(SHOTS, 'console-loop.png') });
  await key('Space');
  check('GO loops back to the next night', /Round 2/.test(await text(con, '#nowMeta')), await text(con, '#nowMeta'));

  // jump to intermission: a 15 minute timer on the projector; S5 adds 30 s
  await con.evaluate(() => { window.confirm = () => true; });
  const li = await con.$('[data-cue="401"]');
  await li.click({ clickCount: 2 }); await sleep(700);
  check('double-click jumps to intermission', (await text(con, '#nowId')) === '401');
  const t1 = await text(dis, '[data-timer]');
  await key('5');
  const t2 = await text(dis, '[data-timer]');
  check('intermission counts down from 15:00 and S5 adds 30 s', /^1[45]:\d\d$/.test(t1) && /^15:[23]\d$/.test(t2), `${t1} then ${t2}`);
  await dis.screenshot({ path: path.join(SHOTS, 'display-401-intermission.png') });
  await con.screenshot({ path: path.join(SHOTS, 'console-intermission.png') });

  // the audience QR: in the corner all night (themed, Q toggles it), big on vote screens; both must scan
  const VOTE = 'https://vessels-events.netlify.app/vote';
  check('the corner QR is up during intermission', (await dis.$('#stage .cornerqr .qr')) !== null);
  const corner = await (await dis.$('#stage .cornerqr .tile')).screenshot();
  check('the corner QR scans to the vote page', scan(corner) === VOTE, scan(corner));
  await key('q');
  check('Q takes the corner QR down', (await dis.$('#stage .cornerqr')) === null && /off/.test(await text(con, '#qrBtn')));
  await key('q');
  check('Q puts it back', (await dis.$('#stage .cornerqr')) !== null);
  await (await con.$('[data-cue="230"]')).click({ clickCount: 2 }); await sleep(900);
  check('a vote screen shows the big QR instead of the corner one', (await dis.$('#stage .bigqr .qr')) !== null && (await dis.$('#stage .cornerqr')) === null);
  const big = await dis.screenshot({ path: path.join(SHOTS, 'display-230-practice-vote.png') });
  check('the big QR scans from a screenshot of the whole projector', scan(big) === VOTE, scan(big));
  await (await con.$('[data-cue="310"]')).click({ clickCount: 2 }); await sleep(900);
  check('in Lesser Evil the corner QR wears its colours', (await dis.$('#stage .cornerqr.le')) !== null);
  await dis.screenshot({ path: path.join(SHOTS, 'display-310-lesser-evil-qr.png') });
  await (await con.$('[data-cue="401"]')).click({ clickCount: 2 }); await sleep(900);
  for (const [q, nm] of [['301', 'display-301-lesser-evil-title.png'], ['501', 'display-501-vessels-title.png'], ['560', 'display-560-vote.png']]) {
    await (await con.$(`[data-cue="${q}"]`)).click({ clickCount: 2 }); await sleep(900); await dis.screenshot({ path: path.join(SHOTS, nm) });
  }
  check('Vessels cues use the Vessels look', (await dis.$('#stage .scr.le')) === null);
  const download = await con.$('[data-cue="620"]'); await download.click({ clickCount: 2 }); await sleep(700);
  await dis.screenshot({ path: path.join(SHOTS, 'display-620-download.png') });
  await (await con.$('[data-cue="401"]')).click({ clickCount: 2 }); await sleep(700);
  check('no page errors', app.pageErrs.length === 0, app.pageErrs.join(' | '));
} finally {
  await app.browser.disconnect().catch(() => {});
  await sleep(600);   // the state file is written 150 ms after the last change
  kill(app.child);
}

// restart: the show picks up on the same cue with the same check-ins
await sleep(1500);
const again = await launch([]);
try {
  check('after a restart the show resumes on 401', (await text(again.con, '#nowId')) === '401', await text(again.con, '#status'));
  check('check-ins survive the restart', (await text(again.con, '#ciCount')).startsWith('12 of 12'));
  check('no page errors after restart', again.pageErrs.length === 0, again.pageErrs.join(' | '));
} finally {
  await again.browser.disconnect().catch(() => {});
  kill(again.child);
}
fs.rmSync(DATA, { recursive: true, force: true });
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `\n${bad} of ${results.length} checks failed` : `\nall ${results.length} checks passed · screenshots in ${SHOTS}`);
process.exit(bad ? 1 : 0);
