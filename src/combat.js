// Staff combat and the raider enemy AI. Pure and deterministic: randomness only through sim.rng.
import { resolveWalls } from './world.js';
import { inGrass, circleHitsRect } from './abilities.js';

export const COMBAT = {
  staff: { swing: 0.45, hitAt: 0.18, range: 60, halfArc: Math.PI / 3, damage: 1, stagger: 1.2, cooldown: 0.6 },
  raider: {
    hp: 3, radius: 13, sight: 160, sightHalf: 1.0, hearing: 60, hearingCrouch: 30,
    patrolSpeed: 55, searchSpeed: 90, chaseSpeed: 150, fleeSpeed: 120,
    react: 0.35, windup: 0.5, reach: 34, strikeReach: 46, damage: 10, recover: 1.0, loseAfter: 3, searchFor: 3, downFlee: 1.0,
  },
  hurtTime: 0.25, hurtInvuln: 0.8,
};

const angleDiff = (from, to) => {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
};

export function createEnemies(world, rng) {
  return world.spawns.filter((s) => s.kind === 'raider').map((s) => ({
    id: s.id, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.hp, radius: COMBAT.raider.radius,
    angle: s.angle, homeAngle: s.angle, homeX: s.x, homeY: s.y, patrol: s.patrol, target: 0,
    phase: rng() * Math.PI * 2, state: 'patrol', stateT: 0, aware: false, sightT: 0, lostT: 0, cd: 0,
    lastX: s.x, lastY: s.y, spin: 1,
  }));
}

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

// Effective sight range against the player: crouching halves it, crouching in tall grass halves it again.
export function sightRange(sim) {
  const p = sim.player; const c = sim.chariot;
  let r = COMBAT.raider.sight;
  if (p.crouching) { r *= 0.5; if (inGrass(sim.world, c.x, c.y)) r *= 0.5; }
  return r;
}

export const hearingRange = (sim) => (sim.player.crouching ? COMBAT.raider.hearingCrouch : COMBAT.raider.hearing);

function sees(sim, e) {
  const c = sim.chariot;
  const d = Math.hypot(c.x - e.x, c.y - e.y);
  if (d > sightRange(sim)) return false;
  if (Math.abs(angleDiff(e.angle, Math.atan2(c.y - e.y, c.x - e.x))) > COMBAT.raider.sightHalf) return false;
  return lineClear(sim.world, e.x, e.y, c.x, c.y);
}

// Starts a swing if allowed. Returns true when it started.
export function startAttack(sim) {
  const p = sim.player;
  if (p.weapon !== 'staff' || !sim.abilities.includes('staff') || p.cooldown > 0) return false;
  if (p.state === 'vault' || p.state === 'attack' || p.state === 'hurt') return false;
  p.state = 'attack'; p.stateT = 0; p.cooldown = COMBAT.staff.cooldown; p.swingHit = false;
  p.attackAngle = sim.chariot.moveAngle;
  return true;
}

// Applies the staff arc once, at the moment of impact in the swing.
export function resolveSwing(sim, events) {
  const p = sim.player; const c = sim.chariot; const s = COMBAT.staff;
  if (p.state !== 'attack' || p.swingHit || p.stateT < s.hitAt) return;
  p.swingHit = true;
  for (const e of sim.enemies) {
    if (e.state === 'down') continue;
    const d = Math.hypot(e.x - c.x, e.y - c.y);
    if (d > s.range + e.radius) continue;
    if (d > 1 && Math.abs(angleDiff(p.attackAngle, Math.atan2(e.y - c.y, e.x - c.x))) > s.halfArc) continue;
    e.hp = Math.max(0, e.hp - s.damage);
    events.push({ type: 'hit-enemy', id: e.id, x: e.x, y: e.y });
    e.state = e.hp === 0 ? 'down' : 'stagger'; e.stateT = 0; e.aware = true; e.cd = 0;
    if (e.hp === 0) events.push({ type: 'enemy-down', id: e.id, x: e.x, y: e.y });
  }
}

function moveEnemy(sim, e, dt, tx, ty, speed) {
  const dx = tx - e.x; const dy = ty - e.y; const d = Math.hypot(dx, dy);
  if (d < 1e-6) return 0;
  const s = Math.min(d, speed * dt);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  e.angle += angleDiff(e.angle, Math.atan2(dy, dx)) * Math.min(1, 12 * dt);
  resolveWalls(sim.world, e);
  for (const o of sim.world.obstacles) if (o.kind !== 'grass') pushOutOf(e, o);
  return d - s;
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
  moveEnemy(sim, e, dt, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, COMBAT.raider.fleeSpeed);
}

