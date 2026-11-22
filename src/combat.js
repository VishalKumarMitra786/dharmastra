// Combat and enemy AI. Pure and deterministic: no DOM, no clock, no unseeded randomness (randomness only through sim.rng).
// Rules of this file (CEO, 2026-11-22): nothing hurts by touch. Damage only comes from an attack with a visible wind-up (at least MIN_WINDUP seconds),
// an active hit window with a real reach and arc, and a recovery. At most MAX_ATTACKERS enemies attack at once; the rest circle, flank or wait.
// Every number a person can feel is in the tables below.
import { resolveWalls } from './world.js';
import { inGrass, inPit, circleHitsRect, PROPS } from './abilities.js';

export const MAX_ATTACKERS = 2;
export const MIN_WINDUP = 0.45; // no enemy blow, first or chained, is telegraphed for less than this many seconds
export const WINDUP_GAP = 0.35; // two enemies never start a wind-up within this many seconds of each other, so two blows never land together
export const INTERRUPT = 0.5; // a hit with at least this much stagger breaks an enemy's wind-up; lighter hits only make it flinch

// ---------------------------------------------------------------- the player's attacks
// swing = whole action in seconds, hitAt = moment the arc is applied, cancel = from here the next combo input (or a roll) cuts the recovery short,
// range/halfArc = the hit arc, stagger = seconds the enemy is stunned, knock = units pushed back, lunge = units the traveller steps forward, stamina = cost.
const S = (o) => ({ halfArc: 0.9, knock: 0, lunge: 0, stamina: 0, ...o });
const FISTS = {
  via: 'fists',
  steps: [
    S({ id: 'jab', hitAt: 0.1, swing: 0.3, cancel: 0.16, range: 44, halfArc: 0.8, damage: 1, stagger: 0.25, knock: 10, lunge: 10, stamina: 4 }),
    S({ id: 'cross', hitAt: 0.1, swing: 0.32, cancel: 0.17, range: 44, halfArc: 0.8, damage: 1, stagger: 0.3, knock: 14, lunge: 12, stamina: 4 }),
    S({ id: 'kick', hitAt: 0.17, swing: 0.52, cancel: 0.52, range: 50, halfArc: 0.9, damage: 2, stagger: 0.7, knock: 46, lunge: 16, stamina: 10 }),
  ],
  heavy: S({ id: 'haymaker', hitAt: 0.48, swing: 0.85, range: 52, damage: 2, stagger: 1.1, knock: 60, lunge: 20, stamina: 20, breaks: true }),
};
const STAFF = {
  via: 'staff',
  steps: [
    S({ id: 'sweep', hitAt: 0.16, swing: 0.42, cancel: 0.26, range: 66, halfArc: 1.0, damage: 1, stagger: 0.3, knock: 14, lunge: 8, stamina: 5 }),
    S({ id: 'backsweep', hitAt: 0.16, swing: 0.42, cancel: 0.26, range: 66, halfArc: 1.0, damage: 1, stagger: 0.3, knock: 14, lunge: 8, stamina: 5 }),
    S({ id: 'thrust', hitAt: 0.2, swing: 0.58, cancel: 0.58, range: 78, halfArc: 0.35, damage: 1, stagger: 1.2, knock: 50, lunge: 14, stamina: 8 }),
  ],
  heavy: S({ id: 'overhead', hitAt: 0.5, swing: 0.88, range: 64, halfArc: 0.8, damage: 2, stagger: 1.4, knock: 50, lunge: 14, stamina: 22, breaks: true }),
};
const SWORD = {
  via: 'sword',
  steps: [
    S({ id: 'cut1', hitAt: 0.14, swing: 0.4, cancel: 0.24, range: 56, halfArc: 0.95, damage: 1, stagger: 0.35, knock: 16, lunge: 10, stamina: 8 }),
    S({ id: 'cut2', hitAt: 0.14, swing: 0.4, cancel: 0.24, range: 56, halfArc: 0.95, damage: 1, stagger: 0.35, knock: 16, lunge: 10, stamina: 8 }),
    S({ id: 'cut3', hitAt: 0.2, swing: 0.6, cancel: 0.6, range: 62, halfArc: 1.0, damage: 2, stagger: 0.9, knock: 40, lunge: 16, stamina: 12 }),
  ],
  heavy: S({ id: 'heavy', hitAt: 0.46, swing: 0.8, range: 66, halfArc: 0.95, damage: 3, stagger: 1.5, knock: 50, lunge: 14, stamina: 30, breaks: true }), // 0.46 s of visible wind-up
};
export const COMBOS = { none: FISTS, bow: FISTS, staff: STAFF, sword: SWORD };
const SHOVE = S({ id: 'shove', hitAt: 0.1, swing: 0.3, range: 46, halfArc: 0.9, damage: 0, stagger: 1.0, knock: 80, stamina: 15, breaks: true, via: 'shove' });
export const ATTACKS = { shove: SHOVE };
for (const [w, set] of Object.entries({ fists: FISTS, staff: STAFF, sword: SWORD })) {
  set.steps.forEach((s) => { s.via = set.via; ATTACKS[`${w}.${s.id}`] = s; });
  set.heavy.via = set.via; ATTACKS[`${w}.${set.heavy.id}`] = set.heavy;
}
const COMBO_GAP = 0.4; // seconds after a swing ends in which the next light input continues the chain
const QUEUE_FOR = 0.3; // a combo or roll input pressed during a swing is remembered this long

export const COMBAT = {
  stamina: { max: 100, regen: 35, delay: 0.7 },
  dodge: { duration: 0.36, distance: 110, iFrom: 0.04, iTo: 0.28, cooldown: 0.55, stamina: 25 }, // invulnerable for 0.24 s of a 0.36 s roll
  block: { parryWindow: 0.25, halfArc: 1.2, cost: 15, parryRefund: 10, moveScale: 0.4, parryStagger: 1.8 },
  finisher: { duration: 0.55, hitAt: 0.22, reach: 78, halfArc: 1.4, damage: 3, bossDamage: 5 },
  bow: { drawTime: 0.9, minDraw: 0.25, speed: 480, range: 420, damageFull: 2, damagePart: 1, stagger: 1.0, cooldown: 0.3, maxArrows: 12, startArrows: 6, aimMoveScale: 0.4, autoAimCone: 0.45, autoAimRange: 380 },
  knockTime: 0.25, poise: 0.6, // knock-back lasts 0.25 s; right after a stagger ends the enemy cannot be staggered again for 0.6 s (no stun-lock)
  hurtTime: 0.25, hurtInvuln: 0.5, aimAssist: { cone: 0.7, extra: 40 },
  juice: { light: 0.05, heavy: 0.09, finisher: 0.14, parry: 0.08, hurt: 0.06, slowParry: [0.3, 0.4], slowFinisher: [0.5, 0.3] }, // hit-stop seconds and slow-motion [seconds, speed]; all off under reduced motion
};
COMBAT.staff = COMBOS.staff.steps[0];

// ---------------------------------------------------------------- the enemies
// Attack: windup (telegraph), active (the hit window), recover (open to a punish). lock = fraction of the wind-up after which it stops turning to follow you.
// chain: extra blows after the first (each is telegraphed for chainWindup). reach/halfArc = the hitbox (units, radians). unblockable = a block does not stop it, a roll does.
const base = {
  radius: 13, sight: 170, sightHalf: 1.0, hearing: 70, hearingCrouch: 35,
  patrolSpeed: 55, searchSpeed: 90, chaseSpeed: 140, circleSpeed: 95, fleeSpeed: 120,
  react: 0.35, loseAfter: 3, searchFor: 3, downFlee: 1.0, retreatAt: 0.3, ring: 72, call: 150, turn: 12, track: 5, cooldown: 0.4,
};
export const ENEMY = {
  // The road raider of the early levels: one telegraphed slash. Same numbers the first rules-2 levels were tuned with.
  raider: { ...base, weapon: 'club', hp: 3, sight: 160, react: 0.35, attacks: { slash: { windup: 0.5, active: 0.14, recover: 1.0, reach: 46, halfArc: 0.95, damage: 10, knock: 26, stun: 0.25, lock: 0.6 } }, main: 'slash', start: 34 },
  spearman: { ...base, weapon: 'spear', hp: 4, chaseSpeed: 130, hearing: 80, staggerScale: 0.6, spacing: { min: 40, ideal: 62 },
    attacks: { thrust: { windup: 0.6, active: 0.16, recover: 1.0, reach: 76, halfArc: 0.22, damage: 10, knock: 18, stun: 0.15, lock: 0.55 } }, main: 'thrust', start: 70 }, // long thrust, short stagger
  swordsman: { ...base, weapon: 'sword', hp: 4, maxChain: 3,
    attacks: { slash: { windup: 0.5, chainWindup: 0.45, active: 0.14, recover: 0.95, chainRecover: 0.14, reach: 44, halfArc: 0.95, damage: 8, knock: 26, stun: 0.25, lock: 0.6 } }, main: 'slash', start: 38 }, // slash chains of 1 to 3
  shield: { ...base, weapon: 'shield', hp: 6, chaseSpeed: 100, circleSpeed: 70, turn: 2.4, track: 2.4, shield: true, shieldHalf: 1.05, retreatAt: 0, // blocks the front: flank it or break the guard
    attacks: { bash: { windup: 0.6, active: 0.15, recover: 1.1, reach: 40, halfArc: 0.8, damage: 6, knock: 44, stun: 0.3, lock: 0.5 } }, main: 'bash', start: 34 },
  archer: { ...base, weapon: 'bow', hp: 3, sight: 280, hearing: 90, chaseSpeed: 120, retreatAt: 0.34, keep: { min: 110, ideal: 190, max: 250 },
    attacks: {
      shoot: { windup: 0.95, active: 0.08, recover: 1.3, reach: 300, halfArc: 0.05, damage: 8, knock: 20, stun: 0.2, lock: 0.6, arrow: 300, ranged: true },
      bash: { windup: 0.5, active: 0.12, recover: 0.8, reach: 32, halfArc: 0.9, damage: 4, knock: 20, stun: 0.2, lock: 0.5 },
    }, main: 'shoot', start: 270 },
  captain: { ...base, weapon: 'blade', hp: 16, radius: 16, sight: 220, sightHalf: 1.3, hearing: 100, chaseSpeed: 128, circleSpeed: 90, call: 260, retreatAt: 0, superarmor: true, poise: 1.6, maxChain: 2,
    attacks: {
      slash: { windup: 0.55, chainWindup: 0.45, active: 0.16, recover: 0.7, chainRecover: 0.12, reach: 52, halfArc: 0.9, damage: 9, knock: 34, stun: 0.3, lock: 0.6 },
      lunge: { windup: 0.8, active: 0.28, recover: 1.2, reach: 58, halfArc: 0.4, damage: 14, knock: 50, stun: 0.35, lock: 0.5, dash: 110, minPhase: 2, from: 80, to: 170 },
      slam: { windup: 0.9, active: 0.2, recover: 1.4, reach: 80, halfArc: Math.PI, damage: 10, knock: 60, stun: 0.35, lock: 1, unblockable: true, minPhase: 3, from: 0, to: 80 },
    }, main: 'slash', start: 48 },
  // The sparring partner of a teaching yard: same telegraph but slower, and its wooden stick does no damage. It cannot be driven off.
  sparrer: { ...base, weapon: 'stick', hp: 3, sight: 240, sightHalf: Math.PI, hearing: 240, hearingCrouch: 240, friendly: true, immortal: true, patrolSpeed: 0, chaseSpeed: 80, fleeSpeed: 80, react: 0.6, loseAfter: 99, retreatAt: 0,
    attacks: { stick: { windup: 0.8, active: 0.15, recover: 2.2, reach: 50, halfArc: 1.0, damage: 0, knock: 0, stun: 0, lock: 0.6 } }, main: 'stick', start: 40 },
};
export const ENEMY_KINDS = Object.keys(ENEMY).filter((k) => k !== 'sparrer');
const cfg = (e) => kitOf(e);
COMBAT.raider = ENEMY.raider; COMBAT.sparrer = ENEMY.sparrer;
for (const R of Object.values(ENEMY)) R.windup = R.attacks[R.main].windup;

