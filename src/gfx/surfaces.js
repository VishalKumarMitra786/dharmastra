// Procedural surface maps for the world: albedo (with a roughness variation in alpha) and tangent-space normal maps for plaster, ashlar stone, roof tiles,
// timber, cobbles, packed earth, bark, woven cloth and a leaf card. Everything is generated at load from seeded noise (no download, no licence).
// Heights are computed first, ambient occlusion is baked into the albedo from the height (grooves and joints darker), then the normal map is derived
// from the same height. All maps tile (noise is periodic), so triplanar and repeat mapping never show a seam. Pure arrays: runs in Node for tests.
const hash = (x, y, s) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
// Periodic value noise: lattice of `per` cells wraps, so the texture tiles.
function vn(x, y, per, s) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
  const X0 = ((xi % per) + per) % per; const Y0 = ((yi % per) + per) % per; const X1 = (X0 + 1) % per; const Y1 = (Y0 + 1) % per;
  const a = hash(X0, Y0, s); const b = hash(X1, Y0, s); const c = hash(X0, Y1, s); const d = hash(X1, Y1, s);
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, per, oct, s) { let a = 0.5; let t = 0; let n = 0; let p = per; let f = 1; for (let i = 0; i < oct; i++) { t += a * vn(x * f, y * f, p, s + i * 17); n += a; a *= 0.5; f *= 2; p *= 2; } return t / n; }
function rng(seed) { let s = Math.abs(seed | 0) % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// h: Float32Array S*S heights 0..1. Returns an RGBA8 normal map whose green axis follows +v (image row index), as the triplanar shader expects (flipY=false data textures).
export function normalFromHeight(h, S, k = 2.2) {
  const out = new Uint8Array(S * S * 4); const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * 0.25 * k;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * 0.25 * k;
    const l = Math.hypot(dx, dy, 1); const o = (y * S + x) * 4;
    out[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); out[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); out[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); out[o + 3] = 255;
  }
  return out;
}
// Pack colour (per pixel [r,g,b] 0..255), roughness variation 0..1 and AO (0..1, multiplied into colour) into RGBA8.
function pack(S, fill) {
  const rgba = new Uint8Array(S * S * 4); const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = fill(x, y); const i = y * S + x; h[i] = o.h; const ao = o.ao ?? 1; rgba[i * 4] = Math.round(clamp01(o.c[0] / 255 * ao) * 255); rgba[i * 4 + 1] = Math.round(clamp01(o.c[1] / 255 * ao) * 255); rgba[i * 4 + 2] = Math.round(clamp01(o.c[2] / 255 * ao) * 255); rgba[i * 4 + 3] = Math.round(clamp01(o.r ?? 0.9) * 255); }
  return { rgba, h };
}

// Lime plaster: trowel mottling, pits, stains and hairline cracks. Near-white so the building's vertex colour sets the tint.
export function plaster(S = 256, seed = 2) {
  const per = 4; const R = rng(seed); const cracks = [];
  for (let i = 0; i < 5; i++) { let x = R() * S; let y = R() * S; let a = R() * 6.28; for (let k = 0; k < 60 + R() * 60; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 1.8; y += Math.sin(a) * 1.8; cracks.push((((Math.round(x) % S) + S) % S) + (((Math.round(y) % S) + S) % S) * S); } }
  const crackSet = new Set(cracks); const pits = new Set(); for (let i = 0; i < S * 0.5; i++) pits.add(Math.floor(R() * S) + Math.floor(R() * S) * S);
  const base = [236, 230, 218]; const warm = [246, 230, 200]; const cool = [214, 216, 214]; const stain = [150, 132, 108];
  const { rgba, h } = pack(S, (x, y) => {
    const u = x / S * per; const v = y / S * per; const lo = fbm(u, v, per, 4, 1); const mid = fbm(u * 4, v * 4, per * 4, 3, 5); const fine = vn(u * 32, v * 32, per * 32, 9);
    const streak = fbm(u * 1.5, v * 7, per * 2, 3, 22); // vertical rain streaks
    let c = mixc(mixc(cool, warm, lo), base, 0.35); c = mixc(c, stain, clamp01((streak - 0.55) * 1.7) * 0.34);
    const i = y * S + x; let ht = 0.55 + (mid - 0.5) * 0.35 + (fine - 0.5) * 0.18; let ao = 0.94 + 0.06 * mid;
    if (crackSet.has(i)) { ht -= 0.4; ao *= 0.55; } if (pits.has(i)) { ht -= 0.35; ao *= 0.7; }
    const sp = (fine - 0.5) * 18; return { c: [c[0] + sp, c[1] + sp, c[2] + sp * 0.9], h: ht, ao, r: 0.84 + 0.14 * fbm(u * 2, v * 2, per * 2, 2, 31) };
  });
  return { rgba, normal: normalFromHeight(h, S, 2.0), h };
}