function patrol(sim, e, dt) {
  const R = COMBAT.raider;
  if (e.patrol.length) {
    const to = e.patrol[e.target % e.patrol.length];
    if (moveEnemy(sim, e, dt, to.x, to.y, R.patrolSpeed) < 2) e.target = (e.target + 1) % e.patrol.length;
  } else e.angle = e.homeAngle + Math.sin(sim.elapsed * 0.6 + e.phase) * 1.0; // stationary lookout sweeps ~±57 degrees
}

export function stepEnemies(sim, dt, events) {
  const R = COMBAT.raider; const c = sim.chariot; const p = sim.player;
  for (const e of sim.enemies) {
    e.stateT += dt; e.cd = Math.max(0, e.cd - dt);
    const dist = Math.hypot(c.x - e.x, c.y - e.y);
    if (e.state === 'down') { if (e.stateT < R.downFlee) flee(sim, e, dt); continue; }
    if (e.state === 'stagger') {
      flee(sim, e, dt);
      if (e.stateT >= COMBAT.staff.stagger) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.lastX = c.x; e.lastY = c.y; }
      continue;
    }
    if (e.state === 'windup') {
      e.angle = Math.atan2(c.y - e.y, c.x - e.x);
      if (e.stateT >= R.windup) {
        e.state = 'chase'; e.stateT = 0; e.cd = R.recover;
        if (dist <= R.strikeReach && sim.invuln <= 0) hurtPlayer(sim, R.damage, events);
      }
      continue;
    }
    const canSee = sees(sim, e);
    if (canSee && !e.aware) { e.aware = true; events.push({ type: 'seen', id: e.id, x: e.x, y: e.y }); }
    if (canSee) { e.lastX = c.x; e.lastY = c.y; e.lostT = 0; }
    if (e.state === 'patrol') {
      patrol(sim, e, dt);
      if (canSee) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; }
      else if (dist <= hearingRange(sim) && c.speed > 20) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.lastX = c.x; e.lastY = c.y; }
    } else if (e.state === 'alert') {
      if (canSee) {
        e.sightT += dt; e.angle = Math.atan2(c.y - e.y, c.x - e.x);
        if (e.sightT >= R.react) { e.state = 'chase'; e.stateT = 0; }
      } else {
        e.sightT = 0;
        const left = moveEnemy(sim, e, dt, e.lastX, e.lastY, R.searchSpeed);
        if (left < 2) e.angle += e.spin * 1.5 * dt;
        if (e.stateT >= R.searchFor) { e.state = 'patrol'; e.stateT = 0; e.aware = false; e.spin = rngSign(sim); }
      }
    } else if (e.state === 'chase') {
      if (!canSee) {
        e.lostT += dt;
        if (e.lostT >= R.loseAfter) { e.state = 'alert'; e.stateT = 0; e.sightT = 0; e.spin = rngSign(sim); continue; }
      }
      if (dist <= R.reach && e.cd <= 0 && canSee) { e.state = 'windup'; e.stateT = 0; continue; }
      if (dist > R.reach - 6) moveEnemy(sim, e, dt, e.lastX, e.lastY, R.chaseSpeed);
      else e.angle = Math.atan2(c.y - e.y, c.x - e.x);
    }
    // Never overlap the player.
    const min = c.radius + e.radius;
    const d = Math.hypot(c.x - e.x, c.y - e.y);
    if (d < min && d > 0) { e.x = c.x - ((c.x - e.x) / d) * min; e.y = c.y - ((c.y - e.y) / d) * min; }
  }
  void p;
}

const rngSign = (sim) => (sim.rng() < 0.5 ? -1 : 1);

export function hurtPlayer(sim, amount, events) {
  const p = sim.player;
  sim.health = Math.max(0, sim.health - amount);
  sim.invuln = Math.max(sim.invuln, COMBAT.hurtInvuln);
  p.state = 'hurt'; p.stateT = 0; p.swingHit = true;
  events.push({ type: 'hurt', amount, health: sim.health, x: sim.chariot.x, y: sim.chariot.y });
}
