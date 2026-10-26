// Vessels Events: the show layer against the REAL event database, the way the launcher and phones use it.
// Registers a throwaway show, checks a cast phone in by code, runs an audience vote (one per phone, closed votes
// refused, live tally operator-only), closes it, reads it back the way /vote does, then deletes the show.
//   node tools/db-check.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
const cfg = JSON.parse(fs.readFileSync(new URL('../config/event.local.json', import.meta.url)));
const rpc = async (fn, args) => {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, data: j, text: t };
};
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const SHOW = 'zz-db-check-' + Date.now().toString(36);
const K = cfg.operatorKey;
let bad = 0; const ok = (name, cond, detail) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); };
try {
  const cast = [['ava', 'Ava', 'ASH-7Q2'], ['bram', 'Bram', 'BONE-4T8'], ['cleo', 'Cleo', 'CROW-2M9']]
    .map(([id, name, code], i) => ({ id, name, seat: i + 1, code_hash: sha(SHOW + ':' + code) }));
  let r = await rpc('ev_setup_show', { p_key: 'not-the-key-not-the-key-xx', p_show: { id: SHOW, cast } });
  ok('a wrong operator key is refused', r.status >= 400, r.status + ' ' + (r.data && r.data.message));
  r = await rpc('ev_setup_show', { p_key: K, p_show: { id: SHOW, name: 'DB check', le_room: 'V-LE001', cv_room: 'V-CV001', cast } });
  ok('the launcher registers the show', r.data && r.data.ok && r.data.cast === 3, r.text);
  r = await rpc('ev_join', { p_show: SHOW, p_code: 'nope-123', p_device: 'phone-aaaaaaaa' });
  ok('a wrong cast code is refused', r.data && r.data.ok === false);
  r = await rpc('ev_join', { p_show: SHOW, p_code: ' bone-4t8 ', p_device: 'phone-bram-1' });
  ok('a cast code checks in (any case, spaces trimmed)', r.data && r.data.ok && r.data.name === 'Bram', r.text);
  r = await rpc('ev_set_show', { p_key: K, p_show: SHOW, p_patch: { live_game: 'cv', live_room: 'V-CV001' } });
  r = await rpc('ev_ping', { p_show: SHOW, p_cast: 'bram', p_device: 'phone-bram-1' });
  ok('the cast phone learns where the show is', r.data && r.data.ok && r.data.live_room === 'V-CV001', r.text);
  await rpc('ev_join', { p_show: SHOW, p_code: 'BONE-4T8', p_device: 'phone-bram-2' });
  r = await rpc('ev_ping', { p_show: SHOW, p_cast: 'bram', p_device: 'phone-bram-1' });
  ok('a second phone with the same code takes over; the first is told', r.data && r.data.reason === 'replaced');
  r = await rpc('ev_cast_status', { p_key: K, p_show: SHOW });
  ok('the check-in board sees Bram in, the others not', r.data && r.data.cast.filter((c) => c.checked_in_at).map((c) => c.id).join() === 'bram', r.text);
  r = await rpc('ev_open_vote', { p_key: K, p_show: SHOW, p_game: 'cv', p_prompt: 'Who leaves the house?', p_candidates: ['ava', 'cleo'], p_practice: false, p_secs: 0 });
  const vote = r.data && r.data.id;
  ok('the launcher opens a vote', !!vote, r.text);
  const votes = [['dev-00000001', 'ava'], ['dev-00000002', 'ava'], ['dev-00000003', 'cleo']];
  for (const [d, c] of votes) { r = await rpc('ev_vote_cast', { p_vote: vote, p_device: d, p_choice: c }); }
  r = await rpc('ev_vote_cast', { p_vote: vote, p_device: 'dev-00000001', p_choice: 'cleo' });
  ok('one vote per phone: a second vote is refused', r.data && r.data.reason === 'already', r.text);
  r = await rpc('ev_vote_cast', { p_vote: vote, p_device: 'dev-00000009', p_choice: 'bram' });
  ok('a vote for someone not on the ballot is refused', r.data && r.data.reason === 'choice');
  r = await rpc('ev_now', { p_show: SHOW });
  ok('phones see the open vote but no counts', r.data && r.data.vote.state === 'open' && r.data.vote.result === null && r.data.stage === 'vote', r.text);
  r = await rpc('ev_tally', { p_key: 'x'.repeat(30), p_vote: vote });
  ok('the live tally needs the operator key', r.status >= 400);
  r = await rpc('ev_tally', { p_key: K, p_vote: vote });
  ok('the launcher reads the live tally', r.data && r.data.counts.ava === 2 && r.data.counts.cleo === 1 && r.data.total === 3, r.text);
  r = await rpc('ev_close_vote', { p_key: K, p_vote: vote, p_reveal_ms: 3000 });
  ok('closing names the winner', r.data && r.data.result.winner === 'ava' && r.data.result.tied === false, r.text);
  r = await rpc('ev_vote_cast', { p_vote: vote, p_device: 'dev-00000004', p_choice: 'ava' });
  ok('a vote after the close is refused', r.data && r.data.reason === 'closed');
  r = await rpc('ev_now', { p_show: SHOW });
  ok('phones get the result with a reveal time ~3 s out (server clock)', r.data && r.data.vote.result && r.data.vote.reveal_at - r.data.now > 1500 && r.data.vote.reveal_at - r.data.now < 3500,
    r.data && `reveal in ${r.data.vote.reveal_at - r.data.now} ms`);
  r = await rpc('ev_open_vote', { p_key: K, p_show: SHOW, p_game: 'cv', p_prompt: 'Tie?', p_candidates: ['ava', 'cleo'], p_practice: true, p_secs: 30 });
  const v2 = r.data.id;
  await rpc('ev_vote_cast', { p_vote: v2, p_device: 'dev-00000001', p_choice: 'ava' });
  await rpc('ev_vote_cast', { p_vote: v2, p_device: 'dev-00000002', p_choice: 'cleo' });
  r = await rpc('ev_close_vote', { p_key: K, p_vote: v2, p_reveal_ms: 0 });
  ok('a tie is reported, not broken (the host calls it)', r.data && r.data.result.tied === true && r.data.result.winner === null, r.text);
} finally {
  const r = await rpc('ev_drop_show', { p_key: K, p_show: SHOW });
  ok('the test show is cleaned up', r.data && r.data.ok);
}
console.log(bad ? `\n${bad} checks failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
