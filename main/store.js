// Vessels Events: small JSON files in the app's data folder. Written to a temp file and renamed, so a crash or a
// pulled plug mid-write never leaves half a file. settings.json: the show file, the projector, window spots.
// state.json: where the show is (cue, rounds, check-ins, safety cards), so a restart picks up on the same cue.
'use strict';

const fs = require('fs');
const path = require('path');

function make(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const at = (name) => path.join(dir, name);
  const read = (name, fallback) => { try { return JSON.parse(fs.readFileSync(at(name), 'utf8')); } catch (e) { return fallback; } };
  const write = (name, data) => {
    const tmp = at(name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, at(name));
  };
  const timers = {};
  const later = (name, data, ms) => { clearTimeout(timers[name]); timers[name] = setTimeout(() => { try { write(name, data); } catch (e) { console.error('save failed', name, e.message); } }, ms || 150); };
  const flush = (name, data) => { clearTimeout(timers[name]); write(name, data); };
  return { dir, read, write, later, flush };
}

module.exports = { make };
