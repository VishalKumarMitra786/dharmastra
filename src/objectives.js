// Objective state machine. Pure: feed it sim events, read the states. Win = every non-optional objective done.
// do: perform a move N times (a teaching exercise): {event:'dodge', count:2, via?}. defeat: drive off N raiders (they are never killed).
export const OBJECTIVE_TYPES = ['reach', 'collect', 'evade', 'do', 'defeat'];
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
    if (d.type === 'evade' && d.max != null && !(Number.isInteger(d.max) && d.max >= 0 && d.max <= 99)) errors.push(`objectives[${i}] evade max must be 0..99`);
  });
  return errors;
}

// Implicit reach objectives (cp1..cpN) come first; a def with type reach and the same target replaces its implicit one.
export function createObjectives(defs, checkpointCount) {
  const list = [];
  const custom = (defs || []).filter((d) => OBJECTIVE_TYPES.includes(d?.type));
  for (let n = 1; n <= checkpointCount; n++) {
    const own = custom.find((d) => d.type === 'reach' && cpIndex(d.target) === n);
    list.push(item(own || { id: `cp${n}`, type: 'reach', target: n, text: `Reach checkpoint ${n}` }));
  }
  custom.filter((d) => d.type !== 'reach').forEach((d) => list.push(item(d)));
  return { items: list, seen: 0 };
}

function item(d) {
  const goal = d.type === 'collect' || d.type === 'do' || d.type === 'defeat' ? d.count : d.type === 'evade' ? (d.max ?? 0) : 1;
  return { id: d.id, type: d.type, text: d.text || d.id, optional: !!d.optional, state: 'active', progress: 0, goal, kind: d.kind || null, target: cpIndex(d.target), unlock: Number.isInteger(d.unlock) ? d.unlock : 0, event: d.event || null, via: d.via || null, heavy: d.heavy ?? null };
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
