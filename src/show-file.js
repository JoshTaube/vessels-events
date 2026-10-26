// Vessels Events: the show file. One JSON file per night, loaded at startup: the cast (names, photos, private codes),
// the host code, the cue list, the night's Lesser Evil prompts and the music bank. check() reads it the way a stage
// manager would: anything that would break the show is an error (it won't load), anything merely missing is a warning.
// Paths in the file (photos, music, media) are relative to the show file's folder.
'use strict';

const path = require('path');
const fs = require('fs');

const FORMAT = 'vessels-show/1';
const SCREENS = ['black', 'menu-loop', 'title', 'card', 'checkin', 'practice-vote', 'game', 'vote', 'intermission', 'mvp', 'download'];
const CODE_RE = /^[A-Z0-9-]{4,12}$/;
// the game steps a cue may take on entry (Core Vessels' captain actions and Lesser Evil's host buttons, main/night.js)
const ENGINE_STEPS = ['start', 'begin', 'next', 'continue', 'openvote', 'rematch', 'skipIntro', 'startTimer', 'skip'];
const ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
// a show without an id gets one from its name
const slug = (obj) => (obj && obj.id) || String((obj && obj.name) || 'show').toLowerCase().normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'show';
const AUDIENCE_URL = 'https://vessels-events.netlify.app/vote';   // where the audience votes (decided 2026-10-26)

const norm = (c) => String(c || '').trim().toUpperCase();

// obj: the parsed JSON; dir: its folder; exists(p): whether a file is there (injected so tests needn't touch disk).
function check(obj, dir, exists) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  const file = (p) => (p ? path.resolve(dir, p) : null);
  if (!obj || typeof obj !== 'object') return { errors: ['The show file is not a JSON object.'], warnings };
  if (obj.format !== FORMAT) err(`"format" must be "${FORMAT}".`);
  if (!String(obj.name || '').trim()) err('The show needs a "name".');
  // the night's id: in the cast and vote links (/cast?s=..., /vote?s=...), so short, lower case, no spaces
  if (obj.id != null && !ID_RE.test(String(obj.id))) err('"id" is 3 to 40 lower-case letters, numbers or dashes (it goes in the cast and vote links).');
  else if (obj.id == null) warn(`No "id": the links will use "${slug(obj)}".`);

  // cast
  const cast = Array.isArray(obj.cast) ? obj.cast : [];
  if (!cast.length) err('"cast" is empty.');
  else if (cast.length !== 12) warn(`The cast has ${cast.length} people (the show is built for 12).`);
  const ids = new Set(), names = new Set(), codes = new Map();
  cast.forEach((p, n) => {
    const at = `Cast #${n + 1}${p && p.name ? ` (${p.name})` : ''}`;
    if (!p || !String(p.id || '').trim()) return err(`${at} needs an "id".`);
    if (ids.has(p.id)) err(`${at}: id "${p.id}" is used twice.`); ids.add(p.id);
    const nm = String(p.name || '').trim();
    if (!nm) err(`${at} needs a "name".`);
    else if (names.has(nm.toLowerCase())) err(`${at}: two cast members are called "${nm}".`);
    names.add(nm.toLowerCase());
    const c = norm(p.code);
    if (!CODE_RE.test(c)) err(`${at}: code must be 4 to 12 letters, numbers or dashes.`);
    else if (codes.has(c)) err(`${at}: code is the same as ${codes.get(c)}'s.`);
    else codes.set(c, nm || p.id);
    if (!p.photo) warn(`${at} has no photo (initials will show).`);
    else if (!exists(file(p.photo))) warn(`${at}: photo not found at ${p.photo} (initials will show).`);
  });
  const host = norm(obj.hostCode);
  if (!CODE_RE.test(host)) err('"hostCode" must be 4 to 12 letters, numbers or dashes.');
  else if (codes.has(host)) err(`"hostCode" is the same as ${codes.get(host)}'s code.`);

  // cues
  const cues = Array.isArray(obj.cues) ? obj.cues : [];
  if (!cues.length) err('"cues" is empty.');
  const seen = new Map();
  let last = 0;
  cues.forEach((c, n) => {
    const id = String((c && c.id) || '');
    const at = `Cue ${id || '#' + (n + 1)}`;
    if (!/^[1-6]\d{2}$/.test(id)) return err(`${at}: ids are 3-digit numbers from 100 to 699 (100s preshow ... 600s finale).`);
    if (seen.has(id)) err(`${at} appears twice.`);
    seen.set(id, n);
    if (+id <= last) warn(`${at} comes after cue ${last}; cues usually run in number order.`);
    last = Math.max(last, +id);
    if (!String(c.title || '').trim()) err(`${at} needs a "title".`);
    const sc = (c.screen && c.screen.type) || 'black';
    if (!SCREENS.includes(sc)) err(`${at}: screen type "${sc}" isn't one of ${SCREENS.join(', ')}.`);
    if (c.timer != null && !(Number.isInteger(c.timer) && c.timer > 0 && c.timer <= 7200)) err(`${at}: "timer" is whole seconds, up to 2 hours.`);
    if (c.lock != null && c.lock !== 'cast') err(`${at}: the only lock is "cast".`);
    // Phase 2: a cue can step its game on entry ("start" on the first game cue), and say where the cast phones go
    if (c.engine != null && !ENGINE_STEPS.includes(String(c.engine))) err(`${at}: "engine" is one of ${ENGINE_STEPS.join(', ')}.`);
    if (c.cast != null && !['le', 'cv', 'none'].includes(c.cast)) err(`${at}: "cast" is "le", "cv" or "none" (where the cast phones go).`);
    if (c.loopTo != null) {
      const to = seen.get(String(c.loopTo));
      if (to == null) err(`${at}: loopTo ${c.loopTo} must be an earlier cue.`);
      if (c.loopTimes != null && c.loopTimes !== 'prompts' && !(Number.isInteger(c.loopTimes) && c.loopTimes >= 0)) err(`${at}: "loopTimes" is a number or "prompts".`);
    }
  });
  if (!cues.some((c) => c && c.lock === 'cast')) warn('No cue waits for the cast check-in (add "lock": "cast" to the welcome cue).');

  // Lesser Evil prompts
  const prompts = (obj.lesserEvil && obj.lesserEvil.prompts) || [];
  if (!Array.isArray(prompts)) err('"lesserEvil.prompts" must be a list.');
  else if (!prompts.length) warn('No Lesser Evil prompts yet.');
  else prompts.forEach((p, n) => { if (!String((p && p.text) || '').trim()) err(`Lesser Evil prompt #${n + 1} has no "text".`); });

  // music bank: 8 buttons
  const tracks = (obj.music && obj.music.tracks) || [];
  const buttons = new Set();
  tracks.forEach((t, n) => {
    const at = `Track #${n + 1}${t && t.name ? ` (${t.name})` : ''}`;
    if (!(Number.isInteger(t.button) && t.button >= 1 && t.button <= 8)) return err(`${at}: "button" is 1 to 8.`);
    if (buttons.has(t.button)) err(`${at}: button ${t.button} is used twice.`);
    buttons.add(t.button);
    if (!t.file) warn(`${at} has no file.`);
    else if (!exists(file(t.file))) warn(`${at}: file not found at ${t.file}.`);
  });
  ((obj.music && obj.music.stingers) || []).forEach((t, n) => { if (t && t.file && !exists(file(t.file))) warn(`Stinger #${n + 1}: file not found at ${t.file}.`); });
  if (obj.media && obj.media.menuLoop && !exists(file(obj.media.menuLoop))) warn(`Menu loop not found at ${obj.media.menuLoop} (the built-in loop will play).`);
  // the audience's link (the QR in the corner and on the vote screens)
  const aud = obj.audience && obj.audience.url;
  if (aud != null && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(String(aud))) err('"audience.url" must be a full https:// link.');
  else if (aud == null) warn(`No "audience.url": the QR points at ${AUDIENCE_URL}.`);
  return { errors, warnings };
}

