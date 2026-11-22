// Hair, turbans, caps, helmets and cloth tails, generated from the head frame stored in hero.glb. Pure (no three.js): returns plain arrays so Node tests can count
// triangles. Everything is skinned: most vertices to the head bone, tails and long hair to short chains of extra bones that the renderer springs for secondary motion.
// Units: metres, model space (floor at y = 0, the figure faces +z).
import { CELL } from './paint.js';
const TAU = Math.PI * 2;
const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

class Builder {
  constructor() { this.pos = []; this.uv = []; this.idx = []; this.w = []; this.cell = CELL.hair; this.vr = [0, 1]; }
  vert(x, y, z, a, b, weights) { this.pos.push(x, y, z); const [cx, cy] = this.cell; const [v0, v1] = this.vr; this.uv.push((cx + 0.03 + 0.94 * a) / 4, (cy + 0.03 + 0.94 * (v0 + (v1 - v0) * b)) / 4); this.w.push(weights); return this.pos.length / 3 - 1; }
  grid(nu, nv, fn, close = false) { // fn(i, j) -> [x, y, z, a, b, weights]; i around (0..nu), j along (0..nv)
    const base = this.pos.length / 3; const cols = close ? nu : nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const [x, y, z, a, b, w] = fn(i, j); this.vert(x, y, z, a, b, w); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const i2 = close ? (i + 1) % nu : i + 1; const a = base + j * cols + i; const b = base + j * cols + i2; const c = base + (j + 1) * cols + i; const d = base + (j + 1) * cols + i2; this.idx.push(a, c, b, b, c, d); }
  }
  finish(h) { const nor = computeNormals(this.pos, this.idx); return { pos: Float32Array.from(this.pos), nor, uv: Float32Array.from(this.uv), idx: Uint16Array.from(this.idx), weights: this.w, tris: this.idx.length / 3 }; }
}
function computeNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3; const b = idx[t + 1] * 3; const c = idx[t + 2] * 3; const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2]; const vx = pos[c] - pos[a]; const vy = pos[c + 1] - pos[a + 1]; const vz = pos[c + 2] - pos[a + 2]; const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx; for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; } }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
// Head frame helpers: an ellipsoid hugging the skull. phi = 0 at the front (+z), pi at the back; theta = 0 at the crown, pi/2 at eye level.
function ellipsoid(h) { const cy = (h.top + h.chin) / 2 + 0.005; const ry = (h.top - cy); const rz = (h.zFront - h.zBack) / 2; return { cy, ry, rx: h.rx, rz, cz: (h.zFront + h.zBack) / 2 }; }
const P = (E, th, ph, s) => [Math.sin(th) * Math.sin(ph) * E.rx * s, E.cy + Math.cos(th) * E.ry * s, E.cz + Math.sin(th) * Math.cos(ph) * E.rz * s];
// Hairline: how far down the cap reaches at each angle (front forehead, ears, nape).
const hairline = (ph, front = 0.95, side = 1.4, back = 2.0) => { const a = Math.abs(((ph + Math.PI) % TAU) - Math.PI); return a < Math.PI / 2 ? lerp(front, side, sm(a / (Math.PI / 2))) : lerp(side, back, sm((a - Math.PI / 2) / (Math.PI / 2))); };

// A hair shell: an irregular hairline, locks that ripple the surface and a whorl at the crown. Two shells (a dense inner one and a looser outer one) give volume.
function cap(B, E, { scale = 1.04, front = 0.95, side = 1.4, back = 2.0, lon = 28, lat = 8, bump = 0.006, quiff = 0, seed = 1, lock = 0.012, vlo = 0, vhi = 1, W }) {
  const vr = B.vr; B.vr = [vlo, vhi];
  B.grid(lon, lat, (i, j) => {
    const ph = (i / lon) * TAU; const wob = 0.07 * Math.sin(ph * 5 + seed) + 0.05 * Math.sin(ph * 11 + seed * 2.3); const tm = hairline(ph, front, side, back) * (1 + wob); const t = j / lat; const th = t * tm;
    const taper = sm((t - 0.78) / 0.22); // the lower edge settles onto the skin
    const lk = lock * (0.5 + 0.5 * Math.sin(ph * 13 + seed * 3 + 2.2 * Math.sin(th * 3.5 + ph))) * sm(t * 3); // locks
    const whorl = 0.01 * Math.sin(ph * 2 + t * 9) * (1 - t);
    let s = scale + lk + whorl + 0.012 * Math.sin(ph * 3 + th * 2) + bump * Math.sin(ph * 17 + th * 9) + quiff * Math.max(0, Math.cos(ph)) * (1 - t) * 0.9 - taper * (scale + lk - 1.002) * 0.9;
    const p = P(E, th, ph, s); return [p[0], p[1], p[2], i / lon, t, W(0, t, ph)];
  }, true);
  B.vr = vr;
}
// A hanging strip (long hair, braid, cloth tail): `rows` rows down from a start, narrower toward the end, skinned along a chain of bones.
function strip(B, { x0 = 0, y0, z0, width, length, rows, cols = 4, dz = -0.02, bow = 0.02, chain, parent = 'head', taper = 0.45, weave = 0, uvCell }) {
  const old = B.cell; if (uvCell) B.cell = uvCell;
  B.grid(cols, rows, (i, j) => {
    const t = j / rows; const u = i / cols - 0.5; const wd = width * lerp(1, taper, t) * (1 + weave * 0.15 * Math.sin(t * 24));
    const w = chain(t); return [x0 + u * wd, y0 - t * length, z0 + dz * t + bow * Math.sin(t * Math.PI) - 0.004 * Math.abs(u) * 0, i / cols, t, w];
  });
  B.cell = old;
}
const chainWeights = (names, t) => { const f = t * (names.length - 1); const k = Math.min(names.length - 2, Math.floor(f)); const u = f - k; return u < 1e-6 ? [[names[k], 1]] : [[names[k], 1 - u], [names[k + 1], u]]; };

