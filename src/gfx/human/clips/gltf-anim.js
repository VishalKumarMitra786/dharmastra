// Reads the animation-only GLB files that tools/blender/anim writes (assets/characters/anim/*.glb) into plain typed arrays.
// Each clip becomes Euler XYZ radians per bone per frame (the same convention src/gfx/human/anim.js poses use), with quaternion sign and Euler wrap made continuous
// so a full roll keeps turning instead of unwinding. Rotations are stored normalised int16 quaternions in the file; hips_root translation is stored as an absolute position.
const CT = { 5120: [Int8Array, 'getInt8', 127], 5121: [Uint8Array, 'getUint8', 255], 5122: [Int16Array, 'getInt16', 32767], 5123: [Uint16Array, 'getUint16', 65535], 5126: [Float32Array, 'getFloat32', 1] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export function parseClipsGlb(buf, bones) {
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true); const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))); const bin = new DataView(buf, 20 + jl + 8);
  const read = (i) => { const a = json.accessors[i]; const v = json.bufferViews[a.bufferView]; const [T, get, div] = CT[a.componentType]; const n = NC[a.type]; const o = new Float32Array(a.count * n);
    for (let k = 0; k < a.count * n; k++) { const x = bin[get](v.byteOffset + (a.byteOffset || 0) + k * T.BYTES_PER_ELEMENT, true); o[k] = a.normalized ? Math.max(-1, x / div) : x; } return o; };
  const nodeName = json.nodes.map((n) => n.name); const bindRoot = json.nodes[nodeName.indexOf('hips_root')].translation || [0, 0, 0];
  const out = new Map(); const NB = bones.length;
  for (const an of json.animations || []) {
    const ex = an.extras || {}; const fps = ex.fps || 30; let nf = 1; const tr = [];
    for (const ch of an.channels) { const s = an.samplers[ch.sampler]; const times = json.accessors[s.input].count; nf = Math.max(nf, times); tr.push({ bone: nodeName[ch.target.node], path: ch.target.path, n: times, data: read(s.output) }); }
    const rot = new Float32Array(nf * NB * 3); const root = new Float32Array(nf * 3);
    const restOf = ex.rest || {};
    for (const t of tr) {
      if (t.path === 'translation') { for (let f = 0; f < nf; f++) { const k = Math.min(f, t.n - 1) * 3; root[f * 3] = t.data[k] - bindRoot[0]; root[f * 3 + 1] = t.data[k + 1] - bindRoot[1]; root[f * 3 + 2] = t.data[k + 2] - bindRoot[2]; } continue; }
      const b = bones.indexOf(t.bone); if (b < 0) continue; let prev = null; let pe = null;
      for (let f = 0; f < nf; f++) {
        const k = Math.min(f, t.n - 1) * 4; let x = t.data[k], y = t.data[k + 1], z = t.data[k + 2], w = t.data[k + 3]; const l = Math.hypot(x, y, z, w) || 1; x /= l; y /= l; z /= l; w /= l;
        if (prev && prev[0] * x + prev[1] * y + prev[2] * z + prev[3] * w < 0) { x = -x; y = -y; z = -z; w = -w; } prev = [x, y, z, w];
        // quaternion to rotation matrix to Euler XYZ (three.js)
        const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w), m23 = 2 * (y * z - x * w), m33 = 1 - 2 * (x * x + y * y), m22 = 1 - 2 * (x * x + z * z), m32 = 2 * (y * z + x * w);
        const ey = Math.asin(Math.max(-1, Math.min(1, m13))); let ex_, ez; if (Math.abs(m13) < 0.9999999) { ex_ = Math.atan2(-m23, m33); ez = Math.atan2(-m12, m11); } else { ex_ = Math.atan2(m32, m22); ez = 0; }
        let e = [ex_, ey, ez];
        if (pe) { const TWO = 2 * Math.PI; const alt = [ex_ + Math.PI, Math.PI - ey, ez + Math.PI]; let best = null; for (const cand of [e, alt]) { const c = cand.map((v, i) => v + Math.round((pe[i] - v) / TWO) * TWO); const d = Math.abs(c[0] - pe[0]) + Math.abs(c[1] - pe[1]) + Math.abs(c[2] - pe[2]); if (!best || d < best[0]) best = [d, c]; } e = best[1]; }
        pe = e;
        const o = (f * NB + b) * 3; rot[o] = e[0]; rot[o + 1] = e[1]; rot[o + 2] = e[2];
      }
      t.done = true;
    }
    out.set(an.name, { name: an.name, fps, n: nf, dur: ex.dur || (nf - 1) / fps, loop: !!ex.loop, extras: ex, rot, root, animated: new Set(tr.filter((t) => t.path === 'rotation').map((t) => bones.indexOf(t.bone))), NB });
  }
  return out;
}

// Fills the bones a clip does not animate with the rest pose, so a clip always defines the whole body.
export function fillRest(clips, bones, REST) {
  for (const c of clips.values()) for (let b = 0; b < bones.length; b++) { if (c.animated.has(b)) continue; const r = REST[bones[b]] || [0, 0, 0]; for (let f = 0; f < c.n; f++) { const o = (f * c.NB + b) * 3; c.rot[o] = r[0]; c.rot[o + 1] = r[1]; c.rot[o + 2] = r[2]; } }
}

// Writes the clip at time t (seconds) into pose.rot and the root offsets. Loops wrap; others clamp. Returns the pose.
export function sampleClip(clip, t, o, BONES, wgt = 1) {
  const NB = clip.NB; let f = t * clip.fps; let i0; let i1; let u;
  if (clip.loop) { const L = clip.n; f = ((f % L) + L) % L; i0 = Math.floor(f); i1 = (i0 + 1) % L; u = f - i0; } else { f = Math.max(0, Math.min(clip.n - 1, f)); i0 = Math.floor(f); i1 = Math.min(clip.n - 1, i0 + 1); u = f - i0; }
  for (let b = 0; b < NB; b++) { const a = (i0 * NB + b) * 3; const c = (i1 * NB + b) * 3; const r = o.rot[BONES[b]];
    for (let k = 0; k < 3; k++) { const v = clip.rot[a + k] + (clip.rot[c + k] - clip.rot[a + k]) * u; r[k] = wgt === 1 ? v : r[k] + (v - r[k]) * wgt; } }
  const ra = i0 * 3; const rc = i1 * 3; const sw = clip.root[ra] + (clip.root[rc] - clip.root[ra]) * u; const lf = clip.root[ra + 1] + (clip.root[rc + 1] - clip.root[ra + 1]) * u; const fw = clip.root[ra + 2] + (clip.root[rc + 2] - clip.root[ra + 2]) * u;
  o.sway = wgt === 1 ? sw : o.sway + (sw - o.sway) * wgt; o.lift = wgt === 1 ? lf : o.lift + (lf - o.lift) * wgt; o.fwd = wgt === 1 ? fw : o.fwd + (fw - o.fwd) * wgt; return o;
}
