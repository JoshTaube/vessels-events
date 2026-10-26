// Vessels Events: the laptop's own little web server for the game TVs. The audience display hosts tv.html and
// lesser-evil-tv.html (the engines) from here, so their 380 MB of video, music and art come off the disk and only
// database traffic goes online.
//
// Two folders, in order:
//   1. web/_site      the event build: the TV pages repointed at the event database and patched (build-event.js)
//   2. Vessels_6_12   production, for MEDIA ONLY (video, audio, images, fonts, css, json). Never its pages or
//                     scripts: those still point at the production database, and local-sb.js would take the TV
//                     offline. So a page or script that isn't in the build is a 404, never prod's copy.
//
// 127.0.0.1 only (nothing else on the venue network can reach it), GET and HEAD only, no directory listings, byte
// ranges for video. A fixed port keeps the TVs' origin (and their saved settings) the same from night to night.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};
// what production may fill in: media and styling, nothing that runs or talks to a database
const MEDIA_ONLY = /\.(mp4|webm|mov|mp3|wav|ogg|m4a|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|css|json)$/i;
const DENY = /(^|\/)(\.|_)|\.(sql|ps1|bak|zip|mjs)$|(^|\/)(local-sb|access-gate)\.js$/i;
const PORT = 47821;

// The file a URL path maps to, or null. Exported for the tests.
function resolve(roots, urlPath) {
  let rel;
  try { rel = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]); } catch (e) { return null; }
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html';
  if (rel.split('/').some((s) => s === '..') || DENY.test(rel)) return null;
  for (let i = 0; i < roots.length; i++) {
    if (i > 0 && !MEDIA_ONLY.test(rel)) break;   // production: media only
    const f = path.join(roots[i], rel);
    if (!f.startsWith(path.resolve(roots[i]) + path.sep)) return null;
    try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* next root */ }
  }
  return null;
}

function handler(roots) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const file = resolve(roots, new URL(req.url, 'http://x').pathname);
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not here'); return; }
    const size = fs.statSync(file).size, type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': /\.(html|js)$/i.test(file) ? 'no-cache' : 'max-age=3600' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let a = m[1] ? +m[1] : size - +m[2], b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      if (a < 0) a = 0;
      if (a >= size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      res.writeHead(206, Object.assign(head, { 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start: a, end: b }).pipe(res);
      return;
    }
    res.writeHead(200, Object.assign(head, { 'Content-Length': size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };
}

// Start it. Resolves {port, origin, close}. The fixed port first; if something else holds it, any free one.
function start(roots, port) {
  const tryPort = (p) => new Promise((ok, bad) => {
    const srv = http.createServer(handler(roots));
    srv.once('error', bad);
    srv.listen(p, '127.0.0.1', () => ok(srv));
  });
  return tryPort(port == null ? PORT : port).catch(() => tryPort(0)).then((srv) => {
    const p = srv.address().port;
    return { port: p, origin: `http://127.0.0.1:${p}`, close: () => new Promise((r) => srv.close(() => r())) };
  });
}

module.exports = { start, resolve, PORT };
