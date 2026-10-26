// The music (main/music.js) and the Stream Deck's keys (main/deck.js): what reaches the player window, the games'
// volume, the games keeping their own music, the player's reports; every key once, every page 15 keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Music = require('../main/music.js');
const Deck = require('../main/deck.js');

const BANK = {
  tracks: [{ button: 2, name: 'Lobby', file: '/m/lobby.mp3' }, { button: 1, name: 'Menu', file: '/m/menu.mp3' },
    { button: 3, name: 'Gone', file: '/m/gone.mp3', missing: true }, { button: 4, name: 'Once', file: '/m/once.mp3', loop: false }],
  stingers: [{ name: 'Gavel', file: '/m/gavel.mp3' }, { name: 'Chime', file: '/m/chime.mp3' }, { name: 'C', file: '/c' }, { name: 'D', file: '/d' }, { name: 'Fifth', file: '/e' }],
};
function setup() {
  const sent = [], levels = [], notices = [];
  let changes = 0;
  const m = Music.make({ send: (x) => sent.push(x), onChange: () => changes++, onLevel: (v) => levels.push(v),
    notice: (t, bad) => notices.push([t, !!bad]), url: (f) => 'file://' + f });
  m.setBank(BANK);
  return { m, sent, levels, notices, last: (type) => sent.filter((x) => x.type === type).pop(), changes: () => changes };
}

test('a track plays, a second crossfades over it, the same one again does nothing', () => {
  const t = setup();
  assert.equal(t.m.play(1).flash, 'Playing Menu');
  let p = t.last('play');
  assert.equal(p.url, 'file:///m/menu.mp3'); assert.equal(p.loop, true); assert.equal(p.ms, 150, 'the first one just starts');
  assert.match(t.m.play(1).flash, /already playing/);
  assert.equal(t.sent.filter((x) => x.type === 'play').length, 1);
  t.m.play(2);
  p = t.last('play');
  assert.equal(p.ms, Music.CROSS_MS, 'a crossfade over the last');
  assert.equal(t.m.status().track.name, 'Lobby');
  t.m.play(4);
  assert.equal(t.last('play').loop, false, '"loop": false plays once');
});

test('a missing file or an empty button says so; stingers are the first 4', () => {
  const t = setup();
  assert.match(t.m.play(3).error, /file isn’t there/);
  assert.match(t.m.play(7).error, /No track on button 7/);
  assert.equal(t.m.status().stingers.length, 4);
  assert.equal(t.m.stinger(2).flash, 'Chime');
  assert.deepEqual(t.last('stinger'), { type: 'stinger', url: 'file:///m/chime.mp3', gain: 1 });
  assert.match(t.m.stinger(5).error, /No stinger 5/);
});

test('Fade: the bed fades and stops when the player says so; nothing playing is an error', () => {
  const t = setup();
  assert.match(t.m.fade().error, /No music/);
  t.m.play(1);
  const id = t.last('play').id;
  t.m.fade();
  assert.deepEqual(t.last('fade'), { type: 'fade', id, ms: Music.FADE_MS });
  assert.equal(t.m.status().fading, true);
  t.m.report({ type: 'stopped', id });
  assert.equal(t.m.status().track, null);
});

test('the duck and the volume: the beds, the stingers, and the games’ master volume', () => {
  const t = setup();
  t.m.duck();
  let l = t.last('level');
  assert.ok(Math.abs(l.music - Music.gainOf(-12)) < 1e-9); assert.equal(l.stingers, 1, 'stingers aren’t ducked');
  assert.equal(t.levels.pop(), 25, 'the games go down 12 dB too');
  t.m.duck();
  assert.equal(t.levels.pop(), 100);
  t.m.vol(-1); t.m.vol(-1);
  l = t.last('level');
  assert.ok(Math.abs(l.music - Music.gainOf(-6)) < 1e-9); assert.ok(Math.abs(l.stingers - Music.gainOf(-6)) < 1e-9);
  assert.equal(t.levels.pop(), 50);
  assert.equal(t.m.status().db, -6);
  t.m.vol(1); t.m.vol(1);
  assert.match(t.m.vol(1).flash, /at full/, 'never above the files’ own level');
  for (let k = 0; k < 20; k++) t.m.vol(-1);
  assert.equal(t.m.status().db, Music.MIN_DB);
  assert.equal(t.m.status().lowest, true);
});

