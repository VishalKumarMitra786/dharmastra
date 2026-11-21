// Proportion measurements from the mesh itself (bind pose, metres). Pure: the Node test and the browser page run the same code.
// pos: xyz floats. uv: the palette uv per vertex (u < 0.5 means skin or top, so the body shell; hair and the dhoti are excluded from body height).
// joints/weights: 4 per vertex. boneNames/boneWorld: skeleton in the bind pose.
export function measureHero({ pos, uv, joints, weights, boneNames, boneWorld }) {
  const n = pos.length / 3; const headIdx = boneNames.indexOf('head'); const hw = boneWorld('head');
  const body = (i) => uv[i * 2] < 0.5;
  let top = -1e9; let bottom = 1e9; let topWithHair = -1e9;
  const headVerts = []; const clav = [];
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1]; topWithHair = Math.max(topWithHair, y);
    if (!body(i)) continue;
    top = Math.max(top, y); bottom = Math.min(bottom, y);
    let best = 0; for (let k = 1; k < 4; k++) if (weights[i * 4 + k] > weights[i * 4 + best]) best = k;
    if (joints[i * 4 + best] === headIdx && weights[i * 4 + best] > 0.5) headVerts.push(i);
    if (boneNames[joints[i * 4 + best]] === 'shoulder_L') clav.push(i);
  }
  const height = top - bottom;
  let chin = 1e9; let hxMin = 1e9; let hxMax = -1e9;
  for (const i of headVerts) { const x = pos[i * 3]; hxMin = Math.min(hxMin, x); hxMax = Math.max(hxMax, x); if (pos[i * 3 + 2] > hw[2] + 0.05) chin = Math.min(chin, pos[i * 3 + 1]); }
  const headH = top - chin; const headW = hxMax - hxMin;
  const aL = boneWorld('upperarm_L'); const aR = boneWorld('upperarm_R'); const shoulderJoints = Math.abs(aL[0] - aR[0]);
  let cx = 0; for (const i of clav) cx = Math.max(cx, pos[i * 3]); // outer edge of the shoulder-bone region, doubled
  let crotch = 1e9; for (let i = 0; i < n; i++) { if (!body(i)) continue; const y = pos[i * 3 + 1]; if (Math.abs(pos[i * 3]) < 0.005 && y > 0.3 * height && y < 0.6 * height) crotch = Math.min(crotch, y); }
  return { height, heightWithHair: topWithHair - bottom, headH, headW, headsTall: height / headH, shoulderJoints, shoulderOuter: cx * 2, shoulderOverHead: shoulderJoints / headW, shoulderOuterOverHead: (cx * 2) / headW, legLength: crotch - bottom, legRatio: (crotch - bottom) / height };
}
