// Objective state machine. Pure: feed it sim events, read the states. Win = every non-optional objective done.
// do: perform a move N times (a teaching exercise): {event:'dodge', count:2, via?}. defeat: drive off N enemies (they are never killed).
// waves (alias arena): hold a yard against rising waves: {waves:[[{kind,at:[col,row]}...],...], gap?, heal? (health given back when a wave is cleared, 0..50), unlock?|zone?}. Positions are in tile units; unlock = checkpoints reached first.
// defeat-captain: bring down the captain, a mini boss with phases. Completes on the sim's 'captain-down' event (or any 'enemy-down' of kind captain).
import { ENEMY_KINDS } from './combat.js';
export const OBJECTIVE_TYPES = ['reach', 'collect', 'evade', 'do', 'defeat', 'waves', 'arena', 'defeat-captain'];
const MAX_WAVES = 8; const MAX_PER_WAVE = 8;
const DO_EVENTS = ['dodge', 'shove', 'shove-hit', 'climb', 'swing', 'heavy', 'blocked', 'parry', 'shot', 'target-hit', 'hit-enemy', 'enemy-fell', 'vault', 'weapon'];

const cpIndex = (t) => (typeof t === 'number' ? t : /^cp(\d+)$/.test(t || '') ? Number(t.slice(2)) : NaN);

export function validateObjectiveDefs(defs, checkpointCount = Infinity) {
  const errors = [];
  if (!Array.isArray(defs)) return ['objectives must be an array'];
  const ids = new Set();
  defs.forEach((d, i) => {
    if (!d || typeof d.id !== 'string' || !d.id) { errors.push(`objectives[${i}] needs an id`); return; }
    if (ids.has(d.id)) errors.push(`objectives[${i}] duplicate id ${d.id}`);
    ids.add(d.id);
    if (!OBJECTIVE_TYPES.includes(d.type)) errors.push(`objectives[${i}] unknown type ${d.type}`);
    if (d.type === 'reach' && !(cpIndex(d.target) >= 1 && cpIndex(d.target) <= checkpointCount)) errors.push(`objectives[${i}] reach needs a checkpoint target`);
    if (d.type === 'collect' && !(Number.isInteger(d.count) && d.count >= 1 && d.count <= 99)) errors.push(`objectives[${i}] collect needs count 1..99`);
    if (d.type === 'do' && !DO_EVENTS.includes(d.event)) errors.push(`objectives[${i}] do needs an event from ${DO_EVENTS.join(', ')}`);
    if ((d.type === 'do' || d.type === 'defeat') && !(Number.isInteger(d.count) && d.count >= 1 && d.count <= 99)) errors.push(`objectives[${i}] ${d.type} needs count 1..99`);
    if (d.type === 'waves' || d.type === 'arena') errors.push(...validateWaves(d, i));
    if (d.type === 'evade' && d.max != null && !(Number.isInteger(d.max) && d.max >= 0 && d.max <= 99)) errors.push(`objectives[${i}] evade max must be 0..99`);
  });
  return errors;
}

function validateWaves(d, i) {
  const errors = []; const at = `objectives[${i}]`;
  if (!Array.isArray(d.waves) || d.waves.length < 1 || d.waves.length > MAX_WAVES) return [`${at} waves needs 1..${MAX_WAVES} waves`];
  d.waves.forEach((w, n) => {
    if (!Array.isArray(w) || w.length < 1 || w.length > MAX_PER_WAVE) { errors.push(`${at} wave ${n + 1} needs 1..${MAX_PER_WAVE} enemies`); return; }
    w.forEach((en, k) => {
      if (!en || !ENEMY_KINDS.includes(en.kind)) errors.push(`${at} wave ${n + 1} enemy ${k + 1} has an unknown kind`);
      if (!Array.isArray(en?.at) || en.at.length !== 2 || !en.at.every(Number.isFinite)) errors.push(`${at} wave ${n + 1} enemy ${k + 1} needs at:[col,row]`);
    });
  });
  if (d.heal != null && !(Number.isFinite(d.heal) && d.heal >= 0 && d.heal <= 50)) errors.push(`${at} heal must be 0..50`);
  if (d.gap != null && !(Number.isFinite(d.gap) && d.gap >= 0 && d.gap <= 30)) errors.push(`${at} gap must be 0..30 seconds`);
  if (d.zone != null && !(d.zone && [d.zone.x, d.zone.y, d.zone.r].every(Number.isFinite))) errors.push(`${at} zone needs x, y, r`);
  return errors;
}

// Implicit reach objectives (cp1..cpN) come first; a def with type reach and the same target replaces its implicit one.
export function createObjectives(defs, checkpointCount) {
  const list = [];
  const custom = (defs || []).filter((d) => OBJECTIVE_TYPES.includes(d?.type)).map((d) => (d.type === 'arena' ? { ...d, type: 'waves' } : d));
  for (let n = 1; n <= checkpointCount; n++) {
    const own = custom.find((d) => d.type === 'reach' && cpIndex(d.target) === n);
    list.push(item(own || { id: `cp${n}`, type: 'reach', target: n, text: `Reach checkpoint ${n}` }));
  }
  custom.filter((d) => d.type !== 'reach').forEach((d) => list.push(item(d)));
  return { items: list, seen: 0 };
}

