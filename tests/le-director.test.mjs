// The Director's Lesser Evil gates, on production's own engine: lesser-evil-engine.js from ..\Vessels_6_12 with the
// event patches applied (web/event-patches.js), run in a sandbox. In event mode the race never moves itself when
// the players finish their part; the host's step does. Out of event mode it plays exactly as production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = path.resolve(ROOT, '..', 'Vessels_6_12');
const PATCH = require(path.join(ROOT, 'web', 'patch-engine.js'));
const PATCHES = require(path.join(ROOT, 'web', 'event-patches.js'));
const have = fs.existsSync(path.join(PROD, 'lesser-evil-engine.js'));

function engine(eventOn) {
  const box = { console, Math, Date, JSON, Object, Array, String, Number, Set, Map, Error };
  box.window = box;
  box.__VL_EVENT = { on: eventOn };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(PROD, 'lesser-evil-prompts.js'), 'utf8'), box);
  const src = PATCH.apply(fs.readFileSync(path.join(PROD, 'lesser-evil-engine.js'), 'utf8'), PATCHES['lesser-evil-engine.js']);
  vm.runInContext(src, box);
  let t = 1e12;
  const o = { rng: () => 0.42, now: () => (t += 1000), draw: box.LE_PROMPTS.draw };
  const E = box.LE_ENGINE;
  const act = (s, a, from) => E.applyAction(JSON.parse(JSON.stringify(s)), a, from, o);
  return { E, o, act };
}
const PLAYERS = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id.toUpperCase(), joined_at: new Date(1e12 + i).toISOString() }));
// from a fresh race to its first pick screen, the way the host's Next gets there
function toPick({ E, o, act }) {
  let s = E.createGame(PLAYERS, o);
  for (let k = 0; k < 6 && !(s.stage && s.stage.sub === 'pick'); k++) {
    const type = !s.stage ? (s.stage_idx === 0 && !(s.history && s.history.length) ? 'start' : 'beginDebate') : 'beginDebate';
    s = act(s, { type }) || s;
  }
  assert.equal(s.stage && s.stage.sub, 'pick', 'reached a pick');
  return s;
}

test('event mode: every position locked leaves the pick up (ready); the host step starts the speeches', { skip: !have && 'no production tree' }, () => {
  const x = engine(true);
  let s = toPick(x);
  for (const id of s.stage.candidates) s = x.act(s, { type: 'pickTopic', topic: s.stage.options[id][0] }, id) || s;
  assert.ok(s.stage.candidates.every((id) => s.stage.picked[id] != null), 'everyone locked a position');
  assert.equal(s.stage.sub, 'pick', 'the screen holds');
  s = x.act(s, { type: 'pickTopic' });
  assert.ok(s, 'the host step is accepted on a ready pick');
  assert.equal(s.stage.sub, 'speech');
  assert.equal(s.stage.speech.started, false);
  const speaker = s.stage.speakOrder[s.stage.speakIdx];
  assert.equal(x.act(s, { type: 'startSpeech' }, speaker), null, 'a speaker’s phone can’t start their own clock');
  const started = x.act(s, { type: 'startSpeech' });
  assert.equal(started.stage.speech.started, true, 'the launcher can');
});

test('event mode: the host step on a pick with gaps fills them and moves on', { skip: !have && 'no production tree' }, () => {
  const x = engine(true);
  let s = toPick(x);
  const first = s.stage.candidates[0];
  s = x.act(s, { type: 'pickTopic', topic: s.stage.options[first][0] }, first);
  assert.equal(s.stage.sub, 'pick');
  s = x.act(s, { type: 'pickTopic' });
  assert.equal(s.stage.sub, 'speech');
});

test('out of event mode the race plays exactly as production', { skip: !have && 'no production tree' }, () => {
  const x = engine(false);
  let s = toPick(x);
  for (const id of s.stage.candidates) s = x.act(s, { type: 'pickTopic', topic: s.stage.options[id][0] }, id) || s;
  assert.equal(s.stage.sub, 'speech', 'the last position locked starts the speeches');
  const speaker = s.stage.speakOrder[s.stage.speakIdx];
  assert.equal(x.act(s, { type: 'startSpeech' }, speaker).stage.speech.started, true, 'the speaker starts their own clock');
});