// Ashlar and brick courses: blocks of varied length with per-block tint and wear, recessed mortar, chipped edges.
export function masonry(S = 256, seed = 3, { rows = 5, brick = false } = {}) {
  const per = 4; const R = rng(seed); const rh = S / rows; const courses = [];
  for (let j = 0; j < rows; j++) { const edges = []; let x = -R() * 40; const minW = brick ? S / 5 : S / 3.2; while (x < S + 40) { const w = minW * (0.8 + R() * 0.6); edges.push([x, x + w, 0.84 + R() * 0.3, R(), R()]); x += w; } courses.push(edges); }
  const gap = brick ? 3.4 : 2.6; const base = brick ? [168, 98, 70] : [206, 192, 168];
  const { rgba, h } = pack(S, (x, y) => {
    const j = Math.min(rows - 1, Math.floor(y / rh)); const course = courses[j]; let blk = course[0]; for (const b of course) { const xx = ((x - b[0]) % S + S) % S; if (x >= b[0] && x < b[1]) { blk = b; break; } if (xx < b[1] - b[0] && ((x + S) >= b[0] && (x + S) < b[1])) { blk = b; break; } }
    const fy = y - j * rh; let fx = x - blk[0]; if (fx < 0) fx += S; const bw = blk[1] - blk[0];
    const dEdge = Math.min(fx, bw - fx, fy, rh - fy); const edge = clamp01(dEdge / gap); const u = x / S * per; const v = y / S * per;
    const grain = fbm(u * 3, v * 3, per * 3, 4, 7 + Math.floor(blk[3] * 50)); const fine = vn(u * 24, v * 24, per * 24, 13);
    let c = base.slice(); const tintK = blk[2]; c = c.map((q) => q * tintK); if (brick) c = mixc(c, [120, 62, 44], blk[4] * 0.5); else c = mixc(c, [180, 168, 140], blk[4] * 0.4);
    c = mixc(c, [92, 80, 62], clamp01((grain - 0.55) * 1.6) * 0.4);
    const mortar = edge < 0.5; if (mortar) c = mixc(c, [118, 108, 92], 0.85);
    const chip = clamp01(1 - dEdge / (gap * 3)) * (fine > 0.72 ? 1 : 0);
    const ht = mortar ? 0.1 : 0.55 + (grain - 0.5) * 0.3 + (fine - 0.5) * 0.12 + edge * 0.2 - chip * 0.25;
    return { c, h: ht, ao: mortar ? 0.55 : 0.82 + 0.18 * edge, r: mortar ? 0.97 : 0.86 + (grain - 0.5) * 0.1 };
  });
  return { rgba, normal: normalFromHeight(h, S, brick ? 2.4 : 2.6), h };
}

// Curved clay roof tiles in overlapping courses, each with its own tint, soot and a little moss in the grooves.
export function roofTiles(S = 256, seed = 4, base = [186, 96, 62]) {
  const per = 4; const R = rng(seed); const rows = 8; const cols = 6; const th = S / rows; const tw = S / cols; const tint = []; for (let i = 0; i < rows * cols; i++) tint.push([0.78 + R() * 0.4, R()]);
  const { rgba, h } = pack(S, (x, y) => {
    const j = Math.min(rows - 1, Math.floor(y / th)); const off = (j % 2) * tw / 2; const xx = (x - off + S) % S; const i = Math.min(cols - 1, Math.floor(xx / tw)); const fx = (xx - i * tw) / tw; const fy = (y - j * th) / th;
    const t = tint[j * cols + i]; const prof = Math.sin(fx * Math.PI); const lap = 1 - fy; // each tile overlaps the one below it
    const u = x / S * per; const v = y / S * per; const grain = fbm(u * 5, v * 5, per * 5, 3, 3); const soot = fbm(u * 2, v * 2, per * 2, 3, 8);
    let c = base.map((q) => q * t[0]); c = mixc(c, [64, 52, 44], clamp01((soot - 0.5) * 1.4) * 0.5); c = mixc(c, [92, 104, 60], clamp01(0.5 - prof) * (grain > 0.6 ? 0.5 : 0) * t[1]);
    const ht = 0.35 + 0.4 * prof + 0.25 * (1 - lap) + (grain - 0.5) * 0.1; const ao = 0.58 + 0.42 * clamp01(prof * 1.1 * (0.5 + 0.5 * fy));
    return { c, h: ht, ao, r: 0.78 + 0.15 * grain };
  });
  return { rgba, normal: normalFromHeight(h, S, 2.8), h };
}

