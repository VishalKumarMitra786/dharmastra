// Procedural walk and idle for the hero rig, as a pure function (no three.js), so a test can check it for popping.
// Rotations are Euler XYZ radians on the bones, in the parent's frame. The rig faces +z, character-left is +x, rest pose has no bone rotation.
export const BONES = ['hips_root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L', 'toe_L',
  'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R', 'toe_R'];
export const STRIDE_M = 1.5; // metres covered by one full cycle (two steps)
// The base mesh stands in an A-pose with the arms out and forward; this relaxed pose brings them down to the sides.
export const REST = { upperarm_L: [0.02, 0.1, -0.66], upperarm_R: [0.02, -0.1, 0.66], forearm_L: [0.8, 0, 0], forearm_R: [0.8, 0, 0], shoulder_L: [0, 0, -0.06], shoulder_R: [0, 0, 0.06] };
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

export function makePose() { const rot = {}; for (const b of BONES) rot[b] = [0, 0, 0]; return { rot, lift: 0, sway: 0 }; }

// cycle: walk cycles completed (any real number; 1 = one full stride). t: seconds, drives the idle. walk: 0 idle .. 1 walking.
export function pose(out, cycle, t, walk) {
  const th = cycle * TAU; const s = Math.sin(th); const c = Math.cos(th);
  const W = {}; const I = {};
  // ---- walk ----
  const swing = 0.5;
  for (const [side, sg] of [['L', 1], ['R', -1]]) {
    const ss = s * sg; const cc = c * sg; // the right leg runs half a cycle behind
    const thigh = -swing * ss + 0.03; const knee = 0.06 + 0.95 * Math.pow(Math.max(0, cc), 1.4) + 0.12 * Math.max(0, -ss) * Math.max(0, -cc);
    W['thigh_' + side] = [thigh, 0, sg * 0.03]; W['shin_' + side] = [knee, 0, 0]; W['foot_' + side] = [-0.75 * (thigh + knee), 0, 0];
    W['toe_' + side] = [0.3 * Math.max(0, -ss) * Math.max(0, cc), 0, 0]; // toes lift a little as the foot swings through
    W['upperarm_' + side] = [0.5 * ss, 0, 0]; W['forearm_' + side] = [-0.12 - 0.3 * Math.max(0, -ss), 0, 0];
  }
  W.hips_root = [0.03, -0.12 * s, 0.03 * s]; W.spine = [0, 0.2 * s, -0.02 * s]; W.chest = [0.02, 0.05 * s, 0]; W.neck = [-0.02, -0.06 * s, 0]; W.head = [-0.02, -0.05 * s, 0];
  const bob = 0.016 * Math.cos(2 * th) - 0.01; const sway = 0.012 * s;
  // ---- idle: slow breathing, a weight shift and a look around ----
  const b = Math.sin(t * TAU / 3.8); const sh = Math.sin(t * TAU / 6.5); const lk = Math.sin(t * TAU / 9.0);
  I.chest = [-0.014 * b, 0.03 * lk, 0]; I.spine = [0.008 * b, -0.02 * lk, 0.015 * sh]; I.hips_root = [0, 0.02 * sh, -0.018 * sh];
  I.shoulder_L = [0, 0, 0.012 * b]; I.shoulder_R = [0, 0, -0.012 * b];
  I.upperarm_L = [0.012 * b, 0, 0.01 * b]; I.upperarm_R = [0.012 * b, 0, -0.01 * b]; I.forearm_L = [-0.02 * b, 0, 0]; I.forearm_R = [-0.02 * b, 0, 0];
  I.neck = [0.01 * b, 0.05 * lk, 0]; I.head = [0.02 * Math.sin(t * TAU / 5.1), 0.14 * lk, 0.015 * sh];
  I.thigh_L = [0, 0, 0.012 * sh]; I.thigh_R = [0, 0, 0.012 * sh]; I.shin_L = [0.02 + 0.02 * sh, 0, 0]; I.shin_R = [0.02 - 0.02 * sh, 0, 0];
  for (const name of BONES) {
    const w = W[name] || [0, 0, 0]; const i = I[name] || [0, 0, 0]; const r = REST[name] || [0, 0, 0]; const o = out.rot[name];
    for (let k = 0; k < 3; k++) o[k] = r[k] + lerp(i[k], w[k], walk);
  }
  out.lift = lerp(0, bob, walk); out.sway = lerp(0.004 * Math.sin(t * TAU / 6.5), sway, walk);
  return out;
}