const angleDiff = (from, to) => {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function spawnEnemy(def, rng) {
  const kind = ENEMY[def.kind] ? def.kind : 'raider'; const R = ENEMY[kind];
  const hp = Number.isFinite(def.hp) ? def.hp : R.hp; const angle = def.angle || 0;
  return {
    id: def.id, kind, x: def.x, y: def.y, hp, maxHp: hp, radius: R.radius,
    angle, homeAngle: angle, homeX: def.x, homeY: def.y, patrol: def.patrol || [], target: 0,
    phase: rng() * Math.PI * 2, state: 'patrol', stateT: 0, aware: false, sightT: 0, lostT: 0, cd: 0,
    lastX: def.x, lastY: def.y, spin: 1, kx: 0, ky: 0, kbT: 0, stagDur: 0, fleeing: false, poise: 0, fell: false,
    atk: null, open: false, guarding: !!R.shield, flinch: 0, callCd: 0, lastAtk: -9, retreating: false, desperate: false, role: 'none', calling: 0,
    phaseNo: 1, invul: 0, pathT: 0, wx: def.x, wy: def.y, retreatT: 0, wave: !!def.wave, speed: def.speed || 0,
    ...startingCarry(kind, def.carry),
  };
}

export function createEnemies(world, rng) {
  const out = [];
  for (const s of world.spawns) if (s.kind !== 'target') out.push(spawnEnemy(s, rng));
  world.guards.forEach((g, i) => { // the old patrol guards are armed soldiers now: same paths, real weapons, no touch damage
    const p0 = g.path[0]; const p1 = g.path[1] || p0;
    out.push(spawnEnemy({ id: `g${i + 1}`, kind: g.kind || 'swordsman', x: p0.x, y: p0.y, hp: g.hp, angle: Math.atan2(p1.y - p0.y, p1.x - p0.x), patrol: g.path.slice(1).concat(g.path.slice(0, 1)), speed: g.speed }, rng));
  });
  return out;
}

// Training posts: hit by the staff, the sword, a shove or an arrow. They never move and never fight back.
export function createTargets(world) {
  return world.spawns.filter((s) => s.kind === 'target').map((s) => ({ id: s.id, x: s.x, y: s.y, radius: 16, flash: 0, hits: 0 }));
}

// ---------------------------------------------------------------- geometry
// Straight-line visibility over the wall grid (low walls, beams and grass do not block sight).
export function lineClear(world, x0, y0, x1, y1) {
  const ts = world.tileSize;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (ts / 4));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
    if (world.solid[Math.floor(y / ts)]?.[Math.floor(x / ts)]) return false;
  }
  return true;
}

// A blow or an arrow never passes through a wall: solid tiles, low walls and marked ledges all stop it.
export function attackClear(world, x0, y0, x1, y1) {
  if (!lineClear(world, x0, y0, x1, y1)) return false;
  const walls = world.obstacles.filter((o) => o.kind === 'lowwall' || o.kind === 'ledge');
  if (!walls.length) return true;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
    if (walls.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.d)) return false;
  }
  return true;
}

// Is target circle (tx,ty,tr) inside the sector from (ox,oy) facing `ang` with reach and half-angle? The arc is widened by the target's size.
export function inSector(ox, oy, ang, reach, half, tx, ty, tr) {
  const d = Math.hypot(tx - ox, ty - oy);
  if (d > reach + tr) return false;
  if (d < 1 || half >= Math.PI) return true;
  return Math.abs(angleDiff(ang, Math.atan2(ty - oy, tx - ox))) <= half + Math.asin(Math.min(1, tr / Math.max(d, tr)));
}

// Effective sight range against the player: crouching halves it, crouching in tall grass halves it again.
export function sightRange(sim, e) {
  const p = sim.player; const c = sim.chariot;
  let r = e ? cfg(e).sight : ENEMY.raider.sight;
  if (p.crouching) { r *= 0.5; if (inGrass(sim.world, c.x, c.y)) r *= 0.5; }
  return r;
}
export const hearingRange = (sim, e) => (sim.player.crouching ? (e ? cfg(e).hearingCrouch : ENEMY.raider.hearingCrouch) : (e ? cfg(e).hearing : ENEMY.raider.hearing));

function sees(sim, e) {
  const c = sim.chariot; const R = cfg(e);
  const d = Math.hypot(c.x - e.x, c.y - e.y);
  if (d > (R.friendly ? R.sight : sightRange(sim, e))) return false;
  if (Math.abs(angleDiff(e.angle, Math.atan2(c.y - e.y, c.x - e.x))) > R.sightHalf) return false;
  return lineClear(sim.world, e.x, e.y, c.x, c.y);
}

// ---------------------------------------------------------------- feel: hit-stop and slow motion (never under reduced motion)
export function juice(sim, stop = 0, slow = null) {
  if (sim.reduceMotion) return;
  if (stop > 0) sim.hitstop = Math.max(sim.hitstop || 0, stop);
  if (slow) { sim.slow.left = Math.max(sim.slow.left, slow[0]); sim.slow.scale = slow[1]; }
}

// ---------------------------------------------------------------- stamina
const spend = (sim, cost) => {
  const p = sim.player;
  if (p.stamina < cost) return false;
  p.stamina -= cost; if (cost > 0) p.stamDelay = COMBAT.stamina.delay;
  return true;
};
export function regenStamina(sim, dt) {
  const p = sim.player; const S_ = COMBAT.stamina;
  if (p.stamDelay > 0) { p.stamDelay = Math.max(0, p.stamDelay - dt); return; }
  p.stamina = Math.min(S_.max, p.stamina + S_.regen * dt * (p.state === 'block' ? 0.4 : 1));
}

const FREE = new Set(['idle', 'walk', 'run', 'crouch']);

// ---------------------------------------------------------------- the player's melee
function aimAssist(sim, range) {
  const c = sim.chariot; const A = COMBAT.aimAssist; let best = null; let bs = Infinity;
  for (const e of sim.enemies) {
    if (e.state === 'down') continue;
    const d = dist(c, e); if (d > range + A.extra) continue;
    const a = Math.abs(angleDiff(c.moveAngle, Math.atan2(e.y - c.y, e.x - c.x)));
    if (a > A.cone || !attackClear(sim.world, c.x, c.y, e.x, e.y)) continue;
    const score = a * 40 + d * 0.2; if (score < bs) { bs = score; best = e; }
  }
  return best ? Math.atan2(best.y - c.y, best.x - c.x) : c.moveAngle;
}

const comboSet = (p) => (p.held ? PROP_SETS[p.held.kind] : COMBOS[p.weapon] || FISTS);
export const comboSetFor = comboSet;

function begin(sim, spec, events, extra = {}) {
  const p = sim.player; const c = sim.chariot;
  p.state = spec === SHOVE ? 'shove' : 'attack'; p.stateT = 0; p.spec = spec; p.atk = spec === SHOVE ? 'shove' : `${spec.via === 'fists' || !spec.via ? 'fists' : spec.via}.${spec.id}`;
  p.swingHit = false; p.crouching = false; p.draw = 0; p.queued = null; p.queueT = 0; p.cooldown = 0;
  p.attackAngle = spec.throwProp ? throwAim(sim, PROPS[spec.prop].throw.range) : aimAssist(sim, spec.range); c.moveAngle = p.attackAngle;
  events.push({ type: spec === SHOVE ? 'shove' : 'swing', heavy: !!extra.heavy, via: spec.via || 'fists', step: extra.step ?? 0, id: spec.id, x: c.x, y: c.y, prop: spec.prop });
}

// kind: 'auto'/'light' (the next step of the weapon's chain), 'heavy' or 'shove'. A light press next to an opened enemy is the finisher.
// chain=true is used for a cancel into the next step during a swing. Returns true when it started.
export function startAttack(sim, kind = 'auto', events = [], chain = false) {
  const p = sim.player;
  if (!chain && !(FREE.has(p.state) || p.state === 'block' || p.state === 'aim')) return false;
  if (kind === 'shove') {
    if (!sim.abilities.includes('push') || p.cooldown > 0) return false;
    if (!spend(sim, SHOVE.stamina)) { events.push({ type: 'tired', what: 'shove' }); return false; }
    begin(sim, SHOVE, events); p.cooldown = 0.8; return true;
  }
  const set = comboSet(p);
  if (kind !== 'heavy' && !chain) { const f = findOpen(sim); if (f) return startFinisher(sim, f, events); }
  let spec; let step = 0;
  if (kind === 'heavy') { spec = set.heavy; p.combo = -1; p.comboT = 0; } else {
    const next = (chain || p.comboT > 0) && p.combo >= 0 && p.combo + 1 < set.steps.length ? p.combo + 1 : 0;
    spec = set.steps[next]; step = next;
  }
  if (!spend(sim, spec.stamina)) { events.push({ type: 'tired', what: kind === 'heavy' ? 'heavy' : 'swing' }); return false; }
  if (kind !== 'heavy') p.combo = step;
  begin(sim, spec, events, { heavy: kind === 'heavy', step });
  return true;
}

// Called every tick the player is in an attack: queues combo input, applies the cancel, ends the swing.
export function stepAttack(sim, dt, act, events) {
  const p = sim.player; const spec = p.spec;
  if (!spec) { p.state = 'idle'; return; }
  p.queueT = Math.max(0, p.queueT - dt);
  if (act.attack) { p.queued = 'light'; p.queueT = QUEUE_FOR; }
  if (act.heavy) { p.queued = 'heavy'; p.queueT = QUEUE_FOR; }
  if (p.queueT <= 0) p.queued = null;
  if (p.state === 'attack' && p.queued && p.stateT >= spec.cancel && p.swingHit) {
    const kind = p.queued; p.queued = null;
    if (spec !== comboSet(p).heavy && startAttack(sim, kind, events, true)) return; // light and heavy chain out of a light step; a heavy blow must finish
  }
  if (p.stateT >= spec.swing) { p.state = 'idle'; p.stateT = 0; if (p.atk !== 'shove' && spec !== comboSet(p).heavy) p.comboT = COMBO_GAP; }
}

