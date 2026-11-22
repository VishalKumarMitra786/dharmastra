// Renderer interface. The game only talks to a renderer through these methods, so a 3D renderer
// (for example Three.js) can replace renderer2d.js without touching game rules.
//
//   resize(width, height, pixelRatio)  fit the drawing surface (CSS pixels)
//   setWorld(world)                    called once per mission to build static geometry
//   setCharacter(look)                 optional: appearance() from characters.js, used to draw the hero (call as renderer.setCharacter?.(look))
//   render(frame)                      draw one frame from a plain snapshot, never from live sim objects
//
// frame = {
//   chariot: {x, y, angle, radius, invulnerable}, guards: [] (always empty: guards are enemies now)
//   checkpoints: [{x, y, radius, state: 'done'|'next'|'later'}],
//   player: {state: idle|walk|run|crouch|attack|shove|block|aim|dodge|hurt|finisher|vault|climb, stateT, weapon: none|staff|sword|bow, crouch, stamina 0..1, draw 0..1, arrows,
//            invulnerable (i-frames), blocking, parrying (block raised within the parry window), aimAngle, facing (radians), combo (step index of the current chain, -1 none), finisher}
//   enemies: [{id, kind: raider|spearman|swordsman|shield|archer|captain|sparrer, weapon: club|spear|sword|shield|bow|blade|stick, x, y, angle, facing (= angle), hpFrac,
//              state: patrol|alert|chase|circle|windup|active|recover|stagger|retreat|phase|down  (windup/active/recover are the attack phases),
//              phase: 'windup'|'active'|'recover'|null, phaseT: 0..1 progress inside that phase, windup: 0..1 (legacy: progress of the wind-up),
//              attack: null | {id, idx, of (chain length), reach, halfArc, unblockable, ranged, windup, active, recover},
//              target: null | {id:'player', x, y, angle}  who it is going for, aim: null | {x0,y0,x1,y1,locked} (archer aim line), guard (shield raised), open (can be finished),
//              role: attacker|flanker|waiting|chaser|archer|none, calling (shouting for allies), flinch, phaseNo (captain phase 1..3), invulnerable, awareness 0..1, sight: {range, half}}],
//   pickups: [{id,x,y,kind,taken}], targets: [{id,x,y,flash 0..1}],
//   arrows: [{x,y,angle}] (the player's, in flight), projectiles: [{x,y,angle,from: 'player'|'enemy',kind:'arrow'}] (every arrow in flight),
//   obstacles: [{x,y,w,d,kind: lowwall|beam|grass|ledge|pit}], events: [{type,x,y,...}] (one-shot, drained by this call),
//   attack: {active, progress, angle, kind: light|heavy|shove|none, via: fists|staff|sword|shove, id, step, range, halfArc, hit (fraction of the swing at which the blow lands)}, blood: boolean,
//   director: {attackers, max}, waves: [{id, wave, total}], timeScale (1, or less during slow motion), hitstop (true while the world is held for a hit),
//   effects: {shake: 0..1, flash: 0..1}, reducedMotion: boolean, time: seconds
// }
// Contract for the renderer: see docs/review/combat-hooks.md.
import { COMBAT, ENEMY, COMBOS, dodgeInvulnerable, attackClear, MAX_ATTACKERS } from './combat.js';
export const RENDERER_METHODS = ['resize', 'setWorld', 'render'];

export function assertRenderer(r) {
  const missing = RENDERER_METHODS.filter((m) => typeof r?.[m] !== 'function');
  if (missing.length) throw new Error(`Renderer is missing: ${missing.join(', ')}`);
  return r;
}

const PHASE_DUR = (a, ph) => (ph === 'windup' ? a.windup : ph === 'active' ? a.def.active : a.def.recover);

function aimLine(sim, e, a) {
  const R = a.def.reach; const x1 = e.x + Math.cos(a.angle) * R; const y1 = e.y + Math.sin(a.angle) * R;
  if (attackClear(sim.world, e.x, e.y, x1, y1)) return { x0: e.x, y0: e.y, x1, y1, locked: !!a.locked };
  let lo = 0; let hi = R; // the line stops at the first wall
  for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (attackClear(sim.world, e.x, e.y, e.x + Math.cos(a.angle) * m, e.y + Math.sin(a.angle) * m)) lo = m; else hi = m; }
  return { x0: e.x, y0: e.y, x1: e.x + Math.cos(a.angle) * lo, y1: e.y + Math.sin(a.angle) * lo, locked: !!a.locked };
}

