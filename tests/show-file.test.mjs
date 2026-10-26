import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ShowFile = require('../src/show-file.js');
const Displays = require('../main/displays.js');
const Engine = require('../src/cue-engine.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(here, '..', 'shows', 'sample-show', 'show.json');
const cast = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'Cast ' + (i + 1), code: 'CODE' + (i + 1), photo: `photos/p${i + 1}.webp` }));
const base = () => ({ format: 'vessels-show/1', id: 'test-night', name: 'Test night', hostCode: 'HOST1', cast: cast(12),
  lesserEvil: { prompts: [{ text: 'A prompt' }] }, cues: [{ id: '101', title: 'Doors' }, { id: '201', title: 'Welcome', lock: 'cast' }],
  music: { tracks: [{ button: 1, name: 'Preshow', file: 'music/a.mp3' }] }, audience: { url: 'https://vessels-events.netlify.app/vote' } });
const yes = () => true;

test('the sample show loads clean and every cue is reachable with GO', () => {
  const r = ShowFile.load(SAMPLE);
  assert.deepEqual(r.errors, []);
  const show = r.show;
  assert.equal(show.cast.length, 12);
  assert.ok(show.fingerprint.length === 12);
  // walk the night: check everyone in, GO through, take every loop's default, and arrive at the last cue
  let s = Engine.initial(show, 0), t = 0, seen = new Set();
  show.cast.forEach((p) => { s = Engine.reduce(show, s, { type: 'checkin', id: p.id }, t).state; });
  for (let k = 0; k < 400; k++) {
    t += 1000;
    const v = Engine.view(show, s, t);
    if (v.current && v.current.loopTo && v.branch.auto === 'loop' && v.branch.max === null) s = Engine.reduce(show, s, { type: 'arm', way: 'exit' }, t).state;
    const r2 = Engine.reduce(show, s, { type: 'go' }, t);
    if (r2.error) { assert.match(r2.error, /End of the cue list/); break; }
    s = r2.state; seen.add(show.cues[s.i].id);
  }
  assert.equal(seen.size, show.cues.length, 'every cue was reached');
  assert.equal(show.cues[s.i].id, show.cues[show.cues.length - 1].id);
});