// Lunge: the traveller steps toward the blow before it lands, never into the enemy.
export function lungeStep(sim, dt) {
  const p = sim.player; const c = sim.chariot; const s = p.spec;
  if (!s || !s.lunge || p.state !== 'attack' || p.stateT >= s.hitAt) return;
  const v = s.lunge / s.hitAt; const nx = c.x + Math.cos(p.attackAngle) * v * dt; const ny = c.y + Math.sin(p.attackAngle) * v * dt;
  for (const e of sim.enemies) if (e.state !== 'down' && Math.hypot(e.x - nx, e.y - ny) < c.radius + e.radius + 2) return;
  c.x = nx; c.y = ny;
}

// Applies one hit to an enemy and says what happened. hit = {damage, stagger, knock, breaks, via, heavy, finisher}.
// Returns 'blocked' (a raised shield took it), 'broke' (guard broken), 'deflect' (invulnerable) or 'hit'.
export function applyHit(sim, e, hit, from, events) {
  const R = cfg(e); const c = sim.chariot;
  if (e.state === 'down') return 'miss';
  if (e.invul > 0) { events.push({ type: 'deflect', id: e.id, x: e.x, y: e.y }); return 'deflect'; }
  const shielded = R.shield && e.guarding && Math.abs(angleDiff(e.angle, from + Math.PI)) <= R.shieldHalf; // `from` is the direction the blow travels: the shield must face where it came from
  if (shielded && !hit.finisher) {
    if (!hit.breaks) { events.push({ type: 'shield-block', id: e.id, x: e.x, y: e.y, via: hit.via }); e.flinch = 0.12; return 'blocked'; }
    e.state = 'stagger'; e.stateT = 0; e.stagDur = 1.6; e.open = true; e.atk = null; e.guarding = false; e.fleeing = false; e.sightT = 0; e.aware = true;
    events.push({ type: 'shield-break', id: e.id, x: e.x, y: e.y, via: hit.via }); events.push({ type: 'opened', id: e.id, x: e.x, y: e.y });
    juice(sim, COMBAT.juice.heavy);
    return 'broke';
  }
  const dmg = hit.damage || 0;
  if (dmg > 0) {
    e.hp = R.immortal ? Math.max(1, e.hp - dmg) : Math.max(0, e.hp - dmg);
    events.push({ type: 'hit-enemy', id: e.id, kind: e.kind, x: e.x, y: e.y, via: hit.via, heavy: !!hit.heavy, dmg, prop: hit.prop, dir: from });
    juice(sim, hit.finisher ? COMBAT.juice.finisher : hit.heavy || dmg > 1 ? COMBAT.juice.heavy : COMBAT.juice.light);
  } else events.push({ type: 'shove-hit', id: e.id, x: e.x, y: e.y, via: hit.via });
  let knock = hit.knock || 0;
  if (knock < 0) knock = -Math.min(-knock, Math.max(0, dist(c, e) - c.radius - e.radius - 4)); // a pull (a rope) never drags an enemy through you
  if (knock) { e.kx = (Math.cos(from) * knock) / COMBAT.knockTime; e.ky = (Math.sin(from) * knock) / COMBAT.knockTime; e.kbT = COMBAT.knockTime; }
  if (!e.aware) { e.aware = true; e.sightT = 0; }
  e.cd = Math.max(e.cd, 0.2);
  if (e.hp === 0) {
    e.state = 'down'; e.stateT = 0; e.fleeing = R.superarmor ? false : true; e.atk = null; e.open = false; e.retreating = false;
    events.push({ type: 'enemy-down', id: e.id, kind: e.kind, x: e.x, y: e.y, finisher: !!hit.finisher });
    dropCarried(sim, e, events, 'down', from);
    if (e.kind === 'captain') { events.push({ type: 'captain-down', id: e.id, x: e.x, y: e.y }); juice(sim, 0, COMBAT.juice.slowFinisher); }
    else if (hit.finisher) juice(sim, 0, COMBAT.juice.slowFinisher);
    return 'hit';
  }
  if (R.superarmor) { // a captain: phases at two thirds and one third of its health; only a heavy blow or a parry staggers it
    const ph = e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3;
    if (ph > e.phaseNo) { e.phaseNo = ph; e.state = 'phase'; e.stateT = 0; e.invul = 1.0; e.atk = null; e.open = false; events.push({ type: 'phase', id: e.id, n: ph, x: e.x, y: e.y }); rally(sim, e, events, true); return 'hit'; }
  }
  const staggers = (!R.superarmor || hit.breaks || hit.finisher) && (hit.stagger >= INTERRUPT || !e.atk || e.atk.phase === 'recover') && (e.poise <= 0 || hit.stagger >= INTERRUPT);
  if (staggers) {
    const dur = Math.min(hit.stagger * (R.staggerScale ?? 1), R.superarmor ? 1.0 : 9);
    e.state = 'stagger'; e.stateT = 0; e.stagDur = dur; e.fleeing = !!hit.flee; e.sightT = 0; e.atk = null; e.open = false;
    events.push({ type: 'stagger', id: e.id, x: e.x, y: e.y });
  } else e.flinch = 0.14;
  tryDisarm(sim, e, hit, from, events);
  return 'hit';
}

// Applies the swing arc once, at the moment of impact in the swing. Shoves also push and break a raised guard.
export function resolveSwing(sim, events) {
  const p = sim.player; const c = sim.chariot; const s = p.spec;
  if (!s || (p.state !== 'attack' && p.state !== 'shove') || p.swingHit || p.stateT < s.hitAt) return;
  p.swingHit = true;
  if (s.throwProp) { launchThrow(sim, events); return; } // the throw leaves the hand at the moment of impact in the action
  let touched = false;
  for (const e of sim.enemies) {
    if (e.state === 'down' || !inSector(c.x, c.y, p.attackAngle, s.range, s.halfArc, e.x, e.y, e.radius) || !attackClear(sim.world, c.x, c.y, e.x, e.y)) continue;
    if (applyHit(sim, e, { ...s, flee: s.via === 'staff' && s.id === 'thrust' }, Math.atan2(e.y - c.y, e.x - c.x), events) !== 'miss') touched = true;
  }
  for (const t of sim.targets) if (inSector(c.x, c.y, p.attackAngle, s.range, s.halfArc, t.x, t.y, t.radius)) { hitTarget(t, s.via || 'fists', events); touched = true; }
  if (touched && p.held && s.prop) wearHeld(sim, events, s.heavy ? 2 : 1, !!s.shatter); // only a swing that connects wears a prop: a miss costs stamina, not wood
}

function hitTarget(t, via, events) { t.flash = 0.3; t.hits += 1; events.push({ type: 'target-hit', id: t.id, x: t.x, y: t.y, via }); }

