// Chase-camera maths for the 3D renderer. Pure functions so they can be tested in node.
// World x maps to 3D x, world y maps to 3D z, and angle 0 faces +x (same as the 2D renderer).
export const CAM = { distance: 270, height: 235, ahead: 150, lookHeight: 10, follow: 6 };

export function angleDelta(from, to) {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d < -Math.PI) d += tau;
  return d;
}

export function createCameraState() {
  return { angle: 0, ready: false };
}

// Moves the camera heading toward the chariot heading. With reduced motion there is no lag at all.
export function followCamera(state, chariot, dt, reducedMotion, cfg = CAM) {
  if (reducedMotion || !state.ready || dt > 0.25) {
    state.angle = chariot.angle;
    state.ready = true;
  } else if (dt > 0) {
    state.angle += angleDelta(state.angle, chariot.angle) * (1 - Math.exp(-cfg.follow * dt));
  }
  const dx = Math.cos(state.angle);
  const dz = Math.sin(state.angle);
  return {
    position: { x: chariot.x - dx * cfg.distance, y: cfg.height, z: chariot.y - dz * cfg.distance },
    target: { x: chariot.x + dx * cfg.ahead, y: cfg.lookHeight, z: chariot.y + dz * cfg.ahead },
  };
}

// Decides which renderer to use. Pure so the fallback rules can be tested without a browser.
export function chooseGraphics({ preference, webglAvailable }) {
  if (preference === '2d') return { mode: '2d', note: '' };
  if (!webglAvailable) return { mode: '2d', note: '3D graphics are not available on this device, so the 2D view is on.' };
  return { mode: '3d', note: '' };
}

// City-map camera for walking missions: north is always up the screen, so a direction on the stick or keys is a direction on the map.
export const MAPCAM = { back: 330, height: 900, lookAhead: 0 };
export function mapView(c, cfg = MAPCAM) {
  return {
    position: { x: c.x, y: cfg.height, z: c.y + cfg.back },
    target: { x: c.x, y: 20, z: c.y + cfg.lookAhead },
  };
}

// ---- Third-person (over-the-shoulder) camera for walking missions ----
// yaw is the direction the camera looks, in the same angle convention as the world (0 = +x east, +pi/2 = +y south).
// Tuned close: about 175 units behind and a little above the hero's shoulder, so the hero fills a good share of a phone screen.
export const FORWARD_UP = -Math.PI / 2; // looking north: identical to the old map view, used by the 2D fallback
export const TPCAM = {
  distance: 175, height: 56, shoulder: 16, lookHeight: 42, lookAhead: 130, minDistance: 90,
  pitchMin: -0.15, pitchMax: 0.4, pitch: 0.1, dragYaw: 0.006, dragPitch: 0.004, keyYaw: 2.2, steer: 1.3,
  recentreSecs: 0.35, // the quick eased swing behind the hero (the reset control)
  autoAfter: 1.2, autoRamp: 1, autoRate: 1.8, // auto-centre: seconds of forward running with no look input, seconds to ramp up, then 1/s pull rate
};
export const HERO_HEIGHT = 76; // about the hero's height in world units, used to check that the hero stays in frame
export const CAMERA_RESET_KEYS = ['KeyG', 'Home']; // C is already Crouch, so the camera reset sits on G and Home

export function createOrbit(cfg = TPCAM) {
  return { yaw: FORWARD_UP, pitch: cfg.pitch, dist: cfg.distance, side: undefined, swing: null, fwdT: 0, idleT: 0 };
}

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { t = clampN(t, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); }; // smootherstep: zero speed and zero acceleration at both ends
const wrap = (a) => { const tau = Math.PI * 2; if (a > Math.PI) return a - tau; if (a < -Math.PI) return a + tau; return a; };
export const easeSwing = smooth;

// Swings the camera behind the hero's facing. Quick and eased; reduced motion snaps at once. Any look input cancels it (the player took over).
export function recentre(o, facing, reducedMotion, cfg = TPCAM) {
  if (!Number.isFinite(facing)) return o;
  if (reducedMotion) { o.yaw = wrap(facing); o.pitch = cfg.pitch; o.swing = null; return o; }
  o.swing = { t: 0, yaw0: o.yaw, pitch0: o.pitch };
  return o;
}

