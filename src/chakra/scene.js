// Chakra rings: geometry and canvas drawing. No DOM here: drawScene() takes any 2D context, so Node tests run it with a stub.
// Three concentric rings, outside in: yugas, eras, events. The ring that is open is thick; the others are thin. A core of decorative rings sits inside.
// Angles run clockwise from the top (12 o'clock is where the open segment aligns). World units: the outer rim has radius 1.
import { compactYear } from './model.js';
import { bloomEase } from './spring.js';

export const TAU = Math.PI * 2;
export const THIN = 0.085, THICK = 0.3, RING_GAP = 0.02, GAP = 0.035;
export const SLOT_PX = 50; // one event slot on the event ring is at least this wide, so a node keeps a 44 px target
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const norm = (a) => { const t = ((a % TAU) + TAU) % TAU; return t > Math.PI ? t - TAU : t; }; // (-pi, pi]

// ---- layout ----
// open = 0, 1 or 2: which ring is thick. Returns [{inner, outer}] for the three rings.
export function ringLayout(open) { return layoutFrom([0, 1, 2].map((i) => (i === open ? THICK : THIN))); }
// The same, from three thicknesses (the view animates these, so the rings grow and shrink continuously).
export function layoutFrom(th) {
  let r = 1; const out = [];
  for (let i = 0; i < 3; i++) { out.push({ outer: r, inner: r - th[i] }); r -= th[i] + RING_GAP; }
  return out;
}
export const coreRadius = (layout) => layout[2].inner - 0.03;
// Where the dial sits. The page's top bar floats over the stage, so the dial is centred in what is left below it and fills the width.
export function dialGeom(W, H, top = 0, bottom = 0) { const avail = Math.max(60, H - top - bottom); return { R: Math.min(W, avail) * 0.48, cx: W / 2, cy: top + avail / 2 }; }
// Easing and springs live in spring.js: the rings are driven by springs, not by a fixed-length tween.

// ---- segment rings (yugas, eras) ----
export const segSpan = (i, n, rot) => [rot + (TAU * i) / n + GAP / 2, rot + (TAU * (i + 1)) / n - GAP / 2];
export const alignRot = (i, n) => -(TAU * (i + 0.5)) / n; // the rotation that puts segment i's middle at the top
export const thetaOf = (dx, dy) => (Math.atan2(dx, -dy) + TAU) % TAU;
export function segAt(theta, n, rot) { if (n < 1) return -1; const p = (((theta - rot) % TAU) + TAU) % TAU; return Math.min(n - 1, Math.floor(p / (TAU / n))); }

// ---- event ring: a window of at most `cap` slots over any number of events, turned by a fractional position ----
export function ringCap(R, layoutRing) { const rad = R * (layoutRing.outer + layoutRing.inner) / 2; return clamp(Math.floor((TAU * rad) / SLOT_PX), 8, 24); }
export const clampPos = (n, cap, pos) => (n <= cap ? (n - 1) / 2 : clamp(pos, 0, n - 1)); // a short list is laid out still around the top; a long one turns
export function visibleRange(n, cap, pos) { if (n < 1) return [0, -1]; return [Math.max(0, Math.ceil(pos - cap / 2)), Math.min(n - 1, Math.ceil(pos + cap / 2) - 1)]; }
// A short list is spread wider (up to 2.5 slots apart) so its labels do not touch; a long one always uses one slot per step.
export const stepOf = (n, cap) => (n > cap ? TAU / cap : Math.min(TAU / Math.max(n, 1), (TAU / cap) * 2.5));
export const slotAngle = (i, pos, cap, n = Infinity) => (i - pos) * stepOf(n, cap);
export const slotAlpha = (i, pos, cap, n) => (n <= cap ? 1 : clamp(cap / 2 - Math.abs(i - pos), 0, 1)); // nodes fade in and out at the bottom of a long ring
export const nearestSlot = (pos, n) => clamp(Math.round(pos), 0, Math.max(0, n - 1));

