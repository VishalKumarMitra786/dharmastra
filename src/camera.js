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
  distance: 195, height: 92, shoulder: 30, lookHeight: 50, lookAhead: 260, minDistance: 36,
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
  const hx = Math.cos(o.pitch); // horizontal share of the boom
  let free = cfg.distance;
  if (blocked) {
    for (let d = cfg.minDistance; d <= cfg.distance; d += 8) {
      const px = c.x - fx * d * hx + rx * cfg.shoulder; const pz = c.y - fz * d * hx + rz * cfg.shoulder;
      if (blocked(px, pz)) { free = Math.max(cfg.minDistance, d - 12); break; }
    }
  }
  if (free < o.dist || reducedMotion || dt > 0.25) o.dist = free; else o.dist += (free - o.dist) * (1 - Math.exp(-3 * dt));
  // When a wall shortens the boom the camera rises instead of crowding the hero, like a GTA camera in a tight alley.
  const lift = cfg.height + Math.sin(o.pitch) * o.dist + (cfg.distance - o.dist) * 0.9;
  return {
    position: { x: c.x - fx * o.dist * hx + rx * cfg.shoulder, y: lift, z: c.y - fz * o.dist * hx + rz * cfg.shoulder },
    target: { x: c.x + fx * cfg.lookAhead + rx * cfg.shoulder, y: cfg.lookHeight, z: c.y + fz * cfg.lookAhead + rz * cfg.shoulder },
  };
}
