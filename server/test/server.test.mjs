import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app.mjs';
import { createMemoryStorage } from '../src/storage.mjs';

const WH = 'whsec_test';
const env = {
  RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'sec', RAZORPAY_WEBHOOK_SECRET: WH,
  ENTITLEMENT_SIGNING_KEY: 'k'.repeat(32), REACH_SALT: 's'.repeat(16), RATE_LIMIT_MAX: '1000',
};
function setup(over = {}) {
  let t = 1_700_000_000_000;
  const store = createMemoryStorage({ now: () => t });
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({ id: 'order_ABC12345', amount: body.amount, currency: body.currency }), { status: 200 });
  };
  const app = createApp({ store, fetch: over.fetch || fetch, now: () => t });
  const call = (method, path, { body, headers = {}, e = env, ip = '1.1.1.1' } = {}) =>
    app(new Request('https://x.test' + path, {
      method, headers: { 'cf-connecting-ip': ip, ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    }), e);
  return { store, calls, call, tick: (ms) => { t += ms; } };
}
const KEY = 'abcdefghijklmnop1234';
const sign = (raw, secret = WH) => createHmac('sha256', secret).update(raw).digest('hex');
const evt = (type = 'payment.captured', amount = 50000) => JSON.stringify({
  event: type, payload: { payment: { entity: { id: 'pay_1', order_id: 'order_ABC12345', amount, currency: 'INR' } } },
});
async function ordered(s) {
  const r = await s.call('POST', '/pro/order', { body: {} });
  assert.equal(r.status, 201);
  return r.json();
}
const hook = (s, raw, sig = sign(raw), id) =>
  s.call('POST', '/pro/webhook', { body: raw, headers: { 'x-razorpay-signature': sig, ...(id ? { 'x-razorpay-event-id': id } : {}) } });

test('reach: counts once per key per event, hashes the key', async () => {
  const s = setup();
  let r = await (await s.call('POST', '/reach', { body: { eventId: 'e1', playerKey: KEY } })).json();
  assert.deepEqual([r.counted, r.count], [true, 1]);
  r = await (await s.call('POST', '/reach', { body: { eventId: 'e1', playerKey: KEY } })).json();
  assert.deepEqual([r.counted, r.count], [false, 1]);
  await s.call('POST', '/reach', { body: { eventId: 'e1', playerKey: KEY + 'z' } });
  await s.call('POST', '/reach', { body: { eventId: 'e2', playerKey: KEY } });
  assert.deepEqual(await (await s.call('GET', '/reach')).json(), { e1: 2, e2: 1 });
  assert.ok(!JSON.stringify(s.store._dump()).includes(KEY), 'raw key never stored');
});

test('reach: malformed input rejected', async () => {
  const s = setup();
  for (const body of ['{bad', '[]', { eventId: 'E 1', playerKey: KEY }, { eventId: 'e1', playerKey: 'short' },
    { eventId: 5, playerKey: KEY }, { eventId: 'e1' }, 'x'.repeat(5000)]) {
    const r = await s.call('POST', '/reach', { body });
    assert.ok(r.status === 400 || r.status === 413, String(r.status));
  }
  assert.equal(s.store._dump().length > 0, true); // only rate-limit counters
  assert.deepEqual(await (await s.call('GET', '/reach')).json(), {});
  assert.equal((await s.call('POST', '/reach', { body: { eventId: 'e1', playerKey: KEY }, e: { ...env, REACH_EVENT_IDS: 'ok' } })).status, 404);
});

test('rate limit: 429 after max, resets next window, per address', async () => {
  const s = setup(); const e = { ...env, RATE_LIMIT_MAX: '5' };
  for (let i = 0; i < 5; i++) assert.equal((await s.call('GET', '/reach', { e })).status, 200);
  const r = await s.call('GET', '/reach', { e });
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
  assert.equal((await s.call('GET', '/reach', { ip: '2.2.2.2', e })).status, 200);
  s.tick(61_000);
  assert.equal((await s.call('GET', '/reach', { e })).status, 200);
});

test('order: 500 INR in paise, configurable, Basic auth, no network', async () => {
  const s = setup();
  const o = await ordered(s);
  assert.equal(o.amount, 50000);
  assert.equal(JSON.parse(s.calls[0].init.body).amount, 50000);
  assert.equal(s.calls[0].init.headers.authorization, 'Basic ' + Buffer.from('rzp_test_x:sec').toString('base64'));
  const r = await s.call('POST', '/pro/order', { body: {}, e: { ...env, PRO_PRICE_PAISE: '60000' } });
  assert.equal((await r.json()).amount, 60000);
});

test('order: provider failure gives 502', async () => {
  const s = setup({ fetch: async () => new Response('{}', { status: 500 }) });
  assert.equal((await s.call('POST', '/pro/order', { body: {} })).status, 502);
  const t = setup({ fetch: async () => { throw new Error('net'); } });
  assert.equal((await t.call('POST', '/pro/order', { body: {} })).status, 502);
});

