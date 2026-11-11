// Soul Purpose: plays a full run in a phone-sized Chromium with real pointer drags, checks the rules,
// and saves screenshots. Run: node soul-purpose/tools/playtest.mjs [outDir]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // the pre-installed global one
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '../www/index.html')).href;
const out = process.argv[2] || path.join(here, '../screenshots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const external = [];
page.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) external.push(r.url()); }); // blob:/data: are in-memory
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const check = (cond, msg) => { if (!cond) fail(msg); else console.log('ok -', msg); };
const sleep = (ms) => page.waitForTimeout(ms);

async function waitTyped() {
  await page.waitForSelector('.card .excuse.show');
}
/** Drag the current card through a list of x offsets (fractions of the arena width), then release. */
async function drag(path) {
  const box = await page.locator('.card').last().boundingBox();
  const arena = await page.locator('.arena').boundingBox();
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  let x = x0;
  for (const f of path) {
    const tx = x0 + f * arena.width;
    for (let k = 1; k <= 6; k++) { await page.mouse.move(x + ((tx - x) * k) / 6, y0); await sleep(12); }
    x = tx;
  }
  await page.mouse.up();
}
const counts = () => page.evaluate(() => ({ ...window.SP.game.run.counts, index: window.SP.game.run.index }));
async function waitIndex(n) { await page.waitForFunction((n) => window.SP.game.run.index === n, n); }

await page.goto(url);
await shot('01-title');
await page.click('[data-act=play]');
await sleep(300);
await shot('02-intro');
await page.click('.intro-screen'); await sleep(150);
await page.click('.intro-screen'); await sleep(150);
await page.click('.intro-screen');
await page.waitForSelector('.card');
await waitTyped();
await shot('03-sort-first');

// Soul 1: drag toward Light, change mind, send Dark = 1 wobble.
await drag([0.2, -0.45]);
await waitIndex(1);
// Mid-drag screenshot on soul 2.
await waitTyped();
{
  const box = await page.locator('.card').last().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) { await page.mouse.move(box.x + box.width / 2 + k * 14, box.y + box.height / 2); await sleep(12); }
  await shot('04-sort-dragging-light');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.up();
  await sleep(300);
}
// A small drag that doesn't commit snaps back and sends nothing.
check((await counts()).index === 1, 'a short drag snaps back without sending the soul');

// Souls 2-10 to Dark (drags, with one Gary-visible pause on soul 5).
for (let i = 2; i <= 10; i++) {
  await waitTyped();
  if (i === 5) await sleep(3200);
  await drag([-0.5]);
  await waitIndex(i);
}
let c = await counts();
check(c.dark === 10 && c.light === 0, 'Dark fills at 10/10');
await sleep(250);
await shot('05-dark-full');

// Soul 11: try Dark (full) -> bounce, then the Dark button (full) -> bounce again, then Light.
await waitTyped();
await drag([-0.5]);
await sleep(500);
c = await counts();
check(c.dark === 10 && c.index === 10, 'a soul swiped at a full door bounces back');
await shot('06-bounce');
await page.click('[data-act=dark]');
await sleep(500);
check((await counts()).dark === 10, 'the full door button bounces too');
await page.click('[data-act=light]');
await waitIndex(11);

// Souls 12-20 to Light by button (keyboard for a couple).
for (let i = 12; i <= 20; i++) {
  await waitTyped();
  if (i % 3 === 0) await page.keyboard.press('ArrowRight'); else await page.click('[data-act=light]');
  if (i < 20) await waitIndex(i);
}
await page.waitForSelector('.reorg-screen');
const run1 = await page.evaluate(() => window.SP.game.run);
const recs = run1.souls.map((s) => run1.records[s.id]);
check(recs.filter((r) => r.choice === 'dark').length === 10 && recs.filter((r) => r.choice === 'light').length === 10, 'sorting ends at exactly 10/10');
console.log('  wobbles per soul:', recs.map((r) => r.wobbles).join(''));
check(recs[0].wobbles === 1, `soul 1 recorded 1 wobble (got ${recs[0].wobbles})`);
// Soul 2 was dragged toward Light, let go, then sent Dark: a change of mind across drags counts too.
check(recs[1].wobbles === 1, `soul 2 recorded 1 wobble (got ${recs[1].wobbles})`);
check(recs.slice(2).every((r) => r.wobbles === 0), 'no other wobbles recorded (the forced switch after a bounce is not one)');
check(recs[10].bounced === true && recs.filter((r) => r.bounced).length === 1, 'soul 11 recorded as bounced, only soul 11');
check(recs[4].decisionMs >= 3000, `soul 5 decision time includes the pause (${recs[4].decisionMs}ms)`);
check(recs.every((r) => r.decisionMs >= 0), 'all decision times recorded');
await shot('07-reorganize');

