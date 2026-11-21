// Chakra geometry and canvas drawing. No DOM here: drawScene() takes any 2D context, so Node tests run it with a stub and count the calls.
// World units: the wheel has radius 1 and y grows down. Angles run clockwise from the top. Five equal sectors, one per yuga.
// (Equal sectors on purpose: the wheel does not claim the lengths of the ages.)
import { YUGAS } from './model.js';

const TAU = Math.PI * 2;
export const SECTOR = TAU / 5, GAP = 0.035;
export const R_TRACK = 0.66, R_BAND_IN = 0.8, R_BAND_OUT = 0.94, R_RIM = 1;
export const CELL = 40; // px: events closer than this merge into one cluster
export const MAX_LABELS = 40;
const pt = (r, th) => [r * Math.sin(th), -r * Math.cos(th)];
export const sectorStart = (i) => i * SECTOR + GAP, sectorEnd = (i) => (i + 1) * SECTOR - GAP;
export const sectorMid = (i) => (sectorStart(i) + sectorEnd(i)) / 2;

// Positions of n events along a yuga's track, in order. Typed arrays: 5,000 events cost 40 KB.
export function buildPositions(n, yi) {
  const xs = new Float32Array(n), ys = new Float32Array(n); const a = sectorStart(yi), b = sectorEnd(yi);
  for (let j = 0; j < n; j++) { const [x, y] = pt(R_TRACK, a + (b - a) * ((j + 0.5) / n)); xs[j] = x; ys[j] = y; }
  return { xs, ys };
}

// ---- camera ----
export function viewOf(cam, W, H, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), k = cam.k;
  return {
    k, W, H,
    px: (x, y) => { const dx = x - cam.cx, dy = y - cam.cy; return W / 2 + (dx * c - dy * s) * k; },
    py: (x, y) => { const dx = x - cam.cx, dy = y - cam.cy; return H / 2 + (dx * s + dy * c) * k; },
    unproject: (sx, sy) => { const dx = (sx - W / 2) / k, dy = (sy - H / 2) / k; return [cam.cx + dx * c + dy * s, cam.cy - dx * s + dy * c]; },
  };
}
export const cameraWhole = (W, H) => ({ cx: 0, cy: 0, k: 0.46 * Math.min(W, H) });
export function cameraYuga(yi, W, H) {
  const a = sectorStart(yi), b = sectorEnd(yi); const P = [];
  for (const r of [0.5, R_RIM]) for (const t of [a, (a + b) / 2, b]) P.push(pt(r, t));
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.min((W * 0.88) / (x1 - x0), (H * 0.88) / (y1 - y0)) };
}
export const ZOOM_STEP = 2.2;
// 0 whole wheel, 1 one yuga, 2 close in on events.
export const levelOf = (k, k1) => (k < k1 * 0.7 ? 0 : k < k1 * 3 ? 1 : 2);
export function maxZoom(k1, n) { return Math.max(k1 * 12, (60 * Math.max(n, 1)) / (R_TRACK * (SECTOR - 2 * GAP))); }
export function clampCamera(cam, k1, kMax, k0) {
  cam.k = Math.min(kMax, Math.max(k0, cam.k));
  const lim = 1.1; cam.cx = Math.max(-lim, Math.min(lim, cam.cx)); cam.cy = Math.max(-lim, Math.min(lim, cam.cy));
  return cam;
}

// ---- clustering ----
// Bins the events that are on screen into CELL-sized squares. A bin with one event is a single node, a bin with more is a cluster.
// Work is O(events on screen) and the result is at most (W/CELL)*(H/CELL) items, however many events the yuga holds.
export function clusterVisible(pos, view, mask = null, selected = -1) {
  const { xs, ys } = pos; const n = xs.length; const W = view.W, H = view.H;
  const cells = new Map(); const m = CELL;
  for (let i = 0; i < n; i++) {
    if (mask && !mask[i]) continue;
    const sx = view.px(xs[i], ys[i]), sy = view.py(xs[i], ys[i]);
    if (sx < -m || sy < -m || sx > W + m || sy > H + m) continue;
    const key = Math.floor(sx / m) * 4096 + Math.floor(sy / m);
    let c = cells.get(key);
    if (!c) { c = { n: 0, sx: 0, sy: 0, first: i, last: i, hasSel: false }; cells.set(key, c); }
    c.n++; c.sx += sx; c.sy += sy; c.last = i; if (i === selected) c.hasSel = true;
  }
  const items = [];
  for (const c of cells.values()) items.push({ n: c.n, x: c.sx / c.n, y: c.sy / c.n, first: c.first, last: c.last, hasSel: c.hasSel });
  return items;
}

// ---- drawing ----
const KIND_COLOR = { History: '#28e0d0', Tradition: '#ffb42e', Invented: '#ff8a6a' };
const YUGA_HUE = ['#fff3dc', '#ffb42e', '#28e0d0', '#ff6a3d', '#ffe9b0'];

function arcPath(ctx, v, r, a, b, ccw = false) { ctx.arc(v.px(0, 0), v.py(0, 0), r * v.k, a - Math.PI / 2, b - Math.PI / 2, ccw); }

