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
export const FORWARD_UP = -Math.PI / 2; // looking north: identical to the old map view, used by the 2D fallback
export const TPCAM = {
  distance: 250, height: 105, shoulder: 34, lookHeight: -15, lookAhead: 300, minDistance: 36,
  pitchMin: -0.12, pitchMax: 0.7, pitch: 0.14, dragYaw: 0.006, dragPitch: 0.004, keyYaw: 2.2, steer: 1.3,
};

export function createOrbit(cfg = TPCAM) {
  return { yaw: FORWARD_UP, pitch: cfg.pitch, dist: cfg.distance };
}

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// look = {dx, dy} drag pixels since the last frame, key = -1..1 from Q/E or the look buttons.
// move = {mx, my} stick or keys relative to the camera (up is my < 0). Pushing forward and sideways at once turns the camera,
// so one thumb on the stick can still curve around a corner. Reduced motion keeps the camera where the player put it.
export function updateOrbit(o, dt, look, move, reducedMotion, cfg = TPCAM) {
  const { dx = 0, dy = 0, key = 0 } = look || {};
  o.yaw += dx * cfg.dragYaw + key * cfg.keyYaw * dt;
  o.pitch = clampN(o.pitch + dy * cfg.dragPitch, cfg.pitchMin, cfg.pitchMax);
  const hadLook = dx !== 0 || dy !== 0 || key !== 0;
  if (!hadLook && !reducedMotion && move && -move.my > 0.3 && Math.abs(move.mx) > 0.15) o.yaw += move.mx * cfg.steer * dt;
  const tau = Math.PI * 2;
  if (o.yaw > Math.PI) o.yaw -= tau; else if (o.yaw < -Math.PI) o.yaw += tau;
  return o;
}

// Converts a direction relative to the camera (mx right, my down the screen) into a map direction (x east, y south).
export function relativeMove(mx, my, yaw) {
  const fx = Math.cos(yaw); const fy = Math.sin(yaw); // forward on the map
  const rx = -Math.sin(yaw); const ry = Math.cos(yaw); // right-hand side on the map
  return { mx: fx * -my + rx * mx, my: fy * -my + ry * mx };
}

// Camera position and target behind the shoulder. blocked(x, z) says whether a map point is inside a wall or building;
// the camera is pulled in along its boom until it is clear, and eases back out so it does not pop.
export function thirdPersonView(c, o, dt, blocked, reducedMotion, cfg = TPCAM) {
  const fx = Math.cos(o.yaw); const fz = Math.sin(o.yaw);
  const rx = -fz; const rz = fx;
  const hx = Math.cos(o.pitch);
  const side = () => cfg.shoulder * Math.max(0.3, Math.min(1, o.dist / cfg.distance)); // the shoulder offset shrinks with the boom, so the hero stays in frame // horizontal share of the boom
  let free = cfg.distance;
  if (blocked) {
    for (let d = cfg.minDistance; d <= cfg.distance; d += 8) {
      const px = c.x - fx * d * hx + rx * cfg.shoulder; const pz = c.y - fz * d * hx + rz * cfg.shoulder; // probe with the full offset: it is the widest
      if (blocked(px, pz)) { free = Math.max(cfg.minDistance, d - 12); break; }
    }
  }
  if (free < o.dist || reducedMotion || dt > 0.25) o.dist = free; else o.dist += (free - o.dist) * (1 - Math.exp(-3 * dt));
  // When a wall shortens the boom the camera rises instead of crowding the hero, like a GTA camera in a tight alley.
  const lift = cfg.height + Math.sin(o.pitch) * o.dist + (cfg.distance - o.dist) * 0.55;
  return {
    position: { x: c.x - fx * o.dist * hx + rx * side(), y: lift, z: c.y - fz * o.dist * hx + rz * side() },
    target: { x: c.x + fx * cfg.lookAhead + rx * side(), y: cfg.lookHeight, z: c.y + fz * cfg.lookAhead + rz * side() },
  };
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
