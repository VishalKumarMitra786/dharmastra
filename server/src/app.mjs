import { readConfig } from './config.mjs';
import { json, hmacHex } from './util.mjs';
import { getReach, postReach } from './reach.mjs';
import { getEntitlement, postClaim, postOrder, postWebhook } from './pro.mjs';

// Rate limited routes (webhook is signature-gated and called by Razorpay, so it is not IP limited).
const LIMITED = new Set(['POST /reach', 'GET /reach', 'POST /pro/order', 'POST /pro/claim', 'GET /pro/entitlement']);
const ROUTES = {
  'POST /reach': postReach,
  'GET /reach': getReach,
  'POST /pro/order': postOrder,
  'POST /pro/webhook': postWebhook,
  'POST /pro/claim': postClaim,
  'GET /pro/entitlement': getEntitlement,
};

/**
 * createApp({store, fetch?, now?}) -> async (request, env) => Response
 * store: storage adapter (see storage.mjs). fetch and now are injectable so tests never touch the network or clock.
 */
export function createApp({ store, fetch: fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now() }) {
  return async function handle(request, env = {}) {
    const cfg = readConfig(env);
    const url = new URL(request.url);
    const cors = corsHeaders(request, cfg);
    const done = (res) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };

    if (request.method === 'OPTIONS') return done(new Response(null, { status: 204 }));
    const route = `${request.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
    const handler = ROUTES[route];
    if (!handler) {
      const known = Object.keys(ROUTES).some((r) => r.split(' ')[1] === url.pathname.replace(/\/+$/, ''));
      return done(json({ error: known ? 'method_not_allowed' : 'not_found' }, known ? 405 : 404));
    }
    try {
      if (LIMITED.has(route)) {
        const limited = await rateLimit(request, cfg, store, now, route);
        if (limited) return done(limited);
      }
      return done(await handler(request, { cfg, store, fetch: fetchImpl, now }));
    } catch {
      return done(json({ error: 'server_error' }, 500)); // never leak internals
    }
  };
}

function corsHeaders(request, cfg) {
  if (!cfg.allowedOrigin) return {};
  const origin = request.headers.get('origin');
  if (origin !== cfg.allowedOrigin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

// Fixed-window counter per (hashed client address, route group). The address is hashed and expires with the window.
async function rateLimit(request, cfg, store, now, route) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const windowId = Math.floor(now() / 1000 / cfg.rateWindowS);
  const who = (await hmacHex(cfg.reachSalt || cfg.signingKey || 'rl', `ip|${ip}`)).slice(0, 32);
  const group = route.startsWith('POST /pro') || route === 'GET /pro/entitlement' ? 'pro' : 'reach';
  const n = await store.incr(`rl:${group}:${who}:${windowId}`, { ttlSeconds: cfg.rateWindowS * 2 });
  if (n > cfg.rateMax) {
    return json({ error: 'rate_limited' }, 429, { 'retry-after': String(cfg.rateWindowS) });
  }
  return null;
}
