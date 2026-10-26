// /api/now?s=<show> - what every audience phone polls: the show's stage and its latest vote (counts only after it
// closes). One database read per show per ~2 s however many phones ask: Netlify's CDN caches the answer
// (Netlify-CDN-Cache-Control), and browsers always revalidate so nobody holds a stale ballot.
// The build fills in __SUPABASE_URL__ and __ANON_KEY__ (the event project's public key; never the operator key).
const SUPA = '__SUPABASE_URL__';
const KEY = '__ANON_KEY__';
const ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

export default async (req) => {
  const show = new URL(req.url).searchParams.get('s') || '';
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' };
  if (!ID.test(show)) return new Response('{"ok":false,"reason":"show"}', { status: 400, headers });
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/ev_now`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_show: show })
    });
    const body = await r.text();
    if (!r.ok) return new Response('{"ok":false,"reason":"db"}', { status: 502, headers });
    return new Response(body, { status: 200, headers: Object.assign({}, headers, {
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=2'   // durable: one cache shared by every edge node
    }) });
  } catch (e) {
    return new Response('{"ok":false,"reason":"offline"}', { status: 502, headers });
  }
};

export const config = { path: '/api/now' };
