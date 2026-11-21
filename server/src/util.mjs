// Small Web-API helpers: encoding, hashing, HMAC, JSON responses. No Node-only imports.
const enc = new TextEncoder();

export const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) return null;
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  try {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch { return null; }
}

const keyCache = new Map();
async function hmacKey(secret, usages) {
  const id = usages.join() + '\0' + secret;
  if (!keyCache.has(id)) {
    if (keyCache.size > 16) keyCache.clear();
    keyCache.set(id, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages));
  }
  return keyCache.get(id);
}
export async function hmacSign(secret, data) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign', 'verify']), enc.encode(data));
  return new Uint8Array(sig);
}
/** Constant-time check: WebCrypto's HMAC verify compares in constant time. sigBytes is a Uint8Array. */
export async function hmacVerify(secret, sigBytes, data) {
  if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret, ['sign', 'verify']), sigBytes, enc.encode(data));
}
export const hmacHex = async (secret, data) => toHex(await hmacSign(secret, data));

export function randomToken(bytes = 24) {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Read a body as text with a hard byte cap. Returns null when too large. */
export async function readTextLimited(request, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > maxBytes) return null;
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}
