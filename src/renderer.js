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
//   player: {state, stateT, weapon, crouch}, enemies: [{id,x,y,angle,hpFrac,state}], pickups: [{id,x,y,kind,taken}],
//   obstacles: [{x,y,w,d,kind}], events: [{type,x,y}], attack: {active,progress,angle}, blood: boolean
//   (5th makeFrame arg `extra` or cam.blood carries the blood setting)
//   effects: {shake: 0..1, flash: 0..1}, reducedMotion: boolean, time: seconds
// }
export const RENDERER_METHODS = ['resize', 'setWorld', 'render'];

export function assertRenderer(r) {
  const missing = RENDERER_METHODS.filter((m) => typeof r?.[m] !== 'function');
  if (missing.length) throw new Error(`Renderer is missing: ${missing.join(', ')}`);
  return r;
}

export function makeFrame(sim, effects, reducedMotion, cam = {}, extra = {}) {
  const c = sim.chariot;
  const p = sim.player;
  const swing = p?.state === 'attack';
  const fx = sim.fx ? sim.fx.splice(0) : []; // one-shot feedback: each event is shown in exactly one frame
  return {
    player: { state: p?.state ?? 'idle', stateT: p?.stateT ?? 0, weapon: p?.weapon ?? 'none', crouch: !!p?.crouching },
    enemies: (sim.enemies || []).map((e) => ({ id: e.id, x: e.x, y: e.y, angle: e.angle, hpFrac: e.maxHp ? e.hp / e.maxHp : 0, state: e.state })),
    pickups: (sim.pickups || []).map((k) => ({ id: k.id, x: k.x, y: k.y, kind: k.kind, taken: k.taken })),
    obstacles: (sim.world.obstacles || []).map((o) => ({ x: o.x, y: o.y, w: o.w, d: o.d, kind: o.kind })),
    events: fx,
    attack: { active: swing, progress: swing ? Math.min(1, p.stateT / 0.45) : 0, angle: swing ? p.attackAngle : 0 },
    blood: (cam.blood ?? extra.blood) !== false,
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
