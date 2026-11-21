// Storage adapter contract. Every adapter must implement:
//   get(key)                       -> string | null
//   put(key, value, {ttlSeconds}?) -> void              (overwrites)
//   putIfAbsent(key, value, {ttlSeconds}?) -> boolean   (true only for the one caller that created it; MUST be atomic)
//   incr(key, {ttlSeconds}?)       -> number            (atomic add 1; ttl applies when the key is created)
//   list(prefix)                   -> [{key, value}]    (values are strings)
// Values are strings. Time comes from the injected clock so tests are deterministic.
// KV cannot do atomic putIfAbsent/incr, so KV alone is NOT a valid adapter for reach or webhooks; use D1
// (INSERT OR IGNORE, UPDATE ... RETURNING) or a Durable Object. See server/README.md.

export function createMemoryStorage({ now = () => Date.now() } = {}) {
  const map = new Map(); // key -> {value, expires|null}
  const live = (key) => {
    const e = map.get(key);
    if (!e) return null;
    if (e.expires !== null && e.expires <= now()) { map.delete(key); return null; }
    return e;
  };
  const exp = (opts) => (opts && opts.ttlSeconds ? now() + opts.ttlSeconds * 1000 : null);
  return {
    async get(key) { const e = live(key); return e ? e.value : null; },
    async put(key, value, opts) { map.set(key, { value: String(value), expires: exp(opts) }); },
    async putIfAbsent(key, value, opts) {
      if (live(key)) return false;
      map.set(key, { value: String(value), expires: exp(opts) });
      return true;
    },
    async incr(key, opts) {
      const e = live(key);
      const n = e ? Number(e.value) + 1 : 1;
      map.set(key, { value: String(n), expires: e ? e.expires : exp(opts) });
      return n;
    },
    async list(prefix) {
      const out = [];
      for (const key of [...map.keys()].sort()) if (key.startsWith(prefix) && live(key)) out.push({ key, value: map.get(key).value });
      return out;
    },
    _size: () => map.size,
    _dump: () => [...map.entries()].map(([k, e]) => [k, e.value]),
  };
}