test('a good file passes; problems are errors or warnings as a stage manager would want', () => {
  assert.deepEqual(ShowFile.check(base(), '/x', yes), { errors: [], warnings: [] });
  const dup = base(); dup.cast[3].code = 'code1';
  assert.match(ShowFile.check(dup, '/x', yes).errors.join(), /Cast #4 \(Cast 4\): code is the same as Cast 1's/);
  const host = base(); host.hostCode = 'CODE2';
  assert.match(ShowFile.check(host, '/x', yes).errors.join(), /hostCode.*Cast 2's code/);
  const cues = base(); cues.cues.push({ id: '305', title: 'Round', loopTo: '320' }, { id: '777', title: 'x' }, { id: '305', title: 'again' });
  const ce = ShowFile.check(cues, '/x', yes).errors.join(' | ');
  assert.match(ce, /Cue 305: loopTo 320 must be an earlier cue/);
  assert.match(ce, /Cue 777: ids are 3-digit numbers from 100 to 699/);
  assert.match(ce, /Cue 305 appears twice/);
  const few = base(); few.cast = cast(10);
  const fw = ShowFile.check(few, '/x', () => false);
  assert.deepEqual(fw.errors, []);
  assert.match(fw.warnings.join(), /The cast has 10 people/);
  assert.match(fw.warnings.join(), /photo not found/);
  assert.match(fw.warnings.join(), /Track #1 \(Preshow\): file not found/);
  const noLock = base(); delete noLock.cues[1].lock;
  assert.match(ShowFile.check(noLock, '/x', yes).warnings.join(), /No cue waits for the cast check-in/);
});

test('the projector window never gets the codes', () => {
  const { show } = ShowFile.load(SAMPLE);
  const d = ShowFile.forDisplay(show);
  assert.equal(d.hostCode, undefined);
  assert.ok(d.cast.every((p) => p.code === undefined));
  assert.ok(show.cast.every((p) => p.code), 'the console still has them');
});

test('projector pick: the remembered one, else the biggest non-laptop screen, else none', () => {
  const D = (id, w, h, label, internal) => ({ id, size: { width: w, height: h }, label, internal: !!internal });
  const laptop = D(1, 1920, 1080, 'Built-in', true), proj = D(2, 1280, 720, 'EPSON'), tv = D(3, 3840, 2160, 'LG TV');
  assert.equal(Displays.pick([laptop], 1, null), null);
  assert.equal(Displays.pick([laptop, proj, tv], 1, null).id, 3, 'biggest');
  assert.equal(Displays.pick([laptop, proj, tv], 1, { id: 2 }).id, 2, 'remembered');
  assert.equal(Displays.pick([laptop, D(9, 1280, 720, 'EPSON'), tv], 1, { id: 2, label: 'EPSON', w: 1280, h: 720 }).id, 9, 'same projector, new id');
  assert.equal(Displays.pick([laptop, proj], 1, { id: 'none' }), null, 'operator chose no projector');
  assert.equal(Displays.pick([laptop, proj], 1, { id: 77 }).id, 2, 'remembered one gone: the one that is there');
});

test('the audience link: a full https link, defaulting to the event site; the QR encodes it exactly', () => {
  const bad = base(); bad.audience = { url: 'vessels-events.netlify.app/vote' };
  assert.match(ShowFile.check(bad, '/x', yes).errors.join(), /audience\.url.*https/);
  const none = base(); delete none.audience;
  assert.match(ShowFile.check(none, '/x', yes).warnings.join(), /QR points at https:\/\/vessels-events\.netlify\.app\/vote/);
  const { show } = ShowFile.load(SAMPLE);
  assert.equal(show.audience.url, 'https://vessels-events.netlify.app/vote');
  // render the SVG's modules to pixels and read it back with a real decoder
  const QR = require('../src/qr.js'), jsQR = require('jsqr');
  const svg = QR.svg(show.audience.url, 4);
  const size = +/viewBox="0 0 (\d+)/.exec(svg)[1], k = 8, W = size * k;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x0 = +m[1] * k, y0 = +m[2] * k;
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  }
  assert.equal(jsQR(px, W, W).data, 'https://vessels-events.netlify.app/vote');
});

test('the night id: lower case and dashes, or made from the name', () => {
  const bad = base(); bad.id = 'Cork Bar!';
  assert.match(ShowFile.check(bad, '/x', yes).errors.join(), /"id" is 3 to 40/);
  const none = base(); delete none.id; none.name = 'Vessels Live · The Cork Bar';
  assert.match(ShowFile.check(none, '/x', yes).warnings.join(), /will use "vessels-live-the-cork-bar"/);
  assert.equal(ShowFile.load(SAMPLE).show.id, 'sample-night');
});

test('the music bank: "loop" is true or false; only 4 stingers get buttons; a missing file is marked', () => {
  const o = base();
  o.music.tracks.push({ button: 2, name: 'Bad loop', file: 'music/b.mp3', loop: 'yes' });
  o.music.stingers = [1, 2, 3, 4, 5].map((n) => ({ name: 'S' + n, file: `sfx/${n}.mp3` }));
  const r = ShowFile.check(o, '/x', yes);
  assert.ok(r.errors.some((e) => /Bad loop.*"loop" is true or false/.test(e)), r.errors.join(' | '));
  assert.ok(r.warnings.some((w) => /5 stingers: only the first 4/.test(w)));
  const show = ShowFile.load(SAMPLE).show;
  assert.ok(show.music.tracks.every((t) => t.missing === false), 'the sample’s music is all there');
});
