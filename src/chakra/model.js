// Chakra data model: validation, lock logic, filtering. Pure functions, no DOM, so Node tests and tools/check-events.mjs use them too.
export const YUGAS = [
  { id: 'satya', name: 'Satya Yuga', short: 'Satya' },
  { id: 'treta', name: 'Treta Yuga', short: 'Treta' },
  { id: 'dvapara', name: 'Dvapara Yuga', short: 'Dvapara' },
  { id: 'kali', name: 'Kali Yuga', short: 'Kali' },
  { id: 'kalki', name: 'Kalki era', short: 'Kalki' },
];
export const YUGA_IDS = YUGAS.map((y) => y.id);
export const KINDS = ['History', 'Tradition', 'Invented'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// ---- validation (used by tests and tools/check-events.mjs) ----
// events: every event of every shard. missionIds: ids in missions/. Returns a list of problems; empty means valid.
export function validateEvents(events, { missionIds = null } = {}) {
  const errs = []; const byId = new Map();
  for (const e of events) {
    const w = `event ${e && e.id}`;
    if (!e || typeof e !== 'object') { errs.push('an event is not an object'); continue; }
    if (typeof e.id !== 'string' || !ID_RE.test(e.id)) { errs.push(`${w}: bad id`); continue; }
    if (byId.has(e.id)) { errs.push(`${w}: duplicate id`); continue; }
    byId.set(e.id, e);
    if (!YUGA_IDS.includes(e.yuga)) errs.push(`${w}: unknown yuga ${e.yuga}`);
    if (!KINDS.includes(e.kind)) errs.push(`${w}: kind must be History, Tradition or Invented (got ${e.kind})`);
    if (typeof e.year !== 'string' || !e.year.trim() || !(e.year === 'Legend' || /\d/.test(e.year))) errs.push(`${w}: year must contain a year or be "Legend" (got ${e.year})`);
    if (typeof e.label !== 'string' || !e.label.trim() || e.label.length > 40) errs.push(`${w}: label is missing or over 40 characters`);
    if (typeof e.intro !== 'string' || e.intro.trim().length < 20) errs.push(`${w}: introduction text is missing or too short`);
    if (typeof e.source !== 'string' || !e.source.trim()) errs.push(`${w}: source note is missing`);
    if (!Number.isFinite(e.order)) errs.push(`${w}: order is missing`);
    if (e.level != null && !(Number.isInteger(e.level) && e.level > 0)) errs.push(`${w}: level must be a positive integer or null`);
    if (e.mission != null) {
      if (e.level == null) errs.push(`${w}: only a level can have a mission`);
      if (missionIds && !missionIds.includes(e.mission)) errs.push(`${w}: mission ${e.mission} does not exist in missions/`);
    }
    if (e.region != null && (typeof e.region !== 'string' || !e.region.trim())) errs.push(`${w}: region must be text`);
  }
  const seen = new Set();
  for (const e of byId.values()) {
    if (e.requires != null) {
      const p = byId.get(e.requires);
      if (!p) errs.push(`event ${e.id}: requires ${e.requires}, which does not exist`);
      else if (p.level == null) errs.push(`event ${e.id}: requires ${e.requires}, which is not a level`);
      else if (e.level == null) errs.push(`event ${e.id}: only a level can require another`);
    }
    // chain must end (no cycles)
    let cur = e; const path = new Set();
    while (cur && cur.requires != null) {
      if (path.has(cur.id)) { errs.push(`event ${e.id}: requires chain loops`); break; }
      path.add(cur.id); cur = byId.get(cur.requires);
    }
    const k = `${e.yuga}#${e.order}`;
    if (seen.has(k)) errs.push(`event ${e.id}: order ${e.order} is used twice in ${e.yuga}`);
    seen.add(k);
  }
  return errs;
}

// ---- lock logic ----
// ctx: { spineById: Map id -> {id, level, label, mission, requires, needsObjective}, completed: progress.completed }
export const isDone = (ev, ctx) => Boolean(ev.mission && ctx.completed && Object.prototype.hasOwnProperty.call(ctx.completed, ev.mission));

// A level that is not built yet can never be finished, so it cannot gate a level that is built. The effective prerequisite skips unbuilt levels back along the requires chain.
export function effectivePrereq(ev, spineById) {
  let id = ev.requires; let guard = 0;
  while (id != null && guard++ < 1000) {
    const p = spineById.get(id);
    if (!p) return null;
    if (p.mission) return p;
    id = p.requires;
  }
  return null;
}

// status.code: open | done | locked | planned | info. status.text is the exact words shown (never colour alone).
export function statusOf(ev, ctx) {
  if (ev.level == null) return { code: 'info', text: 'Info only: not playable yet', playable: false };
  if (!ev.mission) return { code: 'planned', text: 'Coming soon: not playable yet', playable: false };
  if (isDone(ev, ctx)) return { code: 'done', text: ev.needsObjective ? 'Done, objective complete' : 'Done', playable: true }; // replay allowed
  const pre = effectivePrereq(ev, ctx.spineById);
  if (pre && !isDone(pre, ctx)) return { code: 'locked', text: `Locked: finish ${pre.label}${pre.needsObjective ? ', including its objective,' : ''} first`, playable: false, prereq: pre.id };
  return { code: 'open', text: 'Open', playable: true };
}

// The yuga the player is "at": that of the first built level not yet done, else the last yuga with a done level, else the first yuga.
export function currentYuga(spine, ctx) {
  const built = spine.filter((s) => s.mission);
  const next = built.find((s) => !isDone(s, ctx));
  if (next) return next.yuga;
  const done = built.filter((s) => isDone(s, ctx));
  return done.length ? done[done.length - 1].yuga : YUGAS[0].id;
}

export const spineMap = (spine) => new Map(spine.map((s) => [s.id, s]));

// ---- years ----
// A signed year (negative = BCE) from a free-text label, or null for "Legend". Ranges give their middle; "5th century" gives its middle.
export function yearValue(text) {
  if (typeof text !== 'string' || text === 'Legend' || !/\d/.test(text)) return null;
  const dated = text.replace(/\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i, '');
  const toks = [];
  for (const m of dated.matchAll(/(\d{1,4})(?:st|nd|rd|th)?(\s+century)?(?:\s*(BCE|CE)\b)?/gi)) {
    toks.push({ n: Number(m[1]), century: Boolean(m[2]), era: m[3] ? m[3].toUpperCase() : null });
  }
  if (!toks.length) return null;
  if (/century/i.test(dated)) for (const t of toks) if (t.n < 100) t.century = true; // "4th-5th century": both numbers are centuries
  let next = null; // an unmarked number takes the era of the next marked one
  for (let i = toks.length - 1; i >= 0; i--) { if (toks[i].era) next = toks[i].era; else toks[i].era = next || 'CE'; }
  const vals = toks.map((t) => { const y = t.century ? t.n * 100 - 50 : t.n; return t.era === 'BCE' ? -y : y; });
  return (Math.min(...vals) + Math.max(...vals)) / 2;
}

// ---- search and filter ----
// filter: { text, kind, region, from, to } where from/to are signed years or null. Returns indices into events (stable order).
export function filterEvents(events, filter) {
  const text = (filter.text || '').trim().toLowerCase();
  const words = text ? text.split(/\s+/) : [];
  const ranged = filter.from != null || filter.to != null;
  const out = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (filter.kind && e.kind !== filter.kind) continue;
    if (filter.region && (filter.region === '(none)' ? e.region : e.region !== filter.region)) continue;
    if (ranged) {
      const y = e._y === undefined ? (e._y = yearValue(e.year)) : e._y;
      if (y == null) continue;
      if (filter.from != null && y < filter.from) continue;
      if (filter.to != null && y > filter.to) continue;
    }
    if (words.length) {
      const hay = e._h || (e._h = `${e.label} ${e.intro} ${e.year} ${e.kind} ${e.region || ''}`.toLowerCase());
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push(i);
  }
  return out;
}
export const isFiltering = (f) => Boolean((f.text || '').trim() || f.kind || f.region || f.from != null || f.to != null);

export function regionsOf(events) { return [...new Set(events.map((e) => e.region).filter(Boolean))].sort(); }

// ---- words ----
export const kindYear = (e) => `${e.kind}, ${e.year}`;
export function levelWord(e) { return e.level != null ? `Level ${e.level}` : 'Info'; }

// Name read by a screen reader for a row, node or card: type, title, yuga, kind and year, status.
export function accessibleName(e, st) {
  const y = YUGAS.find((x) => x.id === e.yuga)?.name || e.yuga;
  return `${levelWord(e)}, ${e.label}, ${y}, ${kindYear(e)}. ${st.text}.`;
}

// Fixed-window virtual list maths: which rows to put in the DOM. Never more than visible + 2 * buffer.
export function windowRange(scrollTop, viewH, rowH, n, buffer = 4) {
  const first = Math.max(0, Math.floor(scrollTop / rowH) - buffer);
  const last = Math.min(n, Math.ceil((scrollTop + viewH) / rowH) + buffer);
  return [first, Math.max(first, last)];
}
