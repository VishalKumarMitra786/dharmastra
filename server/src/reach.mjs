import { hmacHex, json, readTextLimited } from './util.mjs';

const EVENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PLAYER_KEY = /^[A-Za-z0-9_-]{16,128}$/;

/** POST /reach  {eventId, playerKey}. Counts each (event, anonymous key) pair once. */
export async function postReach(request, ctx) {
  const { cfg, store } = ctx;
  if (!cfg.reachSalt) return json({ error: 'not_configured' }, 500);
  const text = await readTextLimited(request, 2048);
  if (text === null) return json({ error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_body' }, 400);
  const { eventId, playerKey } = body;
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) return json({ error: 'invalid_eventId' }, 400);
  if (typeof playerKey !== 'string' || !PLAYER_KEY.test(playerKey)) return json({ error: 'invalid_playerKey' }, 400);
  if (cfg.reachEventIds.length && !cfg.reachEventIds.includes(eventId)) return json({ error: 'unknown_eventId' }, 404);

  // The raw key is hashed with a server salt and never stored or logged.
  const digest = await hmacHex(cfg.reachSalt, `reach|${eventId}|${playerKey}`);
  const first = await store.putIfAbsent(`reach:seen:${eventId}:${digest}`, '1');
  if (first) await store.incr(`reach:count:${eventId}`);
  const count = Number((await store.get(`reach:count:${eventId}`)) || 0);
  return json({ eventId, counted: first, count });
}

/** GET /reach -> {eventId: count} */
export async function getReach(_request, ctx) {
  const rows = await ctx.store.list('reach:count:');
  const out = {};
  for (const { key, value } of rows) out[key.slice('reach:count:'.length)] = Number(value);
  return json(out);
}