test('the games keep their own music: a game going up fades the track; no track while one is up', () => {
  const t = setup();
  t.m.play(1);
  const id = t.last('play').id;
  const r = t.m.gameOn(true);
  assert.match(r.flash, /faded out: the game plays its own music/);
  assert.deepEqual(t.last('fade'), { type: 'fade', id, ms: Music.GAME_FADE_MS });
  assert.equal(t.m.gameOn(true), null, 'only on the way up');
  assert.match(t.m.play(2).error, /plays its own music/);
  assert.equal(t.m.stinger(1).ok, true, 'stingers still play over a game');
  t.m.gameOn(false);
  assert.equal(t.m.play(2).ok, true);
});

test('the player’s reports: playing, ended, an error (said out loud), an older track ignored, a restart', () => {
  const t = setup();
  t.m.play(1); const a = t.last('play').id;
  t.m.play(2); const b = t.last('play').id;
  t.m.report({ type: 'ended', id: a });
  assert.equal(t.m.status().track.name, 'Lobby', 'the old track’s report is ignored');
  t.m.report({ type: 'playing', id: b, pos: 0, dur: 182.5 });
  assert.equal(t.m.status().dur, 182.5);
  t.m.report({ type: 'error', id: b, message: 'bad file' });
  assert.equal(t.m.status().track, null);
  assert.deepEqual(t.notices.pop(), ['Lobby wouldn’t play: bad file', true]);
  t.m.report({ type: 'out', label: 'Speakers (Realtek)' });
  t.m.report({ type: 'out', label: 'Focusrite USB' });
  assert.deepEqual(t.notices.pop(), ['The sound output is now Focusrite USB', false]);
  t.m.duck();
  t.m.play(1);
  t.m.report({ type: 'ready' });
  assert.equal(t.m.status().track, null, 'a fresh player has nothing playing');
  assert.ok(Math.abs(t.last('level').music - Music.gainOf(-12)) < 1e-9, 'and gets the levels again');
});

test('the Stream Deck: 15 keys a page, each key once, every key does something we can say', () => {
  for (const page of ['main', 'music']) {
    const ks = Deck.KEYS.filter((k) => k.page === page);
    assert.deepEqual(ks.map((k) => k.slot).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1), page);
  }
  const byKey = {};
  for (const k of Deck.KEYS.filter((x) => x.key)) {
    assert.ok(!byKey[k.key] || byKey[k.key] === k.id, `${k.key} does one thing`);
    byKey[k.key] = k.id;
    assert.ok(Deck.ACTIONS[k.id], `${k.id} is explained`);
    assert.match(k.key, /^((Shift|Ctrl)\+)?F(1[3-9]|2[0-4])$/, 'only keys nothing else uses');
  }
  assert.equal(Deck.SHORTCUTS.length, Object.keys(byKey).length);
  assert.ok(Deck.SHORTCUTS.every((s) => !/Ctrl/.test(s.accelerator)), 'Electron spells Ctrl "Control"');
  assert.equal(Deck.KEYS.find((x) => x.page === 'main' && x.slot === 1).id, 'go', 'GO is the first key');
  assert.ok(Deck.KEYS.some((x) => x.page === 'music' && x.id === 'go'), 'and it’s in the music folder too');
  assert.equal(Deck.labelFor(Deck.KEYS.find((x) => x.id === 'track2'), BANK), 'Lobby', 'tiles take the night’s names');
  assert.equal(Deck.labelFor(Deck.KEYS.find((x) => x.id === 'sting1'), BANK), 'Gavel');
  assert.equal(Deck.labelFor(Deck.KEYS.find((x) => x.id === 'track8'), BANK), 'Track 8');
});
