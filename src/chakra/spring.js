// Springs for the chakra's motion. Pure maths, no DOM, so Node tests can check that position and velocity stay continuous.
// Each spring is {x, v, t}: position, velocity and target. step() uses the exact closed-form solution of a damped spring, so any frame time is stable
// (a long frame never explodes) and a new target never moves the position or the velocity: the motion simply bends towards the new goal.
export const spring = (x = 0, t = x) => ({ x, v: 0, t });

// zeta = 1: critically damped (fastest approach with no overshoot). zeta < 1: a soft settle with a small overshoot (1 - zeta^2 shapes how much).
export function step(s, dt, omega, zeta = 1) {
  if (!(dt > 0)) return s;
  const d = s.x - s.t; const e = Math.exp(-zeta * omega * dt);
  if (zeta >= 1) {
    const b = s.v + omega * d;
    s.x = s.t + (d + b * dt) * e; s.v = (s.v - omega * b * dt) * e;
  } else {
    const wd = omega * Math.sqrt(1 - zeta * zeta); const c = Math.cos(wd * dt), n = Math.sin(wd * dt); const a = zeta * omega;
    const B = (s.v + a * d) / wd;
    s.x = s.t + e * (d * c + B * n); s.v = e * (c * (B * wd - a * d) - n * (a * B + d * wd));
  }
  return s;
}
// Has the spring come to rest? Then the caller snaps it to its target so it stops exactly there.
export const settled = (s, ex = 0.0006, ev = 0.006) => Math.abs(s.x - s.t) < ex && Math.abs(s.v) < ev;
export const snap = (s) => { s.x = s.t; s.v = 0; return s; };
export const retarget = (s, t) => { s.t = t; return s; }; // position and velocity are untouched: that is the whole point

// Ease for things that are driven by a clock rather than a spring (the glow's trip round the ring): zero speed at both ends.
export const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (6 * t - 15) + 10); };
// Ease-out with a small overshoot, for the event nodes as they bloom outward.
export const bloomEase = (t) => { t = Math.max(0, Math.min(1, t)); const c = 1.4; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

// Per-ring tuning: outer rings are heavier (slower, more inertia), the inner ones quicker. Rotation settles softly (zeta < 1).
export const TUNE = {
  rot: [{ w: 4.6, z: 0.8 }, { w: 5.2, z: 0.8 }, { w: 5.8, z: 0.8 }, { w: 4.2, z: 0.85 }],
  thick: { w: 6.4, z: 1 }, alpha: { w: 7, z: 1 }, glow: { w: 5, z: 1 }, depth: { w: 6, z: 0.5 }, dim: { w: 6, z: 1 }, bloom: { w: 3.2, z: 1 }, pos: { w: 11, z: 1 },
};

// ---- dust of light: a small fixed pool, no allocation per frame ----
export function createParticles(n = 28) {
  return { n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), life: new Float32Array(n), max: new Float32Array(n), size: new Float32Array(n), seed: 1234567 };
}
const rnd = (p) => { p.seed = (Math.imul(p.seed, 1664525) + 1013904223) >>> 0; return p.seed / 4294967296; };
export function emit(p, x, y, dirx, diry, life = 1.1) {
  for (let i = 0; i < p.n; i++) {
    if (p.life[i] > 0) continue;
    const a = rnd(p) * Math.PI * 2; const sp = 6 + rnd(p) * 16;
    p.x[i] = x + (rnd(p) - 0.5) * 6; p.y[i] = y + (rnd(p) - 0.5) * 6; p.vx[i] = dirx * 10 + Math.cos(a) * sp; p.vy[i] = diry * 10 + Math.sin(a) * sp;
    p.max[i] = p.life[i] = life * (0.6 + rnd(p) * 0.6); p.size[i] = 0.8 + rnd(p) * 1.6; return true;
  }
  return false;
}
export function stepParticles(p, dt) {
  let live = 0; const drag = Math.exp(-1.6 * dt);
  for (let i = 0; i < p.n; i++) {
    if (p.life[i] <= 0) continue;
    p.life[i] -= dt; if (p.life[i] <= 0) { p.life[i] = 0; continue; }
    p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt - 5 * dt; p.vx[i] *= drag; p.vy[i] *= drag; live++;
  }
  return live;
}
export const clearParticles = (p) => { p.life.fill(0); };