// ---------------------------------------------------------------- finisher
// A parry or a broken guard "opens" an enemy for COMBAT.block.parryStagger seconds. A light press next to it is the finisher: a sure blow.
function findOpen(sim) {
  const c = sim.chariot; const F = COMBAT.finisher; let best = null; let bd = Infinity;
  for (const e of sim.enemies) {
    if (!e.open || e.state !== 'stagger') continue;
    const d = dist(c, e);
    if (d > F.reach || Math.abs(angleDiff(c.moveAngle, Math.atan2(e.y - c.y, e.x - c.x))) > F.halfArc) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function startFinisher(sim, e, events) {
  const p = sim.player; const c = sim.chariot;
  p.state = 'finisher'; p.stateT = 0; p.spec = null; p.atk = 'finisher'; p.swingHit = false; p.crouching = false; p.draw = 0; p.queued = null;
  p.attackAngle = Math.atan2(e.y - c.y, e.x - c.x); c.moveAngle = p.attackAngle; p.finTarget = e.id; p.combo = -1; p.comboT = 0;
  events.push({ type: 'finisher', id: e.id, x: e.x, y: e.y });
  return true;
}
export function stepFinisher(sim, dt, events) {
  const p = sim.player; const c = sim.chariot; const F = COMBAT.finisher;
  const e = sim.enemies.find((x) => x.id === p.finTarget);
  sim.invuln = Math.max(sim.invuln, dt * 2); c.speed = 0;
  if (e && p.stateT < F.hitAt) { // step in to arm's length
    const d = dist(c, e); const want = c.radius + e.radius + 6;
    if (d > want) { const k = Math.min(d - want, 260 * dt) / d; c.x += (e.x - c.x) * k; c.y += (e.y - c.y) * k; }
  }
  if (!p.swingHit && p.stateT >= F.hitAt) {
    p.swingHit = true;
    if (e && e.state !== 'down') { e.open = false; applyHit(sim, e, { damage: e.kind === 'captain' ? F.bossDamage : F.damage, stagger: 1.0, knock: 30, via: p.weapon === 'none' || p.weapon === 'bow' ? 'fists' : p.weapon, finisher: true, breaks: true, heavy: true }, Math.atan2(e.y - c.y, e.x - c.x), events); }
  }
  if (p.stateT >= F.duration) { p.state = 'idle'; p.stateT = 0; }
}

// ---------------------------------------------------------------- dodge roll
export function tryDodge(sim, controls, events) {
  const p = sim.player; const c = sim.chariot; const D = COMBAT.dodge;
  if (!sim.abilities.includes('dodge') || p.dodgeCd > 0) return false;
  if (!(FREE.has(p.state) || p.state === 'attack' || p.state === 'shove' || p.state === 'block' || p.state === 'aim')) return false;
  if (p.state === 'attack' && !(p.swingHit && p.stateT >= p.spec.hitAt)) return false; // a roll cancels a swing only after the blow has landed
  if (!spend(sim, D.stamina)) { events.push({ type: 'tired', what: 'dodge' }); return false; }
  const len = Math.hypot(controls.mx || 0, controls.my || 0);
  p.dodgeAngle = len > 0.08 ? Math.atan2(controls.my, controls.mx) : c.moveAngle; // with no direction held you roll the way you face
  c.moveAngle = p.dodgeAngle; p.state = 'dodge'; p.stateT = 0; p.dodgeCd = D.cooldown; p.crouching = false; p.draw = 0; p.swingHit = true; p.queued = null; p.comboT = 0;
  events.push({ type: 'dodge', x: c.x, y: c.y });
  return true;
}

// Moves the roll along its line. Called every tick while state is 'dodge'. The invulnerable window is short and shown in the frame.
export function stepDodge(sim, dt) {
  const p = sim.player; const c = sim.chariot; const D = COMBAT.dodge;
  const v = D.distance / D.duration;
  c.x += Math.cos(p.dodgeAngle) * v * dt; c.y += Math.sin(p.dodgeAngle) * v * dt; c.speed = 0; c.angle = p.dodgeAngle;
  if (p.stateT >= D.iFrom && p.stateT <= D.iTo) sim.invuln = Math.max(sim.invuln, dt * 2);
  if (p.stateT >= D.duration) { p.state = 'idle'; p.stateT = 0; }
}
export const dodgeInvulnerable = (p) => p.state === 'dodge' && p.stateT >= COMBAT.dodge.iFrom && p.stateT <= COMBAT.dodge.iTo;

// ---------------------------------------------------------------- block and parry (held, any weapon)
export function updateGuard(sim, hold) {
  const p = sim.player;
  const can = hold && p.stamina > 0 && !(p.held && PROPS[p.held.kind].twoHands) && (FREE.has(p.state) || p.state === 'block'); // both hands are on a two-handed prop
  if (can && p.state !== 'block') { p.state = 'block'; p.stateT = 0; p.crouching = false; p.comboT = 0; }
  else if (!can && p.state === 'block') { p.state = 'idle'; p.stateT = 0; }
}

// ---------------------------------------------------------------- bow: hold to draw, release to loose
function aimAngle(sim) {
  const c = sim.chariot; const B = COMBAT.bow;
  let best = null; let bd = Infinity;
  const consider = (o) => {
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d > B.autoAimRange || d < 1) return;
    if (Math.abs(angleDiff(c.moveAngle, Math.atan2(o.y - c.y, o.x - c.x))) > B.autoAimCone) return;
    if (d < bd && lineClear(sim.world, c.x, c.y, o.x, o.y)) { best = o; bd = d; }
  };
  for (const e of sim.enemies) if (e.state !== 'down') consider(e);
  for (const t of sim.targets) consider(t);
  return best ? Math.atan2(best.y - c.y, best.x - c.x) : c.moveAngle;
}

export function updateAim(sim, dt, hold, events) {
  const p = sim.player; const B = COMBAT.bow;
  const rising = hold && !p.aimHeld; p.aimHeld = !!hold;
  const can = p.weapon === 'bow' && !p.held && sim.abilities.includes('bow') && (FREE.has(p.state) || p.state === 'aim'); // a held prop fills the hand the bow needs
  if (p.state !== 'aim' && p.draw > 0) p.draw = 0; // a hit or a roll cancels the draw
  if (hold && can) {
    if (p.state !== 'aim') {
      if (p.arrows <= 0) { if (rising) events.push({ type: 'no-arrows' }); return; }
      if (p.cooldown > 0) return;
      p.state = 'aim'; p.stateT = 0; p.crouching = false; p.draw = 0;
    }
    p.draw = Math.min(B.drawTime, p.draw + dt);
    p.aimAngle = aimAngle(sim);
    if (p.draw >= B.drawTime && !p.drawFull) { p.drawFull = true; events.push({ type: 'drawn' }); }
  } else if (p.state === 'aim') {
    if (p.draw >= B.minDraw && p.arrows > 0) loose(sim, events);
    else events.push({ type: 'unnock' }); // let down without loosing: nothing spent
    p.state = 'idle'; p.stateT = 0; p.draw = 0; p.drawFull = false;
  }
}

function loose(sim, events) {
  const p = sim.player; const c = sim.chariot; const B = COMBAT.bow;
  const full = p.draw >= B.drawTime * 0.9;
  const slot = sim.arrows.find((a) => !a.active);
  if (!slot) return; // the pool is full (16 arrows in flight): nothing spent
  p.arrows -= 1; p.cooldown = B.cooldown;
  Object.assign(slot, { active: true, x: c.x + Math.cos(p.aimAngle) * 18, y: c.y + Math.sin(p.aimAngle) * 18, vx: Math.cos(p.aimAngle) * B.speed * (full ? 1 : 0.7), vy: Math.sin(p.aimAngle) * B.speed * (full ? 1 : 0.7), left: B.range * (full ? 1 : 0.7), dmg: full ? B.damageFull : B.damagePart, angle: p.aimAngle });
  events.push({ type: 'shot', full, arrows: p.arrows, x: c.x, y: c.y });
}

// Flies the player's arrows. They stop at walls and marked ledges, hit the first enemy or post in the way, and a spent arrow can be picked up again.
export function stepArrows(sim, dt, events) {
  const w = sim.world; const ts = w.tileSize;
  for (const a of sim.arrows) {
    if (!a.active) continue;
    const sp = Math.hypot(a.vx, a.vy); const step = sp * dt;
    const n = Math.max(1, Math.ceil(step / 6)); let done = false;
    for (let i = 0; i < n && !done; i++) {
      a.x += (a.vx * dt) / n; a.y += (a.vy * dt) / n; a.left -= step / n;
      for (const e of sim.enemies) {
        if (e.state === 'down' || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + 3) continue;
        applyHit(sim, e, { damage: a.dmg, stagger: COMBAT.bow.stagger, via: 'arrow' }, a.angle, events); done = true; break;
      }
      if (!done) for (const t of sim.targets) if (Math.hypot(t.x - a.x, t.y - a.y) <= t.radius + 3) { hitTarget(t, 'arrow', events); done = true; break; }
      if (done) { a.active = false; break; } // the arrow breaks on a hit
      const blocked = w.solid[Math.floor(a.y / ts)]?.[Math.floor(a.x / ts)] !== false || w.obstacles.some((o) => o.kind === 'ledge' && circleHitsRect(a.x, a.y, 2, o));
      if (blocked || a.left <= 0) { land(sim, a, blocked); done = true; }
    }
  }
}

function land(sim, a, blocked) {
  a.active = false;
  const back = blocked ? 10 : 0; const sp = Math.hypot(a.vx, a.vy) || 1;
  const x = a.x - (a.vx / sp) * back; const y = a.y - (a.vy / sp) * back;
  if (sim.pickups.length >= 64 || sim.pickups.filter((k) => k.kind === 'arrows' && !k.taken).length >= 16) return;
  if (x < 4 || y < 4 || x > sim.world.width - 4 || y > sim.world.height - 4) return;
  sim.arrowSeq += 1;
  sim.pickups.push({ id: `ar${sim.arrowSeq}`, x, y, kind: 'arrows', n: 1, taken: false });
}

// ---------------------------------------------------------------- enemy movement and navigation
function ensureNav(sim) {
  if (sim.nav) return sim.nav;
  const w = sim.world; const ts = w.tileSize; const ok = [];
  for (let r = 0; r < w.rows; r++) {
    ok.push([]);
    for (let c = 0; c < w.cols; c++) {
      let free = w.solid[r][c] === false;
      if (free) for (const o of w.obstacles) if (o.kind !== 'grass' && c * ts + 4 < o.x + o.w && c * ts + ts - 4 > o.x && r * ts + 4 < o.y + o.d && r * ts + ts - 4 > o.y) { free = false; break; }
      ok[r].push(free);
    }
  }
  sim.nav = { ok };
  return sim.nav;
}

// Next point on a tile path from (x,y) to (tx,ty), or null when there is none. Breadth-first, four-way, over open tiles.
function navPoint(sim, x, y, tx, ty) {
  const { ok } = ensureNav(sim); const ts = sim.world.tileSize; const cols = sim.world.cols;
  const sc = Math.floor(x / ts); const sr = Math.floor(y / ts); const gc = Math.floor(tx / ts); const gr = Math.floor(ty / ts);
  if (sc === gc && sr === gr) return { x: tx, y: ty };
  const prev = new Map([[sr * cols + sc, -1]]); const q = [[sc, sr]];
  for (let h = 0; h < q.length; h++) {
    const [c, r] = q[h];
    if (c === gc && r === gr) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc; const nr = r + dr; const k = nr * cols + nc;
      if (prev.has(k) || !ok[nr]?.[nc]) continue;
      prev.set(k, r * cols + c); q.push([nc, nr]);
    }
  }
  let k = gr * cols + gc;
  if (!prev.has(k)) return null;
  let steps = 0;
  while (prev.get(k) !== -1 && prev.get(prev.get(k)) !== -1 && steps++ < 400) k = prev.get(k);
  if (prev.get(k) === -1) return { x: tx, y: ty };
  return { x: (k % cols + 0.5) * ts, y: (Math.floor(k / cols) + 0.5) * ts };
}

function moveEnemy(sim, e, dt, tx, ty, speed, turn = cfg(e).turn) {
  const dx = tx - e.x; const dy = ty - e.y; const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  const s = Math.min(d, speed * dt);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  turnTo(e, Math.atan2(dy, dx), dt, turn);
  resolveWalls(sim.world, e);
  for (const o of sim.world.obstacles) if (o.kind !== 'grass') pushOutOf(e, o);
  return d - s;
}

function turnTo(e, ang, dt, rate) { e.angle += clampN(angleDiff(e.angle, ang), -rate * dt, rate * dt); }
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Walks toward a point: straight when the way is clear, round corners by tile path when it is not.
function goTo(sim, e, dt, tx, ty, speed) {
  if (lineClear(sim.world, e.x, e.y, tx, ty)) { e.wx = tx; e.wy = ty; return moveEnemy(sim, e, dt, tx, ty, speed); }
  e.pathT -= dt;
  if (e.pathT <= 0 || Math.hypot(e.wx - e.x, e.wy - e.y) < 8) {
    const n = navPoint(sim, e.x, e.y, tx, ty); e.pathT = 0.35;
    if (n) { e.wx = n.x; e.wy = n.y; }
  }
  moveEnemy(sim, e, dt, e.wx, e.wy, speed);
  return Math.hypot(tx - e.x, ty - e.y);
}

function pushOutOf(e, o) {
  if (!circleHitsRect(e.x, e.y, e.radius, o)) return;
  const qx = Math.max(o.x, Math.min(e.x, o.x + o.w)); const qy = Math.max(o.y, Math.min(e.y, o.y + o.d));
  let dx = e.x - qx; let dy = e.y - qy; const d = Math.hypot(dx, dy);
  if (d === 0) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
  e.x += dx * (e.radius - d); e.y += dy * (e.radius - d);
}

function flee(sim, e, dt) {
  const c = sim.chariot;
  const a = Math.atan2(e.y - c.y, e.x - c.x);
  moveEnemy(sim, e, dt, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, cfg(e).fleeSpeed);
}

function patrol(sim, e, dt) {
  const R = cfg(e);
  if (e.patrol.length) {
    const to = e.patrol[e.target % e.patrol.length];
    if (moveEnemy(sim, e, dt, to.x, to.y, e.speed || R.patrolSpeed) < 2) e.target = (e.target + 1) % e.patrol.length;
  } else e.angle = e.homeAngle + Math.sin(sim.elapsed * 0.6 + e.phase) * 1.0; // stationary lookout sweeps ~±57 degrees
}

// A shove knocks the enemy back along a line. It stops at walls; if its centre ends over a pit it falls and is out of the fight (no gore).
function knockback(sim, e, dt, events) {
  e.x += e.kx * dt; e.y += e.ky * dt; e.kbT -= dt;
  resolveWalls(sim.world, e);
  for (const o of sim.world.obstacles) if (o.kind !== 'grass' && o.kind !== 'pit') pushOutOf(e, o);
  if (inPit(sim.world, e.x, e.y)) {
    e.state = 'down'; e.stateT = 0; e.fell = true; e.fleeing = false; e.kbT = 0; e.atk = null; e.open = false;
    events.push({ type: 'enemy-fell', id: e.id, x: e.x, y: e.y });
  }
}