// Weathered timber planks: grain stretched along the length, knots, seams, nails.
export function timber(S = 256, seed = 5, base = [128, 88, 56]) {
  const per = 4; const R = rng(seed); const planks = 5; const pw = S / planks; const knots = []; for (let i = 0; i < 6; i++) knots.push([R() * S, R() * S, 5 + R() * 6]);
  const { rgba, h } = pack(S, (x, y) => {
    const i = Math.floor(x / pw); const fx = x - i * pw; const u = x / S * per; const v = y / S * per; const pr = hash(i, 0, seed);
    const grain = fbm(u * 14 + pr * 9, v * 1.3, per * 14, 4, 4 + i); const ring = 0.5 + 0.5 * Math.sin((fx / pw * 9 + grain * 6) * Math.PI);
    let kn = 0; for (const k of knots) { const dx = Math.min(Math.abs(x - k[0]), S - Math.abs(x - k[0])); const dy = Math.min(Math.abs(y - k[1]), S - Math.abs(y - k[1])); const d = Math.hypot(dx * 0.7, dy * 1.5) / k[2]; if (d < 1.6) kn = Math.max(kn, 1 - d / 1.6); }
    let c = base.map((q) => q * (0.78 + pr * 0.4)); c = mixc(c, [70, 44, 28], ring * 0.35 + kn * 0.6); c = mixc(c, [150, 138, 118], clamp01(fbm(u * 2, v * 2, per * 2, 3, 9) - 0.6) * 0.8); // weathered grey patches
    const seam = fx < 2 || fx > pw - 2; const crackV = vn(u * 20, v * 2, per * 20, 17) > 0.86 && vn(u * 3, v * 3, per * 3, 19) > 0.5;
    const ht = 0.55 + (ring - 0.5) * 0.18 + (grain - 0.5) * 0.18 - (seam ? 0.45 : 0) - (crackV ? 0.3 : 0) - kn * 0.15;
    return { c, h: ht, ao: seam ? 0.4 : crackV ? 0.55 : 0.88 + 0.12 * ring, r: 0.68 + 0.2 * grain };
  });
  return { rgba, normal: normalFromHeight(h, S, 2.4), h };
}

