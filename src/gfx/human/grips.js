// Hand poses for held things. The game rig has three finger bones per hand (thumb, fingers, fingers2): `f` and `f2` are the curl (radians about x) of the four
// fingers' knuckle and middle joint, `t` the thumb [x, z]. Poses were tuned against close-up renders (prototypes/gfx-shots/chars.mjs).
export const GRIP_POSES = {
  relaxed: { f: 0.28, f2: 0.34, t: [0.05, 0.2] }, open: { f: 0.05, f2: 0.05, t: [-0.1, 0.45] }, fist: { f: 1.35, f2: 1.5, t: [0.7, -0.35] },
  staff: { f: 1.05, f2: 1.2, t: [0.55, -0.15] }, spear: { f: 1.05, f2: 1.2, t: [0.55, -0.15] }, stick: { f: 1.05, f2: 1.2, t: [0.55, -0.15] }, club: { f: 1.25, f2: 1.4, t: [0.7, -0.3] },
  sword: { f: 1.2, f2: 1.3, t: [0.8, -0.35] }, bow: { f: 0.8, f2: 0.95, t: [0.35, 0.0] }, arrow: { f: 0.9, f2: 1.0, t: [0.6, -0.1] }, lamp: { f: 0.95, f2: 1.1, t: [0.5, -0.1] }, torch: { f: 1.0, f2: 1.15, t: [0.5, -0.1] },
  pot: { f: 0.55, f2: 0.6, t: [0.15, 0.35] }, shield: { f: 1.1, f2: 1.25, t: [0.6, -0.2] },
};
// Sets the finger bones of one hand to a named pose, blended with weight w (1 = fully). side 'L' | 'R'.
export function applyGrip(bones, side, name, w = 1) {
  const g = GRIP_POSES[name] || GRIP_POSES.relaxed; const s = side === 'L' ? 1 : -1; const F1 = bones['fingers_' + side]; const F2 = bones['fingers2_' + side]; const T = bones['thumb_' + side];
  if (F1) F1.rotation.x += (g.f - F1.rotation.x) * w; if (F2) F2.rotation.x += (g.f2 - F2.rotation.x) * w; if (T) { T.rotation.x += (g.t[0] - T.rotation.x) * w; T.rotation.z += (s * g.t[1] - T.rotation.z) * w; }
}
