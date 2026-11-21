// Simulation: pure game rules, no DOM. step() advances one fixed tick and returns the events that happened.
import { resolveWalls } from './world.js';

export const TUNING = {
  maxSpeed: 200, maxReverse: 80, accel: 260, brakeForce: 420, coast: 120, drag: 0.25,
  turnRate: 2.8, turnFullAt: 90, radius: 18, guardRadius: 16,
  maxHealth: 100, wallDamage: 8, guardDamage: 20, impactMin: 45, wallCooldown: 0.5, guardInvuln: 1.2,
  walkSpeed: 135, runSpeed: 215, footAccel: 900, footTurn: 14, footRadius: 14, footGuardRadius: 13,
  timerFactor: { off: null, standard: 1, extended: 2 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createSim(world, { timerMode = 'standard', tuning = {} } = {}) {
  const t = { ...TUNING, ...tuning };
  const sim = {
    world, t, status: 'playing', failReason: null, elapsed: 0, timerMode,
    health: t.maxHealth, checkpoint: 0, wallCooldown: 0, invuln: 0,
    foot: world.mode === 'foot',
    chariot: { ...world.start, speed: 0, radius: world.mode === 'foot' ? t.footRadius : t.radius, moveAngle: world.start.angle || 0 },
    guards: world.guards.map((g) => ({ ...g.path[0], radius: world.mode === 'foot' ? t.footGuardRadius : t.guardRadius, angle: 0, speed: g.speed, path: g.path, target: 1 % g.path.length })),
  };
  sim.timeLeft = limitFor(sim);
  return sim;
}

function limitFor(sim, mode = sim.timerMode) {
  const f = sim.t.timerFactor[mode];
  return f == null ? null : sim.world.timeLimit * f;
}

// Change the timer mid-run: keep elapsed time, never leave less than 10s when switching a timer on.
export function setTimerMode(sim, mode) {
  sim.timerMode = mode;
  const limit = limitFor(sim);
  sim.timeLeft = limit == null ? null : Math.max(10, limit - sim.elapsed);
}

export function step(sim, dt, controls) {
  if (sim.status !== 'playing') return [];
  const events = [];
  sim.elapsed += dt;
  sim.wallCooldown = Math.max(0, sim.wallCooldown - dt);
  sim.invuln = Math.max(0, sim.invuln - dt);
  if (sim.foot) walk(sim, dt, controls); else driveChariot(sim, dt, controls);
  moveGuards(sim, dt);
  wallHits(sim, events);
  guardHits(sim, events);
  checkpoints(sim, events);
  if (sim.status === 'playing' && sim.health <= 0) finish(sim, events, 'failed', 'wrecked');
  if (sim.status === 'playing' && sim.timeLeft != null) {
    sim.timeLeft = Math.max(0, sim.timeLeft - dt);
    if (sim.timeLeft === 0) finish(sim, events, 'failed', 'time');
  }
  return events;
}

function finish(sim, events, status, reason) {
  sim.status = status;
  sim.failReason = status === 'failed' ? reason : null;
  events.push({ type: status === 'won' ? 'win' : 'fail', reason });
}

function driveChariot(sim, dt, { steer = 0, throttle = 0 }) {
  const { t, chariot: c } = sim;
  const thr = clamp(throttle, -1, 1);
  if (thr > 0) c.speed += (c.speed < 0 ? t.brakeForce : t.accel) * thr * dt;
  else if (thr < 0) c.speed += (c.speed > 0 ? -t.brakeForce : -t.accel) * -thr * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), t.coast * dt);
  c.speed = clamp(c.speed * (1 - t.drag * dt), -t.maxReverse, t.maxSpeed);
  c.angle += clamp(steer, -1, 1) * t.turnRate * clamp(c.speed / t.turnFullAt, -1, 1) * dt;
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
}

// On foot: direct control. (mx, my) is the wanted direction on the map (x east, y south), length 0..1 for analog sticks.
function walk(sim, dt, { mx = 0, my = 0, run = false }) {
  const { t, chariot: c } = sim;
  let len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; len = 1; }
  const wanted = len > 0.08 ? (run ? t.runSpeed : t.walkSpeed) * len : 0;
  if (len > 0.08) c.moveAngle = Math.atan2(my, mx);
  const dv = wanted - c.speed;
  c.speed += Math.sign(dv) * Math.min(Math.abs(dv), t.footAccel * dt);
  c.angle += clamp(angleDiff(c.angle, c.moveAngle), -t.footTurn * dt, t.footTurn * dt);
  c.x += Math.cos(c.moveAngle) * c.speed * dt;
  c.y += Math.sin(c.moveAngle) * c.speed * dt;
}

function angleDiff(from, to) {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
}

function moveGuards(sim, dt) {
  for (const g of sim.guards) {
    const to = g.path[g.target];
    const dx = to.x - g.x; const dy = to.y - g.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = g.speed * dt;
    if (dist <= stepLen) { g.x = to.x; g.y = to.y; g.target = (g.target + 1) % g.path.length; continue; }
    g.x += (dx / dist) * stepLen; g.y += (dy / dist) * stepLen;
    g.angle = Math.atan2(dy, dx);
  }
}

function wallHits(sim, events) {
  const c = sim.chariot;
  if (sim.foot) { resolveWalls(sim.world, c); return; } // walking into a wall just stops you, no damage
  const vx = Math.cos(c.angle) * c.speed; const vy = Math.sin(c.angle) * c.speed;
  const normals = resolveWalls(sim.world, c);
  const impact = Math.max(0, ...normals.map((n) => -(vx * n.nx + vy * n.ny)));
  if (impact < sim.t.impactMin) return;
  c.speed *= 0.4;
  if (sim.wallCooldown > 0) return;
  sim.wallCooldown = sim.t.wallCooldown;
  sim.health = Math.max(0, sim.health - sim.t.wallDamage);
  events.push({ type: 'wall', damage: sim.t.wallDamage, health: sim.health });
}

function guardHits(sim, events) {
  const c = sim.chariot;
  for (const g of sim.guards) {
    const dx = c.x - g.x; const dy = c.y - g.y;
    const min = c.radius + g.radius;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 0 ? dx / d : 1; const ny = d > 0 ? dy / d : 0;
    c.x = g.x + nx * min; c.y = g.y + ny * min; // separate so we do not hit every tick
    if (sim.invuln > 0) continue;
    c.speed = sim.foot ? 0 : c.speed * -0.3;
    sim.invuln = sim.t.guardInvuln;
    sim.health = Math.max(0, sim.health - sim.t.guardDamage);
    events.push({ type: 'guard', damage: sim.t.guardDamage, health: sim.health });
  }
  resolveWalls(sim.world, c);
}

function checkpoints(sim, events) {
  const next = sim.world.checkpoints[sim.checkpoint];
  if (!next || sim.health <= 0) return;
  if (Math.hypot(sim.chariot.x - next.x, sim.chariot.y - next.y) > next.radius) return;
  sim.checkpoint += 1;
  events.push({ type: 'checkpoint', n: sim.checkpoint });
  if (sim.checkpoint === sim.world.checkpoints.length) finish(sim, events, 'won');
}