function enemyFrame(sim, e) {
  const R = ENEMY[e.kind] || ENEMY.raider; const a = e.atk; const c = sim.chariot;
  const phase = a ? a.phase : null;
  const bearing = Math.atan2(c.y - e.y, c.x - e.x);
  const sight = e.kind === 'sparrer' ? R.sight : R.sight;
  return {
    id: e.id, kind: e.kind, weapon: R.weapon, x: e.x, y: e.y, angle: e.angle, facing: e.angle, hpFrac: e.maxHp ? e.hp / e.maxHp : 0,
    state: phase || (e.state === 'attack' ? 'chase' : e.state), phase, phaseT: a ? Math.min(1, a.t / PHASE_DUR(a, phase)) : 0,
    windup: phase === 'windup' ? Math.min(1, a.t / a.windup) : 0,
    attack: a ? { id: a.name, idx: a.idx, of: a.n, reach: a.def.reach, halfArc: a.def.halfArc, unblockable: !!a.def.unblockable, ranged: !!a.def.ranged, windup: a.windup, active: a.def.active, recover: a.def.recover } : null,
    target: e.aware && e.state !== 'down' && e.state !== 'patrol' ? { id: 'player', x: c.x, y: c.y, angle: bearing } : null,
    aim: a && a.def.ranged && (phase === 'windup' || phase === 'active') ? aimLine(sim, e, a) : null,
    guard: !!R.shield && e.guarding && e.state !== 'down' && e.state !== 'stagger', open: !!e.open && e.state === 'stagger', role: e.role, calling: e.calling > 0, flinch: e.flinch > 0,
    phaseNo: e.phaseNo, invulnerable: e.invul > 0, awareness: e.aware ? 1 : Math.min(1, (e.sightT || 0) / R.react), sight: { range: sight, half: R.sightHalf },
  };
}

export function makeFrame(sim, effects, reducedMotion, cam = {}, extra = {}) {
  const c = sim.chariot;
  const p = sim.player;
  const spec = p?.spec;
  const swing = (p?.state === 'attack' || p?.state === 'shove') && !!spec;
  const fx = sim.fx ? sim.fx.splice(0) : []; // one-shot feedback: each event is shown in exactly one frame
  const live = (sim.enemies || []);
  const heavySpec = p ? (COMBOS[p.weapon] || COMBOS.none).heavy : null;
  return {
    player: {
      state: p?.state ?? 'idle', stateT: p?.stateT ?? 0, weapon: p?.weapon ?? 'none', crouch: !!p?.crouching,
      stamina: p ? p.stamina / COMBAT.stamina.max : 1, draw: p ? p.draw / COMBAT.bow.drawTime : 0, arrows: p?.arrows ?? 0,
      invulnerable: !!p && dodgeInvulnerable(p), blocking: p?.state === 'block', parrying: p?.state === 'block' && p.stateT <= COMBAT.block.parryWindow, aimAngle: p?.aimAngle ?? 0,
      facing: c.moveAngle ?? c.angle, combo: p?.combo ?? -1, finisher: p?.state === 'finisher',
    },
    enemies: live.map((e) => enemyFrame(sim, e)),
    targets: (sim.targets || []).map((t) => ({ id: t.id, x: t.x, y: t.y, flash: Math.min(1, t.flash / 0.3) })),
    arrows: (sim.arrows || []).filter((a) => a.active).map((a) => ({ x: a.x, y: a.y, angle: a.angle })),
    projectiles: [...(sim.arrows || []).filter((a) => a.active).map((a) => ({ x: a.x, y: a.y, angle: a.angle, from: 'player', kind: 'arrow' })), ...(sim.eArrows || []).filter((a) => a.active).map((a) => ({ x: a.x, y: a.y, angle: a.angle, from: 'enemy', kind: 'arrow' }))],
    pickups: (sim.pickups || []).map((k) => ({ id: k.id, x: k.x, y: k.y, kind: k.kind, taken: k.taken })),
    obstacles: (sim.world.obstacles || []).map((o) => ({ x: o.x, y: o.y, w: o.w, d: o.d, kind: o.kind })),
    events: fx,
    attack: { active: swing, progress: swing ? Math.min(1, p.stateT / spec.swing) : 0, angle: swing ? p.attackAngle : 0, kind: swing ? (spec.via === 'shove' ? 'shove' : spec === heavySpec ? 'heavy' : 'light') : 'none', via: swing ? spec.via || 'fists' : 'none', id: swing ? spec.id : '', step: swing ? Math.max(0, p.combo) : 0, range: swing ? spec.range : 0, halfArc: swing ? spec.halfArc : 0, hit: swing ? spec.hitAt / spec.swing : 0 },
    blood: (cam.blood ?? extra.blood) !== false,
    director: { attackers: live.filter((e) => e.atk && e.state !== 'down').length, max: MAX_ATTACKERS },
    waves: (sim.objectives?.items || []).filter((o) => o.type === 'waves').map((o) => ({ id: o.id, wave: Math.max(0, o.wave + 1), total: o.goal })),
    timeScale: sim.slow && sim.slow.left > 0 ? sim.slow.scale : 1, hitstop: (sim.hitstop || 0) > 0,
    chariot: { x: c.x, y: c.y, angle: c.angle, radius: c.radius, speed: c.speed, invulnerable: sim.invuln > 0 },
    mode: sim.foot ? 'foot' : 'chariot',
    guards: [],
    checkpoints: sim.world.checkpoints.map((p, i) => ({
      x: p.x, y: p.y, radius: p.radius, state: i < sim.checkpoint ? 'done' : i === sim.checkpoint ? 'next' : 'later',
    })),
    effects: { shake: effects.shake, flash: effects.flash },
    reducedMotion,
    camYaw: cam.yaw, camPitch: cam.pitch, // third-person camera angles; the 2D renderer ignores them
    time: sim.elapsed,
  };
}