function item(d) {
  const goal = d.type === 'collect' || d.type === 'do' || d.type === 'defeat' ? d.count : d.type === 'evade' ? (d.max ?? 0) : d.type === 'waves' ? d.waves.length : 1;
  const w = d.type === 'waves' ? { waves: d.waves, gap: Number.isFinite(d.gap) ? d.gap : 2.5, heal: Number.isFinite(d.heal) ? Math.max(0, Math.min(50, d.heal)) : 0, zone: d.zone || null, wave: -1, ids: [], timer: 0 } : {};
  return { ...w, id: d.id, type: d.type, text: d.text || d.id, optional: !!d.optional, state: 'active', progress: 0, goal, kind: d.kind || null, target: cpIndex(d.target), unlock: Number.isInteger(d.unlock) ? d.unlock : 0, event: d.event || null, via: d.via || null, heavy: d.heavy ?? null };
}

// Applies one sim event (or null) and settles evade objectives. Returns [{id, state}] for every state change.
export function updateObjectives(obj, ev) {
  const changes = [];
  const set = (o, state) => { if (o.state !== 'active') return; o.state = state; changes.push({ id: o.id, state }); };
  if (ev?.type === 'seen') obj.seen += 1;
  for (const o of obj.items) {
    if (o.state !== 'active') continue;
    if (ev?.type === 'checkpoint' && o.type === 'reach' && ev.n === o.target) { o.progress = 1; set(o, 'done'); }
    if (ev?.type === 'pickup' && o.type === 'collect' && (!o.kind || o.kind === ev.kind)) {
      o.progress = Math.min(o.goal, o.progress + 1);
      if (o.progress >= o.goal) set(o, 'done');
    }
    if (o.type === 'do' && ev && ev.type === o.event && (!o.via || ev.via === o.via) && (o.heavy == null || !!ev.heavy === o.heavy)) {
      o.progress = Math.min(o.goal, o.progress + 1);
      if (o.progress >= o.goal) set(o, 'done');
    }
    if (o.type === 'defeat-captain' && ev && (ev.type === 'captain-down' || (ev.type === 'enemy-down' && ev.kind === 'captain'))) { o.progress = 1; set(o, 'done'); }
    if (o.type === 'defeat' && ev && (ev.type === 'enemy-down' || ev.type === 'enemy-fell')) {
      o.progress = Math.min(o.goal, o.progress + 1);
      if (o.progress >= o.goal) set(o, 'done');
    }
    if (o.type === 'evade') {
      o.progress = obj.seen;
      if (obj.seen > o.goal) set(o, 'failed');
    }
  }
  // Evade is "finish without being seen": it completes once everything else that is required is done.
  const others = obj.items.filter((o) => o.type !== 'evade' && !o.optional);
  if (others.every((o) => o.state === 'done')) for (const o of obj.items) if (o.type === 'evade') set(o, 'done');
  return changes;
}

// 'won' when all non-optional are done, 'failed' when any non-optional failed, else 'playing'.
export function objectivesStatus(obj) {
  const req = obj.items.filter((o) => !o.optional);
  if (req.some((o) => o.state === 'failed')) return 'failed';
  return req.length && req.every((o) => o.state === 'done') ? 'won' : 'playing';
}

// Arena waves. Called once per tick by the sim with plain facts: {dt, checkpoint, px, py, ts (tile size), alive(id)}.
// Returns {spawn:[{id,kind,x,y}], events:[...], changes:[{id,state}]}. A wave starts when its objective unlocks (checkpoints reached, or the player is inside the zone),
// the next one starts `gap` seconds after the last enemy of the wave is down, and the objective is done when the last wave is cleared.
export function tickWaves(obj, ctx) {
  const out = { spawn: [], events: [], changes: [] };
  for (const o of obj?.items ?? []) {
    if (o.type !== 'waves' || o.state !== 'active') continue;
    if (o.wave === -1) {
      const inZone = o.zone ? Math.hypot(ctx.px - o.zone.x * ctx.ts, ctx.py - o.zone.y * ctx.ts) <= o.zone.r * ctx.ts : true;
      if (ctx.checkpoint < o.unlock || !inZone) continue;
      startWave(o, 0, ctx, out);
    } else if (o.ids.every((id) => !ctx.alive(id))) {
      if (o.timer === 0 && o.wave < o.waves.length) { out.events.push({ type: 'wave-clear', id: o.id, n: o.wave + 1, total: o.waves.length, heal: o.heal }); o.progress = o.wave + 1; o.timer = o.gap > 0 ? o.gap : 1e-9; }
      if (o.wave + 1 >= o.waves.length) { o.state = 'done'; out.changes.push({ id: o.id, state: 'done' }); continue; }
      o.timer -= ctx.dt;
      if (o.timer <= 0) { o.timer = 0; startWave(o, o.wave + 1, ctx, out); }
    }
  }
  return out;
}

function startWave(o, n, ctx, out) {
  o.wave = n; o.timer = 0; o.ids = [];
  o.waves[n].forEach((en, k) => { const id = `${o.id}-${n + 1}-${k + 1}`; o.ids.push(id); out.spawn.push({ id, kind: en.kind, x: en.at[0] * ctx.ts, y: en.at[1] * ctx.ts, hp: en.hp }); });
  out.events.push({ type: 'wave-start', id: o.id, n: n + 1, total: o.waves.length });
}