export const EXTRA_BONES = { hair: ['hair1', 'hair2', 'hair3'], braid: ['braid1', 'braid2', 'braid3'], tail: ['tail1', 'tail2', 'tail3'], sashtail: ['stail1', 'stail2', 'stail3'] };

// spec: { hair: 'short'|'crop'|'long'|'bun'|'braid'|'none', headgear: 'none'|'turban'|'cap'|'helmet', sashTail: bool, hipY }
export function buildHeadgear(h, spec) {
  const B = new Builder(); const E = ellipsoid(h); const extra = []; const H = (t = 0) => [['head', 1]];
  const hg = spec.headgear || 'none'; const hair = hg === 'none' || hg === 'cap' ? (spec.hair || 'short') : (hg === 'turban' || hg === 'helmet' ? 'none' : spec.hair);
  const headPos = [0, E.cy, E.cz];
  if (hair !== 'none' && hg !== 'turban' && hg !== 'helmet') {
    B.cell = CELL.hair;
    if (hair === 'short') { cap(B, E, { scale: 1.034, front: 0.95, side: 1.4, back: 2.0, lock: 0.004, seed: 1, W: H }); cap(B, E, { scale: 1.052, front: 0.86, side: 1.32, back: 1.85, quiff: 0.05, lock: 0.016, seed: 4, W: H }); }
    else if (hair === 'crop') { cap(B, E, { scale: 1.02, front: 1.0, side: 1.3, back: 1.75, lock: 0.003, seed: 2, W: H }); cap(B, E, { scale: 1.034, front: 0.92, side: 1.22, back: 1.6, lock: 0.008, seed: 7, W: H }); }
    else if (hair === 'bun') { cap(B, E, { scale: 1.035, front: 0.9, side: 1.42, back: 1.9, bump: 0.004, W: H }); const bun = E; B.grid(8, 4, (i, j) => { const ph = (i / 8) * TAU; const th = (j / 4) * Math.PI; const r = 0.05; return [Math.sin(th) * Math.sin(ph) * r * 1.1, bun.cy + bun.ry * 0.62 + Math.cos(th) * r * 0.9, bun.cz - bun.rz * 0.92 - 0.02 + Math.sin(th) * Math.cos(ph) * r, i / 8, j / 4, [['head', 1]]]; }, true); }
    else if (hair === 'long' || hair === 'braid') {
      cap(B, E, { scale: 1.05, front: 0.9, side: 1.45, back: 2.05, bump: 0.005, W: H });
      const names = hair === 'long' ? EXTRA_BONES.hair : EXTRA_BONES.braid; extra.push({ names, parent: 'head', at: [0, E.cy - E.ry * 0.5, E.cz - E.rz * 0.8], step: -0.11 });
      const yTop = E.cy - E.ry * 0.46; const zb = E.cz - E.rz * 0.93;
      if (hair === 'long') strip(B, { y0: yTop + 0.02, z0: zb, width: h.rx * 2.05, length: 0.4, rows: 7, cols: 8, dz: -0.015, bow: 0.012, taper: 0.62, chain: (t) => chainWeights(['head', ...names], Math.min(1, t * 1.05)) });
      else { strip(B, { y0: yTop + 0.02, z0: zb - 0.005, width: 0.085, length: 0.5, rows: 10, cols: 3, dz: -0.01, bow: 0.018, taper: 0.4, weave: 1, chain: (t) => chainWeights(['head', ...names], Math.min(1, t * 1.05)) });
        strip(B, { y0: yTop + 0.02, z0: zb, width: h.rx * 1.2, length: 0.07, rows: 2, cols: 6, dz: 0, bow: 0, taper: 0.9, chain: () => [['head', 1]] }); }
    }
  }
  if (hg === 'turban') {
    B.cell = CELL.cloth2; const top = E.cy + E.ry * 1.18;
    B.grid(18, 7, (i, j) => { const ph = (i / 18) * TAU; const t = j / 7; const th = t * hairline(ph, 1.18, 1.2, 1.75); const wrap = 0.028 * Math.sin(th * 7 + ph * 1.6) + 0.012 * Math.sin(th * 15 - ph * 2); const s = 1.16 + wrap - sm((t - 0.85) / 0.15) * 0.1; const p = P(E, th, ph, s); p[1] += 0.045 * (1 - t) ** 2 * (0.4 + 0.3 * Math.cos(ph)); return [p[0], p[1], p[2], i / 18, t, H()]; }, true);
    B.grid(8, 4, (i, j) => { const ph = (i / 8) * TAU; const th = (j / 4) * Math.PI; return [Math.sin(th) * Math.sin(ph) * 0.07, top - 0.01 + Math.cos(th) * 0.04, E.cz + 0.005 + Math.sin(th) * Math.cos(ph) * 0.07, i / 8, j / 4, H()]; }, true); // the knot on top
    if (spec.turbanTail !== false) { extra.push({ names: EXTRA_BONES.tail, parent: 'head', at: [0, E.cy + E.ry * 0.1, E.cz - E.rz * 1.1], step: -0.13 }); strip(B, { y0: E.cy + E.ry * 0.25, z0: E.cz - E.rz * 1.12, width: 0.11, length: 0.42, rows: 6, cols: 3, dz: -0.05, bow: 0.02, taper: 0.8, chain: (t) => chainWeights(['head', ...EXTRA_BONES.tail], t), uvCell: CELL.cloth2 }); }
  } else if (hg === 'cap') {
    B.cell = CELL.cloth2; B.grid(16, 4, (i, j) => { const ph = (i / 16) * TAU; const t = j / 4; const th = t * hairline(ph, 0.93, 1.0, 1.15); const p = P(E, th, ph, 1.07 + 0.01 * Math.sin(ph * 9) - sm((t - 0.9) / 0.1) * 0.02); p[1] += 0.01 * (1 - t); return [p[0], p[1], p[2], i / 16, t, H()]; }, true);
  } else if (hg === 'helmet') {
    B.cell = CELL.metal; const lon = 16; const lat = 7;
    B.grid(lon, lat, (i, j) => { const ph = (i / lon) * TAU; const t = j / lat; const th = t * hairline(ph, 1.05, 1.5, 1.95); const peak = (1 - t) ** 3 * 0.075; const s = 1.12 - 0.006 * sm((t - 0.9) / 0.1); const p = P(E, th, ph, s); p[1] += peak; return [p[0], p[1], p[2], i / lon, 0.1 + 0.3 * t, H()]; }, true);
    B.grid(16, 1, (i, j) => { const ph = (i / 16) * TAU; const a = hairline(ph, 1.05, 1.5, 1.95); const p = P(E, a, ph, 1.12 + 0.03 * j); return [p[0], p[1] - 0.012 * j, p[2], i / 16, 0.46 + 0.05 * j, H()]; }, true); // rim
    B.grid(8, 3, (i, j) => { const ph = (i / 8) * TAU; const t = j / 3; return [Math.sin(ph) * 0.016 * (1 - t), E.cy + E.ry * 1.12 + 0.07 + t * 0.07, E.cz + Math.cos(ph) * 0.016 * (1 - t), i / 8, 0.05, H()]; }, true); // the spike
    B.cell = CELL.cloth2;
  }
  if (spec.carry === 'pot' || spec.carry === 'bundle') { // carried on the head: a clay pot or a cloth bundle (own cell of the atlas: the cloth cell)
    B.cell = spec.carry === 'pot' ? CELL.leather : CELL.cloth2; const top = E.cy + E.ry * 0.98; const R2 = spec.carry === 'pot' ? 0.13 : 0.14;
    B.grid(14, 8, (i, j) => { const ph = (i / 14) * TAU; const t = j / 8; const prof = spec.carry === 'pot' ? [0.04, 0.5, 1, 0.92, 0.66, 0.5, 0.58, 0.5, 0.3][j] : [0.2, 0.6, 0.9, 1, 0.95, 0.8, 0.55, 0.3, 0.06][j]; const yy = top + 0.012 + t * (spec.carry === 'pot' ? 0.26 : 0.18); return [Math.sin(ph) * R2 * prof, yy, E.cz + Math.cos(ph) * R2 * prof, i / 14, t, H()]; }, true);
  }
  const out = B.finish(h); out.extra = extra; out.E = E; void headPos; return out;
}
// A cloth tail hanging from the hip sash (the end of the waist cloth), skinned to a three-bone chain under the hips bone.
export function buildSashTail(sashY, side = 1) {
  const B = new Builder(); B.cell = CELL.sash; const names = EXTRA_BONES.sashtail.map((n) => n + (side > 0 ? '_L' : '_R'));
  strip(B, { x0: side * 0.2, y0: sashY, z0: 0.15, width: 0.1, length: 0.55, rows: 7, cols: 3, dz: 0.02, bow: 0.015, taper: 0.9, chain: (t) => chainWeights(['hips', ...names], t), uvCell: CELL.sash });
  const out = B.finish(); out.extra = [{ names, parent: 'hips', at: [side * 0.2, sashY, 0.15], step: -0.18 }]; return out;
}
