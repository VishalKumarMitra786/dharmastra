// Renderer interface. The game only talks to a renderer through these methods, so a 3D renderer
// (for example Three.js) can replace renderer2d.js without touching game rules.
//
//   resize(width, height, pixelRatio)  fit the drawing surface (CSS pixels)
//   setWorld(world)                    called once per mission to build static geometry
//   setCharacter(look)                 optional: appearance() from characters.js, used to draw the hero (call as renderer.setCharacter?.(look))
//   render(frame)                      draw one frame from a plain snapshot, never from live sim objects
//
// frame = {
//   chariot: {x, y, angle, radius, invulnerable}, guards: [{x, y, angle, radius}],
//   checkpoints: [{x, y, radius, state: 'done'|'next'|'later'}],
//   effects: {shake: 0..1, flash: 0..1}, reducedMotion: boolean, time: seconds
// }
export const RENDERER_METHODS = ['resize', 'setWorld', 'render'];

export function assertRenderer(r) {
  const missing = RENDERER_METHODS.filter((m) => typeof r?.[m] !== 'function');
  if (missing.length) throw new Error(`Renderer is missing: ${missing.join(', ')}`);
  return r;
}

export function makeFrame(sim, effects, reducedMotion, cam = {}) {
  const c = sim.chariot;
  return {
    chariot: { x: c.x, y: c.y, angle: c.angle, radius: c.radius, speed: c.speed, invulnerable: sim.invuln > 0 },
    mode: sim.foot ? 'foot' : 'chariot',
    guards: sim.guards.map(({ x, y, angle, radius }) => ({ x, y, angle, radius })),
    checkpoints: sim.world.checkpoints.map((p, i) => ({
      x: p.x, y: p.y, radius: p.radius, state: i < sim.checkpoint ? 'done' : i === sim.checkpoint ? 'next' : 'later',
    })),
    effects: { shake: effects.shake, flash: effects.flash },
    reducedMotion,
    camYaw: cam.yaw, camPitch: cam.pitch, // third-person camera angles; the 2D renderer ignores them
    time: sim.elapsed,
  };
}