// Reorganize: one swap, and a select/deselect that doesn't swap.
const darkFirst = page.locator('[data-col=dark] .mini').first();
await darkFirst.click();
await darkFirst.click(); // deselect
await page.locator('[data-col=dark] .mini').nth(2).click();
await shot('08-reorganize-selected');
await page.locator('[data-col=light] .mini').nth(4).click();
await sleep(200);
check(await page.locator('[data-col=dark] .mini').count() === 10 && await page.locator('[data-col=light] .mini').count() === 10, 'a swap keeps 10/10');
check((await page.locator('.swap-count b').textContent()) === '1', 'swap counter reads 1');
await shot('09-reorganize-swapped');
await page.click('[data-act=lock]');

// Results reveals.
await page.waitForSelector('.results-screen');
await sleep(500);
await shot('10-results-stats');
await page.click('.reveal'); await sleep(400);
await shot('11-results-archetype');
await page.click('.reveal'); await sleep(1700);
await shot('12-results-verdict');
await page.click('.reveal'); await sleep(400);
await shot('13-results-home');
await page.click('.reveal'); await sleep(400);
await page.waitForSelector('.share-img[data-ready]', { timeout: 15000 });
await shot('14-results-final');
/** Save the share card PNG the page made, and return its pixel size. */
async function saveCard(name) {
  const { b64, w, h } = await page.evaluate(async () => {
    const img = document.querySelector('.share-img');
    const buf = await (await fetch(img.src)).arrayBuffer();
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), w: img.naturalWidth, h: img.naturalHeight };
  });
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(b64, 'base64'));
  return [w, h];
}
const [cw, chh] = await saveCard('card-real');
check(cw === 1080 && chh === 1920, `share card is 1080x1920 (got ${cw}x${chh})`);
check(await page.locator('[data-act=save]:not([disabled])').count() === 1, 'SAVE IMAGE is ready');

// Debug panel: tap Gary 5 times.
for (let k = 0; k < 5; k++) { await page.click('.results-gary'); await sleep(80); }
await page.waitForSelector('.debug');
await shot('15-debug');
const dbg = await page.locator('.debug-kv').textContent();
check(/swaps\s*1/.test(dbg) && /bounces\s*1/.test(dbg) && /wobbles\s*2/.test(dbg), 'debug panel shows wobbles 2, bounces 1, swaps 1');
check(/doubt = W \+ 2S \+ B\s*5/.test(dbg), 'doubt = 2 + 2 + 1 = 5');

// Force every archetype x place and check the screens render.
const keys = await page.evaluate(() => Object.keys(window.SP.data.ARCHETYPES));
let rendered = 0;
for (const k of keys) {
  for (const p of ['light', 'dark']) {
    if (!(await page.locator('.debug').count())) {
      for (let t = 0; t < 5; t++) { await page.click('.results-gary'); await sleep(60); }
      await page.waitForSelector('.debug');
    }
    await page.selectOption('[data-f=archetype]', k);
    await page.selectOption('[data-f=place]', p);
    await page.click('[data-act=force]');
    for (let t = 0; t < 4; t++) { await page.click('.reveal'); await sleep(t === 1 ? 1500 : 120); }
    await page.waitForSelector('.share-img[data-ready]', { timeout: 15000 });
    const txt = await page.locator('.share-img').getAttribute('alt');
    const size = await page.evaluate(() => [document.querySelector('.share-img').naturalWidth, document.querySelector('.share-img').naturalHeight]);
    if (size[0] !== 1080 || size[1] !== 1920) fail(`forced ${k}/${p} card is ${size}`);
    if (['stickyNote-dark', 'hotTake-light', 'overthinkingAngel-dark', 'hallMonitor-dark'].includes(k + '-' + p)) await saveCard(`card-${k}-${p}`);
    const want = await page.evaluate(([k, p]) => [window.SP.data.ARCHETYPES[k].name, window.SP.data.HOMES[k][p].name], [k, p]);
    if (txt.includes(want[0]) && txt.includes(want[1])) rendered++;
    else fail(`forced ${k}/${p} rendered "${txt}"`);
  }
}
check(rendered === 16, 'all 16 archetype x place results render when forced, each with a 1080x1920 share card');

// Play again starts a fresh, different run.
await page.click('[data-act=again]');
await page.waitForSelector('.card');
const run2 = await page.evaluate(() => window.SP.game.run);
check(run2.index === 0 && run2.souls.map((s) => s.id).join() !== run1.souls.map((s) => s.id).join(), 'PLAY AGAIN draws a new set of souls');

// Mute persists.
await page.click('#mute');
await page.reload();
check(await page.locator('#mute.is-muted').count() === 1, 'mute is remembered');
check(await page.locator('.last-result').count() === 1, 'title shows the last result');

check(external.length === 0, `no external requests (${external.join(', ') || 'none'})`);
check(errors.length === 0, `no page errors (${errors.join(' | ') || 'none'})`);

await browser.close();
console.log(process.exitCode ? 'PLAYTEST FAILED' : 'PLAYTEST PASSED', '- screenshots in', out);