// look = {dx, dy} drag pixels since the last frame, key = -1..1 from Q/E or the look buttons, reset = the camera-reset control was pressed.
// move = {mx, my} stick or keys relative to the camera (up is my < 0). Pushing forward and sideways at once turns the camera,
// so one thumb on the stick can still curve around a corner. Reduced motion keeps the camera where the player put it.
// ext = {facing, autoCentre}: the hero's facing angle (for reset and auto-centre) and whether auto-centre is on.
// Auto-centre: after running forward for autoAfter seconds with no look input, the camera drifts behind the hero's facing, ramping in smoothly.
export function updateOrbit(o, dt, look, move, reducedMotion, cfg = TPCAM, ext = null) {
  const { dx = 0, dy = 0, key = 0, reset = false } = look || {};
  const hadLook = dx !== 0 || dy !== 0 || key !== 0;
  const facing = ext?.facing;
  if (hadLook) o.swing = null;
  if (reset && !hadLook) recentre(o, facing, reducedMotion, cfg);
  o.yaw += dx * cfg.dragYaw + key * cfg.keyYaw * dt;
  o.pitch = clampN(o.pitch + dy * cfg.dragPitch, cfg.pitchMin, cfg.pitchMax);
  if (o.swing) {
    o.swing.t += dt; const p = smooth(o.swing.t / cfg.recentreSecs);
    const target = Number.isFinite(facing) ? facing : o.yaw; // follows the hero if it turns mid-swing
    o.yaw = o.swing.yaw0 + angleDelta(o.swing.yaw0, target) * p;
    o.pitch = o.swing.pitch0 + (cfg.pitch - o.swing.pitch0) * p;
    if (o.swing.t >= cfg.recentreSecs) { o.yaw = target; o.pitch = cfg.pitch; o.swing = null; }
  } else {
    const fwd = !!move && -move.my > 0.3;
    if (hadLook || !fwd) { o.fwdT = 0; } else o.fwdT = (o.fwdT || 0) + dt;
    if (!hadLook && !reducedMotion && move && fwd && Math.abs(move.mx) > 0.15) o.yaw += move.mx * cfg.steer * dt;
    else if (ext?.autoCentre && !reducedMotion && fwd && Math.abs(move.mx) <= 0.15 && Number.isFinite(facing) && o.fwdT > cfg.autoAfter) {
      const ramp = smooth((o.fwdT - cfg.autoAfter) / cfg.autoRamp); // 0 at first, 1 a second later: no sudden start
      const d = angleDelta(o.yaw, facing);
      if (Math.abs(d) > 0.01) o.yaw += d * (1 - Math.exp(-cfg.autoRate * ramp * dt));
    }
  }
  o.yaw = wrap(o.yaw);
  return o;
}

// Converts a direction relative to the camera (mx right, my down the screen) into a map direction (x east, y south).
export function relativeMove(mx, my, yaw) {
  const fx = Math.cos(yaw); const fy = Math.sin(yaw); // forward on the map
  const rx = -Math.sin(yaw); const ry = Math.cos(yaw); // right-hand side on the map
  return { mx: fx * -my + rx * mx, my: fy * -my + ry * mx };
}

// Camera position and target behind the shoulder. blocked(x, z) says whether a map point is inside a wall or building.
// The camera is pulled in along its boom until it is clear and eases back out so it does not pop. A wall at the hero's side does not collapse the boom:
// the camera slides to the other shoulder or to the middle first. When the hero's back is to a wall the boom stops at minDistance and the target
// moves in with it, so the hero stays near the middle of the picture instead of the camera climbing high above them.
export function thirdPersonView(c, o, dt, blocked, reducedMotion, cfg = TPCAM) {
  const fx = Math.cos(o.yaw); const fz = Math.sin(o.yaw);
  const rx = -fz; const rz = fx;
  const hx = Math.cos(o.pitch);
  const reach = (s) => { // how far back the camera can go with lateral offset s
    if (!blocked) return cfg.distance;
    for (let d = cfg.minDistance; d <= cfg.distance; d += 8) {
      if (blocked(c.x - fx * d * hx + rx * s, c.y - fz * d * hx + rz * s)) return Math.max(cfg.minDistance, d - 14);
    }
    return cfg.distance;
  };
  const sh = cfg.shoulder; const cand = [sh, sh * 0.45, 0, -sh * 0.45, -sh];
  let side = cand[0]; let free = reach(side);
  if (free < cfg.distance * 0.9) {
    for (let i = 1; i < cand.length; i++) { const r = reach(cand[i]); if (r > free + 1e-6) { free = r; side = cand[i]; if (r >= cfg.distance * 0.9) break; } }
  }
  const snap = reducedMotion || dt > 0.25 || o.side === undefined;
  if (snap) o.side = side; else o.side += (side - o.side) * (1 - Math.exp(-7 * dt));
  if (free < o.dist || snap) o.dist = free; else o.dist += (free - o.dist) * (1 - Math.exp(-3 * dt));
  const k = clampN(o.dist / cfg.distance, 0, 1);
  const sd = o.side * clampN(k, 0.4, 1); // the shoulder offset shrinks with the boom
  const lift = cfg.height + Math.sin(o.pitch) * o.dist + (cfg.distance - o.dist) * 0.3; // a little higher in a tight spot, never far above the hero
  const la = cfg.lookAhead * (0.4 + 0.6 * k);
  return {
    position: { x: c.x - fx * o.dist * hx + rx * sd, y: lift, z: c.y - fz * o.dist * hx + rz * sd },
    target: { x: c.x + fx * la + rx * sd, y: cfg.lookHeight, z: c.y + fz * la + rz * sd },
  };
}

