// Vessels Events: the show launcher's main process. It owns the night: the show file, the cue engine's state, the two
// windows (the operator console on the laptop, the audience display full screen on the projector) and saving it all,
// so a restart resumes on the same cue. The windows only render what they're sent and send commands back.
//
// Phase 2: the night goes online (main/night.js). The two games run inside the audience display, hosted from the
// laptop's own web server (main/server.js); the cast phones check in and follow the show; the audience votes on /vote.
//
// Command line (handy for rehearsal and the smoke test): --show=<file> loads that show file; --user-data=<dir> keeps
// settings and saved state somewhere else; --fresh ignores any saved position; --display=none never takes a screen;
// --offline never touches the event database (no games, no phones, no votes: the Phase 1 launcher).
'use strict';

const { app, BrowserWindow, ipcMain, screen, dialog, Menu, webFrameMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const Engine = require('../src/cue-engine.js');
const ShowFile = require('../src/show-file.js');
const Displays = require('./displays.js');
const Store = require('./store.js');
const QR = require('../src/qr.js');
const EV = require('./ev.js');
const Night = require('./night.js');
const Server = require('./server.js');

const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
if (arg('user-data')) app.setPath('userData', path.resolve(arg('user-data')));
if (!app.requestSingleInstanceLock()) app.exit(0);

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'web', '_site');                  // the event build (web/build-event.js)
const PROD = path.resolve(ROOT, '..', 'Vessels_6_12');         // production: the TVs' media only (see server.js)
let store, settings;
let show = null, state = null, problems = { errors: [], warnings: [], file: null };
let consoleWin = null, displayWin = null, projector = null;   // projector: the Electron display the audience sees, or null
let night = null, web = null, siteProblem = null;              // the online side; the TVs' web server