// s: { W, H, cam, rot, alpha, t, motion, yugas:[{count, levels, done}], sel (yuga index), cur (yuga index), pos, events, mask, selIdx, status(ev) -> {code}, level (0,1,2), hits: [] (filled) }
export function drawScene(ctx, s) {
  const v = viewOf(s.cam, s.W, s.H, s.rot || 0); const k = v.k; const cx = v.px(0, 0), cy = v.py(0, 0);
  const rot = s.rot || 0;
  ctx.setTransform(s.dpr || 1, 0, 0, s.dpr || 1, 0, 0);
  ctx.clearRect(0, 0, s.W, s.H);
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.lineCap = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // soft glow behind the hub
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * 1.05);
  g.addColorStop(0, 'rgba(255,180,60,0.20)'); g.addColorStop(0.6, 'rgba(120,60,200,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, k * 1.05, 0, TAU); ctx.fill();
  // rim with tick marks
  ctx.strokeStyle = 'rgba(255,200,90,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, k * R_RIM, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,90,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, k * 0.975, 0, TAU); ctx.stroke();
  if (k < 2500) { // tick marks only while the rim is small; they are decoration
    ctx.beginPath(); for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU + rot - Math.PI / 2; ctx.moveTo(cx + Math.cos(a) * k * 0.955, cy + Math.sin(a) * k * 0.955); ctx.lineTo(cx + Math.cos(a) * k * 0.975, cy + Math.sin(a) * k * 0.975); }
    ctx.stroke();
  }
  // inner decoration: turning spokes and petals (the only moving layers)
  const spin = s.motion ? s.t * 0.035 : 0;
  ctx.strokeStyle = 'rgba(255,200,90,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + spin + rot - Math.PI / 2; ctx.moveTo(cx + Math.cos(a) * k * 0.13, cy + Math.sin(a) * k * 0.13); ctx.lineTo(cx + Math.cos(a) * k * 0.46, cy + Math.sin(a) * k * 0.46); }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, k * 0.46, 0, TAU); ctx.moveTo(cx + k * 0.13, cy); ctx.arc(cx, cy, k * 0.13, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,224,138,0.55)'; ctx.beginPath();
  for (let i = 0; i < 16; i++) { // petals, turning the other way
    const a = (i / 16) * TAU - spin * 0.7 + rot - Math.PI / 2; const ca = Math.cos(a), sa = Math.sin(a), pa = -sa, pb = ca;
    const r0 = 0.5 * k, r1 = 0.6 * k, w = 0.045 * k;
    ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.quadraticCurveTo(cx + ca * (r0 + r1) / 2 + pa * w, cy + sa * (r0 + r1) / 2 + pb * w, cx + ca * r1, cy + sa * r1);
    ctx.quadraticCurveTo(cx + ca * (r0 + r1) / 2 - pa * w, cy + sa * (r0 + r1) / 2 - pb * w, cx + ca * r0, cy + sa * r0);
  }
  ctx.stroke();
  const hub = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * 0.08);
  hub.addColorStop(0, '#fff0b8'); hub.addColorStop(1, '#ff8a2a'); ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, k * 0.075, 0, TAU); ctx.fill();

  // yuga bands
  const pulse = s.motion ? 0.5 + 0.5 * Math.sin(s.t * 2) : 0.8;
  for (let i = 0; i < 5; i++) {
    const a = sectorStart(i) + rot, b = sectorEnd(i) + rot, hue = YUGA_HUE[i]; const sel = i === s.sel;
    ctx.beginPath(); arcPath(ctx, v, R_BAND_OUT, a, b); arcPath(ctx, v, R_BAND_IN, b, a, true); ctx.closePath();
    ctx.globalAlpha = (s.alpha ?? 1) * (sel ? 0.34 : 0.17); ctx.fillStyle = hue; ctx.fill();
    ctx.globalAlpha = s.alpha ?? 1; ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,243,220,0.55)'; ctx.lineWidth = sel ? 2.4 : 1.2; ctx.stroke();
    if (i === s.cur) { // glowing ring for the current yuga: three widening passes
      for (const [w, al] of [[14, 0.10], [8, 0.18], [3, 0.9]]) {
        ctx.globalAlpha = (s.alpha ?? 1) * al * (w === 3 ? 1 : pulse + 0.4); ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = w;
        ctx.beginPath(); arcPath(ctx, v, R_BAND_OUT + 0.012, a, b); arcPath(ctx, v, R_BAND_IN - 0.012, b, a, true); ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = s.alpha ?? 1;
    }
    // faint event track
    ctx.strokeStyle = 'rgba(255,243,220,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([2, 6]); ctx.beginPath(); arcPath(ctx, v, R_TRACK, a, b); ctx.stroke(); ctx.setLineDash([]);
    // text on the band and track (a picture of facts that are also in the lists)
    const [mx, my] = pt(1, sectorMid(i) + rot); const lx = v.px(mx * 0.87, my * 0.87), ly = v.py(mx * 0.87, my * 0.87);
    if (lx > -60 && lx < s.W + 60 && ly > -30 && ly < s.H + 30) {
      ctx.fillStyle = '#fff3dc'; ctx.font = `700 ${s.W < 480 ? 13 : 15}px Georgia, serif`; ctx.fillText(YUGAS[i].short + (i === s.cur ? ' (you are here)' : ''), lx, ly);
      const y = s.yugas[i]; if (y && s.level === 0) { ctx.font = `600 ${s.W < 480 ? 11 : 12}px system-ui, sans-serif`; ctx.fillStyle = '#d9cdf0'; const [tx, ty] = pt(0.74, sectorMid(i) + rot); const al = Math.abs(tx) > 0.5 ? (tx > 0 ? 'right' : 'left') : 'center'; ctx.textAlign = al; const ax = v.px(tx, ty), ay = v.py(tx, ty); ctx.fillText(`${y.count} events`, ax, ay - 8); ctx.fillText(`${y.done}/${y.levels} levels done`, ax, ay + 8); ctx.textAlign = 'center'; }
    }
  }

  // events of the selected yuga (only when zoomed in)
  s.hits.length = 0; const stats = { clusters: 0, singles: 0, labels: 0 };
  if (s.level >= 1 && s.pos && s.events) {
    const items = clusterVisible(s.pos, v, s.mask, s.selIdx);
    const rects = [];
    for (const it of items) {
      if (it.n > 1) {
        stats.clusters++; const r = 13 + Math.min(8, Math.log2(it.n));
        ctx.fillStyle = 'rgba(22,15,58,0.92)'; ctx.strokeStyle = it.hasSel ? '#fff' : '#ffe9b0'; ctx.lineWidth = it.hasSel ? 3 : 1.6;
        ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff3dc'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillText(it.n > 999 ? '999+' : String(it.n), it.x, it.y);
        s.hits.push({ x: it.x, y: it.y, r: Math.max(r, 22), cluster: it });
      } else {
        stats.singles++; const e = s.events[it.first]; const st = s.status(e);
        drawNode(ctx, it.x, it.y, e, st, it.hasSel, s);
        s.hits.push({ x: it.x, y: it.y, r: 24, idx: it.first });
        if (stats.labels < MAX_LABELS && (s.level === 2 || it.hasSel)) {
          const text = e.label, sub = `${e.kind}, ${e.year}`; const w = Math.max(text.length * 6.6, sub.length * 5.6) + 8, h = 30;
          const right = it.x < s.W * 0.55; const rx = right ? it.x + 16 : it.x - 16 - w; const ry = it.y - h / 2;
          if (rx < 0 || rx + w > s.W || rects.some((q) => rx < q.x + q.w && rx + w > q.x && ry < q.y + q.h && ry + h > q.y)) continue;
          rects.push({ x: rx, y: ry, w, h }); stats.labels++;
          ctx.textAlign = right ? 'left' : 'right'; const tx = right ? rx + 4 : rx + w - 4;
          ctx.fillStyle = 'rgba(10,7,38,0.8)'; ctx.fillRect(rx, ry, w, h);
          ctx.fillStyle = '#fff3dc'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(text, tx, ry + 9);
          ctx.fillStyle = '#d9cdf0'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(sub, tx, ry + 22); ctx.textAlign = 'center';
        }
      }
    }
  }
  s.stats = stats; ctx.globalAlpha = 1;
  return stats;
}