// ---------------------------------------------------------------- the player takes a blow
export function hurtPlayer(sim, amount, events, from = null, opts = {}) {
  const p = sim.player; const c = sim.chariot;
  sim.health = Math.max(0, sim.health - amount);
  sim.invuln = Math.max(sim.invuln, COMBAT.hurtInvuln);
  const dir = from ? Math.atan2(from.y - c.y, from.x - c.x) : 0;
  p.state = 'hurt'; p.stateT = 0; p.hurtFor = opts.stun ?? COMBAT.hurtTime; p.swingHit = true; p.draw = 0; p.drawFull = false; p.queued = null; p.combo = -1; p.comboT = 0;
  if (opts.knock) { p.kx = (-Math.cos(dir) * opts.knock) / 0.18; p.ky = (-Math.sin(dir) * opts.knock) / 0.18; p.kbT = 0.18; }
  events.push({ type: 'hurt', amount, health: sim.health, x: c.x, y: c.y, from: from?.id ?? null, dir, weapon: from ? cfg(from).weapon : null });
  juice(sim, COMBAT.juice.hurt);
}

// What a landed blow does: a roll or a step out of reach whiffs; a block turns it aside; a parry opens the attacker for a finisher.
// Returns 'hurt', 'blocked', 'parry', 'broke' or 'whiff'.
function resolveBlow(sim, src, def, events, angle) {
  const c = sim.chariot; const p = sim.player; const B = COMBAT.block;
  const front = Math.abs(angleDiff(c.moveAngle, Math.atan2(src.y - c.y, src.x - c.x))) <= B.halfArc;
  if (p.state === 'block' && front && !def.unblockable) {
    if (p.stateT <= B.parryWindow) {
      p.stamina = Math.min(COMBAT.stamina.max, p.stamina + B.parryRefund);
      events.push({ type: 'parry', id: src.id, x: src.x ?? c.x, y: src.y ?? c.y, ranged: !!def.ranged });
      if (!def.ranged) {
        src.state = 'stagger'; src.stateT = 0; src.stagDur = B.parryStagger; src.fleeing = false; src.cd = 0; src.atk = null; src.open = true; src.poise = 0;
        events.push({ type: 'opened', id: src.id, x: src.x, y: src.y });
      }
      juice(sim, COMBAT.juice.parry, COMBAT.juice.slowParry);
      return 'parry';
    }
    if (spend(sim, p.held ? (PROPS[p.held.kind].guard?.cost ?? B.cost) : B.cost)) { events.push({ type: 'blocked', id: src.id, x: c.x, y: c.y }); if (p.held && PROPS[p.held.kind].guard) wearHeld(sim, events, 1, false); return 'blocked'; } // a shield turns blows for less stamina, and wears
    p.stamina = 0;
    events.push({ type: 'guard-break' });
    hurtPlayer(sim, Math.ceil(def.damage / 2), events, src, { stun: def.stun, knock: def.knock * 0.5 });
    return 'broke';
  }
  if (def.damage === 0) { sim.invuln = Math.max(sim.invuln, 0.6); events.push({ type: 'tap', id: src.id, x: c.x, y: c.y }); return 'hurt'; }
  hurtPlayer(sim, def.damage, events, src, { stun: def.stun, knock: def.knock });
  return 'hurt';
}

// ---------------------------------------------------------------- the director: who may attack, who circles, who calls for help
const attackers = (sim) => sim.enemies.reduce((n, e) => n + (e.atk && e.state !== 'down' ? 1 : 0), 0);

function rally(sim, src, events, all = false) {
  const c = sim.chariot; const R = cfg(src); let n = 0;
  for (const o of sim.enemies) {
    if (o === src || o.state === 'down' || o.aware || o.kind === 'sparrer') continue;
    if (!all && dist(o, src) > R.call) continue;
    o.aware = true; o.state = 'alert'; o.stateT = 0; o.sightT = cfg(o).react; o.lastX = c.x; o.lastY = c.y; n++; // already convinced: they come at once
  }
  src.callCd = 6;
  if (n > 0 || all) { src.calling = 0.8; events.push({ type: 'call', id: src.id, x: src.x, y: src.y, n }); }
}

function pickAttack(sim, e, d) {
  const R = cfg(e); const names = Object.keys(R.attacks);
  const ok = names.filter((n) => { const a = R.attacks[n]; return (a.minPhase || 1) <= e.phaseNo && (a.from == null || (d >= a.from && d <= a.to)); });
  if (R.attacks[R.main] && e.kind !== 'archer' && e.kind !== 'captain') return R.main;
  if (e.kind === 'archer') return d < 60 ? 'bash' : 'shoot';
  // captain: a special when it fits, else the slash chain
  if (e.plan && sim.clock < e.plan.until && e.plan.phase === e.phaseNo) return e.plan.name; // decide once per beat, not once per tick
  const specials = ok.filter((n) => n !== 'slash');
  const name = specials.length && sim.rng() < 0.55 ? specials[Math.floor(sim.rng() * specials.length)] : 'slash';
  e.plan = { name, until: sim.clock + 1.2, phase: e.phaseNo };
  return name;
}

function beginAttack(sim, e, name, events) {
  const R = cfg(e); const def = R.attacks[name]; const c = sim.chariot;
  const n = R.maxChain ? 1 + Math.floor(sim.rng() * Math.min(R.maxChain, e.phaseNo + (e.kind === 'captain' ? 0 : 2))) : 1;
  const scale = e.kind === 'captain' && e.phaseNo === 3 ? 0.85 : 1;
  const windup = Math.max(MIN_WINDUP, def.windup * scale);
  e.plan = null;
  e.atk = { name, def, idx: 0, n: name === 'slash' ? n : 1, phase: 'windup', t: 0, windup, angle: Math.atan2(c.y - e.y, c.x - e.x), hit: false, dash: 0 };
  e.state = 'attack'; e.stateT = 0; e.retreating = false;
  sim.lastWindup = sim.clock;
  events.push({ type: 'windup', id: e.id, kind: e.kind, weapon: R.weapon, x: e.x, y: e.y, dur: windup, unblockable: !!def.unblockable });
}

function endAttack(sim, e) {
  e.atk = null; e.state = 'chase'; e.stateT = 0; e.cd = cfg(e).cooldown; e.lastAtk = sim.clock; e.lastX = sim.chariot.x; e.lastY = sim.chariot.y;
}

function stepAttackPhase(sim, e, dt, events) {
  const a = e.atk; const def = a.def; const c = sim.chariot; const R = cfg(e);
  a.t += dt;
  if (R.shield) e.guarding = a.phase !== 'recover'; // the shield drops only when the bash is spent
  if (a.phase === 'windup') {
    const lockAt = a.windup * (def.lock ?? 0.6);
    if (a.t < lockAt) { a.angle = a.angle + clampN(angleDiff(a.angle, Math.atan2(c.y - e.y, c.x - e.x)), -R.track * dt, R.track * dt); }
    e.angle = a.angle; a.locked = a.t >= lockAt;
    if (a.t >= a.windup) {
      a.phase = 'active'; a.t = 0; a.hit = false; a.dash = def.dash || 0;
      events.push({ type: 'enemy-swing', id: e.id, kind: e.kind, weapon: R.weapon, x: e.x, y: e.y });
      if (def.ranged) fireArrow(sim, e, a, events);
    }
  } else if (a.phase === 'active') {
    if (def.dash) { const v = (def.dash / def.active) * dt; e.x += Math.cos(a.angle) * v; e.y += Math.sin(a.angle) * v; resolveWalls(sim.world, e); const d = dist(e, c); const min = c.radius + e.radius; if (d < min && d > 0) { e.x = c.x - ((c.x - e.x) / d) * min; e.y = c.y - ((c.y - e.y) / d) * min; } }
    if (!a.hit && !def.ranged && sim.invuln <= 0 && inSector(e.x, e.y, a.angle, def.reach, def.halfArc, c.x, c.y, c.radius) && attackClear(sim.world, e.x, e.y, c.x, c.y)) {
      a.hit = true; resolveBlow(sim, e, def, events, a.angle);
    }
    if (a.t >= def.active) {
      if (!a.hit && !def.ranged) events.push({ type: 'whiff', id: e.id, x: e.x, y: e.y });
      a.phase = 'recover'; a.t = 0;
    }
  } else if (a.phase === 'recover') {
    const chain = a.idx + 1 < a.n && a.t >= (def.chainRecover ?? 0.12) && dist(e, c) <= def.reach + 18 && attackClear(sim.world, e.x, e.y, c.x, c.y) && sim.health > 0;
    if (chain) {
      a.idx += 1; a.phase = 'windup'; a.t = 0; a.windup = Math.max(MIN_WINDUP, def.chainWindup ?? def.windup); a.angle = Math.atan2(c.y - e.y, c.x - e.x); a.hit = false; a.locked = false;
      events.push({ type: 'windup', id: e.id, kind: e.kind, weapon: R.weapon, x: e.x, y: e.y, dur: a.windup, chain: a.idx, unblockable: !!def.unblockable });
    } else if (a.t >= def.recover) endAttack(sim, e);
  }
}

// ---------------------------------------------------------------- enemy arrows
function fireArrow(sim, e, a, events) {
  const def = a.def; const slot = sim.eArrows.find((x) => !x.active);
  if (!slot) return;
  Object.assign(slot, { active: true, x: e.x + Math.cos(a.angle) * 16, y: e.y + Math.sin(a.angle) * 16, vx: Math.cos(a.angle) * def.arrow, vy: Math.sin(a.angle) * def.arrow, left: def.reach, angle: a.angle, from: e.id, dmg: def.damage, stun: def.stun, knock: def.knock });
  events.push({ type: 'enemy-arrow', id: e.id, x: e.x, y: e.y, angle: a.angle });
}

export function stepEnemyArrows(sim, dt, events) {
  const w = sim.world; const ts = w.tileSize; const c = sim.chariot;
  for (const a of sim.eArrows) {
    if (!a.active) continue;
    const step = Math.hypot(a.vx, a.vy) * dt; const n = Math.max(1, Math.ceil(step / 6));
    for (let i = 0; i < n && a.active; i++) {
      a.x += (a.vx * dt) / n; a.y += (a.vy * dt) / n; a.left -= step / n;
      if (w.solid[Math.floor(a.y / ts)]?.[Math.floor(a.x / ts)] !== false || w.obstacles.some((o) => (o.kind === 'ledge' || o.kind === 'lowwall') && circleHitsRect(a.x, a.y, 2, o)) || a.left <= 0) { a.active = false; break; }
      if (Math.hypot(c.x - a.x, c.y - a.y) <= c.radius + 4 && sim.invuln <= 0) {
        a.active = false;
        const src = sim.enemies.find((x) => x.id === a.from) || { id: a.from, x: a.x - Math.cos(a.angle) * 40, y: a.y - Math.sin(a.angle) * 40 };
        resolveBlow(sim, { id: src.id, x: a.x - Math.cos(a.angle) * 30, y: a.y - Math.sin(a.angle) * 30, state: 'chase' }, { damage: a.dmg, stun: a.stun, knock: a.knock, ranged: true }, events, a.angle);
        events.push({ type: 'arrow-hit', x: c.x, y: c.y });
      }
    }
  }
}

