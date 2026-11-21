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
