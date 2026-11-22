// Procedural painting for people: the albedo atlas of one look (face, skin, cloth with weave and borders, leather, metal, hair, turban cloth), and the
// normal and roughness/occlusion/metal maps shared by every person (they do not depend on colour). All drawn at load, no download.
// The atlas is a 4 x 4 grid of cells (see CELL in tools/build-hero.mjs): the face uses the 2 x 2 block at the top left.
import { hexMix, rng } from './looks.js';
export const CELL = { skin: [2, 0], tunic: [3, 0], dhoti: [0, 2], leather: [1, 2], metal: [2, 2], sash: [3, 2], hair: [2, 1], cloth2: [3, 1] };
export const FACE = { x0: -0.98, x1: 0.98, y0: 5.8, y1: 8.6 }; // base-mesh decimetres, as in the build script
const TAU = Math.PI * 2;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (h, a = 1) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (h, k) => { const [r, g, b] = hexRgb(h); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

// Pixel position of a point of the base mesh in the face block, for atlas size S.
export function faceMap(S) { const k = S / 4; return { px: (x) => k * (0.015 + 1.97 * ((x - FACE.x0) / (FACE.x1 - FACE.x0))), py: (y) => k * (0.015 + 1.97 * ((FACE.y1 - y) / (FACE.y1 - FACE.y0))), unit: k * 1.97 / (FACE.x1 - FACE.x0) }; }
// Landmarks of the face in base-mesh decimetres (shared by the albedo painter and the roughness map so the eyes are wet and the lips are soft).
export const LANDMARK = { eyeY: 7.27, eyeX: 0.31, eyeW: 0.15, browY: 7.56, noseY: 6.86, mouthY: 6.45, mouthW: 0.2 };

export function paintAtlas(g, S, L, blink = 0) {
  const c = S / 4; const R = rng(L.seed * 31 + 7);
  g.save(); g.clearRect(0, 0, S, S);
  paintFace(g, S, L, blink, R); paintSkin(g, S, L, R);
  paintCloth(g, c, CELL.tunic, L.tunicColor, L.tunicPattern, L.border, 'tunic', R);
  paintCloth(g, c, CELL.dhoti, L.dhotiColor, L.dhotiPattern, L.border, 'dhoti', R);
  paintCloth(g, c, CELL.sash, L.sashColor, 'stripe', L.border, 'sash', R);
  paintLeather(g, c, CELL.leather, L.leather, R); paintMetal(g, c, CELL.metal, L.metal, R);
  paintHair(g, c, CELL.hair, L.hair.color, R); paintCloth(g, c, CELL.cloth2, L.headgear.color || '#cccccc', 'wound', L.headgear.color2 || '#d9b24a', 'turban', R);
  g.restore();
}
function cellRect(c, cell) { return [cell[0] * c, cell[1] * c]; }

function paintSkin(g, S, L, R) {
  const c = S / 4; const [x0, y0] = cellRect(c, CELL.skin); const base = L.skin;
  const gr = g.createLinearGradient(0, y0, 0, y0 + c); gr.addColorStop(0, shade(base, 1.04)); gr.addColorStop(0.5, shade(base, 0.98)); gr.addColorStop(1, shade(base, 0.9));
  g.fillStyle = gr; g.fillRect(x0, y0, c, c);
  for (let i = 0; i < 90; i++) { const x = x0 + R() * c; const y = y0 + R() * c; const rr = (3 + R() * 9) * c / 128; const gg = g.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, rgba(R() < 0.5 ? hexMix(base, '#a03a30', 0.5) : hexMix(base, '#3a2418', 0.4), 0.09)); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
}

export function paintFace(g, S, L, blink, R) {
  const { px, py, unit } = faceMap(S); const base = L.skin; const k = S / 4; const x0 = 0; const y0 = 0; const size = k * 2;
  g.save(); g.beginPath(); g.rect(0, 0, size, size); g.clip();
  // base: forehead light, jaw and neck darker; the neck (below the chin, y < 6.1) is a touch darker in shade
  const gr = g.createLinearGradient(0, py(8.6), 0, py(5.8)); gr.addColorStop(0, shade(base, 1.0)); gr.addColorStop(0.18, shade(base, 1.04)); gr.addColorStop(0.55, shade(base, 1.0)); gr.addColorStop(0.8, shade(base, 0.96)); gr.addColorStop(1, shade(base, 0.8));
  g.fillStyle = gr; g.fillRect(x0, y0, size, size);
  const blot = (x, y, rx, ry, col, a) => { g.save(); g.translate(px(x), py(y)); g.scale(rx * unit, ry * unit); const gg = g.createRadialGradient(0, 0, 0, 0, 0, 1); gg.addColorStop(0, rgba(col, a)); gg.addColorStop(1, rgba(col, 0)); g.fillStyle = gg; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); };
  const warm = hexMix(base, '#b24a3c', 0.55); const dark = hexMix(base, '#2a140e', 0.7); const light = hexMix(base, '#ffffff', 0.35);
  blot(0, 8.05, 0.6, 0.25, light, 0.22); // forehead highlight
  for (const s of [-1, 1]) { blot(s * 0.42, 6.75, 0.22, 0.15, warm, 0.28); blot(s * 0.5, 7.05, 0.2, 0.12, light, 0.2); blot(s * 0.78, 7.0, 0.08, 0.2, warm, 0.3); } // cheeks, cheekbones, ears
  blot(0, 6.85, 0.1, 0.1, light, 0.18); blot(0, 6.2, 0.2, 0.08, light, 0.15); // nose tip, chin
  for (const s of [-1, 1]) { blot(s * 0.28, 7.12, 0.24, 0.07, dark, 0.14); blot(s * 0.15, 7.42, 0.16, 0.1, dark, 0.14); } // under-eye and socket shadow
  blot(0, 6.69, 0.11, 0.03, dark, 0.2); // shadow under the nose
  for (const s of [-1, 1]) { blot(s * 0.1, 6.78, 0.05, 0.03, dark, 0.42); blot(s * 0.1, 7.1, 0.05, 0.28, dark, 0.12); blot(s * 0.25, 6.52, 0.04, 0.16, dark, 0.11); } // nostril wings, bridge, nasolabial folds
  blot(0, 8.3, 0.9, 0.35, hexMix(L.hair.color, base, 0.35), 0.5); // scalp under the hair
  // beard and moustache, painted into the skin (fibres as short strokes)
  const hc = hexMix(L.hair.color, '#1a120e', 0.2);
  const fiber = (poly, n, a) => { g.save(); g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))); g.closePath(); g.clip(); const xs = poly.map((p) => p[0]); const ys = poly.map((p) => p[1]); for (let i = 0; i < n; i++) { const x = Math.min(...xs) + R() * (Math.max(...xs) - Math.min(...xs)); const y = Math.min(...ys) + R() * (Math.max(...ys) - Math.min(...ys)); g.strokeStyle = rgba(hc, a * (0.4 + R() * 0.6)); g.lineWidth = Math.max(1, unit * 0.012); g.beginPath(); g.moveTo(px(x), py(y)); g.lineTo(px(x + (R() - 0.5) * 0.05), py(y - 0.07 - R() * 0.05)); g.stroke(); } g.restore(); };
  const jaw = [[-0.74, 6.95], [-0.66, 6.3], [-0.4, 5.95], [0, 5.9], [0.4, 5.95], [0.66, 6.3], [0.74, 6.95], [0.5, 6.6], [0.25, 6.55], [-0.25, 6.55], [-0.5, 6.6]];
  const must = [[-0.28, 6.55], [-0.12, 6.6], [0, 6.58], [0.12, 6.6], [0.28, 6.55], [0.22, 6.5], [0, 6.52], [-0.22, 6.5]];
  const full = [[-0.72, 7.1], [-0.68, 6.2], [-0.42, 5.88], [0, 5.82], [0.42, 5.88], [0.68, 6.2], [0.72, 7.1], [0.45, 6.6], [0, 6.55], [-0.45, 6.6]];
  if (L.beard === 'stubble') fiber(jaw, Math.round(2600 * (S / 1024) ** 2 + 400), 0.32); else if (L.beard === 'moustache') { fiber(must, 700, 0.9); g.fillStyle = rgba(hc, 0.85); g.beginPath(); must.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))); g.fill(); }
  else if (L.beard === 'full') { g.fillStyle = rgba(hc, 0.9); g.beginPath(); full.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y)))); g.fill(); fiber(full, 1400, 0.7); }
  // mouth
  const my = LANDMARK.mouthY; const mw = LANDMARK.mouthW; const lip = hexMix(base, '#7a2f2c', 0.48);
  g.fillStyle = rgba(hexMix(lip, '#3a1612', 0.25), 0.95); g.beginPath(); g.moveTo(px(-mw), py(my)); g.quadraticCurveTo(px(-mw * 0.5), py(my + 0.1), px(-0.04), py(my + 0.075)); g.quadraticCurveTo(px(0), py(my + 0.06), px(0.04), py(my + 0.075)); g.quadraticCurveTo(px(mw * 0.5), py(my + 0.1), px(mw), py(my)); g.quadraticCurveTo(px(0), py(my + 0.01), px(-mw), py(my)); g.fill();
  g.fillStyle = rgba(hexMix(lip, '#d9806e', 0.25), 0.95); g.beginPath(); g.moveTo(px(-mw), py(my)); g.quadraticCurveTo(px(0), py(my - 0.2), px(mw), py(my)); g.quadraticCurveTo(px(0), py(my - 0.01), px(-mw), py(my)); g.fill();
  g.strokeStyle = rgba('#2a0e0c', 0.8); g.lineWidth = unit * 0.016; g.lineCap = 'round'; g.beginPath(); g.moveTo(px(-mw * 1.04), py(my + 0.005)); g.quadraticCurveTo(px(0), py(my - 0.02), px(mw * 1.04), py(my + 0.005)); g.stroke();
  blot(0, my - 0.12, 0.07, 0.03, '#ffffff', 0.18); // lower lip highlight
  // eyes
  const ey = LANDMARK.eyeY; const ew = LANDMARK.eyeW;
  for (const s of [-1, 1]) {
    const cx = s * LANDMARK.eyeX; const inner = cx - s * ew; const outer = cx + s * ew; const lift = 0.03; const open = 1 - blink;
    const upper = (t) => { const x = inner + (outer - inner) * t; return [x, ey + lift * t * 0.6 + 0.108 * open * Math.sin(Math.PI * Math.pow(t, 0.85))]; };
    const lower = (t) => { const x = inner + (outer - inner) * t; return [x, ey + lift * t * 0.6 - 0.062 * open * Math.sin(Math.PI * t)]; };
    const path = () => { g.beginPath(); for (let i = 0; i <= 16; i++) { const [x, y] = upper(i / 16); (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))); } for (let i = 16; i >= 0; i--) { const [x, y] = lower(i / 16); g.lineTo(px(x), py(y)); } g.closePath(); };
    g.save(); path(); g.clip();
    const sc = g.createLinearGradient(px(inner), 0, px(outer), 0); sc.addColorStop(0, '#c9a79a'); sc.addColorStop(0.25, '#eee6da'); sc.addColorStop(0.75, '#eee6da'); sc.addColorStop(1, '#cdb8a8'); g.fillStyle = sc; g.fillRect(0, 0, size, size);
    const ix = cx + s * 0.004; const iy = ey - 0.004; const ir = 0.078 * unit;
    const ig = g.createRadialGradient(px(ix), py(iy), ir * 0.2, px(ix), py(iy), ir); ig.addColorStop(0, shade(hexMix(L.eye, '#c89a60', 0.25), 1.0)); ig.addColorStop(0.7, shade(L.eye, 0.9)); ig.addColorStop(1, shade(L.eye, 0.35)); g.fillStyle = ig; g.beginPath(); g.arc(px(ix), py(iy), ir, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(14,8,6,0.75)'; g.lineWidth = ir * 0.16; g.beginPath(); g.arc(px(ix), py(iy), ir * 0.96, 0, TAU); g.stroke(); // limbal ring
    for (let k = 0; k < 26; k++) { const a = R() * TAU; g.strokeStyle = rgba(hexMix(L.eye, R() < 0.5 ? '#e0b070' : '#140c08', 0.5), 0.35); g.lineWidth = Math.max(0.6, ir * 0.04); g.beginPath(); g.moveTo(px(ix + Math.cos(a) * ir * 0.45 / unit), py(iy + Math.sin(a) * ir * 0.45 / unit)); g.lineTo(px(ix + Math.cos(a) * ir * 0.88 / unit), py(iy + Math.sin(a) * ir * 0.88 / unit)); g.stroke(); } // iris fibres
    g.fillStyle = '#0c0807'; g.beginPath(); g.arc(px(ix), py(iy), ir * 0.42, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(px(ix - 0.03), py(iy + 0.03), ir * 0.2, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(px(ix + 0.035), py(iy - 0.025), ir * 0.1, 0, TAU); g.fill();
    const sh = g.createLinearGradient(0, py(ey + 0.1), 0, py(ey - 0.01)); sh.addColorStop(0, 'rgba(40,18,12,0.3)'); sh.addColorStop(1, 'rgba(40,18,12,0)'); g.fillStyle = sh; g.fillRect(0, py(ey + 0.1), size, py(ey - 0.01) - py(ey + 0.1)); // lid shadow
    g.restore();
    g.strokeStyle = rgba('#1a0e0a', 0.95); g.lineCap = 'round'; g.lineWidth = unit * 0.02; g.beginPath(); for (let i = 0; i <= 16; i++) { const [x, y] = upper(i / 16); (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))); } g.stroke(); // upper lash line
    g.lineWidth = unit * 0.034; g.beginPath(); for (let i = 8; i <= 16; i++) { const [x, y] = upper(i / 16); (i > 8 ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))); } g.stroke(); // heavier toward the outer corner
    g.strokeStyle = rgba(dark, 0.75); g.lineWidth = unit * 0.02; g.beginPath(); for (let i = 0; i <= 16; i++) { const [x, y] = lower(i / 16); (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))); } g.stroke();
    g.strokeStyle = rgba(dark, 0.32); g.lineWidth = unit * 0.014; g.beginPath(); for (let i = 1; i <= 15; i++) { const [x, y] = upper(i / 16); (i > 1 ? g.lineTo(px(x), py(y + 0.04)) : g.moveTo(px(x), py(y + 0.04))); } g.stroke(); // lid crease
    // brow: tapered, a little arched, painted as many small strokes
    const bc = hexMix(L.hair.color, '#150e0b', 0.4); const by = LANDMARK.browY;
    for (let i = 0; i < 120; i++) { const t = R(); const bx = cx - s * 0.2 + s * 0.46 * t; const byy = by - 0.035 + 0.06 * Math.sin(Math.PI * Math.pow(t, 0.9)) - 0.04 * t; const th = (1 - Math.abs(t - 0.3) * 1.1) * 0.05; g.strokeStyle = rgba(hexMix(bc, base, 0.22), 0.28 + R() * 0.4); g.lineWidth = Math.max(1, unit * 0.007); g.beginPath(); g.moveTo(px(bx), py(byy - th * (R() - 0.5))); g.lineTo(px(bx + s * 0.04), py(byy + 0.015 + th * R() * 0.8)); g.stroke(); }
  }
  g.restore();
}