// Where a point on the hero lands on the screen for a view from thirdPersonView. Returns {x, y} in -1..1 (0 is the centre, y up) and the hero's
// height as a share of the screen height. Used by tests so "the hero is clearly visible" is a number. fovDeg is the vertical field of view.
export function heroFraming(view, hero, fovDeg, aspect, h = HERO_HEIGHT, at = h * 0.5) {
  const P = view.position; const T = view.target;
  let fx = T.x - P.x; let fy = T.y - P.y; let fz = T.z - P.z; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz; let rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // right = forward x up, flattened
  const ux = rz * fy; const uy = rx * fz - rz * fx; const uz = -rx * fy; // up = right x forward
  const vx = hero.x - P.x; const vy = at - P.y; const vz = hero.y - P.z;
  const z = vx * fx + vy * fy + vz * fz; if (z <= 0) return { x: 9, y: 9, size: 0 };
  const th = Math.tan((fovDeg * Math.PI) / 360);
  return { x: (vx * rx + vz * rz) / (z * th * aspect), y: (vx * ux + vy * uy + vz * uz) / (z * th), size: h / (2 * z * th) };
}

// ---- Render helpers shared by renderer3d.js and renderer2d.js (pure, no allocation per call) ----
export const MAX_PARTICLES = 24;
// Icon above an enemy's head. Shape carries the meaning (not colour): '!' alert/chase/windup, '?' search, 'shield' stagger. Patrol and down show none.
const ICONS = { alert: 'bang', chase: 'bang', windup: 'bang', search: 'question', stagger: 'shield' };
export function enemyIcon(state) { return ICONS[state] || null; }
// Vault hop height (world units) for stateT seconds into a 0.5 s vault.
export function vaultHop(stateT, reduced) { const u = Math.max(0, Math.min(1, (stateT || 0) / 0.5)); return Math.sin(Math.PI * u) * (reduced ? 8 : 22); }
// Burst table: events become small pooled bursts. blood decides red or neutral for the violent ones; sparks stay neutral for pickup and vault.
const BURSTS = {
  'hit-enemy': { n: 8, violent: true }, 'enemy-down': { n: 10, violent: true }, hurt: { n: 8, violent: true },
  pickup: { n: 6, violent: false }, vault: { n: 4, violent: false },
  'shove-hit': { n: 6, violent: false }, parry: { n: 8, violent: false }, blocked: { n: 6, violent: false }, 'target-hit': { n: 6, violent: false }, 'enemy-fell': { n: 8, violent: false }, climb: { n: 4, violent: false }, dodge: { n: 3, violent: false }, // neutral dust and sparks: never red
};
const CALM = {};
for (const k of Object.keys(BURSTS)) CALM[k] = { n: Math.min(BURSTS[k].n, 5), violent: BURSTS[k].violent };
// Returns a shared frozen-style spec {n, violent, life (s), speed (0..1)} or null. Fade is about 300 ms; reduced motion shortens it to 150 ms and slows it.
const SPEC = {}; const SPEC_CALM = {};
for (const k of Object.keys(BURSTS)) { SPEC[k] = { ...BURSTS[k], life: 0.3, speed: 1 }; SPEC_CALM[k] = { ...CALM[k], life: 0.15, speed: 0.35 }; }
export function burstSpec(type, reduced) { return (reduced ? SPEC_CALM : SPEC)[type] || null; }
// Particle colour: red only when blood is on and the burst is violent; otherwise a neutral spark.
export function burstColor(spec, blood) { return spec.violent && blood === true ? 0xb3201a : 0xfff0b0; }