// Greedy word wrap for the centre readout. Returns at most maxLines strings, the last ending in an ellipsis when text was cut.
export function wrapLines(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let line = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!line) line = w; else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; if (lines.length === maxLines) { line = ''; words.length = i; break; } }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(' ').split(/\s+/).length; let cut = used < String(text).split(/\s+/).filter(Boolean).length;
  const out = lines.map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + '…' : l));
  if (cut && out.length) { const last = out[out.length - 1]; out[out.length - 1] = last.endsWith('…') ? last : (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…'; }
  return out;
}

// ---- hit testing (screen px) ----
// s: the same state object drawScene() takes. Returns {kind: 'hub'|'segment'|'node'|'none', ring, index}.
export function hitTest(s, x, y) {
  const R = s.R, dx = x - s.cx, dy = y - s.cy, r = Math.hypot(dx, dy) / R;
  if (s.nodes && s.L === 2) { let best = null, bd = 1e9; for (const nd of s.nodes) { const d = Math.hypot(nd.x - x, nd.y - y); if (d <= 26 && d < bd) { best = nd; bd = d; } } if (best) return { kind: 'node', ring: 2, index: best.k }; }
  if (r < coreRadius(s.layout) - 0.05) return { kind: 'hub', ring: -1, index: -1 };
  for (let j = 0; j <= Math.min(s.L, 1); j++) {
    const b = s.layout[j]; const pad = (b.outer - b.inner) < 0.15 ? 0.02 : 0;
    if (r <= b.outer + pad && r >= b.inner - pad) { const n = s.rings[j]?.n || 0; if (!n) return { kind: 'none', ring: j, index: -1 }; return { kind: 'segment', ring: j, index: segAt(thetaOf(dx, dy), n, s.rot[j]) }; }
  }
  return { kind: 'none', ring: -1, index: -1 };
}

// ---- drawing ----
export const KIND_COLOR = { History: '#28e0d0', Tradition: '#ffb42e', Invented: '#ff8a6a' };
const YUGA_HUE = ['#fff3dc', '#ffb42e', '#28e0d0', '#ff6a3d', '#ffe9b0'];
const GOLD = '#ffd36a';

function band(ctx, cx, cy, ro, ri, a0, a1) { ctx.beginPath(); ctx.arc(cx, cy, ro, a0 - Math.PI / 2, a1 - Math.PI / 2); ctx.arc(cx, cy, ri, a1 - Math.PI / 2, a0 - Math.PI / 2, true); ctx.closePath(); }
const FIT = new Map(); // text fitting measures the font many times; the answer is cached (width rounded down to 4 px so a ring that is growing still hits the cache)
function textFit(ctx, text, size, maxW, weight = 700) {
  const q = Math.max(8, Math.floor(maxW / 4) * 4); const key = `${weight}|${size}|${q}|${text}`; const hit = FIT.get(key);
  if (hit) { ctx.font = hit.font; return hit.t; }
  let px = size; ctx.font = `${weight} ${px}px system-ui, sans-serif`;
  const w = (t) => { const m = ctx.measureText?.(t); return m && m.width > 0 ? m.width : t.length * px * 0.58; };
  while (px > 9 && w(text) > q) { px -= 1; ctx.font = `${weight} ${px}px system-ui, sans-serif`; }
  let t = text; while (t.length > 3 && w(t) > q) t = t.slice(0, -2).trimEnd() + '…';
  if (FIT.size > 400) FIT.clear(); FIT.set(key, { t, font: ctx.font });
  return t;
}
function tangentText(ctx, text, cx, cy, r, theta, size, maxW, color, weight) {
  const a = theta - Math.PI / 2; ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  const th = ((theta % TAU) + TAU) % TAU; ctx.rotate(th > Math.PI / 2 && th < (3 * Math.PI) / 2 ? theta + Math.PI : theta);
  const t = textFit(ctx, text, size, maxW, weight); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 0); ctx.restore();
}
function glowBand(ctx, cx, cy, ro, ri, g, color = GOLD) {
  if (g <= 0) return;
  for (const [w, al] of [[16, 0.1], [9, 0.2], [3.5, 0.95]]) { ctx.globalAlpha = al * g; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, ro + 1, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, ri - 1, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
function decorRing(ctx, cx, cy, ro, ri, rot, n) {
  ctx.fillStyle = 'rgba(255,243,220,0.05)'; ctx.beginPath(); ctx.arc(cx, cy, ro, 0, TAU); ctx.arc(cx, cy, ri, 0, TAU, true); ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,200,90,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, ro, 0, TAU); ctx.moveTo(cx + ri, cy); ctx.arc(cx, cy, ri, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot - Math.PI / 2; const long = i % 6 === 0; const r0 = ri + (ro - ri) * (long ? 0.1 : 0.3), r1 = ro - (ro - ri) * (long ? 0.1 : 0.3); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
  ctx.stroke();
}

// Keyboard focus is drawn here, on the dial's own shape: a glowing ring (never a box). The caller draws it only while the keyboard is in use.
function haloStroke(ctx, path) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,211,106,0.35)'; ctx.lineWidth = 12; path(); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 6.5; path(); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.2; path(); ctx.stroke();
}
function haloCircle(ctx, x, y, r) { haloStroke(ctx, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }); }
// The glow that travels once round the ring that has just opened: a bright head with a fading tail. head is 0..1 round the ring, k is its strength.
function comet(ctx, cx, cy, ro, ri, head, k) {
  if (k <= 0.01) return; const rm = (ro + ri) / 2; const w = Math.max(3, (ro - ri) * 0.55); const a1 = head * TAU - Math.PI / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [len, lw, al] of [[1.5, w, 0.1], [1.0, w * 0.7, 0.18], [0.55, w * 0.42, 0.3], [0.22, w * 0.22, 0.6], [0.06, w * 0.12, 0.95]]) {
    ctx.globalAlpha = al * k; ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, rm, a1 - len, a1); ctx.stroke();
  }
  ctx.restore();
}