// ---------------------------------------------------------------- the enemy turn
// Per tick: nearest first, so the nearest enemy that is ready gets one of the MAX_ATTACKERS attack slots. Everyone else circles, flanks or waits.
export function stepEnemies(sim, dt, events) {
  const c = sim.chariot;
  const order = [...sim.enemies].sort((a, b) => (a.lastAtk - b.lastAtk) || (dist(a, c) - dist(b, c)) || (a.id < b.id ? -1 : 1)); // who waited longest goes first, so the slots rotate
  for (const e of sim.enemies) { e.calling = Math.max(0, e.calling - dt); e.invul = Math.max(0, e.invul - dt); e.flinch = Math.max(0, e.flinch - dt); e.callCd = Math.max(0, e.callCd - dt); }
  for (const e of order) {
    const R = cfg(e);
    e.stateT += dt; e.cd = Math.max(0, e.cd - dt); e.poise = Math.max(0, e.poise - dt); if (!e.carry) e.disarmedT += dt;
    if (e.state !== 'down' && e.kbT > 0) knockback(sim, e, dt, events);
    const d = dist(e, c);
    if (e.state === 'down') { if (!e.fell && e.stateT < R.downFlee && e.fleeing) flee(sim, e, dt); continue; }
    if (e.state === 'phase') { turnTo(e, Math.atan2(c.y - e.y, c.x - e.x), dt, 6); if (e.stateT >= 0.9) { e.state = 'chase'; e.stateT = 0; } continue; }
    if (e.state === 'stagger') {
      if (e.fleeing) flee(sim, e, dt);
      if (e.stateT >= e.stagDur) { e.state = 'alert'; e.stateT = 0; e.sightT = R.react; e.lastX = c.x; e.lastY = c.y; e.poise = R.poise ?? COMBAT.poise; e.open = false; e.guarding = !!R.shield; }
      continue;
    }
    if (e.state === 'rearm') { stepRearm(sim, e, dt, events); keepApart(sim, e); continue; }
    if (e.atk) { stepAttackPhase(sim, e, dt, events); keepApart(sim, e); continue; }
    if (R.shield) e.guarding = true;
    const canSee = sees(sim, e);
    if (canSee && !e.aware) { e.aware = true; if (!R.friendly) events.push({ type: 'seen', id: e.id, x: e.x, y: e.y }); }
    if (canSee) { e.lastX = c.x; e.lastY = c.y; e.lostT = 0; }
    if (e.state === 'patrol') {
      patrol(sim, e, dt);
      if (canSee) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; }
      else if (d <= (R.friendly ? R.hearing : hearingRange(sim, e)) && c.speed > 20) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.lastX = c.x; e.lastY = c.y; }
    } else if (e.state === 'alert') {
      if (canSee || e.sightT >= R.react) {
        e.sightT += dt; if (canSee) e.angle += clampN(angleDiff(e.angle, Math.atan2(c.y - e.y, c.x - e.x)), -8 * dt, 8 * dt);
        if (e.sightT >= R.react) {
          e.state = 'chase'; e.stateT = 0; e.aware = true;
          if (!R.friendly && e.callCd <= 0) rally(sim, e, events);
        }
      } else {
        e.sightT = 0;
        const left = goTo(sim, e, dt, e.lastX, e.lastY, R.searchSpeed);
        if (left < 2) e.angle += e.spin * 1.5 * dt;
        if (e.stateT >= R.searchFor) { e.state = 'patrol'; e.stateT = 0; e.aware = false; e.spin = rngSign(sim); }
      }
    } else if (e.state === 'retreat') {
      e.retreatT += dt;
      const away = d > 230 && e.retreatT > 1.5;
      if (away) { e.state = 'alert'; e.stateT = 0; e.sightT = R.react; e.retreating = false; e.desperate = false; e.retreatT = 0; }
      else if (e.retreatT > 1.2 && (d < 50 || (d < 130 && e.pinned > 0.6))) { e.state = 'chase'; e.desperate = true; e.retreating = false; e.stateT = 0; } // cornered: it fights
      else { const bx = e.x; const by = e.y; flee(sim, e, dt); e.pinned = Math.hypot(e.x - bx, e.y - by) < 0.15 * R.fleeSpeed * dt ? (e.pinned || 0) + dt : 0; if (e.kind === 'archer' && e.cd <= 0 && d > 100 && canSee) { e.state = 'chase'; e.stateT = 0; } }
    } else if (e.state === 'chase' || e.state === 'circle') {
      if (!canSee) {
        e.lostT += dt;
        if (e.lostT >= R.loseAfter) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.spin = rngSign(sim); continue; }
      }
      if (!R.friendly && R.retreatAt > 0 && !e.desperate && e.hp / e.maxHp <= R.retreatAt && !e.retreating) { e.state = 'retreat'; e.retreating = true; e.stateT = 0; e.retreatT = 0; events.push({ type: 'retreat', id: e.id, x: e.x, y: e.y }); continue; }
      if (wantsRearm(sim, e, d)) { startRearm(sim, e, events); keepApart(sim, e); continue; }
      const los = attackClear(sim.world, e.x, e.y, c.x, c.y);
      const name = pickAttack(sim, e, d);
      const def = R.attacks[name];
      const inRange = e.kind === 'archer' ? (name === 'bash' ? d <= def.reach + 8 : d <= R.keep.max + 30 && d >= R.keep.min - 10) : (def.from != null ? d >= def.from && d <= def.to : d <= (R.start ?? def.reach * 0.85));
      const ready = e.cd <= 0 && los && inRange && (canSee || d < 60) && sim.health > 0;
      if (ready && attackers(sim) < MAX_ATTACKERS && sim.clock - (sim.lastWindup ?? -9) >= WINDUP_GAP) { beginAttack(sim, e, name, events); e.role = 'attacker'; keepApart(sim, e); continue; }
      positioning(sim, e, dt, R, d, los);
    }
    keepApart(sim, e);
    const min = c.radius + e.radius; const dd = Math.hypot(c.x - e.x, c.y - e.y); // never overlap the player
    if (dd < min && dd > 0) { e.x = c.x - ((c.x - e.x) / dd) * min; e.y = c.y - ((c.y - e.y) / dd) * min; }
  }
}

// Where an engaged enemy that is not attacking should be: kind-specific spacing, otherwise a ring around the player.
function positioning(sim, e, dt, R, d, los) {
  const c = sim.chariot;
  const bearing = Math.atan2(e.y - c.y, e.x - c.x);
  if (e.kind === 'archer') { // keep a firing distance, with a clear line; back off when pressed
    e.role = 'archer';
    if (d < R.keep.min) { const a = bearing; moveEnemy(sim, e, dt, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, R.fleeSpeed, 8); turnTo(e, Math.atan2(c.y - e.y, c.x - e.x), dt, 8); }
    else if (d > R.keep.max || !los) goTo(sim, e, dt, c.x, c.y, R.chaseSpeed);
    else turnTo(e, Math.atan2(c.y - e.y, c.x - e.x), dt, 8);
    e.state = 'chase'; return;
  }
  if (R.spacing && d < R.spacing.min && los) { // a spear wants room: it steps back to its thrusting distance
    e.role = 'waiting'; moveEnemy(sim, e, dt, e.x + Math.cos(bearing) * 30, e.y + Math.sin(bearing) * 30, R.chaseSpeed * 0.8, 8); turnTo(e, bearing + Math.PI, dt, R.turn); return;
  }
  if (attackers(sim) >= MAX_ATTACKERS && d <= R.ring + 40) { // both attack slots are taken: wait on the ring, and half of the waiters work round to the player's back
    e.state = 'circle';
    const flank = sim.enemies.indexOf(e) % 2 === 0; e.role = flank ? 'flanker' : 'waiting';
    const sign = flank ? (angleDiff(bearing, c.moveAngle + Math.PI) >= 0 ? 1 : -1) : e.spin;
    const want = bearing + sign * 0.55;
    moveEnemy(sim, e, dt, c.x + Math.cos(want) * R.ring, c.y + Math.sin(want) * R.ring, R.circleSpeed, R.track);
    turnTo(e, Math.atan2(c.y - e.y, c.x - e.x), dt, R.track);
    return;
  }
  e.state = 'chase'; e.role = 'chaser';
  if (d > (R.start ?? 40) - 6) goTo(sim, e, dt, e.lastX, e.lastY, R.chaseSpeed);
  else turnTo(e, Math.atan2(c.y - e.y, c.x - e.x), dt, R.turn);
}

// Enemies never stack on one another.
function keepApart(sim, e) {
  for (const o of sim.enemies) {
    if (o === e || o.state === 'down') continue;
    const dx = e.x - o.x; const dy = e.y - o.y; const d = Math.hypot(dx, dy); const min = (e.radius + o.radius) * 0.9;
    if (d < min && d > 0.01) { const k = (min - d) / 2; e.x += (dx / d) * k; e.y += (dy / d) * k; }
  }
}

const rngSign = (sim) => (sim.rng() < 0.5 ? -1 : 1);

// Test and tooling hook: put an enemy mid-attack at `t` seconds into the named phase, facing the player.
export function forceAttack(sim, e, { name, phase = 'windup', t = 0, n = 1 } = {}) {
  const R = cfg(e); const nm = name || R.main; const def = R.attacks[nm]; const c = sim.chariot;
  e.aware = true; e.state = 'attack'; e.stateT = 0; e.cd = 0; e.fleeing = false;
  e.atk = { name: nm, def, idx: 0, n, phase, t, windup: Math.max(MIN_WINDUP, def.windup), angle: Math.atan2(c.y - e.y, c.x - e.x), hit: false, dash: 0, locked: true };
  e.angle = e.atk.angle;
  return e;
}

// ================================================================ props (CEO, 2026-11-22): grab things from the world and fight with them
// Data lives in abilities.js (PROPS). Rules, all deterministic (only sim.rng, and only for a disarm roll):
//  - A prop is idle (on the ground), held (by the player), thrown (in flight) or broken (debris, gone after DEBRIS_FOR seconds).
//  - The held prop replaces the melee weapon until it is dropped, thrown, broken or swapped. The ability weapon underneath (staff, sword, bow) comes back with it.
//  - Every action costs stamina (the swing's own cost, or the throw's cost) and says so with 'tired' when you have too little. Picking up and dropping are free.
//  - A swing that connects wears the prop by 1 (a heavy blow by 2). A miss wears nothing. At 0 it breaks. Cracks show at 2/3 and 1/3 left (frame crack 1, 2; broken = 3).
//  - A shove, any heavy blow, a rope or a shield slam can knock the weapon out of an enemy's hand (the roll uses sim.rng). A beaten enemy drops its weapon too.
//  - An unarmed enemy that is not close to you may walk to a loose prop within REARM.range, bend for REARM.grab seconds (visible, interruptible) and arm itself. It never does so
//    while you are next to it: then it punches (4 damage, telegraphed like every blow) instead of its old weapon's 6 to 10.
//  - Nothing here hurts by touch: a thrown prop only hurts an enemy, and enemies never throw.
export const PICK_RADIUS = 46; export const MAX_PROPS = 48; export const DEBRIS_FOR = 4; export const DISARM_CHANCE = 0.7;
const THROW_CONE = 0.5; const REARM = { range: 120, grab: 0.7, delay: 0.9, reach: 22, near: 56 };
export const NATIVE_PROP = { raider: 'club', spearman: 'spear', swordsman: 'fallen-sword', shield: 'wood-shield' }; // what each armed kind carries, and drops