// Read a show file from disk: {show, errors, warnings}. show has absolute paths and a fingerprint of its cue list (a
// saved position is only resumed into the same cues).
function load(file) {
  const dir = path.dirname(path.resolve(file));
  let obj;
  try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return { show: null, errors: [e.code === 'ENOENT' ? `No show file at ${file}.` : `Not valid JSON: ${e.message}`], warnings: [] }; }
  const exists = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  const { errors, warnings } = check(obj, dir, exists);
  if (errors.length) return { show: null, errors, warnings };
  const abs = (p) => (p ? path.resolve(dir, p) : null);
  const show = Object.assign({}, obj, {
    id: slug(obj),
    file: path.resolve(file),
    dir,
    hostCode: norm(obj.hostCode),
    cast: obj.cast.map((p) => Object.assign({}, p, { code: norm(p.code), photo: p.photo && exists(abs(p.photo)) ? abs(p.photo) : null })),
    cues: obj.cues.map((c) => Object.assign({}, c, { id: String(c.id), loopTo: c.loopTo != null ? String(c.loopTo) : undefined, screen: c.screen || { type: 'black' } })),
    audience: { url: String((obj.audience && obj.audience.url) || AUDIENCE_URL) },
    music: { tracks: ((obj.music && obj.music.tracks) || []).map((t) => Object.assign({}, t, { file: abs(t.file) })),
      stingers: ((obj.music && obj.music.stingers) || []).map((t) => Object.assign({}, t, { file: abs(t.file) })) },
    media: Object.fromEntries(Object.entries(obj.media || {}).map(([k, v]) => [k, abs(v) && exists(abs(v)) ? abs(v) : null])),
  });
  show.fingerprint = require('crypto').createHash('sha1').update(JSON.stringify(show.cues.map((c) => [c.id, c.loopTo || '', c.loopTimes || '']))).digest('hex').slice(0, 12);
  return { show, errors, warnings };
}

// The show as the projector window gets it: no codes.
const forDisplay = (show) => Object.assign({}, show, { hostCode: undefined, cast: show.cast.map((p) => Object.assign({}, p, { code: undefined })) });

module.exports = { FORMAT, SCREENS, AUDIENCE_URL, check, load, forDisplay, slug };
