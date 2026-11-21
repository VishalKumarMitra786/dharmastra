import { b64uDecode, b64uEncode, fromHex, hmacHex, hmacSign, hmacVerify, json, randomToken, readTextLimited } from './util.mjs';

const PLAN = 'pro-lifetime';
const ORDER_ID = /^[A-Za-z0-9_]{6,40}$/;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- entitlement tokens: base64url(payload JSON) "." base64url(HMAC-SHA256), server-held key ----
export async function issueToken(cfg, { orderId, iat }) {
  const payload = b64uEncode(enc.encode(JSON.stringify({ v: 1, plan: PLAN, oid: orderId, iat })));
  const sig = b64uEncode(await hmacSign(cfg.signingKey, payload));
  return `${payload}.${sig}`;
}

/** Returns the payload object when valid, else null. Tries the current key, then the previous one (rotation). */
export async function verifyToken(cfg, token) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const sig = b64uDecode(parts[1]);
  if (!sig) return null;
  const keys = [cfg.signingKey, cfg.signingKeyPrevious].filter(Boolean);
  let ok = false;
  for (const k of keys) if (await hmacVerify(k, sig, parts[0])) ok = true; // no early exit
  if (!ok) return null;
  const raw = b64uDecode(parts[0]);
  if (!raw) return null;
  let p;
  try { p = JSON.parse(dec.decode(raw)); } catch { return null; }
  if (!p || p.v !== 1 || p.plan !== PLAN || typeof p.oid !== 'string' || !Number.isInteger(p.iat)) return null;
  return p;
}

async function readJson(request, max) {
  const text = await readTextLimited(request, max);
  if (text === null) return { err: json({ error: 'too_large' }, 413) };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return { body };
  } catch { return { err: json({ error: 'invalid_json' }, 400) }; }
}

// ---- POST /pro/order ----
export async function postOrder(request, ctx) {
  const { cfg, store, fetch, now } = ctx;
  if (!cfg.rzpKeyId || !cfg.rzpKeySecret || !cfg.signingKey) return json({ error: 'not_configured' }, 500);
  const receipt = 'pro_' + randomToken(12); // 20 chars, within Razorpay's 40 limit; no personal data
  let res;
  try {
    res = await fetch(`${cfg.razorpayBase}/v1/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Basic ' + btoa(`${cfg.rzpKeyId}:${cfg.rzpKeySecret}`),
      },
      body: JSON.stringify({ amount: cfg.pricePaise, currency: cfg.currency, receipt, notes: { product: PLAN } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { return json({ error: 'payment_provider_unreachable' }, 502); }
  let order;
  try { order = await res.json(); } catch { order = null; }
  if (!res.ok || !order || typeof order.id !== 'string' || !ORDER_ID.test(order.id)
      || order.amount !== cfg.pricePaise || order.currency !== cfg.currency) {
    return json({ error: 'payment_provider_error' }, 502);
  }
  const claimCode = randomToken(24);
  await store.put(`pro:order:${order.id}`, JSON.stringify({
    amount: cfg.pricePaise, currency: cfg.currency,
    claimHash: await hmacHex(cfg.signingKey, `claim|${order.id}|${claimCode}`),
    createdAt: Math.floor(now() / 1000),
  }));
  // keyId is Razorpay's public key id, meant for the browser checkout.
  return json({ orderId: order.id, amount: cfg.pricePaise, currency: cfg.currency, keyId: cfg.rzpKeyId, claimCode }, 201);
}

// ---- POST /pro/webhook ----
export async function postWebhook(request, ctx) {
  const { cfg, store, now } = ctx;
  if (!cfg.webhookSecret || !cfg.signingKey) return json({ error: 'not_configured' }, 500);
  const raw = await readTextLimited(request, 65536); // raw body: exactly what was signed
  if (raw === null) return json({ error: 'too_large' }, 413);
  const sig = fromHex(request.headers.get('x-razorpay-signature') || '');
  if (!sig) return json({ error: 'bad_signature' }, 400);
  let ok = await hmacVerify(cfg.webhookSecret, sig, raw);
  if (cfg.webhookSecretPrevious) ok = (await hmacVerify(cfg.webhookSecretPrevious, sig, raw)) || ok;
  if (!ok) return json({ error: 'bad_signature' }, 400);

  let evt;
  try { evt = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }
  const type = evt && evt.event;
  if (type !== 'payment.captured' && type !== 'order.paid') return json({ status: 'ignored' });
  const pay = evt.payload && evt.payload.payment && evt.payload.payment.entity;
  const ord = evt.payload && evt.payload.order && evt.payload.order.entity;
  const orderId = (pay && pay.order_id) || (ord && ord.id);
  const paymentId = pay && pay.id;
  const amount = (pay && pay.amount) ?? (ord && ord.amount_paid);
  const currency = (pay && pay.currency) || (ord && ord.currency);
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) return json({ status: 'ignored' });

  // Duplicate delivery of the same event.
  const eventId = request.headers.get('x-razorpay-event-id');
  if (eventId && /^[\w.-]{1,100}$/.test(eventId)) {
    if (!(await store.putIfAbsent(`pro:wh:${eventId}`, '1', { ttlSeconds: 60 * 60 * 24 * 14 }))) {
      return json({ status: 'duplicate' });
    }
  }
  const orderRaw = await store.get(`pro:order:${orderId}`);
  if (!orderRaw) return json({ status: 'ignored' }); // not an order we created
  const order = JSON.parse(orderRaw);
  if (amount !== order.amount || currency !== order.currency) return json({ status: 'ignored' }); // wrong amount: no entitlement

  // payment.captured and order.paid both arrive for one purchase: issue exactly once per order.
  const iat = Math.floor(now() / 1000);
  const created = await store.putIfAbsent(`pro:ent:${orderId}`, JSON.stringify({
    token: await issueToken(cfg, { orderId, iat }), paymentId: typeof paymentId === 'string' ? paymentId : null, iat,
  }));
  return json({ status: created ? 'issued' : 'duplicate' });
}

// ---- POST /pro/claim  {orderId, claimCode} -> token once paid ----
export async function postClaim(request, ctx) {
  const { cfg, store } = ctx;
  if (!cfg.signingKey) return json({ error: 'not_configured' }, 500);
  const { body, err } = await readJson(request, 1024);
  if (err) return err;
  const { orderId, claimCode } = body;
  if (typeof orderId !== 'string' || !ORDER_ID.test(orderId)) return json({ error: 'invalid_orderId' }, 400);
  if (typeof claimCode !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(claimCode)) return json({ error: 'invalid_claimCode' }, 400);
  const orderRaw = await store.get(`pro:order:${orderId}`);
  const expected = orderRaw ? JSON.parse(orderRaw).claimHash : null;
  const stored = expected === null ? null : fromHex(expected);
  // Constant-time: re-derive the HMAC over the submitted code and verify it against the stored one.
  const ok = stored !== null && await hmacVerify(cfg.signingKey, stored, `claim|${orderId}|${claimCode}`);
  if (!ok) return json({ error: 'not_found' }, 404); // same answer for unknown order and wrong code
  const entRaw = await store.get(`pro:ent:${orderId}`);
  if (!entRaw) return json({ status: 'pending' }, 202);
  return json({ status: 'paid', token: JSON.parse(entRaw).token });
}

// ---- GET /pro/entitlement  (Authorization: Bearer <token>) ----
export async function getEntitlement(request, ctx) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(h);
  const p = m ? await verifyToken(ctx.cfg, m[1]) : null;
  if (!p) return json({ valid: false }, 401);
  return json({ valid: true, plan: p.plan, issuedAt: p.iat });
}