// What an enemy fights like with a prop in hand (movement, sight and health stay the kind's own). Numbers mirror the native kinds so a re-armed enemy is no stronger than a native one.
const FISTS_KIT = { weapon: 'fists', attacks: { punch: { windup: 0.55, active: 0.14, recover: 1.0, reach: 34, halfArc: 0.9, damage: 4, knock: 14, stun: 0.2, lock: 0.6 } }, main: 'punch', start: 32 };
export const ENEMY_PROPS = {
  stick: { weapon: 'stick', attacks: { whack: { windup: 0.55, active: 0.14, recover: 1.0, reach: 44, halfArc: 0.95, damage: 6, knock: 20, stun: 0.2, lock: 0.6 } }, main: 'whack', start: 36 },
  'bamboo-staff': { weapon: 'stick', attacks: { sweep: { windup: 0.6, active: 0.16, recover: 1.0, reach: 58, halfArc: 0.9, damage: 6, knock: 22, stun: 0.2, lock: 0.6 } }, main: 'sweep', start: 48 },
  club: { weapon: 'club', attacks: ENEMY.raider.attacks, main: 'slash', start: 34 },
  spear: { weapon: 'spear', attacks: ENEMY.spearman.attacks, main: 'thrust', start: 70, spacing: ENEMY.spearman.spacing },
  'fallen-sword': { weapon: 'sword', attacks: { slash: { ...ENEMY.swordsman.attacks.slash } }, main: 'slash', start: 38 },
  'wood-shield': { weapon: 'shield', attacks: ENEMY.shield.attacks, main: 'bash', start: 34, shield: true, shieldHalf: 1.05 },
};
const KITS = new Map();
// The enemy's fighting numbers: the kind's own table while it holds its native weapon (or has no prop concept at all: archer, captain, sparrer), else a derived kit.
export function kitOf(e) {
  const base = ENEMY[e.kind] || ENEMY.raider; const nat = NATIVE_PROP[e.kind];
  if (!nat || e.carry === undefined || e.carry === nat) return base;
  const key = `${e.kind}|${e.carry}`; let k = KITS.get(key);
  if (!k) {
    const P = (e.carry && ENEMY_PROPS[e.carry]) || FISTS_KIT;
    k = { ...base, ...P, shield: !!P.shield, shieldHalf: P.shieldHalf, spacing: P.spacing, maxChain: undefined }; k.windup = k.attacks[k.main].windup; KITS.set(key, k);
  }
  return k;
}
function startingCarry(kind, carry) { // carry: undefined = the kind's own weapon, null = unarmed, a prop id = that prop
  const nat = NATIVE_PROP[kind];
  if (!nat) return { carry: null, carryUses: 0, disarmedT: 99, rearm: null };
  const k = carry === null ? null : typeof carry === 'string' && PROPS[carry]?.enemy ? carry : nat;
  return { carry: k, carryUses: k ? Math.max(2, Math.ceil(PROPS[k].uses * 0.5)) : 0, disarmedT: k ? 0 : 99, rearm: null }; // an enemy's weapon is half worn when you take it
}

// The player's attack tables for each prop, built from the data: { via, steps, heavy } like the weapon sets above.
const throwSpec = (kind) => ({ id: 'throw', via: 'prop', prop: kind, throwProp: true, hitAt: 0.14, swing: 0.4, cancel: 0.4, range: 20, halfArc: 0.5, damage: 0, stagger: 0, knock: 0, lunge: 0, stamina: PROPS[kind].throw.stamina });
export const PROP_SETS = {};
for (const [kind, P] of Object.entries(PROPS)) {
  const tag = (s) => ({ ...s, via: 'prop', prop: kind });
  PROP_SETS[kind] = { via: 'prop', steps: P.primary === 'throw' ? [throwSpec(kind)] : P.melee.steps.map(tag), heavy: { ...tag(P.melee.heavy), heavy: true, breaks: true } };
  PROP_SETS[kind].steps.forEach((s) => { ATTACKS[`prop.${kind}.${s.id}`] = s; }); ATTACKS[`prop.${kind}.${PROP_SETS[kind].heavy.id}`] = PROP_SETS[kind].heavy;
}

// ---- state
export function createProps(world) {
  return (world.props || []).map((q) => ({ id: q.id, kind: q.kind, x: q.x, y: q.y, state: 'idle', uses: PROPS[q.kind].uses, holder: null, angle: q.angle || 0, vx: 0, vy: 0, left: 0, z: 0, t: 0, from: null }));
}
export function spawnProp(sim, kind, x, y, o = {}) {
  if (!PROPS[kind]) return null;
  if (sim.props.length >= MAX_PROPS) { const i = sim.props.findIndex((q) => q.state === 'broken'); if (i < 0) return null; sim.props.splice(i, 1); } // full: debris makes room, else the item is simply lost
  const pr = { id: `d${++sim.propSeq}`, kind, x, y, state: 'idle', uses: o.uses ?? PROPS[kind].uses, holder: null, angle: o.angle ?? 0, vx: 0, vy: 0, left: 0, z: 0, t: 0, from: o.from ?? null };
  sim.props.push(pr);
  return pr;
}
export const durFrac = (pr) => (pr.state === 'broken' ? 0 : Math.max(0, Math.min(1, pr.uses / PROPS[pr.kind].uses)));
export const crackOf = (pr) => { if (pr.state === 'broken') return 3; const f = durFrac(pr); return f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : 2; };

// A spot for something that lands or is dropped at (x,y): out of walls and solid obstacles, never over a pit; else where it came from.
function freeSpot(sim, x, y, fx, fy) {
  const w = sim.world; const q = { x, y, radius: 10 };
  resolveWalls(w, q);
  for (const o of w.obstacles) if (o.kind !== 'grass' && o.kind !== 'pit') pushOutOf(q, o);
  if (inPit(w, q.x, q.y) || q.x < 8 || q.y < 8 || q.x > w.width - 8 || q.y > w.height - 8) return { x: fx, y: fy };
  return { x: q.x, y: q.y };
}

// ---- picking up, swapping, dropping
export function nearestProp(sim) {
  const p = sim.player; const c = sim.chariot;
  if (!FREE.has(p.state)) return null;
  let best = null; let bd = PICK_RADIUS + 1;
  for (const pr of sim.props) {
    if (pr.state !== 'idle') continue;
    const d = dist(c, pr);
    if (d < bd && attackClear(sim.world, c.x, c.y, pr.x, pr.y)) { bd = d; best = pr; }
  }
  return best;
}
export function tryPickupProp(sim, events) {
  const p = sim.player; const pr = nearestProp(sim);
  if (!pr) return false;
  let swapped = null;
  if (p.held) { // swap: what you hold is put down where the new one lay
    swapped = p.held; swapped.state = 'idle'; swapped.holder = null; swapped.x = pr.x; swapped.y = pr.y;
    events.push({ type: 'prop-drop', id: swapped.id, kind: swapped.kind, by: 'player', reason: 'swap', x: swapped.x, y: swapped.y });
  }
  pr.state = 'held'; pr.holder = 'player'; pr.x = sim.chariot.x; pr.y = sim.chariot.y; p.held = pr;
  p.cooldown = Math.max(p.cooldown, 0.2); p.combo = -1; p.comboT = 0; p.queued = null; p.draw = 0; p.drawFull = false; p.crouching = false;
  events.push({ type: 'prop-pickup', id: pr.id, kind: pr.kind, name: PROPS[pr.kind].name, x: pr.x, y: pr.y, swap: !!swapped });
  return true;
}
export function dropHeld(sim, events, reason = 'drop') {
  const p = sim.player; const c = sim.chariot; const pr = p.held;
  if (!pr) return false;
  const a = c.moveAngle ?? 0; const s = freeSpot(sim, c.x + Math.cos(a) * 24, c.y + Math.sin(a) * 24, c.x, c.y);
  pr.state = 'idle'; pr.holder = null; pr.x = s.x; pr.y = s.y; pr.angle = a; p.held = null; p.cooldown = Math.max(p.cooldown, 0.15);
  events.push({ type: 'prop-drop', id: pr.id, kind: pr.kind, by: 'player', reason, x: pr.x, y: pr.y });
  return true;
}
export function breakProp(sim, pr, events, shatter = false) {
  const p = sim.player;
  if (p.held === pr) p.held = null;
  pr.state = 'broken'; pr.holder = null; pr.t = 0; pr.uses = 0;
  events.push({ type: shatter ? 'prop-shatter' : 'prop-break', id: pr.id, kind: pr.kind, name: PROPS[pr.kind].name, x: pr.x, y: pr.y });
}
export function wearHeld(sim, events, n = 1, shatter = false) {
  const pr = sim.player.held; if (!pr) return;
  pr.uses -= n;
  if (shatter || pr.uses <= 0) breakProp(sim, pr, events, shatter);
}

// ---- throwing
function throwAim(sim, range) { // the nearest enemy or post in a cone in front, else straight ahead
  const c = sim.chariot; let best = null; let bd = Infinity;
  const consider = (o) => {
    const d = dist(c, o); if (d > range || d < 1) return;
    if (Math.abs(angleDiff(c.moveAngle, Math.atan2(o.y - c.y, o.x - c.x))) > THROW_CONE || !lineClear(sim.world, c.x, c.y, o.x, o.y)) return;
    if (d < bd) { bd = d; best = o; }
  };
  for (const e of sim.enemies) if (e.state !== 'down' && e.kind !== 'sparrer') consider(e);
  for (const t of sim.targets) consider(t);
  return best ? Math.atan2(best.y - c.y, best.x - c.x) : c.moveAngle;
}
export function throwTarget(sim) { // the enemy the Do button would throw at, if any: the HUD shows "Throw" only when this is not null
  const held = sim.player.held; const T = held && PROPS[held.kind].throw;
  if (!T) return null;
  const a = throwAim(sim, Math.min(T.range, 300)); const c = sim.chariot;
  return sim.enemies.find((e) => e.state !== 'down' && e.kind !== 'sparrer' && Math.abs(angleDiff(a, Math.atan2(e.y - c.y, e.x - c.x))) < 0.05 && dist(c, e) <= Math.min(T.range, 300)) || null;
}
export function startThrow(sim, events) {
  const p = sim.player; const held = p.held;
  if (!held || !(FREE.has(p.state) || p.state === 'block') || p.cooldown > 0) return false;
  const T = PROPS[held.kind].throw;
  if (!T) { events.push({ type: 'prop-nothrow', kind: held.kind, name: PROPS[held.kind].name }); return false; }
  if (!spend(sim, T.stamina)) { events.push({ type: 'tired', what: 'throw' }); return false; }
  begin(sim, throwSpec(held.kind), events);
  return true;
}
export function throwContext(sim, events) { return !!throwTarget(sim) && startThrow(sim, events); }
function launchThrow(sim, events) {
  const p = sim.player; const c = sim.chariot; const pr = p.held;
  if (!pr) return;
  const T = PROPS[pr.kind].throw; const a = p.attackAngle;
  p.held = null; pr.state = 'thrown'; pr.holder = null; pr.angle = a; pr.t = 0; pr.z = 0; pr.left = T.range;
  pr.vx = Math.cos(a) * T.speed; pr.vy = Math.sin(a) * T.speed; pr.x = c.x + Math.cos(a) * (c.radius + 6); pr.y = c.y + Math.sin(a) * (c.radius + 6);
  events.push({ type: 'prop-throw', id: pr.id, kind: pr.kind, name: PROPS[pr.kind].name, x: pr.x, y: pr.y, angle: a, range: T.range });
}

