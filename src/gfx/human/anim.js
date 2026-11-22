// Procedural animation clips for the human rig (28 bones), as pure functions so Node tests can check them for popping.
// Rotations are Euler XYZ radians on each bone, in the parent's frame. The rig faces +z, character-left is +x, and every bone rests with no rotation.
// Sign rules (checked against renders): a negative x rotation swings a hanging limb FORWARD (thigh, upper arm); a positive x on the spine,
// neck or head leans FORWARD; a positive x on the shin or the forearm bends the knee or elbow so the foot or hand goes BACK.
// Feet are planted by grounding: after the leg angles are chosen, the pelvis height is set so the lowest foot touches the floor (no sliding up or sinking),
// and the walk cycle advances by distance travelled (see strideMetres), so the step length matches the ground speed.
import { parseClipsGlb, fillRest, sampleClip } from './clips/gltf-anim.js';
import { planClips } from './clips/plan.js';
export const BONES = ['hips_root', 'hips', 'spine', 'chest', 'neck', 'head',
  ...['L', 'R'].flatMap((s) => [`shoulder_${s}`, `upperarm_${s}`, `forearm_${s}`, `hand_${s}`, `thumb_${s}`, `fingers_${s}`, `fingers2_${s}`, `thigh_${s}`, `shin_${s}`, `foot_${s}`, `toe_${s}`])];
export const REST = { upperarm_L: [0.02, 0.1, -0.66], upperarm_R: [0.02, -0.1, 0.66], forearm_L: [0.8, 0, 0], forearm_R: [0.8, 0, 0], shoulder_L: [0, 0, -0.06], shoulder_R: [0, 0, 0.06],
  thumb_L: [0, 0, 0.2], thumb_R: [0, 0, -0.2], fingers_L: [0.25, 0, 0], fingers_R: [0.25, 0, 0], fingers2_L: [0.3, 0, 0], fingers2_R: [0.3, 0, 0] };
export const STRIDE_WALK = 1.4; export const STRIDE_RUN = 2.5; // metres per full cycle (two steps)
export const LEGS = { l1: 0.418, l2: 0.375 }; // thigh and shin length in metres; the loader overwrites these from the GLB
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = (x) => 1 - (1 - clamp01(x)) ** 3;

export function makePose() { const rot = {}; for (const b of BONES) rot[b] = [0, 0, 0]; return { rot, lift: 0, sway: 0, fwd: 0 }; }
export function copyPose(a, b) { for (const n of BONES) { a.rot[n][0] = b.rot[n][0]; a.rot[n][1] = b.rot[n][1]; a.rot[n][2] = b.rot[n][2]; } a.lift = b.lift; a.sway = b.sway; a.fwd = b.fwd; return a; }
// Moves `cur` toward `target` by factor k (0..1) per bone: this is the animation blend between states. A full roll is wrapped first so it does not unwind.
export function blendPose(cur, target, k) {
  for (const n of BONES) { const c = cur.rot[n]; const t = target.rot[n]; for (let i = 0; i < 3; i++) { if (Math.abs(c[i] - t[i]) > Math.PI) c[i] -= Math.round((c[i] - t[i]) / TAU) * TAU; c[i] += (t[i] - c[i]) * k; } }
  cur.lift += (target.lift - cur.lift) * k; cur.sway += (target.sway - cur.sway) * k; cur.fwd += (target.fwd - cur.fwd) * k; return cur;
}

// Where in a swing are we? progress 0..1 through the whole swing, hit = the fraction at which the blow lands.
export function attackPhase(progress, hit) {
  const h = hit > 0 ? hit : 0.4; const p = clamp01(progress); const activeEnd = Math.min(1, h + (1 - h) * 0.3);
  if (p < h) return { phase: 'windup', u: p / h };
  if (p < activeEnd) return { phase: 'active', u: (p - h) / Math.max(1e-3, activeEnd - h) };
  return { phase: 'recover', u: (p - activeEnd) / Math.max(1e-3, 1 - activeEnd) };
}

const set = (o, b, x = 0, y = 0, z = 0) => { const r = o.rot[b]; r[0] = x; r[1] = y; r[2] = z; };
const add = (o, b, x = 0, y = 0, z = 0) => { const r = o.rot[b]; r[0] += x; r[1] += y; r[2] += z; };
const both = (o, name, x, y = 0, z = 0) => { set(o, name + '_L', x, y, z); set(o, name + '_R', x, y, -z); };

function hands(o, rightGrip, leftGrip) { // 0 open .. 1 fist (curl about x)
  for (const [s, g] of [['R', rightGrip], ['L', leftGrip]]) { const r = REST['fingers_' + s]; o.rot['fingers_' + s][0] = r[0] + g * 1.25; o.rot['fingers2_' + s][0] = REST['fingers2_' + s][0] + g * 1.35; o.rot['thumb_' + s][0] = g * 0.55; o.rot['thumb_' + s][2] = REST['thumb_' + s][2] * (1 - g) - (s === 'R' ? 1 : -1) * g * 0.45; }
}

