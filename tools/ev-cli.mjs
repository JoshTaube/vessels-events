// Vessels Events: the event database from the command line (rehearsals, checks). The launcher does all of this
// itself during a show.
//   node tools/ev-cli.mjs register shows/sample-show/show.json [LE-ROOM CV-ROOM]
//   node tools/ev-cli.mjs status sample-night
//   node tools/ev-cli.mjs live sample-night cv V-XXXXX        (send the cast phones to a room; "none" clears)
//   node tools/ev-cli.mjs drop sample-night
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'event.local.json'), 'utf8'));
const EV = require(path.join(ROOT, 'main', 'ev.js'));
const ShowFile = require(path.join(ROOT, 'src', 'show-file.js'));
const db = EV.make(cfg);
const [cmd, a, b, c] = process.argv.slice(2);
const out = (x) => console.log(JSON.stringify(x, null, 1));
if (cmd === 'register') {
  const r = ShowFile.load(path.resolve(ROOT, a));
  if (!r.show) { console.error(r.errors.join('\n')); process.exit(1); }
  const rooms = { le: b || EV.newRoom(), cv: c || EV.newRoom() };
  out(await db.registerShow(r.show, rooms)); out({ show: r.show.id, rooms });
} else if (cmd === 'status') out(await db.castStatus(a));
else if (cmd === 'live') out(await db.setShow(a, b === 'none' ? { live_game: null, live_room: null } : { live_game: b, live_room: c }));
else if (cmd === 'drop') out(await db.dropShow(a));
else { console.log('register | status | live | drop'); process.exit(1); }
