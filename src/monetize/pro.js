// Pro (lifetime) flag. Reads a signed token that the server will supply later. Holds no keys and makes no requests.
// Pro only removes ads. It must never be read by gameplay code (sim, combat, missions, progress).
export const PRO_KEY = 'dharmastra.pro.v1';
export const PRO_SKU = 'pro-lifetime';
const MAX_TOKEN = 1024;
const TOKEN_RE = /^v1\.[A-Za-z0-9_-]{2,700}\.[A-Za-z0-9_-]{2,300}$/;

let state = { pro: false, override: null };
// The verifier is supplied by the integrator once the server exists. It gets the parsed parts and answers true or false (sync or async).
// The default refuses everything, so Pro is off until a real verifier is installed. That is the safe failure.
let verifier = async () => false;
export function setVerifier(fn) { if (typeof fn !== 'function') throw new TypeError('verifier must be a function'); verifier = fn; }

const getStorage = (s) => { if (s) return s; try { return globalThis.localStorage || null; } catch { return null; } };
const b64urlToString = (s) => { const b = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4)); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };

// Token shape: "v1.<payload base64url JSON>.<signature base64url>". Payload: { v:1, sku:"pro-lifetime", iat:<seconds> }. No expiry: lifetime.
export function parseToken(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN || !TOKEN_RE.test(token)) return null;
  const [, p, sig] = token.split('.');
  let payload; try { payload = JSON.parse(b64urlToString(p)); } catch { return null; }
  if (!payload || typeof payload !== 'object' || payload.v !== 1 || payload.sku !== PRO_SKU || !Number.isInteger(payload.iat) || payload.iat < 0) return null;
  return { payload, signingInput: `v1.${p}`, signature: sig };
}
export async function verifyToken(token) {
  const parts = parseToken(token); if (!parts) return false;
  try { return (await verifier(parts)) === true; } catch { return false; }
}
// Reads and validates what is stored; anything odd counts as "no token" and is discarded.
export function readStoredToken(storage) {
  const st = getStorage(storage); if (!st) return null;
  let raw; try { raw = st.getItem(PRO_KEY); } catch { return null; }
  if (raw == null) return null;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && o.v === 1 && Object.keys(o).length === 2 && parseToken(o.token)) return o.token;
  } catch { /* fall through */ }
  try { st.removeItem(PRO_KEY); } catch { /* ignore */ }
  return null;
}
// Call once at boot (does not block play: isPro() is false until it resolves).
export async function initPro(storage) {
  const t = readStoredToken(storage);
  state.pro = t ? await verifyToken(t) : false;
  if (t && !state.pro) { try { getStorage(storage)?.removeItem(PRO_KEY); } catch { /* ignore */ } }
  return state.pro;
}
// Called when the server hands over a token after purchase. Stores only {v, token}.
export async function redeemToken(token, storage) {
  if (!(await verifyToken(token))) return false;
  try { getStorage(storage)?.setItem(PRO_KEY, JSON.stringify({ v: 1, token })); } catch { /* storage full or blocked: Pro still holds for this session */ }
  state.pro = true; return true;
}
export function clearPro(storage) { state.pro = false; try { getStorage(storage)?.removeItem(PRO_KEY); } catch { /* ignore */ } }
export function isPro() { return state.override !== null ? state.override : state.pro; }
// Tests only: true or false forces the answer, null clears it. Never touches storage.
export function setProForTesting(v) { state.override = v === null ? null : !!v; }
