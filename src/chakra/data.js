// Loads the small event index first and each yuga's shard when that yuga is opened. Shards are cached after the first load.
import { YUGA_IDS } from './model.js';
import { makeSynthetic } from './synth.js';

export function createEventStore({ base = 'data/', fetchFn = globalThis.fetch?.bind(globalThis), synth = 0 } = {}) {
  let index = null; const shards = new Map();
  const getJson = async (path) => { const r = await fetchFn(base + path); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
  return {
    async loadIndex() {
      if (!index) { index = await getJson('events/index.json'); if (!Array.isArray(index.yugas) || !Array.isArray(index.spine)) throw new Error('events index is damaged'); }
      return index;
    },
    // Resolves to the sorted events of one yuga. Throws on failure so the screen can say so and offer a retry; a failure is not cached.
    async loadShard(yuga) {
      if (!YUGA_IDS.includes(yuga)) throw new Error(`unknown yuga ${yuga}`);
      if (shards.has(yuga)) return shards.get(yuga);
      const p = (async () => {
        const idx = await this.loadIndex(); const meta = idx.yugas.find((y) => y.id === yuga);
        const data = await getJson(meta ? meta.file : `events/${yuga}.json`);
        if (!Array.isArray(data.events)) throw new Error(`shard ${yuga} is damaged`);
        const list = data.events.slice().sort((a, b) => a.order - b.order);
        if (synth > 0 && yuga === 'kali') return list.concat(makeSynthetic(synth, 'kali', list.length));
        return list;
      })();
      shards.set(yuga, p);
      try { return await p; } catch (e) { shards.delete(yuga); throw e; }
    },
  };
}