// Ground. 'cobble' is irregular rounded stones (cellular), 'earth' is packed earth with pebbles and wheel ruts.
export function ground(S = 256, kind = 'cobble', seed = 6, base = [150, 132, 108]) {
  const per = 4; const R = rng(seed);
  if (kind === 'cobble') {
    const N = 7; const cell = S / N; const pts = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.15 + R() * 0.7) * cell, (j + 0.15 + R() * 0.7) * cell, R()]);
    const { rgba, h } = pack(S, (x, y) => {
      const ci = Math.floor(x / cell); const cj = Math.floor(y / cell); let d1 = 1e9; let d2 = 1e9; let id = 0;
      for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) { // only the 3 x 3 neighbouring cells can hold the nearest points
        const wi = (ci + oi + N) % N; const wj = (cj + oj + N) % N; const p = pts[wj * N + wi]; const px = p[0] + Math.floor((ci + oi) / N) * S; const py = p[1] + Math.floor((cj + oj) / N) * S; const dx = px - x; const dy = py - y; const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; id = wj * N + wi; } else if (d < d2) d2 = d;
      }
      const e = (Math.sqrt(d2) - Math.sqrt(d1)); const rad = cell * 0.5; const round = clamp01(e / (rad * 0.55)); const u = x / S * per; const v = y / S * per; const grain = fbm(u * 6, v * 6, per * 6, 3, 2); const fine = vn(u * 40, v * 40, per * 40, 5);
      let c = base.map((q) => q * (0.78 + pts[id][2] * 0.4)); c = mixc(c, [92, 82, 70], clamp01((grain - 0.5) * 1.4) * 0.4); const joint = round < 0.18; if (joint) c = mixc(c, [58, 48, 38], 0.8);
      c = c.map((q) => q + (fine - 0.5) * 14);
      return { c, h: joint ? 0.05 : 0.35 + 0.55 * Math.sqrt(round) + (grain - 0.5) * 0.08, ao: joint ? 0.45 : 0.78 + 0.22 * round, r: joint ? 0.98 : 0.74 + 0.2 * grain };
    });
    return { rgba, normal: normalFromHeight(h, S, 3.0), h };
  }
  const pebH = new Float32Array(S * S); // pebbles are stamped into a height buffer first (cheap), then read per pixel
  for (let i = 0; i < 90; i++) { const px = R() * S; const py = R() * S; const r = 1.5 + R() * 3; for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) { const d = Math.hypot(dx, dy) / r; if (d < 1) { const X = (((Math.round(px) + dx) % S) + S) % S; const Y = (((Math.round(py) + dy) % S) + S) % S; pebH[Y * S + X] = Math.max(pebH[Y * S + X], Math.sqrt(1 - d * d)); } } }
  const { rgba, h } = pack(S, (x, y) => {
    const u = x / S * per; const v = y / S * per; const lo = fbm(u, v, per, 4, 3); const mid = fbm(u * 5, v * 5, per * 5, 3, 7); const fine = vn(u * 40, v * 40, per * 40, 11);
    let c = mixc(mixc(base, [190, 168, 134], lo * 0.6), [96, 78, 58], clamp01((mid - 0.55) * 1.6) * 0.5); c = c.map((q) => q + (fine - 0.5) * 22);
    const rut = Math.exp(-(((y / S) - 0.5) * ((y / S) - 0.5)) * 160); let ht = 0.55 + (mid - 0.5) * 0.3 + (fine - 0.5) * 0.14 - rut * 0.22;
    const ao = 0.9 + 0.1 * mid - rut * 0.12; const pb = pebH[y * S + x];
    if (pb > 0) { ht += pb * 0.4; c = mixc(c, [128, 112, 92], 0.5); }
    return { c, h: ht, ao, r: 0.9 - pb * 0.15 };
  });
  return { rgba, normal: normalFromHeight(h, S, 2.4), h };
}

export function bark(S = 128, seed = 7) {
  const per = 4; const { rgba, h } = pack(S, (x, y) => {
    const u = x / S * per; const v = y / S * per; const ridge = Math.abs(fbm(u * 7, v * 0.9, per * 7, 4, seed) - 0.5) * 2; const fine = vn(u * 28, v * 6, per * 28, 3);
    const c = mixc([70, 50, 34], [128, 100, 72], ridge * 0.8 + fine * 0.2); return { c, h: 0.3 + 0.6 * ridge, ao: 0.5 + 0.5 * ridge, r: 0.95 };
  });
  return { rgba, normal: normalFromHeight(h, S, 3.2), h };
}

// Woven cotton: warp and weft threads with slubs. Near-white so vertex colour dyes it.
export function weave(S = 128, seed = 8) {
  const { rgba, h } = pack(S, (x, y) => {
    const p = S / 32; const wx = Math.floor(x / p); const wy = Math.floor(y / p); const over = (wx + wy) % 2 === 0; const fx = (x % p) / p; const fy = (y % p) / p;
    const th = over ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI); const slub = hash(wx, wy, seed) * 0.5 + (over ? hash(wx, 0, seed + 1) : hash(0, wy, seed + 2)) * 0.5; const c = 225 + (slub - 0.5) * 30 - (1 - th) * 40;
    return { c: [c, c * 0.985, c * 0.95], h: 0.3 + 0.5 * th, ao: 0.7 + 0.3 * th, r: 0.9 };
  });
  return { rgba, normal: normalFromHeight(h, S, 1.8), h };
}

// A cluster of leaves on a transparent background (alpha is the leaf shape). Drawn into RGBA directly: ellipses with a midrib, tinted by vertex colour.
export function leafCard(S = 128, seed = 9) {
  const R = rng(seed); const rgba = new Uint8Array(S * S * 4); const leaves = [];
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.4; const len = S * (0.26 + R() * 0.16); leaves.push({ x: S / 2 + (R() - 0.5) * S * 0.5, y: S * (0.5 + R() * 0.38), a, len, w: len * (0.34 + R() * 0.1), t: R() }); }
  leaves.sort((p, q) => p.y - q.y);
  for (const lf of leaves) {
    const ca = Math.cos(lf.a); const sa = Math.sin(lf.a); const r = Math.ceil(lf.len + 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = Math.round(lf.x + dx); const py = Math.round(lf.y + dy); if (px < 0 || py < 0 || px >= S || py >= S) continue;
      const lx = dx * ca + dy * sa; const ly = -dx * sa + dy * ca; const u = lx / lf.len; if (u < 0 || u > 1) continue;
      const half = lf.w * Math.sin(Math.PI * Math.pow(u, 0.75)) * 0.5; if (Math.abs(ly) > half) continue;
      const rib = Math.abs(ly) < 0.7; const edge = Math.abs(ly) / half; const o = (py * S + px) * 4; const shade = 0.62 + 0.38 * (1 - edge) * (0.6 + 0.4 * lf.t);
      const g = (rib ? 1.18 : 1) * shade; rgba[o] = Math.min(255, 210 * g * 0.7); rgba[o + 1] = Math.min(255, 230 * g); rgba[o + 2] = Math.min(255, 160 * g * 0.8); rgba[o + 3] = 255;
    }
  }
  return { rgba, size: S };
}