// Status is shown by shape and icon as well as dimming: open = solid with a play mark, done = double ring with a tick,
// locked = dashed ring with a lock (dimmed), coming soon = dotted ring with the level number (dimmed), info = diamond.
function drawNode(ctx, x, y, e, st, focus, alpha, kbd = false) {
  const col = KIND_COLOR[e.kind] || '#fff3dc';
  const dim = st.code === 'locked' ? 0.5 : st.code === 'planned' ? 0.7 : 1;
  ctx.globalAlpha = alpha * dim;
  if (focus && !kbd) { ctx.strokeStyle = GOLD; ctx.globalAlpha = alpha * dim * 0.6; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.stroke(); ctx.globalAlpha = alpha * dim; } // the chosen event; the bright keyboard halo is drawn by haloCircle
  ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = 'rgba(22,15,58,0.94)';
  if (st.code === 'info') { ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 13, y); ctx.lineTo(x, y + 13); ctx.lineTo(x - 13, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else {
    ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU);
    if (st.code === 'open') { ctx.fillStyle = '#ffb42e'; ctx.fill(); ctx.strokeStyle = '#fff3dc'; ctx.stroke(); ctx.fillStyle = '#1a0f05'; ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x - 4, y + 6); ctx.closePath(); ctx.fill(); }
    else if (st.code === 'done') { ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = '#fff3dc'; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 1.5, y + 5); ctx.lineTo(x + 7, y - 5); ctx.stroke(); }
    else if (st.code === 'locked') { ctx.fill(); ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#fff3dc'; ctx.fillRect(x - 5, y - 1, 10, 8); ctx.lineWidth = 1.8; ctx.strokeStyle = '#fff3dc'; ctx.beginPath(); ctx.arc(x, y - 2, 4, Math.PI, 0); ctx.stroke(); }
    else { ctx.fill(); ctx.setLineDash([1.5, 3.5]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#d9cdf0'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(e.level), x, y); }
  }
  ctx.globalAlpha = 1;
}

// s: { W, H, dpr, top, bottom (px under floating chrome), layout:[3], rot:[ring0, ring1, ring2, core], L (open ring), alpha:[3] (content opacity), glow:[3], dim:[3] (rings behind),
//      par:[3] (parallax scale offsets), bloom (0..1, event nodes), sweep ({ring, head, k} or null), parts (particle pool), kbd (draw the keyboard focus),
//      rings:[{n, labels, sel, chosen, cur, progress:[0..1]}, {n, labels, sel, chosen}], list: {events, idx (indices of the ring list), status(e)}, pos, cap, focus, readout: [title, sub], motion }
export function drawScene(ctx, s) {
  const W = s.W, H = s.H; const { R, cx, cy } = dialGeom(W, H, s.top || 0, s.bottom || 0);
  s.R = R; s.cx = cx; s.cy = cy;
  ctx.setTransform(s.dpr || 1, 0, 0, s.dpr || 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1); g0.addColorStop(0, 'rgba(255,180,60,0.16)'); g0.addColorStop(0.7, 'rgba(120,60,200,0.1)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, TAU); ctx.fill();
  const lay = s.layout; const core = coreRadius(lay) * R; const stats = { nodes: 0, labels: 0 };
  const par = s.par || [0, 0, 0]; const dim = s.dim || [1, 1, 1];
  // core: spokes and petals, turning with the core rotation
  ctx.globalAlpha = s.L === 2 ? 0.3 : 0.7; ctx.strokeStyle = 'rgba(255,200,90,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + s.rot[3] - Math.PI / 2; ctx.moveTo(cx + Math.cos(a) * core * 0.3, cy + Math.sin(a) * core * 0.3); ctx.lineTo(cx + Math.cos(a) * core * 0.95, cy + Math.sin(a) * core * 0.95); }
  ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, core * 0.95, 0, TAU); ctx.moveTo(cx + core * 0.3, cy); ctx.arc(cx, cy, core * 0.3, 0, TAU); ctx.stroke();
  const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 0.2); hub.addColorStop(0, '#fff0b8'); hub.addColorStop(1, '#ff8a2a'); ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, core * 0.17, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;

  for (let j = 2; j >= 0; j--) {
    const ro = lay[j].outer * R, ri = lay[j].inner * R; const open = j === s.L; const info = s.rings[j]; const a = s.alpha ? s.alpha[j] : 1; const rot = s.rot[j];
    ctx.save(); if (par[j]) { const k = 1 + par[j]; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy); } // layered parallax: each ring breathes a little differently
    if (j === 2 && s.L === 2) { // the event ring: a thick band with nodes
      ctx.fillStyle = 'rgba(40,24,90,0.7)'; band(ctx, cx, cy, ro, ri, 0, TAU - 0.0001); ctx.fill(); ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 1.5; ctx.stroke();
      glowBand(ctx, cx, cy, ro, ri, s.glow ? s.glow[2] : 0);
      s.nodes = []; const L = s.list; const n = L ? L.idx.length : 0; const bl = s.bloom == null ? 1 : s.bloom;
      if (L && n) {
        const [lo, hi] = visibleRange(n, s.cap, s.pos); const nodeR = ro - 34, labR = ro - 10, SPAN = 0.6;
        for (let k = lo; k <= hi; k++) {
          const e = L.events[L.idx[k]]; const st = L.status(e); const al = slotAlpha(k, s.pos, s.cap, n) * a; if (al <= 0.02) continue;
          const delay = (Math.min(Math.abs(k - s.pos), 12) / 12) * SPAN; const u = clamp(bl * (1 + SPAN) - delay, 0, 1); if (u <= 0.01) { s.nodes.push({ k, x: -999, y: -999 }); continue; } // the ripple starts at the top and spreads round both ways
          const g = bloomEase(u);
          const th = slotAngle(k, s.pos, s.cap, n) + rot; const aa = th - Math.PI / 2; const rr = ri + (nodeR - ri) * g; const x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr;
          ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.05, g), Math.max(0.05, g)); ctx.translate(-x, -y);
          drawNode(ctx, x, y, e, st, k === s.focus, al * clamp(u * 1.6, 0, 1), s.kbd); ctx.restore(); stats.nodes++; s.nodes.push({ k, x, y });
          if (k === s.focus && s.kbd && u >= 1) { ctx.globalAlpha = al; haloCircle(ctx, x, y, 21); ctx.globalAlpha = 1; }
          ctx.globalAlpha = al * clamp(u * 1.6 - 0.4, 0, 1); ctx.fillStyle = '#e6dcf7'; ctx.font = '700 9.5px system-ui, sans-serif'; ctx.fillText(compactYear(e.year), cx + Math.cos(aa) * labR, cy + Math.sin(aa) * labR); ctx.globalAlpha = 1; stats.labels++;
        }
      }
      if (s.sweep && s.sweep.ring === 2) comet(ctx, cx, cy, ro, ri, s.sweep.head, s.sweep.k);
      ctx.restore(); continue;
    }
    if (j > s.L || !info || !info.n) { ctx.globalAlpha = dim[j]; decorRing(ctx, cx, cy, ro, ri, rot, j === 1 ? 60 : 48); ctx.globalAlpha = 1; ctx.restore(); continue; }
    // a segment ring: yugas or eras (a ring that is still fading in shows its turning decoration underneath)
    if (a < 1) { ctx.globalAlpha = dim[j]; decorRing(ctx, cx, cy, ro, ri, rot, j === 1 ? 60 : 48); }
    const n = info.n; const thick = (ro - ri) > 30; const ad = a * dim[j];
    for (let i = 0; i < n; i++) {
      const [a0, a1] = segSpan(i, n, rot); const chosen = i === info.chosen; const sel = open && i === info.sel;
      band(ctx, cx, cy, ro, ri, a0, a1);
      ctx.globalAlpha = ad * (open ? (sel ? 0.38 : 0.2) : chosen ? 0.55 : 0.1); ctx.fillStyle = j === 0 ? YUGA_HUE[i % 5] : GOLD; ctx.fill();
      ctx.globalAlpha = ad; ctx.strokeStyle = sel || chosen ? '#ffffff' : 'rgba(255,243,220,0.6)'; ctx.lineWidth = sel || chosen ? 2.4 : 1.2; ctx.stroke();
      if (sel && s.kbd) { ctx.globalAlpha = a; haloStroke(ctx, () => band(ctx, cx, cy, ro + 1, ri - 1, a0 - 0.004, a1 + 0.004)); ctx.globalAlpha = ad; }
      if (thick) {
        const mid = (a0 + a1) / 2; const arc = (a1 - a0) * ((ro + ri) / 2); const done = info.progress ? info.progress[i] : null;
        if (done != null && done > 0) { ctx.strokeStyle = '#28e0d0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, ri + 5, a0 - Math.PI / 2 + 0.03, a0 - Math.PI / 2 + 0.03 + (a1 - a0 - 0.06) * done); ctx.stroke(); }
        tangentText(ctx, info.labels[i] || '', cx, cy, (ro + ri) / 2 + 1, mid, s.W < 480 ? 13 : 15, Math.max(30, arc - 14), '#fff3dc', 700); stats.labels++;
        if (i === info.cur) { ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, ro - 2.5, a0 - Math.PI / 2 + 0.05, a1 - Math.PI / 2 - 0.05); ctx.stroke(); } // you are here
      } else if (i === info.cur) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, ro - 1.5, a0 - Math.PI / 2 + 0.05, a1 - Math.PI / 2 - 0.05); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    if (open) glowBand(ctx, cx, cy, ro, ri, s.glow ? s.glow[j] : 0);
    if (s.sweep && s.sweep.ring === j) comet(ctx, cx, cy, ro, ri, s.sweep.head, s.sweep.k);
    ctx.restore();
  }
  // dust of light
  const P = s.parts;
  if (P) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffe3a0'; for (let i = 0; i < P.n; i++) { if (P.life[i] <= 0) continue; const f = P.life[i] / P.max[i]; ctx.globalAlpha = 0.85 * f * f; ctx.beginPath(); ctx.arc(P.x[i], P.y[i], P.size[i], 0, TAU); ctx.fill(); } ctx.restore(); }
  // alignment mark at the top: where the chosen segment locks in
  const my = cy - R - 6; ctx.fillStyle = GOLD; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 9, my - 10); ctx.lineTo(cx + 9, my - 10); ctx.lineTo(cx, my + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  // readout in the middle: short title and year
  if (s.readout && s.readout[0]) {
    const lines = wrapLines(s.readout[0], 16, 2); const base = cy - (lines.length - 1) * 8 - (s.readout[1] ? 8 : 0);
    ctx.fillStyle = '#fff3dc'; ctx.font = '700 13px system-ui, sans-serif'; lines.forEach((l, i) => ctx.fillText(l, cx, base + i * 16));
    if (s.readout[1]) { ctx.fillStyle = '#ffe9b0'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(s.readout[1], cx, base + lines.length * 16 + 2); }
  }
  s.stats = stats; ctx.globalAlpha = 1;
  return stats;
}
