// The TVs' web server (main/server.js): the event build first, production for media only, nothing outside.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Server = require('../main/server.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 've-server-'));
const site = path.join(tmp, 'site'), prod = path.join(tmp, 'prod');
const put = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
put(site, 'tv.html', 'event tv');
put(site, 'player-2b.js', 'event script');
put(prod, 'tv.html', 'PROD tv');
put(prod, 'graveyard-engine.js', 'PROD script');
put(prod, 'local-sb.js', 'shim');
put(prod, 'intro.mp4', '0123456789');
put(prod, 'img/key.png', 'png');
put(prod, 'deploy.ps1', 'x');

test('the event build wins; production serves media only, never a page or a script', () => {
  const r = (u) => { const f = Server.resolve([site, prod], u); return f && path.relative(tmp, f).replace(/\\/g, '/'); };
  assert.equal(r('/tv.html?game=V-ABCDE'), 'site/tv.html');
  assert.equal(r('/player-2b.js'), 'site/player-2b.js');
  assert.equal(r('/intro.mp4'), 'prod/intro.mp4');
  assert.equal(r('/img/key.png'), 'prod/img/key.png');
  assert.equal(r('/graveyard-engine.js'), null, 'a prod script would point at the production database');
  assert.equal(r('/local-sb.js'), null);
  assert.equal(r('/deploy.ps1'), null);
  assert.equal(r('/../prod/tv.html'), null);
  assert.equal(r('/%2e%2e/prod/tv.html'), null);
});

test('it serves byte ranges (video seeking) on 127.0.0.1', async () => {
  const s = await Server.start([site, prod], 0);
  try {
    assert.match(s.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const whole = await fetch(s.origin + '/tv.html');
    assert.equal(await whole.text(), 'event tv');
    const part = await fetch(s.origin + '/intro.mp4', { headers: { Range: 'bytes=2-5' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await part.text(), '2345');
    assert.equal((await fetch(s.origin + '/nope.html')).status, 404);
    assert.equal((await fetch(s.origin + '/tv.html', { method: 'POST' })).status, 405);
  } finally { await s.close(); }
});