// A thrown prop splashes: everyone near the impact (but the one it struck) is staggered and nothing more.
function splash(sim, pr, T, x, y, skip, events) {
  for (const e of sim.enemies) {
    if (e === skip || e.state === 'down' || dist(e, { x, y }) > (T.radius || 0) + e.radius) continue;
    applyHit(sim, e, { damage: 0, stagger: T.stagger * 0.6, knock: 0, via: 'prop', prop: pr.kind, thrown: true }, Math.atan2(e.y - y, e.x - x), events);
  }
}
function landProp(sim, pr, x, y, hitEnemy, events) {
  const T = PROPS[pr.kind].throw; pr.z = 0; pr.vx = 0; pr.vy = 0;
  if (T.shatter) { pr.x = x; pr.y = y; splash(sim, pr, T, x, y, hitEnemy, events); breakProp(sim, pr, events, true); return; }
  if (T.breaks) { pr.x = x; pr.y = y; breakProp(sim, pr, events, false); return; }
  pr.uses -= 1; // a thrown spear or stone is dented by it
  const s = freeSpot(sim, x, y, sim.chariot.x, sim.chariot.y); pr.x = s.x; pr.y = s.y;
  if (pr.uses <= 0 || inPit(sim.world, s.x, s.y)) { breakProp(sim, pr, events, false); return; }
  pr.state = 'idle';
  events.push({ type: 'prop-land', id: pr.id, kind: pr.kind, x: pr.x, y: pr.y });
}
function flyProp(sim, pr, dt, events) {
  const w = sim.world; const ts = w.tileSize; const T = PROPS[pr.kind].throw;
  const sp = Math.hypot(pr.vx, pr.vy); const step = sp * dt; const n = Math.max(1, Math.ceil(step / 6));
  for (let i = 0; i < n; i++) {
    pr.x += (pr.vx * dt) / n; pr.y += (pr.vy * dt) / n; pr.left -= step / n;
    pr.z = T.arc * Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - pr.left / T.range)));
    for (const e of sim.enemies) {
      if (e.state === 'down' || e.kind === 'sparrer' || dist(e, pr) > e.radius + 7) continue;
      applyHit(sim, e, { damage: T.damage, stagger: T.stagger, knock: T.knock, via: 'prop', prop: pr.kind, thrown: true, heavy: T.damage >= 2 }, pr.angle, events);
      events.push({ type: 'prop-hit', id: pr.id, kind: pr.kind, name: PROPS[pr.kind].name, x: e.x, y: e.y, target: e.id });
      landProp(sim, pr, e.x - Math.cos(pr.angle) * 14, e.y - Math.sin(pr.angle) * 14, e, events); return;
    }
    for (const t of sim.targets) if (dist(t, pr) <= t.radius + 7) { hitTarget(t, 'prop', events); landProp(sim, pr, pr.x - Math.cos(pr.angle) * 14, pr.y - Math.sin(pr.angle) * 14, null, events); return; }
    const blocked = w.solid[Math.floor(pr.y / ts)]?.[Math.floor(pr.x / ts)] !== false || w.obstacles.some((o) => o.kind === 'ledge' && circleHitsRect(pr.x, pr.y, 2, o));
    if (blocked || pr.left <= 0) { const back = blocked ? 12 : 0; landProp(sim, pr, pr.x - (pr.vx / sp) * back, pr.y - (pr.vy / sp) * back, null, events); return; }
  }
}
// Called once per tick: the held prop follows the player, thrown props fly, debris fades.
export function stepProps(sim, dt, events) {
  const c = sim.chariot;
  for (let i = sim.props.length - 1; i >= 0; i--) {
    const pr = sim.props[i];
    if (pr.state === 'held') { pr.x = c.x; pr.y = c.y; }
    else if (pr.state === 'thrown') flyProp(sim, pr, dt, events);
    else if (pr.state === 'broken') { pr.t += dt; if (pr.t >= DEBRIS_FOR) sim.props.splice(i, 1); }
  }
  sim.player.twoHandCd = Math.max(0, (sim.player.twoHandCd || 0) - dt);
}
// Block pressed with both hands on a prop: say why nothing happened, now and then.
export function twoHandCue(sim, hold, events) {
  const p = sim.player;
  if (hold && p.held && PROPS[p.held.kind].twoHands && !(p.twoHandCd > 0)) { p.twoHandCd = 1.5; events.push({ type: 'prop-twohands', kind: p.held.kind, name: PROPS[p.held.kind].name }); }
}
// Movement scale while carrying (a bench or a crate is slow and cannot be run with).
export const carryScale = (p) => (p.held ? PROPS[p.held.kind].move : 1);

// ---- enemies: dropping, being disarmed, picking a prop up
function dropCarried(sim, e, events, reason, from) {
  if (!e.carry) return null;
  const kind = e.carry; const uses = Math.max(1, e.carryUses || 1); const fling = reason === 'disarm' ? 30 : 16;
  e.carry = null; e.carryUses = 0; e.disarmedT = 0; e.guarding = false;
  const s = freeSpot(sim, e.x + Math.cos(from) * fling, e.y + Math.sin(from) * fling, e.x, e.y);
  const pr = spawnProp(sim, kind, s.x, s.y, { uses, from: e.id, angle: from });
  events.push({ type: 'prop-drop', id: pr ? pr.id : null, kind, by: e.id, reason, x: s.x, y: s.y });
  return pr;
}
function tryDisarm(sim, e, hit, from, events) {
  if (!e.carry || e.state === 'down' || hit.finisher || hit.thrown || hit.via === 'arrow' || !NATIVE_PROP[e.kind]) return false;
  const chance = hit.disarm ?? (hit.breaks ? DISARM_CHANCE : 0);
  if (!(chance > 0)) return false;
  if (chance < 1 && sim.rng() >= chance) return false;
  const kind = e.carry;
  dropCarried(sim, e, events, 'disarm', from);
  e.atk = null; e.rearm = null; if (e.state === 'attack' || e.state === 'rearm') { e.state = 'chase'; e.stateT = 0; }
  events.push({ type: 'disarm', id: e.id, kind: e.kind, prop: kind, x: e.x, y: e.y });
  return true;
}
function findRearmProp(sim, e) {
  let best = null; let bd = REARM.range;
  for (const pr of sim.props) {
    if (pr.state !== 'idle' || !PROPS[pr.kind].enemy) continue;
    const d = dist(e, pr);
    if (d < bd && lineClear(sim.world, e.x, e.y, pr.x, pr.y)) { bd = d; best = pr; }
  }
  return best;
}
function wantsRearm(sim, e, d) { return !e.carry && !!NATIVE_PROP[e.kind] && e.disarmedT >= REARM.delay && d > REARM.near && !!findRearmProp(sim, e); }
function startRearm(sim, e, events) {
  const pr = findRearmProp(sim, e);
  e.state = 'rearm'; e.stateT = 0; e.atk = null; e.rearm = { id: pr.id, t: 0 };
  events.push({ type: 'enemy-rearm', id: e.id, kind: e.kind, prop: pr.kind, x: e.x, y: e.y });
}
function stepRearm(sim, e, dt, events) {
  const pr = e.rearm && sim.props.find((q) => q.id === e.rearm.id); const R = cfg(e);
  if (!pr || pr.state !== 'idle' || dist(e, sim.chariot) <= REARM.near * 0.7) { e.state = 'chase'; e.stateT = 0; e.rearm = null; e.cd = Math.max(e.cd, 0.3); return; } // gone, or you are on top of it: it fights with what it has
  if (dist(e, pr) > REARM.reach) { e.rearm.t = 0; goTo(sim, e, dt, pr.x, pr.y, R.chaseSpeed * 0.9); return; }
  turnTo(e, Math.atan2(pr.y - e.y, pr.x - e.x), dt, R.turn);
  e.rearm.t += dt;
  if (e.rearm.t < REARM.grab) return;
  sim.props.splice(sim.props.indexOf(pr), 1);
  e.carry = pr.kind; e.carryUses = pr.uses; e.disarmedT = 0; e.rearm = null; e.state = 'chase'; e.stateT = 0; e.cd = Math.max(e.cd, 0.5); e.guarding = !!cfg(e).shield;
  events.push({ type: 'enemy-pickup', id: e.id, kind: e.kind, prop: pr.kind, x: e.x, y: e.y });
}

// ---- what the frame says (renderer.js makeFrame): props, the held item and the pick-up prompt (HUD request in docs/review/prop-hooks.md)
export function propPrompt(sim) {
  if (!sim.rules2) return null;
  const pr = nearestProp(sim); const held = sim.player.held;
  if (pr) return { text: `${held ? 'Swap' : 'Take'} ${PROPS[pr.kind].name.toLowerCase()}`, propId: pr.id, kind: pr.kind };
  if (held && throwTarget(sim)) return { text: 'Throw', propId: held.id, kind: held.kind };
  return null;
}
export function heldFrame(sim) {
  const pr = sim.player.held; if (!pr) return null;
  const P = PROPS[pr.kind];
  return { id: pr.id, kind: pr.kind, name: P.name, cls: P.cls, uses: pr.uses, maxUses: P.uses, durability: durFrac(pr), crack: crackOf(pr), twoHands: P.twoHands, canThrow: !!P.throw, fire: !!P.fire, guard: !!P.guard };
}
export function propsFrame(sim) {
  return (sim.props || []).map((pr) => ({ id: pr.id, kind: pr.kind, name: PROPS[pr.kind].name, x: pr.x, y: pr.y, state: pr.state, angle: pr.angle, z: pr.z, uses: pr.uses, maxUses: PROPS[pr.kind].uses, durability: durFrac(pr), crack: crackOf(pr), holder: pr.holder, fire: !!PROPS[pr.kind].fire }));
}
