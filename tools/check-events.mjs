// Validates data/events/: index plus one shard per yuga. Exit 1 on any problem. Run: node tools/check-events.mjs
// Rejects: duplicate ids, a kind that is not History/Tradition/Invented, a missing year (or "Legend"), a missing source note,
// a requires chain that is broken or loops, and an event with no introduction text. Also checks index counts and spine against the shards.
import { readFile, readdir } from 'node:fs/promises';
import { validateEvents, YUGA_IDS } from '../src/chakra/model.js';
import { MISSIONS } from '../src/missions.js';

const ROOT = new URL('..', import.meta.url).pathname;
const dir = ROOT + 'data/events/';
const errs = []; const all = [];
const read = async (f) => JSON.parse(await readFile(dir + f, 'utf8'));
let index;
try { index = await read('index.json'); } catch (e) { console.error(`EVENTS CHECK FAILED: cannot read data/events/index.json (${e.message})`); process.exit(1); }
const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'index.json');
for (const y of YUGA_IDS) {
  if (!files.includes(`${y}.json`)) { errs.push(`missing shard data/events/${y}.json`); continue; }
  let shard; try { shard = await read(`${y}.json`); } catch (e) { errs.push(`${y}.json is not valid JSON (${e.message})`); continue; }
  if (shard.yuga !== y) errs.push(`${y}.json: "yuga" is ${shard.yuga}`);
  if (!Array.isArray(shard.events)) { errs.push(`${y}.json: events is not a list`); continue; }
  for (const e of shard.events) { if (e.yuga !== y) errs.push(`${y}.json: event ${e.id} says yuga ${e.yuga}`); all.push(e); }
  const meta = index.yugas?.find((m) => m.id === y);
  if (!meta) errs.push(`index.json has no entry for ${y}`);
  else {
    if (meta.count !== shard.events.length) errs.push(`index.json says ${meta.count} events for ${y} but the shard has ${shard.events.length}`);
    const lv = shard.events.filter((e) => e.level != null).length;
    if (meta.levels !== lv) errs.push(`index.json says ${meta.levels} levels for ${y} but the shard has ${lv}`);
  }
}
for (const f of files) if (!YUGA_IDS.includes(f.replace('.json', ''))) errs.push(`unexpected file data/events/${f}`);
errs.push(...validateEvents(all, { missionIds: MISSIONS.map((m) => m.id) }));
// the spine must match the shards exactly, so locks work without loading other shards
const levels = all.filter((e) => e.level != null);
if ((index.spine || []).length !== levels.length) errs.push(`index.json spine has ${(index.spine || []).length} levels, shards have ${levels.length}`);
for (const s of index.spine || []) {
  const e = levels.find((x) => x.id === s.id);
  if (!e) { errs.push(`spine entry ${s.id} is not a level in any shard`); continue; }
  if (s.requires !== e.requires || (s.mission || null) !== (e.mission || null) || s.label !== e.label || s.yuga !== e.yuga || s.level !== e.level || Boolean(s.needsObjective) !== Boolean(e.needsObjective)) errs.push(`spine entry ${s.id} differs from its shard entry (regenerate the index)`);
}
console.log(`events: ${all.length} in ${files.length} shards, ${levels.length} levels, ${all.filter((e) => e.mission).length} playable`);
if (errs.length) { console.error(`EVENTS CHECK FAILED (${errs.length})\n- ${errs.join('\n- ')}`); process.exit(1); }
console.log('events check passed');