test('webhook: tampered body, wrong secret, missing or malformed signature rejected', async () => {
  const s = setup(); await ordered(s);
  const raw = evt();
  assert.equal((await hook(s, raw + ' ', sign(raw))).status, 400); // body altered after signing
  assert.equal((await hook(s, raw, sign(raw, 'other'))).status, 400);
  assert.equal((await hook(s, raw, 'zz')).status, 400);
  assert.equal((await hook(s, raw, '')).status, 400);
  assert.equal((await hook(s, raw, sign(raw).slice(0, 60))).status, 400);
  assert.equal((await s.call('POST', '/pro/webhook', { body: raw })).status, 400);
});

test('full flow: claim pending, webhook issues token, replay and second event idempotent', async () => {
  const s = setup(); const o = await ordered(s);
  const claim = () => s.call('POST', '/pro/claim', { body: { orderId: o.orderId, claimCode: o.claimCode } });
  assert.equal((await claim()).status, 202);
  const raw = evt();
  assert.equal((await (await hook(s, raw, undefined, 'ev1')).json()).status, 'issued');
  assert.equal((await (await hook(s, raw, undefined, 'ev1')).json()).status, 'duplicate'); // replay
  assert.equal((await (await hook(s, evt('order.paid'), undefined, 'ev2')).json()).status, 'duplicate'); // other event, same order
  const c = await (await claim()).json();
  assert.equal(c.status, 'paid');
  const ent = await s.call('GET', '/pro/entitlement', { headers: { authorization: 'Bearer ' + c.token } });
  assert.equal(ent.status, 200);
  assert.equal((await ent.json()).valid, true);
  assert.equal(s.store._dump().filter(([k]) => k.startsWith('pro:ent:')).length, 1);
});

test('webhook: wrong amount, unknown order, other events issue nothing', async () => {
  const s = setup(); const o = await ordered(s);
  assert.equal((await (await hook(s, evt('payment.captured', 100))).json()).status, 'ignored');
  assert.equal((await (await hook(s, evt('payment.failed'))).json()).status, 'ignored');
  const other = evt().replace('order_ABC12345', 'order_ZZZ99999');
  assert.equal((await (await hook(s, other)).json()).status, 'ignored');
  const r = await s.call('POST', '/pro/claim', { body: { orderId: o.orderId, claimCode: o.claimCode } });
  assert.equal(r.status, 202);
});

test('claim: wrong code and unknown order look the same; bad input 400', async () => {
  const s = setup(); const o = await ordered(s);
  await hook(s, evt());
  const bad = await s.call('POST', '/pro/claim', { body: { orderId: o.orderId, claimCode: 'A'.repeat(32) } });
  const unk = await s.call('POST', '/pro/claim', { body: { orderId: 'order_NOPE1234', claimCode: o.claimCode } });
  assert.equal(bad.status, 404); assert.equal(unk.status, 404);
  assert.equal((await s.call('POST', '/pro/claim', { body: { orderId: '!', claimCode: 'x' } })).status, 400);
});

test('entitlement: tampered, wrong key, garbage, missing all 401; key rotation works', async () => {
  const s = setup(); const o = await ordered(s); await hook(s, evt());
  const { token } = await (await s.call('POST', '/pro/claim', { body: { orderId: o.orderId, claimCode: o.claimCode } })).json();
  const get = (tok, e = env) => s.call('GET', '/pro/entitlement', { headers: tok ? { authorization: 'Bearer ' + tok } : {}, e });
  const [p, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, plan: 'pro-lifetime', oid: 'order_X', iat: 1 })).toString('base64url');
  for (const t of [`${forged}.${sig}`, `${p}.${sig.slice(0, -2)}AA`, 'garbage', `${p}`, '', null]) {
    assert.equal((await get(t)).status, 401);
  }
  assert.equal((await get(token, { ...env, ENTITLEMENT_SIGNING_KEY: 'n'.repeat(32) })).status, 401);
  assert.equal((await get(token, { ...env, ENTITLEMENT_SIGNING_KEY: 'n'.repeat(32), ENTITLEMENT_SIGNING_KEY_PREVIOUS: env.ENTITLEMENT_SIGNING_KEY })).status, 200);
});

test('routing, CORS, missing config', async () => {
  const s = setup();
  assert.equal((await s.call('GET', '/nope')).status, 404);
  assert.equal((await s.call('PUT', '/reach')).status, 405);
  const e = { ...env, ALLOWED_ORIGIN: 'https://a.test' };
  const ok = await s.call('GET', '/reach', { headers: { origin: 'https://a.test' }, e });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://a.test');
  const no = await s.call('GET', '/reach', { headers: { origin: 'https://evil.test' }, e });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
  assert.equal((await s.call('POST', '/reach', { body: { eventId: 'e', playerKey: KEY }, e: {} })).status, 500);
});

test('memory storage contract: putIfAbsent, incr, ttl, list', async () => {
  let t = 0; const m = createMemoryStorage({ now: () => t });
  assert.equal(await m.putIfAbsent('a', '1', { ttlSeconds: 1 }), true);
  assert.equal(await m.putIfAbsent('a', '2'), false);
  t = 1500; assert.equal(await m.get('a'), null);
  assert.equal(await m.incr('n'), 1); assert.equal(await m.incr('n'), 2);
  assert.deepEqual(await m.list('n'), [{ key: 'n', value: '2' }]);
});
