// Tests for the ad gate, Pro flag and slot contract. The slot's DOM behaviour is checked in headless Chrome (see docs/review/monetize-integration.md).
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createAdGate, countdownState, houseProvider, DEFAULTS } from '../monetize/ads.js';
import * as pro from '../monetize/pro.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const mkToken = (p = { v: 1, sku: 'pro-lifetime', iat: 1700000000 }) => `v1.${b64(p)}.${b64('sig-bytes')}`;
const counter = () => { const c = { n: 0, reasons: [] }; c.show = async ({ reason }) => { c.n++; c.reasons.push(reason); return 'shown'; }; return c; };

export function registerMonetize(test) {
  test('ads: app-open ad shows once, then not again in the same session', async () => {
    const c = counter(); const g = createAdGate({ show: c.show });
    assert.equal(await g.onAppOpen(), 'shown'); assert.equal(await g.onAppOpen(), 'none'); assert.equal(c.n, 1); assert.deepEqual(c.reasons, ['open']);
  });
  test('ads: default every is 3 completed levels, and the ad runs before the 4th start, not before', async () => {
    const c = counter(); const g = createAdGate({ show: c.show }); assert.equal(g.every, 3); assert.equal(DEFAULTS.every, 3);
    await g.onAppOpen();
    for (let i = 0; i < 2; i++) { g.levelCompleted(); assert.equal(await g.beforeLevelStart(), 'none'); }
    g.levelCompleted(); assert.equal(await g.beforeLevelStart(), 'shown'); assert.equal(c.n, 2);
    g.levelCompleted(); assert.equal(await g.beforeLevelStart(), 'none', 'counter reset after an ad');
  });
  test('ads: N is configurable and bad values fall back to 3', async () => {
    const g = createAdGate({ every: 1, show: counter().show }); g.levelCompleted(); assert.equal(await g.beforeLevelStart(), 'shown');
    assert.equal(g.setEvery(5), 5); assert.equal(g.setEvery(0), 3); assert.equal(g.setEvery('x'), 3); assert.equal(g.setEvery(2.5), 3);
  });
  test('ads: never on retry, never during a mission, and the count is kept for later', async () => {
    const c = counter(); const g = createAdGate({ show: c.show, every: 1 }); g.levelCompleted();
    assert.equal(await g.beforeLevelStart({ retry: true }), 'none'); assert.equal(await g.beforeLevelStart({ inMission: true }), 'none');
    assert.equal(await g.onAppOpen({ inMission: true }), 'none'); assert.equal(c.n, 0);
    assert.equal(await g.beforeLevelStart({}), 'shown');
  });
  test('ads: Pro removes every ad, and a purchase takes effect on the next call', async () => {
    const c = counter(); let p = true; const g = createAdGate({ show: c.show, every: 1, isPro: () => p });
    g.levelCompleted(); assert.equal(await g.onAppOpen(), 'none'); assert.equal(await g.beforeLevelStart(), 'none'); assert.equal(c.n, 0);
    p = false; assert.equal(await g.beforeLevelStart(), 'shown');
  });
  test('ads: a provider that errors, throws or reports unavailable lets the player through', async () => {
    for (const show of [async () => 'error', async () => { throw new Error('boom'); }, async () => 'unavailable']) {
      const g = createAdGate({ show, every: 1 }); g.levelCompleted(); const r = await g.beforeLevelStart();
      assert.ok(['error', 'unavailable'].includes(r)); assert.equal(g.stats.failed, 1); assert.equal(g.sinceAd, 0);
    }
  });
  test('ads: a provider that never answers times out, aborts the slot and proceeds', async () => {
    let aborted = false; const show = ({ signal }) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); });
    const g = createAdGate({ show, every: 1, maxMs: 30 }); g.levelCompleted();
    const t0 = Date.now(); assert.equal(await g.beforeLevelStart(), 'timeout'); assert.ok(Date.now() - t0 < 500); assert.ok(aborted);
  });
  test('ads: two calls while an ad is showing share one ad', async () => {
    const c = counter(); const g = createAdGate({ show: async (o) => { await new Promise((r) => setTimeout(r, 10)); return c.show(o); }, every: 1 }); g.levelCompleted();
    const [a, b] = await Promise.all([g.beforeLevelStart(), g.beforeLevelStart()]); assert.equal(a, 'shown'); assert.equal(b, 'shown'); assert.equal(c.n, 1);
  });
  test('ads: countdown is text, starts at 10, unlocks Continue only at zero', () => {
    const a = countdownState(0); assert.equal(a.secondsLeft, 10); assert.equal(a.canContinue, false); assert.match(a.text, /10 seconds/); assert.match(a.label, /Continue in 10 seconds/);
    assert.equal(countdownState(9100).text, 'Ad ends in 1 second'); assert.equal(countdownState(9999).canContinue, false);
    const z = countdownState(10000); assert.equal(z.canContinue, true); assert.equal(z.label, 'Continue to game'); assert.equal(countdownState(99999).secondsLeft, 0);
  });
  test('ads: the house provider has a visible "Ad" label and no media element', () => {
    const made = []; const el = (tag) => { const e = { tag, children: [], className: '', textContent: '', append(...c) { this.children.push(...c); } }; made.push(e); return e; };
    const container = { ownerDocument: { createElement: el }, children: [], append(c) { this.children.push(c); } };
    houseProvider.render(container); assert.equal(houseProvider.hasAudio, false);
    assert.ok(made.some((e) => e.textContent === 'Ad')); assert.ok(!made.some((e) => /audio|video/.test(e.tag)));
  });

  test('pro: default is off, setProForTesting forces and clears without touching storage', () => {
    const st = mem(); assert.equal(pro.isPro(), false); pro.setProForTesting(true); assert.equal(pro.isPro(), true); pro.setProForTesting(false); assert.equal(pro.isPro(), false);
    pro.setProForTesting(null); assert.equal(pro.isPro(), false); assert.equal(st._m.size, 0);
  });
  test('pro: default verifier refuses every token (safe until the server exists)', async () => {
    assert.equal(await pro.redeemToken(mkToken(), mem()), false); assert.equal(pro.isPro(), false);
  });
  test('pro: valid signed token is stored as only {v, token} under dharmastra.pro.v1 and survives a reload', async () => {
    const st = mem(); pro.setVerifier(async ({ signingInput, signature }) => signingInput.startsWith('v1.') && signature === b64('sig-bytes'));
    assert.equal(pro.PRO_KEY, 'dharmastra.pro.v1'); const t = mkToken();
    assert.equal(await pro.redeemToken(t, st), true); assert.equal(pro.isPro(), true);
    assert.deepEqual(JSON.parse(st.getItem(pro.PRO_KEY)), { v: 1, token: t }); assert.equal(st._m.size, 1);
    pro.clearPro(st); assert.equal(pro.isPro(), false); st.setItem(pro.PRO_KEY, JSON.stringify({ v: 1, token: t }));
    assert.equal(await pro.initPro(st), true);
    pro.clearPro(st);
  });
  test('pro: bad signature, wrong sku, extra fields, garbage and oversize are rejected and cleaned from storage', async () => {
    pro.setVerifier(async ({ signature }) => signature === b64('sig-bytes'));
    const st = mem();
    assert.equal(await pro.redeemToken(`v1.${b64({ v: 1, sku: 'pro-lifetime', iat: 1 })}.${b64('bad')}`, st), false);
    assert.equal(await pro.redeemToken(mkToken({ v: 1, sku: 'other', iat: 1 }), st), false);
    assert.equal(await pro.redeemToken(mkToken({ v: 2, sku: 'pro-lifetime', iat: 1 }), st), false);
    assert.equal(await pro.redeemToken(mkToken({ v: 1, sku: 'pro-lifetime', iat: -1 }), st), false);
    assert.equal(await pro.redeemToken('not a token', st), false); assert.equal(await pro.redeemToken('v1.' + 'A'.repeat(2000) + '.AAAA', st), false);
    assert.equal(st._m.size, 0);
    for (const raw of ['{', 'null', '[]', JSON.stringify({ v: 1, token: 5 }), JSON.stringify({ v: 1, token: mkToken(), extra: 1 }), JSON.stringify({ v: 2, token: mkToken() })]) {
      st.setItem(pro.PRO_KEY, raw); assert.equal(await pro.initPro(st), false, raw); assert.equal(st.getItem(pro.PRO_KEY), null, 'cleaned');
    }
    st.setItem(pro.PRO_KEY, JSON.stringify({ v: 1, token: `v1.${b64({ v: 1, sku: 'pro-lifetime', iat: 1 })}.${b64('bad')}` }));
    assert.equal(await pro.initPro(st), false); assert.equal(st.getItem(pro.PRO_KEY), null);
    pro.setVerifier(async () => false);
  });
  test('pro: a verifier that throws or returns a truthy non-true value does not grant Pro; blocked storage does not crash', async () => {
    pro.setVerifier(async () => { throw new Error('x'); }); assert.equal(await pro.redeemToken(mkToken(), mem()), false);
    pro.setVerifier(async () => 'yes'); assert.equal(await pro.redeemToken(mkToken(), mem()), false);
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    pro.setVerifier(async () => true); assert.equal(await pro.initPro(bad), false); assert.equal(await pro.redeemToken(mkToken(), bad), true); pro.clearPro(bad);
    pro.setVerifier(async () => false);
  });
  test('monetize: no secrets or network calls in the module, and gameplay code does not import it', async () => {
    for (const f of ['ads.js', 'pro.js', 'ad-slot.js']) {
      const s = await readFile(new URL(`../monetize/${f}`, import.meta.url), 'utf8');
      assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|apikey|secret/i.test(s), `${f} has no network or secret`);
    }
    for (const f of ['sim.js', 'combat.js', 'mission.js', 'missions.js', 'objectives.js', 'abilities.js', 'progress.js']) {
      assert.ok(!/monetize/.test(await readFile(new URL(`../${f}`, import.meta.url), 'utf8')), `${f} must not read Pro or ads`);
    }
  });
}