// Status is shown by shape as well as colour: open = solid with a play mark, done = double ring with a tick,
// locked = dashed ring with a lock, coming soon = dotted ring, info = diamond.
function drawNode(ctx, x, y, e, st, selected, s) {
  const col = KIND_COLOR[e.kind] || '#fff3dc';
  if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke(); }
  ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = 'rgba(22,15,58,0.92)';
  if (st.code === 'info') {
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 10, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    return;
  }
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU);
  if (st.code === 'open') {
    ctx.fillStyle = '#ffb42e'; ctx.fill(); ctx.strokeStyle = '#fff3dc'; ctx.stroke();
    ctx.fillStyle = '#1a0f05'; ctx.beginPath(); ctx.moveTo(x - 3, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x - 3, y + 5); ctx.closePath(); ctx.fill();
    if (s.motion) { ctx.strokeStyle = 'rgba(255,180,46,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 14 + 3 * Math.sin(s.t * 3), 0, TAU); ctx.stroke(); }
  } else if (st.code === 'done') {
    ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.strokeStyle = '#fff3dc'; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 1, y + 4); ctx.lineTo(x + 6, y - 4); ctx.stroke();
  } else if (st.code === 'locked') {
    ctx.fill(); ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#fff3dc'; ctx.fillRect(x - 4, y - 1, 8, 6); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff3dc'; ctx.beginPath(); ctx.arc(x, y - 2, 3, Math.PI, 0); ctx.stroke();
  } else { // planned
    ctx.fill(); ctx.setLineDash([1.5, 3.5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d9cdf0'; ctx.font = '700 9px system-ui, sans-serif'; ctx.fillText(String(e.level), x, y);
  }
}