// ctx: { state, t (seconds in state), cycle (walk cycles, any real), speed (0..1: 0 stand, ~0.5 walk, 1 run), time (s), weapon: 'none'|'staff'|'sword'|'bow'|'spear'|'club',
//        crouch (0..1), atk: {kind, progress, hit}, windup (0..1), draw (0..1), carry: 'none'|'pot'|'bundle'|'lamp', stoop (0..0.5), legs: {l1,l2}, seed }
export function poseProcedural(o, c) {
  for (const n of BONES) { const r = REST[n]; const q = o.rot[n]; q[0] = r ? r[0] : 0; q[1] = r ? r[1] : 0; q[2] = r ? r[2] : 0; }
  o.lift = 0; o.sway = 0; o.fwd = 0;
  const st = c.state || 'idle'; const t = c.t || 0; const time = c.time || 0; const stoop = c.stoop || 0; const w = c.weapon || 'none';
  const legs = c.legs || LEGS; const ck = clamp01(c.crouch || (st === 'crouch' ? 1 : 0));
  // ---- locomotion base: idle breathing blended with the walk/run cycle ----
  const sp = clamp01(c.speed || 0); const moving = sp > 0.05; const r = clamp01((sp - 0.45) / 0.45); const th = (c.cycle || 0) * TAU; const s = Math.sin(th); const cs = Math.cos(th);
  const amp = lerp(0.42, 0.82, r) * (ck > 0.3 ? 0.65 : 1); const mv = smooth(sp / 0.3); // fades the cycle in and out with speed
  const b = Math.sin(time * TAU / 3.8); const sh = Math.sin(time * TAU / 6.5); const lk = Math.sin(time * TAU / 9.0);
  const L = { thigh: [0, 0], shin: [0, 0], foot: [0, 0] }; // per side: x angle
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const ss = s * sg; const cc = cs * sg;
    const thigh = lerp(0.015 * sh, -amp * ss + 0.03, mv);
    const knee = lerp(0.03 + 0.03 * sh * sg, 0.07 + lerp(0.8, 1.35, r) * Math.pow(Math.max(0, cc), 1.4) + 0.1 * Math.max(0, -ss) * Math.max(0, -cc), mv);
    const tx = thigh * (1 - ck) - 1.05 * ck; const kx = knee * (1 - ck) + 1.9 * ck + 0.15 * ck * knee;
    set(o, 'thigh_' + side, tx, 0, sg * 0.03 * mv); set(o, 'shin_' + side, kx, 0, 0);
    const ankle = -(tx + kx) * 0.85 + 0.35 * ck; set(o, 'foot_' + side, ankle, 0, 0); set(o, 'toe_' + side, mv * 0.3 * Math.max(0, -ss) * Math.max(0, cc) + 0.4 * ck * 0.5, 0, 0);
    const k = side === 'L' ? 0 : 1; L.thigh[k] = tx; L.shin[k] = kx;
    const aa = lerp(0.015 * b, 0.55 * lerp(0.8, 1.45, r) * ss, mv);
    set(o, 'upperarm_' + side, REST['upperarm_' + side][0] + aa * (1 - ck * 0.5) - 0.25 * r * mv - 0.5 * ck, REST['upperarm_' + side][1], REST['upperarm_' + side][2]);
    set(o, 'forearm_' + side, REST['forearm_' + side][0] - 0.15 * mv - lerp(0, 0.95, r * mv) - 0.3 * Math.max(0, -ss) * mv - 0.35 * ck, 0, 0);
    set(o, 'shoulder_' + side, 0, 0, REST['shoulder_' + side][2] + 0.012 * b * (side === 'L' ? 1 : -1));
  }
  set(o, 'hips_root', 0.03 + 0.1 * r * mv + 0.15 * ck, -0.12 * s * mv + 0.02 * sh * (1 - mv), 0.03 * s * mv - 0.018 * sh * (1 - mv));
  set(o, 'spine', 0.02 + 0.07 * r * mv + 0.25 * ck + stoop * 0.5 + 0.01 * b, 0.2 * s * mv - 0.02 * lk * (1 - mv), -0.02 * s * mv + 0.015 * sh);
  set(o, 'chest', -0.014 * b + 0.02 + stoop * 0.35 + 0.1 * ck, 0.05 * s * mv + 0.03 * lk * (1 - mv), 0);
  set(o, 'neck', 0.01 * b - 0.05 * r * mv + stoop * 0.2 - 0.12 * ck, -0.06 * s * mv + 0.05 * lk * (1 - mv), 0);
  set(o, 'head', 0.02 * Math.sin(time * TAU / 5.1) - 0.03 + stoop * 0.15, -0.05 * s * mv + 0.14 * lk * (1 - mv), 0.015 * sh);
  const grip = w === 'none' ? 0.25 : 0.95; hands(o, grip, c.carry === 'lamp' ? 0.9 : 0.2);
  const bob = 0.012 * Math.cos(2 * th) * mv; o.sway = lerp(0.004 * sh, 0.012 * s, mv);
  // ---- weapon carried (not attacking): right hand on the weapon, sensible forearm ----
  const holdRight = (up) => { add(o, 'upperarm_R', -0.2 - up * 0.15, 0, -0.15); add(o, 'forearm_R', -0.55 - up * 0.2, 0, 0); };
  if (w === 'staff' || w === 'spear') holdRight(0.2); else if (w === 'sword' || w === 'club') { add(o, 'upperarm_R', -0.1, 0, -0.1); add(o, 'forearm_R', -0.45, 0, 0); }
  if (w === 'bow') { add(o, 'upperarm_L', -0.3, 0, 0.1); add(o, 'forearm_L', -0.55, 0, 0); }
  if (c.carry === 'lamp') { add(o, 'upperarm_L', -0.25, 0, 0.1); add(o, 'forearm_L', -0.75, 0, 0); }
  if (c.carry === 'pot' || c.carry === 'bundle') { // one hand steadies the load on the head
    set(o, 'upperarm_R', -2.3, 0.2, -0.55 + 0.0); set(o, 'forearm_R', -1.55, 0, 0); hands(o, 0.3, 0.2); add(o, 'neck', -0.04, 0, 0); set(o, 'spine', 0.0 + 0.01 * b, 0.1 * s * mv, 0);
  }
  // ---- states ----
  let full = null; // whole-body states set their own lift
  switch (st) {
    case 'attack': case 'shove': {
      const A = c.atk || { kind: st === 'shove' ? 'shove' : 'staff', progress: clamp01(t / 0.45), hit: 0.4 }; const ph = attackPhase(A.progress, A.hit); const k = A.kind;
      const arc = (a, bb) => (ph.phase === 'windup' ? lerp(a[0], bb[0], 0) + 0 : 0); void arc;
      // keyframes [raised/back, through, recover] for the right arm: [upperarm x, y, z], forearm x, spine yaw, spine pitch, step
      const KEY = {
        staff: { r0: [-2.35, 0.1, -0.5], f0: -0.9, r1: [-0.75, -0.45, -0.1], f1: -0.25, yaw0: -0.5, yaw1: 0.65, pitch0: -0.1, pitch1: 0.3, step: 0.35 },
        light: { r0: [-1.0, -0.9, -1.0], f0: -0.9, r1: [-1.15, 0.9, 0.35], f1: -0.2, yaw0: -0.7, yaw1: 0.75, pitch0: 0.05, pitch1: 0.2, step: 0.4 },
        heavy: { r0: [-2.75, 0.1, -0.3], f0: -0.7, r1: [-0.55, -0.2, -0.15], f1: -0.15, yaw0: -0.35, yaw1: 0.4, pitch0: -0.22, pitch1: 0.55, step: 0.6 },
      };
      if (k === 'shove') {
        const e = ph.phase === 'windup' ? smooth(ph.u) * 0.5 : ph.phase === 'active' ? 0.5 + 0.5 * smooth(ph.u) : 1 - smooth(ph.u);
        both(o, 'upperarm', -1.35 * e + (1 - e) * 0.0, 0, 0); add(o, 'upperarm_L', 0.64 * (1 - e) * 0 - 0.0, 0, 0); add(o, 'upperarm_L', 0.02, 0, 0.66 * (1 - e)); add(o, 'upperarm_R', 0.02, 0, -0.66 * (1 - e));
        both(o, 'forearm', lerp(0.8, -0.15, e)); o.rot.spine[0] += 0.35 * e; o.rot.hips_root[0] += 0.1 * e; set(o, 'thigh_L', -0.5 * e); set(o, 'thigh_R', 0.35 * e); set(o, 'shin_R', 0.35 * e + L.shin[1] * (1 - e)); hands(o, 0.1, 0.1); o.fwd = 0.15 * e;
        break;
      }
      const K = KEY[k] || KEY.staff; const e = ph.phase === 'windup' ? smooth(ph.u) : ph.phase === 'active' ? 1 : 1;
      let q; // 0 = start guard, 1 = raised, 2 = through
      if (ph.phase === 'windup') q = [lerp(0, 1, smooth(ph.u)), 1]; else if (ph.phase === 'active') q = [lerp(1, 2, smooth(ph.u)), 2]; else q = [lerp(2, 0, smooth(ph.u)), 0];
      const pos = q[0]; const mix = (a, bb, cc2) => (pos <= 1 ? lerp(a, bb, pos) : lerp(bb, cc2, pos - 1));
      const g0 = [REST.upperarm_R[0] - 0.25, REST.upperarm_R[1], REST.upperarm_R[2] - 0.15]; void e;
      const ua = [0, 1, 2].map((i) => mix(g0[i], K.r0[i], K.r1[i])); set(o, 'upperarm_R', ua[0], ua[1], ua[2] + REST.upperarm_R[2] * 0.2);
      set(o, 'forearm_R', mix(REST.forearm_R[0] - 0.5, K.f0, K.f1), 0, 0);
      o.rot.spine[1] = mix(0, K.yaw0, K.yaw1); o.rot.chest[1] = 0.5 * mix(0, K.yaw0, K.yaw1); o.rot.spine[0] += mix(0, K.pitch0, K.pitch1); o.rot.head[1] = -0.5 * mix(0, K.yaw0, K.yaw1);
      const step = mix(0, K.step * 0.3, K.step); set(o, 'thigh_L', -step * 1.1, 0, 0); set(o, 'thigh_R', step * 0.7, 0, 0); set(o, 'shin_R', 0.3 + step * 0.5, 0, 0); set(o, 'shin_L', 0.15, 0, 0); o.rot.foot_L[0] = step * 1.1 - 0.15; o.rot.foot_R[0] = -step * 0.7 - 0.3;
      o.rot.hips_root[1] = -0.35 * mix(0, K.yaw0, K.yaw1) * 0.5; o.fwd = 0.12 * (pos >= 1 ? 1 : 0);
      set(o, 'upperarm_L', REST.upperarm_L[0] - 0.35 * pos, 0, REST.upperarm_L[2] + 0.35 * pos); set(o, 'forearm_L', 0.4, 0, 0);
      hands(o, 0.95, 0.4);
      break;
    }
    case 'block': {
      const e = ease(t / 0.12); set(o, 'upperarm_R', REST.upperarm_R[0] - 1.05 * e, 0.2 * e, REST.upperarm_R[2] - 0.5 * e); set(o, 'forearm_R', REST.forearm_R[0] - 2.0 * e, 0, 0);
      set(o, 'upperarm_L', REST.upperarm_L[0] - 0.9 * e, 0, REST.upperarm_L[2] + 0.2 * e); set(o, 'forearm_L', REST.forearm_L[0] - 1.9 * e, 0, 0);
      o.rot.spine[0] += 0.15 * e; set(o, 'thigh_L', -0.25 * e); set(o, 'thigh_R', 0.25 * e); set(o, 'shin_L', 0.4 * e); set(o, 'shin_R', 0.3 * e); o.rot.hips_root[0] += 0.08 * e; hands(o, 0.95, 0.9);
      break;
    }
    case 'parry': {
      const u = clamp01(t / 0.3); const e = Math.sin(u * Math.PI); set(o, 'upperarm_R', -1.2, -0.3 + 1.2 * u, -0.7 + 0.9 * u); set(o, 'forearm_R', -1.4 + 0.9 * e, 0, 0); o.rot.spine[1] = 0.45 - 0.9 * u; o.rot.spine[0] += 0.1; hands(o, 0.95, 0.3);
      break;
    }
    case 'aim': {
      const d = clamp01(c.draw || 0); // left arm holds the bow out, right hand draws the string back to the cheek
      set(o, 'upperarm_L', -1.45, 0.25, REST.upperarm_L[2] + 0.75); set(o, 'forearm_L', -0.1, 0, 0);
      set(o, 'upperarm_R', lerp(-1.4, -1.15, d), lerp(0.2, -0.35, d), lerp(-0.7, -1.05, d)); set(o, 'forearm_R', lerp(-0.2, -2.4, d), 0, 0);
      o.rot.spine[1] = 0.55; o.rot.chest[1] = 0.25; o.rot.head[1] = -0.7; o.rot.spine[0] += 0.04; hands(o, 0.8, 0.9); set(o, 'thigh_L', -0.2); set(o, 'thigh_R', 0.2); set(o, 'shin_R', 0.2);
      o.rot.neck[1] = -0.1;
      break;
    }
    case 'hurt': case 'stagger': {
      const dur = st === 'hurt' ? 0.25 : 0.7; const u = clamp01(t / dur); const e = st === 'hurt' ? Math.sin(Math.min(1, u * 1.2) * Math.PI) * (1 - u * 0.2) : Math.min(1, t / 0.12) * (1 - smooth((u - 0.7) / 0.3) * 0.7) * 0.9;
      o.rot.spine[0] = st === 'hurt' ? -0.38 * e : 0.55 * e; o.rot.chest[0] += st === 'hurt' ? -0.15 * e : 0.2 * e; o.rot.head[0] = st === 'hurt' ? -0.35 * e : 0.35 * e; o.rot.hips_root[0] += st === 'hurt' ? -0.12 * e : 0.1 * e; o.rot.spine[1] = 0.25 * e;
      add(o, 'upperarm_L', -0.9 * e, 0, 0.55 * e); add(o, 'upperarm_R', -0.7 * e, 0, -0.65 * e); add(o, 'forearm_L', -0.5 * e); add(o, 'forearm_R', -0.4 * e); set(o, 'thigh_L', -0.35 * e); set(o, 'thigh_R', 0.3 * e); set(o, 'shin_R', 0.4 * e); o.fwd = -0.08 * e;
      if (st === 'stagger') { o.rot.hips_root[2] = 0.08 * Math.sin(t * 14) * e; o.rot.spine[2] = -0.1 * Math.sin(t * 11) * e; }
      break;
    }
    case 'dodge': {
      const u = clamp01(t / 0.36); const e = Math.sin(Math.min(1, u * 1.1) * Math.PI) ** 0.6; // tuck then open
      set(o, 'hips_root', ease(u) * 0 + u * TAU * 0.98 * 1.0, 0, 0); o.rot.hips_root[0] = smooth(u) * TAU; // one full forward roll
      set(o, 'thigh_L', -1.9 * e, 0, 0); set(o, 'thigh_R', -1.9 * e, 0, 0); set(o, 'shin_L', 2.2 * e); set(o, 'shin_R', 2.2 * e); set(o, 'foot_L', -0.6 * e); set(o, 'foot_R', -0.6 * e);
      o.rot.spine[0] = 0.9 * e; o.rot.chest[0] = 0.3 * e; o.rot.head[0] = 0.5 * e; both(o, 'upperarm', -1.3 * e + REST.upperarm_L[0] * (1 - e), 0, 0); set(o, 'upperarm_L', -1.3 * e, 0, REST.upperarm_L[2] * (1 - e) + 0.2 * e); set(o, 'upperarm_R', -1.3 * e, 0, REST.upperarm_R[2] * (1 - e) - 0.2 * e); both(o, 'forearm', lerp(0.8, -1.9, e)); hands(o, 0.9, 0.9);
      full = { lift: -0.62 * Math.pow(Math.sin(u * Math.PI), 0.5), skipGround: true };
      break;
    }
    case 'vault': {
      const u = clamp01(t / 0.5); const e = Math.sin(u * Math.PI);
      both(o, 'upperarm', -1.9 * e + REST.upperarm_L[0] * (1 - e), 0, 0); set(o, 'upperarm_L', -1.9 * e, 0, 0.45 * (1 - e) + REST.upperarm_L[2] * (1 - e)); set(o, 'upperarm_R', -1.9 * e, 0, -0.45 * (1 - e) + REST.upperarm_R[2] * (1 - e)); both(o, 'forearm', lerp(0.8, -0.2, e));
      set(o, 'thigh_L', -1.35 * e, 0, 0); set(o, 'shin_L', 1.5 * e); set(o, 'thigh_R', 0.35 * e - 0.8 * e * (u > 0.5 ? 0.3 : 0)); set(o, 'shin_R', 0.9 * e); set(o, 'foot_L', -0.2 * e); set(o, 'foot_R', -0.4 * e);
      o.rot.spine[0] = 0.5 * e; o.rot.chest[0] = 0.15 * e; o.rot.head[0] = -0.3 * e; o.rot.hips_root[0] = 0.15 * e; hands(o, 0.4, 0.4); full = { lift: -0.15 * e, skipGround: true };
      break;
    }
    case 'climb': {
      const ph = (t * 1.9) * TAU; const a = Math.sin(ph); const cr = Math.cos(ph);
      set(o, 'upperarm_L', -2.7 + 0.5 * a, 0, 0.2); set(o, 'upperarm_R', -2.7 - 0.5 * a, 0, -0.2); both(o, 'forearm', -0.3);
      set(o, 'thigh_L', -0.9 - 0.4 * cr, 0, 0.1); set(o, 'shin_L', 1.2 + 0.4 * cr); set(o, 'thigh_R', -0.9 + 0.4 * cr, 0, -0.1); set(o, 'shin_R', 1.2 - 0.4 * cr); set(o, 'foot_L', -0.4); set(o, 'foot_R', -0.4);
      o.rot.spine[0] = 0.18; o.rot.head[0] = -0.4; hands(o, 0.85, 0.85); full = { lift: -0.12, skipGround: true };
      break;
    }
    case 'down': {
      const u = clamp01(t / 0.7); const e = ease(u); const e2 = smooth((u - 0.35) / 0.65);
      o.rot.hips_root[0] = -1.45 * e - 0.1 * Math.sin(u * 3) * (1 - u); o.rot.spine[0] = -0.1 * e; o.rot.head[0] = -0.2 * e2; o.rot.head[1] = 0.35 * e2; both(o, 'upperarm', -0.1 * e + REST.upperarm_L[0], 0, 0);
      set(o, 'upperarm_L', 0.1, 0, REST.upperarm_L[2] + 0.9 * e2 - 0.2); set(o, 'upperarm_R', 0.1, 0, REST.upperarm_R[2] - 0.9 * e2 + 0.2); both(o, 'forearm', 0.5 + 0.3 * e2);
      set(o, 'thigh_L', -0.35 * e2, 0, 0.18 * e2); set(o, 'thigh_R', -0.1 * e2, 0, -0.22 * e2); set(o, 'shin_L', 0.4 * e2); set(o, 'shin_R', 0.2 * e2); hands(o, 0.2, 0.2);
      full = { lift: -(0.9 - 0.2) * e, skipGround: true }; // lies on the back
      break;
    }
    case 'windup': case 'strike': case 'recover': { // enemy attacks. c.windup 0..1 in the wind-up, c.u 0..1 in the active and recover phases, c.weapon = the weapon kind, c.attackName, c.chain (index in a chain)
      const ph = st === 'windup' ? 0 : st === 'strike' ? 1 : 2; const wu = smooth(ph === 0 ? (c.windup ?? clamp01(t / 0.5)) : 1); const u = ph === 0 ? 0 : clamp01(c.u ?? t / 0.3); const E = ph === 1 ? smooth(u) : ph === 2 ? 1 - smooth(u) : 0;
      const kind = c.attackName || ''; const flip = (c.chain || 0) % 2 ? -1 : 1;
      if (ph === 2) { // recover: lowered weapon, a breath, open to a punish
        o.rot.spine[0] += 0.3 * E; o.rot.head[0] += 0.2 * E; o.rot.chest[0] += 0.1 * E; set(o, 'upperarm_R', REST.upperarm_R[0] - 0.5 * E, 0, REST.upperarm_R[2]); set(o, 'forearm_R', REST.forearm_R[0] - 0.2 * E, 0, 0); set(o, 'thigh_L', -0.3 * E); set(o, 'thigh_R', 0.2 * E); hands(o, 0.8, 0.3); break;
      }
      const R0 = REST.upperarm_R; const F0 = REST.forearm_R; const k = ph === 0 ? wu : 1;
      if (kind === 'slam') { // two hands high, lean back, then the weight comes down
        const up = ph === 0 ? wu : 1 - E; both(o, 'upperarm', -2.85 * up + (1 - up) * -0.2, 0, 0); set(o, 'upperarm_L', -2.85 * up - 0.2 * (1 - up), 0, -0.25 * up); set(o, 'upperarm_R', -2.85 * up - 0.2 * (1 - up), 0, 0.25 * up); both(o, 'forearm', -0.5 * up + 0.4 * (1 - up));
        o.rot.spine[0] = -0.3 * up + 0.7 * (1 - up) * (ph === 1 ? 1 : 0); o.rot.head[0] = -0.2 * up; set(o, 'thigh_L', -0.5 * (1 - up) - 0.2 * up); set(o, 'thigh_R', 0.4 * up + 0.4 * (1 - up)); set(o, 'shin_L', 0.5 * (1 - up)); hands(o, 0.95, 0.95); break;
      }
      if (kind === 'thrust') { // spear: hand drawn back by the hip, left hand guiding, then a long straight thrust
        const e = ph === 0 ? 0 : E; set(o, 'upperarm_R', lerp(-0.45 * wu - 0.1, -1.45, e), lerp(0.2, -0.1, e), R0[2] - 0.1 * wu); set(o, 'forearm_R', lerp(F0[0] + 0.7 * wu, -0.1, e), 0, 0);
        set(o, 'upperarm_L', -0.9 - 0.2 * e, 0.2, REST.upperarm_L[2] + 0.4); set(o, 'forearm_L', -0.3, 0, 0);
        o.rot.spine[1] = lerp(0.45 * wu, -0.3, e); o.rot.chest[1] = 0.3 * lerp(wu, -0.5, e); o.rot.spine[0] += lerp(-0.12 * wu, 0.3, e); set(o, 'thigh_L', lerp(0.35 * wu, -0.75, e)); set(o, 'thigh_R', lerp(-0.2 * wu, 0.45, e)); set(o, 'shin_L', lerp(0.4 * wu, 0.1, e)); set(o, 'shin_R', lerp(0.3 * wu, 0.4, e)); o.fwd = 0.2 * e; hands(o, 0.95, 0.7); break;
      }
      if (kind === 'bash') { // shield punch: arm drawn in, then driven forward
        const e = ph === 0 ? 0 : E; set(o, 'upperarm_L', lerp(-0.4 * wu, -1.5, e), 0, REST.upperarm_L[2] + 0.3); set(o, 'forearm_L', lerp(F0[0] + 0.8 * wu, -0.3, e), 0, 0); set(o, 'upperarm_R', R0[0] - 1.6 * wu * (1 - e), 0, R0[2] - 0.3 * wu); set(o, 'forearm_R', F0[0] - 0.8 * wu, 0, 0);
        o.rot.spine[0] += lerp(-0.1 * wu, 0.35, e); o.rot.spine[1] = lerp(-0.3 * wu, 0.25, e); set(o, 'thigh_L', lerp(-0.1, -0.5, e)); set(o, 'thigh_R', lerp(0.3 * wu, 0.3, e)); set(o, 'shin_R', 0.3); hands(o, 0.9, 0.9); break;
      }
      if (kind === 'lunge') { // low coil, then a long dash step with the blade out front
        const e = ph === 0 ? 0 : E; const lo = ph === 0 ? wu : 1 - E * 0.6; set(o, 'upperarm_R', lerp(-0.3 * wu, -1.6, e), lerp(0.1, -0.2, e), R0[2] - 0.2); set(o, 'forearm_R', lerp(F0[0] + 0.5 * wu, -0.15, e), 0, 0); o.rot.spine[0] += lerp(0.3 * wu, 0.5, e); set(o, 'thigh_L', lerp(-0.9 * wu, -1.0, e)); set(o, 'shin_L', lerp(1.1 * wu, 0.4, e)); set(o, 'thigh_R', lerp(0.5 * wu, 0.9, e)); set(o, 'shin_R', lerp(0.7 * wu, 0.2, e)); o.fwd = 0.3 * e; void lo; hands(o, 0.95, 0.5); break;
      }
      if (c.weapon === 'sword' || c.weapon === 'blade' || kind === 'slash' && c.weapon !== 'club') { // sword: a high cut that alternates sides on a chain
        const pos = ph === 0 ? wu : 1 + E; const mix = (a, b2, c2) => (pos <= 1 ? lerp(a, b2, pos) : lerp(b2, c2, pos - 1)); const g0 = [R0[0] - 0.25, R0[1], R0[2] - 0.15]; const r0 = flip > 0 ? [-2.3, 0.1, -0.5] : [-1.1, -0.9, -1.0]; const r1 = flip > 0 ? [-0.75, -0.55, -0.1] : [-1.15, 0.9, 0.35];
        set(o, 'upperarm_R', mix(g0[0], r0[0], r1[0]), mix(g0[1], r0[1], r1[1]), mix(g0[2], r0[2], r1[2]) + R0[2] * 0.2); set(o, 'forearm_R', mix(F0[0] - 0.5, -0.9, -0.25), 0, 0);
        o.rot.spine[1] = mix(0, -0.6 * flip, 0.65 * flip); o.rot.chest[1] = 0.5 * o.rot.spine[1]; o.rot.spine[0] += mix(0, -0.1, 0.3); o.rot.head[1] = -0.4 * o.rot.spine[1]; set(o, 'thigh_L', -mix(0, 0.12, 0.4)); set(o, 'thigh_R', mix(0, 0.1, 0.35)); set(o, 'shin_R', 0.25); o.fwd = 0.1 * (pos > 1 ? 1 : 0);
        set(o, 'upperarm_L', REST.upperarm_L[0] - 0.3 * Math.min(pos, 1), 0, REST.upperarm_L[2] + 0.3 * Math.min(pos, 1)); set(o, 'forearm_L', 0.4, 0, 0); hands(o, 0.95, 0.4); break;
      }
      // club and anything else: raised overhead in the wind-up, brought down in the active phase
      const e = ph === 0 ? 0 : E; set(o, 'upperarm_R', lerp(R0[0] - 2.4 * wu, -0.7, e), lerp(0.1 * wu, -0.1, e), R0[2] - 0.2 * k); set(o, 'forearm_R', lerp(F0[0] - 1.3 * wu, -0.15, e), 0, 0); o.rot.spine[0] += lerp(-0.2 * wu, 0.5, e); o.rot.spine[1] = lerp(-0.35 * wu, 0.5, e); o.rot.head[1] = lerp(0.25 * wu, -0.2, e);
      set(o, 'thigh_L', lerp(-0.3 * wu, -0.5, e)); set(o, 'thigh_R', 0.3 * (1 - e) * wu); set(o, 'shin_R', 0.3 * (1 - e) * wu); hands(o, 0.95, 0.3);
      break;
    }
    case 'call': { // a captain's roar: head back, chest out, a fist raised
      const e = Math.min(1, t / 0.25) * (1 - smooth((t - 0.9) / 0.4)); o.rot.spine[0] = -0.2 * e; o.rot.chest[0] -= 0.15 * e; o.rot.head[0] = -0.45 * e; set(o, 'upperarm_R', REST.upperarm_R[0] - 2.5 * e, 0, REST.upperarm_R[2] - 0.3 * e); set(o, 'forearm_R', REST.forearm_R[0] - 0.6 * e, 0, 0); set(o, 'upperarm_L', REST.upperarm_L[0] - 0.3 * e, 0, REST.upperarm_L[2] + 0.5 * e); set(o, 'thigh_L', -0.2 * e); set(o, 'thigh_R', 0.2 * e); hands(o, 0.95, 0.9);
      break;
    }
    case 'alert': case 'search': {
      o.rot.head[1] += 0.55 * Math.sin(time * 2.2 + (c.seed || 0)); o.rot.neck[1] += 0.2 * Math.sin(time * 2.2 + (c.seed || 0)); o.rot.spine[0] += 0.06; o.rot.spine[1] += 0.18 * Math.sin(time * 2.2 + (c.seed || 0));
      break;
    }
    case 'talk': {
      const g = Math.sin(time * 2.1 + (c.seed || 0)); add(o, 'upperarm_R', -0.5 - 0.3 * g, 0, 0.1); add(o, 'forearm_R', -0.9 - 0.4 * g, 0, 0); o.rot.head[1] += 0.2 * Math.sin(time * 0.9 + (c.seed || 0)); o.rot.head[0] += 0.04 * g;
      break;
    }
    default: break;
  }
  if (c.guard && st !== 'windup' && st !== 'strike' && st !== 'down' && st !== 'stagger') { set(o, 'upperarm_L', REST.upperarm_L[0] - 0.95, 0, REST.upperarm_L[2] + 0.25); set(o, 'forearm_L', REST.forearm_L[0] - 1.6, 0, 0); o.rot.spine[0] += 0.08; hands(o, w === 'none' ? 0.25 : 0.95, 0.9); }
  // ---- grounding: the pelvis drops or rises so the lowest foot rests on the floor; whole-body clips set their own lift ----
  if (full) { o.lift = full.lift; } else {
    let ext = 0; for (let k = 0; k < 2; k++) { const a = o.rot[k ? 'thigh_R' : 'thigh_L'][0]; const kn = o.rot[k ? 'shin_R' : 'shin_L'][0]; ext = Math.max(ext, legs.l1 * Math.cos(a) + legs.l2 * Math.cos(a + kn)); }
    o.lift = ext - (legs.l1 + legs.l2) + bob;
  }
  return o;
}