// The event database: config/event.local.json (the operator key lives there and never leaves this process).
function eventConfig() {
  if (process.argv.includes('--offline')) return null;
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8')); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// The show
function loadShow(file, opts) {
  const r = ShowFile.load(file);
  problems = { errors: r.errors, warnings: r.warnings, file };
  if (!r.show) { broadcast(); return false; }   // a bad file never replaces a good one mid-show
  show = r.show;
  show.audience.qr = QR.svg(show.audience.url);   // the audience QR, made here once (works offline)
  settings.showFile = show.file; store.write('settings.json', settings);
  const saved = !(opts && opts.fresh) && store.read('state.json', null);
  const now = Date.now();
  if (saved && saved.file === show.file && saved.fingerprint === show.fingerprint && saved.state) {
    state = Object.assign({ phones: {} }, saved.state);
    state.flash = { text: state.started ? `Resumed on cue ${show.cues[state.i] ? show.cues[state.i].id : ''}` : 'Show loaded', at: now };
  } else {
    state = Engine.initial(show, now);
    state.flash = { text: 'Show loaded', at: now };
  }
  save(true);
  if (night) { night.attach(show); night.setContext(state, curCue()); }
  broadcast();
  return true;
}
const curCue = () => (show && state && state.started ? Engine.view(show, state, Date.now()).current : null);
function save(now) {
  if (!show || !state) return;
  const data = { file: show.file, fingerprint: show.fingerprint, savedAt: Date.now(), state };
  if (now) store.flush('state.json', data); else store.later('state.json', data);
}
function act(action) {
  if (!show) return { error: 'Load a show file first' };
  // the night may hold GO: Core Vessels' vote needs its shortlist, and the game at its vote
  if ((action.type === 'go' || (action.type === 'jump' && !action.force)) && night && !(state.safety && state.safety.full)) {
    const step = action.type === 'go' ? Engine.nextStep(show, state) : { i: show.cues.findIndex((c) => c.id === String(action.cue)) };
    const why = step && step.i >= 0 && night.preflight(show.cues[step.i]);
    if (why) { broadcast({ error: why }); return { error: why }; }
  }
  // S5 adds time to the open audience vote too (a Lesser Evil ballot has no cue timer of its own)
  if (action.type === 'safety' && action.id === 'S5' && night && night.voteOpen()) {
    const secs = action.secs || Engine.EXTEND_SECS;
    night.extendVote(secs);
    if (!state.timer) { state.flash = { text: `+${secs} s on the vote`, at: Date.now() }; broadcast(); return { ok: true }; }
  }
  const before = curCue();
  const r = Engine.reduce(show, state, action, Date.now());
  if (r.error) { if (action.type !== 'phones') broadcast({ error: r.error }); return { error: r.error }; }
  state = r.state;
  save();
  if (night) {
    if (action.type === 'reset') night.reset();
    const after = curCue();
    night.setContext(state, after);
    if (['go', 'back', 'jump', 'reset'].includes(action.type)) night.cueChanged(before, after, state).catch((e) => console.error('cue change:', e));
  }
  broadcast();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// What each window gets. The projector never sees the codes or the operator's problems list.
const fileUrl = (p) => (p ? pathToFileURL(p).href : null);
function payload(forConsole, extra) {
  const sh = show && (forConsole ? show : ShowFile.forDisplay(show));
  const withUrls = sh && Object.assign({}, sh, {
    cast: sh.cast.map((p) => Object.assign({}, p, { photoUrl: fileUrl(p.photo) })),
    media: Object.fromEntries(Object.entries(sh.media || {}).map(([k, v]) => [k, fileUrl(v)])),
  });
  const now = Date.now();
  const view = show && state ? Engine.view(show, state, now) : null;
  const cue = view && view.current;
  const live = night && show ? night.snapshot(state, cue, forConsole) : null;
  const engines = night && show ? night.engines(state, cue, web && web.origin) : [];
  const replay = replayAt >= 0 && shots[replayAt] ? { title: shots[replayAt].title, back: shots.length - 1 - replayAt } : null;
  const base = { now, show: withUrls, state, view, safety: Engine.SAFETY, onProjector: !!projector, live, engines, replay };
  if (!forConsole) return base;
  const all = screen.getAllDisplays(), primaryId = screen.getPrimaryDisplay().id;
  return Object.assign(base, extra || {}, {
    problems: siteProblem ? Object.assign({}, problems, { warnings: [siteProblem].concat(problems.warnings) }) : problems,
    displays: all.map((d) => Displays.describe(d, primaryId)),
    projector: projector ? Displays.describe(projector, primaryId) : null,
    displayChoice: settings.display ? settings.display.id : null,
    version: app.getVersion(),
  });
}
function broadcast(extra) {
  clearTimeout(broadcast.soon); broadcast.soon = null;
  if (consoleWin && !consoleWin.isDestroyed()) consoleWin.webContents.send('state', payload(true, extra));
  if (displayWin && !displayWin.isDestroyed()) {
    const p = payload(false);
    displayWin.webContents.send('state', p);
    // the games' sound only while a game is on the projector (a hidden TV keeps playing its music otherwise)
    const loud = (p.engines || []).some((e) => e.visible) && !(state && state.safety && state.safety.full);
    if (displayWin.webContents.isAudioMuted() === loud) displayWin.webContents.setAudioMuted(!loud);
    thumbs(p.engines.some((e) => e.visible));
  }
  pictureLoop();
}
// the night changes often (polls); coalesce into one update
const broadcastSoon = () => { if (!broadcast.soon) broadcast.soon = setTimeout(() => broadcast(), 60); };

// The console's preview can't run a second copy of a game (it would be a second engine), so while a game is on the
// projector the console gets a small picture of the projector instead, about once a second.
function thumbs(on) {
  if (!on) { if (thumbs.t) { clearInterval(thumbs.t); thumbs.t = null; sendThumb(null); } return; }
  if (thumbs.t) return;
  const snap = () => {
    if (!displayWin || displayWin.isDestroyed()) return;
    displayWin.webContents.capturePage().then((img) => sendThumb(img.isEmpty() ? null : 'data:image/jpeg;base64,' + img.resize({ width: 640 }).toJPEG(70).toString('base64')), () => {});
  };
  thumbs.t = setInterval(snap, 1000); snap();
}
const sendThumb = (url) => { if (consoleWin && !consoleWin.isDestroyed()) consoleWin.webContents.send('thumb', url); };

// BACK in a game (the Director): the projector shows an earlier screen again, as it looked, without touching the game.
// While a game cue plays, the projector is pictured every 1.5 s into the current screen's slot (night.js tells us
// when a new screen starts: onScreen). Back steps through them; Space or Esc returns to the live game.
const shots = [];   // [{key, title, img, pics}] oldest first; the last is the screen on now
let replayAt = -1;  // which one the projector is showing again (-1: live)
// A new screen: the one before it keeps its last picture taken before it ended (cutAt: the GO that ended it, or a
// beat before the launcher noticed, since the game changes screen up to a second before the launcher reads it).
function onScreen(s, cutAt) {
  if (shots.length && shots[shots.length - 1].key === s.key) return;
  const prev = shots[shots.length - 1];
  if (prev && prev.pics) {
    const before = prev.pics.filter((p) => p.at < cutAt);
    prev.img = (before.length ? before[before.length - 1] : prev.pics[0] || {}).img || null;
    prev.pics = null;
  }
  shots.push({ key: s.key, title: s.title, img: null, pics: [] });
  if (shots.length > 30) shots.shift();
}
function pictureLoop() {
  const on = !!(night && show && state && night.directorOn(curCue()));
  if (!on) { if (pictureLoop.t) { clearInterval(pictureLoop.t); pictureLoop.t = null; } shots.length = 0; if (replayAt >= 0) replayLive(); return; }
  if (pictureLoop.t) return;
  pictureLoop.t = setInterval(() => {
    if (replayAt >= 0 || !shots.length || !displayWin || displayWin.isDestroyed()) return;   // never picture a replay
    const slot = shots[shots.length - 1], at = Date.now();
    displayWin.webContents.capturePage().then((img) => {
      if (img.isEmpty() || replayAt >= 0 || !slot.pics) return;
      const sz = img.getSize();
      slot.pics.push({ at, img: 'data:image/jpeg;base64,' + (sz.width > 1920 ? img.resize({ width: 1920 }) : img).toJPEG(82).toString('base64') });
      if (slot.pics.length > 4) slot.pics.shift();
    }, () => {});
  }, 1500);
}
function replayBack() {
  // the screens before the live one that have a picture, newest first
  const earlier = shots.slice(0, -1).map((s, i) => i).filter((i) => shots[i].img).reverse();
  if (!earlier.length) return { error: 'No earlier screen to show yet' };
  const next = replayAt < 0 ? earlier[0] : earlier.find((i) => i < replayAt);
  if (next == null) return { error: 'That’s the first screen of this game' };
  replayAt = next;
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('replay', shots[next].img);
  broadcast();
  return { ok: true, flash: 'Showing again: ' + shots[next].title };
}
function replayLive() {
  replayAt = -1;
  if (displayWin && !displayWin.isDestroyed()) displayWin.webContents.send('replay', null);
  broadcast();
  return { ok: true, flash: 'Back to the live game' };
}

// Run a line of JavaScript inside one of the game TVs the display hosts (Lesser Evil's host buttons).
function engineFrame(game) {
  if (!displayWin || displayWin.isDestroyed() || !web) return null;
  const page = game === 'le' ? '/lesser-evil-tv.html' : '/tv.html';
  return displayWin.webContents.mainFrame.framesInSubtree.find((f) => {
    try { const u = new URL(f.url); return u.origin === web.origin && u.pathname === page; } catch (e) { return false; }
  }) || null;
}
function runInEngine(game, js) {
  const f = engineFrame(game);
  if (!f) return Promise.reject(new Error(`the ${game === 'le' ? 'Lesser Evil' : 'Vessels'} screen isn’t loaded`));
  return f.executeJavaScript(js);
}
// The night's own Lesser Evil prompts (show.lesserEvil.prompts, by bank) replace the game's bank of the same name, so
// the race argues tonight's topics. Banks the show doesn't list keep the game's own.
function feedPrompts(frame) {
  const list = (show && show.lesserEvil && show.lesserEvil.prompts) || [];
  if (!list.length) return;
  const banks = {};
  for (const p of list) { const b = p.bank || 'harmless'; (banks[b] = banks[b] || []).push(b === 'sudden_death' ? { for: p.for || p.text, against: p.against || p.text } : p.text); }
  frame.executeJavaScript(`(function(b){var P=window.LE_PROMPTS&&LE_PROMPTS.PROMPTS;if(!P)return 0;Object.keys(b).forEach(function(k){if(P[k])P[k]=b[k];});return 1;})(${JSON.stringify(banks)})`).catch(() => {});
}

// ---------------------------------------------------------------------------------------------
// Windows
const PRELOAD = path.join(__dirname, 'preload.js');
const webPrefs = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };

function makeConsole() {
  const b = settings.consoleBounds;
  consoleWin = new BrowserWindow(Object.assign({ width: 1440, height: 900, minWidth: 1100, minHeight: 700 }, b || {}, {
    title: 'Vessels Events', backgroundColor: '#0a0a0b', show: false, webPreferences: webPrefs,
  }));
  if (!b) consoleWin.maximize();
  consoleWin.loadFile(path.join(__dirname, '..', 'renderer', 'console', 'index.html'));
  consoleWin.once('ready-to-show', () => consoleWin.show());
  consoleWin.on('close', (e) => {
    if (app.quitting) return;
    const live = show && state && state.started;
    if (live && dialog.showMessageBoxSync(consoleWin, { type: 'warning', buttons: ['Keep running', 'Close the launcher'], defaultId: 0, cancelId: 0,
      message: 'Close Vessels Events?', detail: 'The show is running. Its place is saved, so reopening picks up on the same cue.' }) === 0) { e.preventDefault(); return; }
    settings.consoleBounds = consoleWin.getNormalBounds(); store.write('settings.json', settings);
    app.quitting = true; app.quit();
  });
}

function makeDisplay() {
  displayWin = new BrowserWindow({
    width: 960, height: 540, title: 'Vessels: audience display', backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    // the game TVs play their music and video without anyone tapping the projector first
    webPreferences: Object.assign({}, webPrefs, { autoplayPolicy: 'no-user-gesture-required' }),
  });
  displayWin.setMenu(null);
  displayWin.loadFile(path.join(__dirname, '..', 'renderer', 'display', 'index.html'));
  displayWin.once('ready-to-show', () => { place(); displayWin.showInactive(); });
  displayWin.on('close', (e) => { if (!app.quitting) e.preventDefault(); });   // it lives as long as the console does
  // nothing in a game may open windows or take over the display
  displayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  displayWin.webContents.on('will-navigate', (e) => e.preventDefault());
  displayWin.webContents.on('did-frame-finish-load', (_e, isMain, proc, routing) => {
    if (isMain) return;
    const f = webFrameMain.fromId(proc, routing);
    if (f && /\/lesser-evil-tv\.html/.test(f.url)) feedPrompts(f);
  });
}

// Put the audience display on the projector, full screen; no projector: a preview window on the laptop.
function place() {
  if (!displayWin || displayWin.isDestroyed()) return;
  const all = screen.getAllDisplays(), primaryId = screen.getPrimaryDisplay().id;
  // --display=none (rehearsal on one screen, the smoke test) keeps it a preview window whatever is plugged in
  const target = arg('display') === 'none' ? null : Displays.pick(all, primaryId, settings.display);
  projector = target;
  if (target) {
    displayWin.setFullScreen(false);
    displayWin.setBounds(target.bounds);
    displayWin.setFocusable(false);   // clicks on the projector never steal the operator's keyboard
    displayWin.setFullScreen(true);
    displayWin.setTitle('Vessels: audience display');
  } else {
    displayWin.setFullScreen(false);
    displayWin.setFocusable(true);
    const wa = screen.getPrimaryDisplay().workArea;
    displayWin.setBounds({ x: wa.x + wa.width - 980, y: wa.y + wa.height - 580, width: 960, height: 540 });
    displayWin.setTitle('Vessels: audience display (preview, no projector)');
  }
  broadcast();
}

// ---------------------------------------------------------------------------------------------
// Commands from the windows
async function command(cmd, fromConsole) {
  switch (cmd && cmd.type) {
    case 'open-show': {
      if (!fromConsole) return { error: 'console only' };
      const r = await dialog.showOpenDialog(consoleWin, { title: 'Open a show file', properties: ['openFile'], filters: [{ name: 'Vessels show', extensions: ['json'] }],
        defaultPath: settings.showFile ? path.dirname(settings.showFile) : app.getPath('documents') });
      if (r.canceled || !r.filePaths[0]) return { ok: false };
      return { ok: loadShow(r.filePaths[0]) };
    }
    case 'reload-show': return settings.showFile ? { ok: loadShow(settings.showFile) } : { error: 'No show file yet' };
    case 'set-display': {
      if (!fromConsole) return { error: 'console only' };
      const all = screen.getAllDisplays();
      const d = cmd.id === 'none' ? null : all.find((x) => x.id === cmd.id);
      settings.display = cmd.id === 'none' ? { id: 'none' } : d ? { id: d.id, label: d.label, w: d.size.width, h: d.size.height } : null;
      store.write('settings.json', settings);
      place();
      return { ok: true };
    }
    case 'reset-show': {
      if (!fromConsole || !show) return { error: 'No show' };
      const r = await dialog.showMessageBox(consoleWin, { type: 'warning', buttons: ['Cancel', 'Start over'], defaultId: 0, cancelId: 0,
        message: 'Start the show over?', detail: 'Back to before the first cue. Seats marked by hand are cleared, and both games get fresh rooms (the cast phones follow).' });
      if (r.response !== 1) return { ok: false };
      return act({ type: 'reset' });
    }
    // GO. In a game cue it plays the game (the Director): the game's next screen; once the game is done there, the
    // next cue. {cue: true} (Shift+Space) always moves the cue list. While an earlier screen is showing again, GO
    // first returns to the live game.
    case 'go': {
      if (replayAt >= 0) return replayLive();
      if (!cmd.cue && night && show && state && night.directorOn(curCue())) {
        const r = await night.directorGo('operator');
        if (!r.cue) {
          if (r.ok && r.flash) state.flash = { text: r.flash, at: Date.now() };
          broadcast(r.error ? { error: r.error } : undefined);
          return r;
        }
      }
      return act({ type: 'go' });
    }
    // the Director's mode (A), Hold (H), Back (Shift+Backspace in a game) and back to live
    case 'director-mode': case 'director-hold': case 'replay-back': case 'replay-live': {
      if (!fromConsole) return { error: 'console only' };
      if (!night || !show) return { error: 'Offline: the games need the event database' };
      let r;
      if (cmd.type === 'director-mode') r = night.setDirMode(cmd.mode);
      else if (cmd.type === 'director-hold') r = night.holdDir();
      else if (cmd.type === 'replay-back') r = replayBack();
      else r = replayLive();
      if (r && r.ok && r.flash) state.flash = { text: r.flash, at: Date.now() };
      broadcast(r && r.error ? { error: r.error } : undefined);
      return r;
    }
    // the night: a game step (the game panel's extra buttons), the Core Vessels shortlist, closing a vote now,
    // picking the prize for its winner
    case 'engine': case 'nominee': case 'vote-close': case 'prize-pick': {
      if (!fromConsole) return { error: 'console only' };
      if (!night || !show) return { error: 'Offline: the games need the event database' };
      let r;
      if (cmd.type === 'engine') r = await night.engineStep(cmd.game || night.snapshot(state, curCue(), true).game, cmd.action);
      else if (cmd.type === 'nominee') r = night.toggleNominee(cmd.id);
      else if (cmd.type === 'prize-pick') r = await night.pickFor(cmd.role || null);
      else r = await night.closeVote('operator');
      if (r && r.flash) { state.flash = { text: r.flash, at: Date.now() }; }
      broadcast(r && r.error ? { error: r.error } : undefined);
      return r;
    }
    default:
      // the display window may only send the show keys (GO, safety, clear) when it's the preview on the laptop
      if (!fromConsole && !['go', 'safety', 'clear'].includes(cmd && cmd.type)) return { error: 'console only' };
      if (cmd && cmd.type === 'phones') return { error: 'console only' };   // only the event database says who's in
      return act(cmd);
  }
}

// ---------------------------------------------------------------------------------------------
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  store = Store.make(app.getPath('userData'));
  settings = store.read('settings.json', {});
  ipcMain.handle('cmd', (e, cmd) => command(cmd, consoleWin && e.sender === consoleWin.webContents));
  ipcMain.on('hello', () => broadcast());
  // the TVs' web server and the night (unless offline)
  const cfg = eventConfig();
  if (cfg) {
    if (!fs.existsSync(path.join(SITE, 'tv.html'))) siteProblem = 'The event build is missing (web/_site): run web\\deploy.ps1 once, then restart. The games can’t load until then.';
    try { web = await Server.start([SITE, PROD]); } catch (e) { siteProblem = 'The games’ web server didn’t start: ' + e.message; }
    night = Night.make({ db: EV.make(cfg), EV, store, act: (a) => act(a), onChange: broadcastSoon, runInEngine, onScreen,
      log: (m) => console.log('[night] ' + m) });
  }
  makeConsole();
  makeDisplay();
  ['display-added', 'display-removed', 'display-metrics-changed'].forEach((ev) => screen.on(ev, () => place()));
  const file = arg('show') ? path.resolve(arg('show')) : settings.showFile;
  if (file) loadShow(file, { fresh: process.argv.includes('--fresh') });
  // timers count down in the windows themselves, from the state's start time (one laptop, one clock)
});
app.on('second-instance', () => { if (consoleWin) { if (consoleWin.isMinimized()) consoleWin.restore(); consoleWin.focus(); } });
app.on('before-quit', () => { app.quitting = true; save(true); if (night) night.stop(); });
app.on('window-all-closed', () => app.quit());
