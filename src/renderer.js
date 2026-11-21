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
//   player: {state, stateT, weapon, crouch, stamina 0..1, draw 0..1, arrows, invulnerable (dodge i-frames), blocking, aimAngle}
//   enemies: [{id,x,y,angle,hpFrac,state, kind, windup 0..1 (progress of the telegraph, 0 outside 'windup')}], pickups: [{id,x,y,kind,taken}],
//   targets: [{id,x,y,flash 0..1}], arrows: [{x,y,angle}] (in flight only),
//   obstacles: [{x,y,w,d,kind: lowwall|beam|grass|ledge|pit}], events: [{type,x,y}], attack: {active,progress,angle,kind: staff|light|heavy|shove,range,hit (fraction of the swing at which the blow lands)}, blood: boolean
//   (5th makeFrame arg `extra` or cam.blood carries the blood setting)
//   effects: {shake: 0..1, flash: 0..1}, reducedMotion: boolean, time: seconds
// }
import { ATTACKS, COMBAT, dodgeInvulnerable } from './combat.js';
export const RENDERER_METHODS = ['resize', 'setWorld', 'render'];

export function assertRenderer(r) {
  const missing = RENDERER_METHODS.filter((m) => typeof r?.[m] !== 'function');
  if (missing.length) throw new Error(`Renderer is missing: ${missing.join(', ')}`);
  return r;
}

export function makeFrame(sim, effects, reducedMotion, cam = {}, extra = {}) {
  const c = sim.chariot;
  const p = sim.player;
  const spec = p && ATTACKS[p.atk];
  const swing = (p?.state === 'attack' || p?.state === 'shove') && !!spec;
  const fx = sim.fx ? sim.fx.splice(0) : []; // one-shot feedback: each event is shown in exactly one frame
  return {
    player: {
      state: p?.state ?? 'idle', stateT: p?.stateT ?? 0, weapon: p?.weapon ?? 'none', crouch: !!p?.crouching,
      stamina: p ? p.stamina / COMBAT.stamina.max : 1, draw: p ? p.draw / COMBAT.bow.drawTime : 0, arrows: p?.arrows ?? 0,
      invulnerable: !!p && dodgeInvulnerable(p), blocking: p?.state === 'block', aimAngle: p?.aimAngle ?? 0,
    },
    enemies: (sim.enemies || []).map((e) => ({ id: e.id, x: e.x, y: e.y, angle: e.angle, hpFrac: e.maxHp ? e.hp / e.maxHp : 0, state: e.state, kind: e.kind, windup: e.state === 'windup' ? Math.min(1, e.stateT / (COMBAT[e.kind]?.windup || 0.5)) : 0 })),
    targets: (sim.targets || []).map((t) => ({ id: t.id, x: t.x, y: t.y, flash: Math.min(1, t.flash / 0.3) })),
    arrows: (sim.arrows || []).filter((a) => a.active).map((a) => ({ x: a.x, y: a.y, angle: a.angle })),
    pickups: (sim.pickups || []).map((k) => ({ id: k.id, x: k.x, y: k.y, kind: k.kind, taken: k.taken })),
    obstacles: (sim.world.obstacles || []).map((o) => ({ x: o.x, y: o.y, w: o.w, d: o.d, kind: o.kind })),
    events: fx,
    attack: { active: swing, progress: swing ? Math.min(1, p.stateT / spec.swing) : 0, angle: swing ? p.attackAngle : 0, kind: swing ? p.atk : 'none', range: swing ? spec.range : 0, hit: swing ? spec.hitAt / spec.swing : 0 },
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