function cloth(g, x0, y0, c, base, kind) {
  g.fillStyle = base; g.fillRect(x0, y0, c, c);
  const gr = g.createLinearGradient(0, y0, 0, y0 + c); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(x0, y0, c, c);
}
function paintCloth(g, c, cell, base, pattern, border, kind, R) {
  const [x0, y0] = cellRect(c, cell); cloth(g, x0, y0, c, base, kind); const u = c / 128;
  g.save(); g.beginPath(); g.rect(x0, y0, c, c); g.clip();
  const P = (a, b) => [x0 + a * c, y0 + b * c];
  if (pattern === 'stripe') for (let i = 0; i < 16; i++) { g.fillStyle = rgba(hexMix(base, border, 0.55), i % 4 === 1 ? 0.55 : 0.2); const [x] = P(i / 16, 0); g.fillRect(x, y0, c / 32 * (i % 4 === 1 ? 1.4 : 0.8), c); }
  else if (pattern === 'check') { g.fillStyle = rgba(hexMix(base, border, 0.5), 0.28); for (let i = 0; i < 10; i++) g.fillRect(x0 + i * c / 10, y0, c / 20, c); for (let j = 0; j < 12; j++) g.fillRect(x0, y0 + j * c / 12, c, c / 24); }
  else if (pattern === 'block') { for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const [x, y] = P((i + (j % 2) * 0.5) / 8, (j + 0.5) / 8); g.fillStyle = rgba(border, 0.55); g.beginPath(); g.ellipse(x + c / 16, y, c / 52, c / 30, 0, 0, TAU); g.fill(); g.fillStyle = rgba(border, 0.35); g.fillRect(x + c / 16 - 1, y + c / 30, 2 * u, c / 28); } }
  else if (pattern === 'wound') { for (let i = 0; i < 14; i++) { const [, y] = P(0, i / 14); g.fillStyle = i % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.1)'; g.fillRect(x0, y, c, c / 14); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + c, y + c / 40); g.stroke(); } g.fillStyle = rgba(border, 0.8); g.fillRect(x0, y0 + c * 0.9, c, c * 0.05); }
  // folds: soft vertical shading bands (the geometry carries the real folds through the normal map)
  const folds = kind === 'dhoti' ? 9 : kind === 'sash' ? 4 : 6;
  for (let i = 0; i < folds; i++) { const [x] = P((i + R() * 0.5) / folds, 0); const gg = g.createLinearGradient(x, 0, x + c / folds * 0.5, 0); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, `rgba(0,0,0,${0.1 + R() * 0.07})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x, y0, c / folds * 0.5, c); }
  // borders
  if (kind === 'tunic') { g.fillStyle = rgba(border, 0.9); g.fillRect(x0, y0 + c * 0.9, c, c * 0.07); g.fillStyle = rgba('#d9b24a', 0.85); g.fillRect(x0, y0 + c * 0.88, c, c * 0.012); g.fillRect(x0, y0 + c * 0.97, c, c * 0.012); g.fillStyle = rgba(border, 0.95); g.fillRect(x0, y0 + c * 0.03, c, c * 0.05); g.fillStyle = rgba(border, 0.9); g.fillRect(x0, y0 + c * 0.855, c, c * 0.03); }
  if (kind === 'dhoti') { g.fillStyle = rgba(border, 0.88); g.fillRect(x0, y0 + c * 0.9, c, c * 0.045); g.fillStyle = rgba('#d9b24a', 0.9); g.fillRect(x0, y0 + c * 0.945, c, c * 0.014); g.fillRect(x0, y0 + c * 0.885, c, c * 0.01); const dg = g.createLinearGradient(0, y0 + c * 0.6, 0, y0 + c); dg.addColorStop(0, 'rgba(90,60,30,0)'); dg.addColorStop(1, 'rgba(90,60,30,0.28)'); g.fillStyle = dg; g.fillRect(x0, y0 + c * 0.6, c, c * 0.4); }
  if (kind === 'sash') { g.fillStyle = rgba('#d9b24a', 0.85); g.fillRect(x0, y0 + c * 0.08, c, c * 0.04); g.fillRect(x0, y0 + c * 0.88, c, c * 0.04); }
  // grime and soft stains
  for (let i = 0; i < 18; i++) { const [x, y] = P(R(), 0.5 + R() * 0.5); const r = (6 + R() * 16) * u; const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(60,40,20,0.1)'); gg.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.restore();
}
function paintLeather(g, c, cell, base, R) {
  const [x0, y0] = cellRect(c, cell); const u = c / 128; g.fillStyle = base; g.fillRect(x0, y0, c, c);
  const gr = g.createLinearGradient(0, y0, 0, y0 + c); gr.addColorStop(0, shade(base, 1.15)); gr.addColorStop(1, shade(base, 0.7)); g.fillStyle = gr; g.fillRect(x0, y0, c, c);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,235,200' : '0,0,0'},${0.04 + R() * 0.06})`; g.beginPath(); g.ellipse(x0 + R() * c, y0 + R() * c, (1 + R() * 3) * u, (1 + R() * 2) * u, R() * 3, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(240,220,170,0.55)'; g.lineWidth = 1.2 * u; g.setLineDash([3 * u, 3 * u]); g.beginPath(); g.moveTo(x0, y0 + c * 0.3); g.lineTo(x0 + c, y0 + c * 0.3); g.moveTo(x0, y0 + c * 0.7); g.lineTo(x0 + c, y0 + c * 0.7); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y0 + c * 0.86, c, c * 0.14); // the sole
}
export const metalBand = (b) => (b < 0.07 || b > 0.93 ? 'brass' : b > 0.46 && b < 0.52 ? 'brass' : 'steel');
function paintMetal(g, c, cell, kind, R) {
  const [x0, y0] = cellRect(c, cell); const u = c / 128; const steel = kind === 'bronze' ? '#9a7a46' : '#8b9096';
  g.fillStyle = steel; g.fillRect(x0, y0, c, c);
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${R() < 0.5 ? '255,255,255' : '20,20,30'},${0.02 + R() * 0.04})`; g.lineWidth = (0.6 + R() * 1.2) * u; const y = y0 + R() * c; g.beginPath(); g.moveTo(x0 + R() * c * 0.5, y); g.lineTo(x0 + c * (0.5 + R() * 0.5), y + (R() - 0.5) * 2 * u); g.stroke(); }
  for (let j = 1; j <= 4; j++) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x0, y0 + c * (0.07 + j * 0.17) - u, c, 2.2 * u); g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x0, y0 + c * (0.07 + j * 0.17) + 1.5 * u, c, 1.2 * u); }
  g.fillStyle = '#b8903c'; g.fillRect(x0, y0, c, c * 0.07); g.fillRect(x0, y0 + c * 0.93, c, c * 0.07); g.fillRect(x0, y0 + c * 0.46, c, c * 0.06);
  for (let i = 0; i < 12; i++) for (const yy of [0.035, 0.965, 0.49]) { g.fillStyle = 'rgba(60,40,10,0.7)'; g.beginPath(); g.arc(x0 + (i + 0.5) * c / 12, y0 + yy * c, 1.5 * u, 0, TAU); g.fill(); }
}
// Hair cell: strands run down the cell (v = crown to tip). Dark roots, many fine strands with a sheen band, grey flecks for age (via the base colour), and a
// frayed lower edge cut into the alpha channel so the shell reads as wisps, not a swim cap (the atlas material alpha-tests, with alpha-to-coverage).
function paintHair(g, c, cell, base, R) {
  const [x0, y0] = cellRect(c, cell); const u = c / 128; g.fillStyle = shade(base, 0.7); g.fillRect(x0, y0, c, c);
  const lite = hexMix(base, '#e9d6b8', 0.34); const dk = hexMix(base, '#000000', 0.55);
  for (let i = 0; i < 520; i++) {
    const x = x0 + R() * c; const w = (0.5 + R() * 1.1) * u; const t = R();
    const col = t < 0.5 ? rgba(dk, 0.35 + R() * 0.3) : t < 0.88 ? rgba(base, 0.5 + R() * 0.4) : rgba(lite, 0.18 + R() * 0.3);
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + (R() - 0.5) * 5 * u, y0 + c * 0.33, x + (R() - 0.5) * 6 * u, y0 + c * 0.66, x + (R() - 0.5) * 4 * u, y0 + c); g.stroke();
  }
  const sh = g.createLinearGradient(0, y0, 0, y0 + c); sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(0.18, 'rgba(0,0,0,0.12)'); sh.addColorStop(0.5, rgba(lite, 0.16)); sh.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = sh; g.fillRect(x0, y0, c, c); // dark roots, a sheen band
  g.save(); g.globalCompositeOperation = 'destination-out'; // frayed ends: each strand column stops at its own length
  for (let x = 0; x < c; x += Math.max(1, u * 0.9)) { const cut = y0 + c * (0.8 + R() * R() * 0.2); g.fillRect(x0 + x, cut, Math.max(1, u * 0.9), y0 + c - cut + 1); }
  g.restore();
}

// ---- Shared maps: normal and roughness/occlusion/metal, from height fields computed per cell ----
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };
function vnoise(x, y, s) { const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi; const a = hash(xi, yi, s); const b = hash(xi + 1, yi, s); const c2 = hash(xi, yi + 1, s); const d = hash(xi + 1, yi + 1, s); const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v; }
export function cellKind(cx, cy) {
  if (cx < 2 && cy < 2) return 'face'; if (cx === 2 && cy === 0) return 'skin'; if (cx === 3 && cy === 0) return 'tunic'; if (cx === 0 && cy === 2) return 'dhoti'; if (cx === 1 && cy === 2) return 'leather';
  if (cx === 2 && cy === 2) return 'metal'; if (cx === 3 && cy === 2) return 'sash'; if (cx === 2 && cy === 1) return 'hair'; if (cx === 3 && cy === 1) return 'cloth2'; return 'misc';
}
export function buildHeightRough(S) { // returns { h: Float32Array (S*S), orm: Uint8Array (S*S*4) }
  const h = new Float32Array(S * S); const orm = new Uint8Array(S * S * 4); const c = S / 4; const u = c / 128;
  const fm = faceMap(S); const eyes = [-1, 1].map((s) => ({ x: fm.px(s * LANDMARK.eyeX), y: fm.py(LANDMARK.eyeY), rx: LANDMARK.eyeW * fm.unit, ry: 0.07 * fm.unit }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = Math.min(3, Math.floor(x / c)); const cy = Math.min(3, Math.floor(y / c)); const kind = cellKind(cx, cy); const lx = (x - cx * c) / c; const ly = (y - cy * c) / c;
    let ht = 0; let ao = 1; let rough = 0.8; let metal = 0;
    switch (kind) {
      case 'face': case 'skin': { ht = 0.5 + (vnoise(x / (1.6 * u), y / (1.6 * u), 1) - 0.5) * 0.45 + (vnoise(x / (5 * u), y / (5 * u), 2) - 0.5) * 0.3; rough = 0.5 + 0.12 * vnoise(x / (9 * u), y / (9 * u), 3); break; }
      case 'tunic': case 'sash': case 'cloth2': { const p = 1.3 * u; const warp = 0.5 + 0.5 * Math.sin(x / p * TAU / 2); const weft = 0.5 + 0.5 * Math.sin(y / p * TAU / 2 + (Math.floor(x / p) % 2) * Math.PI); ht = 0.4 + 0.1 * warp * weft + 0.25 * (vnoise(x / (9 * u), y / (9 * u), 4) - 0.5) + 0.12 * (vnoise(x / (2.5 * u), y / (2.5 * u), 12) - 0.5); rough = 0.88 + 0.08 * vnoise(x / (3 * u), y / (3 * u), 5); if (kind === 'cloth2') ht += 0.08 * Math.sin((y / c) * TAU * 7 + (x / c) * 3); break; }
      case 'dhoti': { const p = 1.6 * u; const weave = 0.5 + 0.5 * Math.sin(x / p * Math.PI) * Math.sin(y / p * Math.PI); const fold = 0.5 + 0.5 * Math.sin(lx * TAU * 9 + 2 * vnoise(lx * 6, ly * 3, 6)); ht = 0.3 + 0.07 * weave + 0.55 * fold * (0.5 + 0.5 * (1 - ly)) + 0.1 * (vnoise(x / (4 * u), y / (4 * u), 13) - 0.5); rough = 0.9; ao = 0.82 + 0.18 * fold; break; }
      case 'leather': { const n1 = vnoise(x / (3.2 * u), y / (3.2 * u), 7); const n2 = vnoise(x / (1.4 * u), y / (1.4 * u), 8); ht = 0.4 + 0.35 * Math.abs(n1 - 0.5) * 2 + 0.15 * n2; rough = 0.55 + 0.2 * n2; break; }
      case 'metal': { const streak = vnoise(x / (40 * u), y / (0.9 * u), 9); ht = 0.5 + 0.12 * streak; const plate = (ly * 5.88) % 1; ht -= plate < 0.04 ? 0.35 : 0; const band = ly < 0.07 || ly > 0.93 || (ly > 0.46 && ly < 0.52); rough = band ? 0.32 : 0.36 + 0.2 * streak; metal = band ? 1 : 0.85; const rv = ((lx * 12) % 1) - 0.5; const rvy = [0.035, 0.965, 0.49].some((yy) => Math.abs(ly - yy) < 0.02); if (rvy && Math.abs(rv) < 0.12) ht += 0.4; break; }
      case 'hair': { ht = 0.5 + 0.3 * (vnoise(x / (1.2 * u), y / (24 * u), 10) - 0.5) + 0.2 * Math.sin(x / u * 1.4); rough = 0.42 + 0.12 * vnoise(x / (2 * u), y / (20 * u), 11); break; }
      default: ht = 0.5; rough = 0.8;
    }
    if (kind === 'face') { // wet eyes, soft lips, matte brows
      for (const e of eyes) { const dx = (x - e.x) / e.rx; const dy = (y - e.y) / e.ry; if (dx * dx + dy * dy < 1) { rough = 0.1; ht = 0.55; ao = 1; } else if (dx * dx + dy * dy < 2.4) { ao = 0.86; } }
      const mx = (x - fm.px(0)) / (LANDMARK.mouthW * fm.unit); const my = (y - fm.py(LANDMARK.mouthY)) / (0.1 * fm.unit); if (mx * mx + my * my < 1) { rough = 0.36; ao = 0.9; }
      const nx = (x - fm.px(0)) / (0.22 * fm.unit); const ny = (y - fm.py(6.78)) / (0.08 * fm.unit); if (nx * nx + ny * ny < 1) ao = 0.72;
    }
    h[y * S + x] = ht; const o = (y * S + x) * 4; orm[o] = Math.round(255 * ao); orm[o + 1] = Math.round(255 * Math.min(1, rough)); orm[o + 2] = Math.round(255 * metal); orm[o + 3] = 255;
  }
  return { h, orm };
}
export function heightToNormal(h, S, strengthFor) {
  const out = new Uint8Array(S * S * 4); const c = S / 4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = Math.min(3, Math.floor(x / c)); const cy = Math.min(3, Math.floor(y / c)); const k = strengthFor(cellKind(cx, cy));
    const xl = Math.max(x - 1, cx * c); const xr = Math.min(x + 1, (cx + 1) * c - 1); const yu = Math.max(y - 1, cy * c); const yd = Math.min(y + 1, (cy + 1) * c - 1);
    const dx = (h[y * S + xr] - h[y * S + xl]) * k; const dy = (h[yd * S + x] - h[yu * S + x]) * k; const l = Math.hypot(dx, dy, 1);
    const o = (y * S + x) * 4; out[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); out[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); out[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); out[o + 3] = 255; // glTF: +y is up, v runs down, so g is flipped here
  }
  return out;
}
export const NORMAL_STRENGTH = { face: 0.55, skin: 0.55, tunic: 1.1, sash: 1.1, cloth2: 1.4, dhoti: 1.8, leather: 2.6, metal: 1.6, hair: 1.2, misc: 0 };