// ======================================================================================================================================
// Authored clips (Blender, see tools/blender/anim) layered over the procedural pose above. If a clip file has not loaded, or a state has no clip, the
// procedural pose is what plays: nothing here can leave a person without a pose.
export const CLIPS = new Map(); export const clipInfo = { groups: [], failed: [], loading: null };
export function installClips(buf) { const m = parseClipsGlb(buf, BONES); fillRest(m, BONES, REST); for (const [k, v] of m) CLIPS.set(k, v); return m.size; }
export function clearClips() { CLIPS.clear(); clipInfo.groups.length = 0; clipInfo.failed.length = 0; }
// Loads the clip sets in priority order (locomotion first, so the game is moving before the combat clips arrive). Safe to call twice.
export function loadClips(base, groups = ['loco', 'combat', 'react', 'interact'], fetchFn = (typeof fetch === 'function' ? fetch : null)) {
  if (clipInfo.loading) return clipInfo.loading; if (!fetchFn) return Promise.resolve(0);
  const root = base || new URL('../../../assets/characters/anim/', import.meta.url).href;
  clipInfo.loading = (async () => { let n = 0; for (const g of groups) { try { const r = await fetchFn(root + g + '.glb'); if (!r.ok) throw new Error(String(r.status)); n += installClips(await r.arrayBuffer()); clipInfo.groups.push(g); } catch (e) { clipInfo.failed.push(g); } } return n; })();
  return clipInfo.loading;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') loadClips().catch(() => {});

const scratch = () => makePose();
// Look-at with limits: the neck takes 40 percent and the head 60 percent of a turn; total yaw 80 degrees, pitch 35 down to 30 up. Eased by the caller's blend.
export const LOOK_LIMIT = { yaw: 1.4, pitchUp: 0.52, pitchDown: 0.6, neckShare: 0.4 };
export function applyLook(o, yaw, pitch, amount = 1) {
  const L = LOOK_LIMIT; const y = Math.max(-L.yaw, Math.min(L.yaw, yaw)) * amount; const p = Math.max(-L.pitchDown, Math.min(L.pitchUp, pitch)) * amount;
  o.rot.neck[1] += y * L.neckShare; o.rot.head[1] += y * (1 - L.neckShare); o.rot.neck[0] += -p * L.neckShare; o.rot.head[0] += -p * (1 - L.neckShare); return { yaw: y, pitch: p };
}
// Blink timing: a closure 0..1 over time, 0.16 s long, every 2.5 to 5.5 s, one in five a double blink. Deterministic from a seed so crowds do not blink together.
export function blinkAt(time, seed = 0) {
  const per = 3.2 + ((seed * 7.31) % 1) * 2.6; const ph = ((time + seed * 1.7) % per); const one = (x) => (x < 0 || x > 0.16 ? 0 : Math.sin((x / 0.16) * Math.PI));
  const dbl = Math.floor((time + seed * 1.7) / per + seed) % 5 === 0 ? one(ph - 0.3) : 0; return Math.max(one(ph), dbl);
}
// One step of a damped spring chain joint (hair, cloth tails): j = {a, v}; target angle, stiffness k, damping d, hard limits. Stable for dt up to 0.05.
export function springStep(j, target, dt, k = 90, d = 9, lo = -0.7, hi = 1.1) {
  const h = Math.min(dt, 0.05); j.v += ((target - j.a) * k - j.v * d) * h; j.a += j.v * h; if (j.a < lo) { j.a = lo; j.v = 0; } else if (j.a > hi) { j.a = hi; j.v = 0; } return j.a;
}
// Time warp for hit-stop and slow motion: returns the dt a clip should advance by. During a hit-stop (seconds left) the clip is frozen; scale slows it.
export function warpDt(dt, { hitstop = 0, timeScale = 1 } = {}) { return hitstop > 0 ? 0 : dt * timeScale; }

const ARM_BONE = /^(shoulder|upperarm|forearm|hand|thumb|fingers|fingers2)_/;
export function pose(o, c) {
  poseProcedural(o, c);
  o.clip = null; if (!CLIPS.size) return o;
  const plan = planClips(o, c, (n) => CLIPS.has(n), CLIPS); if (!plan) return o;
  const T = o.tmp || (o.tmp = scratch()); const reduced = !!c.reduced && !c.moving;
  const first = CLIPS.get(plan.layers[0].name);
  for (let i = 0; i < plan.layers.length; i++) { const l = plan.layers[i]; const cl = CLIPS.get(l.name); const tt = reduced && plan.loco ? 0 : l.t; sampleClip(cl, tt, T, BONES, i === 0 ? 1 : l.w); }
  void first;
  // carried things keep the procedural arms (the hand grip is tuned for the prop in the hand); the clip drives everything else
  const keepArms = plan.carryArms && ((c.weapon && c.weapon !== 'none') || (c.carry && c.carry !== 'none') || c.guard);
  for (const n of BONES) { if (keepArms && ARM_BONE.test(n)) continue; const a = o.rot[n]; const b = T.rot[n]; a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; }
  o.lift = T.lift; o.sway = T.sway; o.fwd = T.fwd; o.clip = plan.layers.map((l) => l.name).join('+'); o.snap = plan.snap || 0;
  // additive layers: look-at with limits, turn lead, and impact tremor during a hit-stop (none under reduced motion)
  if (c.look) applyLook(o, c.look.yaw || 0, c.look.pitch || 0, c.look.amount ?? 1);
  if (c.turnRate && !c.reduced) { const lead = Math.max(-1, Math.min(1, c.turnRate * 0.12)); o.rot.head[1] += lead * 0.5; o.rot.neck[1] += lead * 0.2; o.rot.chest[1] += lead * 0.12; }
  if (c.hitstop > 0 && !c.reduced) { const sh = Math.sin((c.time || 0) * 160) * 0.012 * Math.min(1, c.hitstop / 0.05); o.rot.chest[2] += sh; o.rot.head[0] += sh * 0.6; o.rot.upperarm_R[0] += sh; }
  if (o.mem) o.blink = blinkAt(c.time || 0, c.seed || 0);
  return o;
}