// Soft blob for lantern light pools and contact shadows (alpha radial falloff), 64 px.
export function softDisc(S = 64, power = 2) { const rgba = new Uint8Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2); const a = clamp01(1 - d) ** power; const o = (y * S + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = 255; rgba[o + 3] = Math.round(a * 255); } return rgba; }
export { hex };

// Equirectangular sky: a gradient (zenith to horizon haze) with noise clouds on a projected layer, lit from the sun's side (bright rims, violet-grey undersides),
// thinning into haze at the horizon. Rows run bottom-first so the array can feed a DataTexture with flipY = false. T: sky[4], haze, cloudLit, cloudShade, cloudRim, cover, sunU, sunV.
export function skyMap(S = 512, T = {}) {
  const W = S; const H = S / 2; const out = new Uint8Array(W * H * 4); const hx = (c) => (typeof c === 'string' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c);
  const stops = (T.sky || ['#2f4f94', '#5f86c4', '#e8a878', '#f7c27a']).map(hx); const haze = hx(T.haze || '#f0c9a0'); const lit = hx(T.cloudLit || '#fff1dc'); const shade = hx(T.cloudShade || '#a8a4c4'); const rim = hx(T.cloudRim || '#ffd89a');
  const cover = T.cover ?? 0.5; const sunAz = (T.sunU ?? 0.46) * Math.PI * 2; const sunEl = (0.5 - (T.sunV ?? 0.4)) * Math.PI; const per = 256;
  const proj = (az, el) => { const k = 1 / (Math.max(el, 0) + 0.16); return [Math.cos(az) * k * 2.2, Math.sin(az) * k * 2.2]; };
  const sp = proj(sunAz, Math.max(0.05, sunEl)); const dsx = sp[0] / Math.hypot(sp[0], sp[1]); const dsy = sp[1] / Math.hypot(sp[0], sp[1]);
  for (let y = 0; y < H; y++) {
    const v = y / H; const el = (0.5 - v) * Math.PI; const row = H - 1 - y;
    for (let x = 0; x < W; x++) {
      const az = x / W * Math.PI * 2; let c;
      if (v >= 0.5) c = haze.slice();
      else {
        const t = Math.pow(1 - clamp01(v / 0.5), 0.85); // 1 at horizon, 0 at zenith
        const f = t * 3; const k = Math.min(2, Math.floor(f)); c = mixc(stops[k], stops[k + 1], f - k);
        const [X, Y] = proj(az, el); const d = fbm(X * 1.3 + 40, Y * 1.3 + 40, per, 6, 41); const d2 = fbm(X * 1.3 + 40 + dsx * 0.09, Y * 1.3 + 40 + dsy * 0.09, per, 6, 41);
        const a = clamp01((d - cover) / 0.22) * clamp01(el * 9 + 0.04); // thin to nothing at the horizon
        if (a > 0.003) { const l = clamp01(0.55 + (d - d2) * 5.5); let cc = mixc(shade, lit, l); const sunNear = Math.max(0, Math.cos(az - sunAz)) ** 6 * clamp01(1 - Math.abs(el - sunEl) * 2); cc = mixc(cc, rim, sunNear * 0.55 * (1 - a * 0.4)); c = mixc(c, cc, a * (0.55 + 0.45 * a)); }
        const g = Math.max(0, Math.cos(az - sunAz)) ** 3 * Math.max(0, 1 - Math.abs(el - sunEl) * 1.4); c = mixc(c, [255, 232, 170], g * 0.45); // sun glow
        c = mixc(c, haze, clamp01(1 - el * 5) ** 2 * 0.7); // horizon haze
      }
      const o = (row * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  return { rgba: out, w: W, h: H };
}
