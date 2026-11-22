// Hand-painted looking canvas art: tileable textures (brush strokes, ink joints, no photographic noise), the painted sky and the sun.
// Everything is drawn procedurally at load time, so it adds no download. Pure canvas 2D calls: `g` is a CanvasRenderingContext2D.
export function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function shade(hex, k) { // multiply an #rrggbb colour (k < 1 darkens, k > 1 lightens)
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
export function mix(a, b, t) { // blend two #rrggbb colours
  const x = parseInt(a.slice(1), 16); const y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round((x >> s & 255) * (1 - t) + (y >> s & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// Draw `fn` at the nine wrapped offsets so anything crossing an edge reappears on the other side (seamless tiling).
function wrap(g, n, fn) { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) fn(dx, dy); }
function stroke(g, n, x, y, len, ang, w, col, a) {
  wrap(g, n, (dx, dy) => { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(ang) * len, y + dy + Math.sin(ang) * len); g.stroke(); });
  g.globalAlpha = 1;
}
function blot(g, n, x, y, r, col, a) {
  wrap(g, n, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); });
  g.globalAlpha = 1;
}
function wobbleLine(g, n, x0, y0, x1, y1, r, col, w, a) { // a slightly shaky hand-inked line
  const mx = (x0 + x1) / 2 + (r() - 0.5) * n * 0.012; const my = (y0 + y1) / 2 + (r() - 0.5) * n * 0.012;
  wrap(g, n, (dx, dy) => { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + dx, y0 + dy); g.quadraticCurveTo(mx + dx, my + dy, x1 + dx, y1 + dy); g.stroke(); });
  g.globalAlpha = 1;
}

// Masonry: painted blocks with a light top edge, a soft shadow under, and brown ink joints.
export function paintStone(g, n, seed = 1, base = '#efe6d6', ink = '#6e5a42', rows = 4, cols = 2) {
  const r = rng(seed); const bh = n / rows; const bw = n / cols; const sc = n / 256;
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * bw + (j % 2) * bw / 2; const y = j * bh;
    wrap(g, n, (dx, dy) => { g.fillStyle = shade(base, 0.9 + r() * 0.14); g.fillRect(x + dx + 2 * sc, y + dy + 2 * sc, bw - 4 * sc, bh - 4 * sc); });
    for (let k = 0; k < 7; k++) stroke(g, n, x + r() * bw, y + r() * bh, 14 * sc + r() * 20 * sc, r() * 0.3 - 0.15, 3 * sc + r() * 4 * sc, r() < 0.5 ? '#fff6e0' : '#b09870', 0.16);
    wobbleLine(g, n, x + 3 * sc, y + 3 * sc, x + bw - 3 * sc, y + 3 * sc, r, '#fffaf0', 2.4 * sc, 0.8); // lit top edge
    wobbleLine(g, n, x, y + bh - 2 * sc, x + bw, y + bh - 2 * sc, r, '#8a6e4e', 3.2 * sc, 0.3); // shade under
  }
  for (let j = 0; j <= rows; j++) wobbleLine(g, n, 0, j * bh, n, j * bh, r, ink, 3 * sc, 0.85);
  for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) { const x = i * bw + (j % 2) * bw / 2; wobbleLine(g, n, x, j * bh, x, (j + 1) * bh, r, ink, 3 * sc, 0.85); }
}

// Plaster: warm and cool wash strokes and soft blotches, like gouache on a wall.
export function paintPlaster(g, n, seed = 2) {
  const r = rng(seed); const sc = n / 256;
  g.fillStyle = '#f6f0e4'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 14; i++) blot(g, n, r() * n, r() * n, (40 + r() * 70) * sc, r() < 0.5 ? '#ffe9c4' : '#c9d6e4', 0.28);
  for (let i = 0; i < 90; i++) stroke(g, n, r() * n, r() * n, (18 + r() * 40) * sc, (r() - 0.5) * 0.25, (4 + r() * 8) * sc, ['#e9dcc4', '#fffaf0', '#dccfb8'][i % 3], 0.1 + r() * 0.1);
  for (let i = 0; i < 4; i++) stroke(g, n, r() * n, r() * n * 0.5, (50 + r() * 70) * sc, Math.PI / 2 + (r() - 0.5) * 0.1, 3 * sc, '#b9a07c', 0.14); // faint rain streaks
}

// Timber: vertical planks with ink seams and long grain strokes.
export function paintTimber(g, n, seed = 3) {
  const r = rng(seed); const planks = 6; const pw = n / planks; const sc = n / 256;
  g.fillStyle = '#e6d3b4'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < planks; i++) {
    g.fillStyle = shade('#e6d3b4', 0.86 + r() * 0.2); g.fillRect(i * pw + 1.5 * sc, 0, pw - 3 * sc, n);
    for (let k = 0; k < 9; k++) stroke(g, n, i * pw + 4 * sc + r() * (pw - 8 * sc), r() * n, (40 + r() * 90) * sc, Math.PI / 2 + (r() - 0.5) * 0.05, (1 + r() * 2) * sc, r() < 0.5 ? '#8a6038' : '#fff0d0', 0.2);
    wrap(g, n, (dx, dy) => { if (r() < 0.5) { g.fillStyle = 'rgba(110,70,40,0.3)'; g.beginPath(); g.ellipse(i * pw + pw / 2 + dx, r() * n + dy, 4 * sc, 7 * sc, 0, 0, 7); g.fill(); } });
    wobbleLine(g, n, i * pw, 0, i * pw, n, r, '#4a2e1a', 3 * sc, 0.8);
  }
}

// Roof: painted scalloped tiles (also reads as layered thatch), light on the crest of each tile and dark in the gap below.
export function paintRoof(g, n, seed = 4) {
  const r = rng(seed); const rows = 8; const cols = 6; const th = n / rows; const tw = n / cols; const sc = n / 256;
  g.fillStyle = '#d8b98a'; g.fillRect(0, 0, n, n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = i * tw + (j % 2) * tw / 2; const cy = j * th + th * 0.5;
    wrap(g, n, (dx, dy) => {
      g.fillStyle = shade('#e8cc9a', 0.84 + r() * 0.26); g.beginPath(); g.ellipse(cx + dx, cy + dy, tw * 0.52, th * 0.66, 0, 0, Math.PI); g.fill();
      g.strokeStyle = 'rgba(70,40,20,0.7)'; g.lineWidth = 2.4 * sc; g.beginPath(); g.ellipse(cx + dx, cy + dy, tw * 0.5, th * 0.62, 0, 0.1, Math.PI - 0.1); g.stroke();
      g.strokeStyle = 'rgba(255,245,210,0.6)'; g.lineWidth = 2 * sc; g.beginPath(); g.moveTo(cx + dx - tw * 0.4, cy + dy - th * 0.05); g.lineTo(cx + dx + tw * 0.4, cy + dy - th * 0.05); g.stroke();
    });
  }
}

// Ground: 'flag' is large painted flagstones, 'earth' is packed earth with soft patches, pebbles and tuft ticks. `base` is the era's ground colour.
export function paintGround(g, n, kind, base, seed = 5) {
  const r = rng(seed); const sc = n / 256;
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  if (kind === 'flag') {
    const rows = 3; const cols = 3; const bh = n / rows; const bw = n / cols;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * bw + (j % 2) * bw / 2; const y = j * bh;
      wrap(g, n, (dx, dy) => { g.fillStyle = shade(base, 0.9 + r() * 0.2); g.fillRect(x + dx + 3 * sc, y + dy + 3 * sc, bw - 6 * sc, bh - 6 * sc); });
      blot(g, n, x + r() * bw, y + r() * bh, 30 * sc, r() < 0.3 ? '#5f9a52' : '#fff2cc', 0.22);
      wobbleLine(g, n, x + 5 * sc, y + 5 * sc, x + bw - 6 * sc, y + 5 * sc, r, '#fff4d6', 3 * sc, 0.55);
      wobbleLine(g, n, x + 5 * sc, y + 5 * sc, x + 5 * sc, y + bh - 6 * sc, r, '#fff4d6', 3 * sc, 0.4);
    }
    for (let j = 0; j < rows; j++) wobbleLine(g, n, 0, j * bh, n, j * bh, r, '#3a2818', 3.4 * sc, 0.75);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = i * bw + (j % 2) * bw / 2; wobbleLine(g, n, x, j * bh, x, (j + 1) * bh, r, '#3a2818', 3.4 * sc, 0.75); }
  } else {
    for (let i = 0; i < 16; i++) blot(g, n, r() * n, r() * n, (28 + r() * 60) * sc, r() < 0.5 ? shade(base, 1.25) : shade(base, 0.7), 0.3);
    for (let i = 0; i < 26; i++) { const x = r() * n; const y = r() * n; wrap(g, n, (dx, dy) => { g.fillStyle = shade(base, 0.7); g.beginPath(); g.ellipse(x + dx, y + dy + sc, (3 + r() * 3) * sc, 2.2 * sc, 0, 0, 7); g.fill(); g.fillStyle = shade(base, 1.35); g.beginPath(); g.ellipse(x + dx - sc, y + dy - sc * 0.6, (2.4) * sc, 1.5 * sc, 0, 0, 7); g.fill(); }); }
    for (let i = 0; i < 24; i++) stroke(g, n, r() * n, r() * n, (4 + r() * 6) * sc, -Math.PI / 2 + (r() - 0.5) * 0.8, 1.6 * sc, '#4f7a38', 0.55);
  }
}

// Calm river: blue to teal wash with pale ripple curves.
export function paintWater(g, n, seed = 6) {
  const r = rng(seed); const sc = n / 256;
  const l = g.createLinearGradient(0, 0, n, n); l.addColorStop(0, '#1d78b8'); l.addColorStop(0.5, '#2aa5c2'); l.addColorStop(1, '#1b8fb0'); g.fillStyle = l; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 40; i++) {
    const x = r() * n; const y = r() * n; const len = (18 + r() * 40) * sc;
    wrap(g, n, (dx, dy) => { g.globalAlpha = 0.45; g.strokeStyle = r() < 0.7 ? '#d8f4f8' : '#ffe9a8'; g.lineWidth = (1.6 + r() * 1.6) * sc; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + dx, y + dy); g.quadraticCurveTo(x + dx + len / 2, y + dy - 4 * sc, x + dx + len, y + dy); g.stroke(); });
  }
  g.globalAlpha = 1;
}

// ---- Sky ------------------------------------------------------------------------------------------------------------------
// Equirectangular painted sky: top 0 .. horizon 0.5 .. bottom 1. Strong blue-to-gold gradient, soft cumulus clouds with a lit rim, a warm haze at the horizon.
function cloud(g, w, x, y, s, T, r) {
  const puffs = []; const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); const px = (t - 0.5) * s * 2.4; const hump = Math.sin(t * Math.PI); puffs.push([px + (r() - 0.5) * s * 0.2, -hump * s * 0.42 * (0.6 + r() * 0.6), s * (0.28 + hump * 0.3) * (0.7 + r() * 0.5)]); }
  for (const dx of [-w, 0, w]) {
    const pass = (col, ox, oy, k, a) => { g.globalAlpha = a; for (const [px, py, pr] of puffs) { const rr = pr * k; const gr = g.createRadialGradient(x + dx + px + ox, y + py + oy, rr * 0.55, x + dx + px + ox, y + py + oy, rr); gr.addColorStop(0, col); gr.addColorStop(0.82, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x + dx + px + ox, y + py + oy, rr, 0, 7); g.fill(); } };
    pass(T.cloudShade, 0, s * 0.1, 1.0, 0.95); // blue-violet underside
    pass(T.cloudLit, -s * 0.04, -s * 0.05, 0.88, 0.97); // warm white body
    pass(T.cloudRim, s * 0.05, -s * 0.1, 0.55, 0.8); // gold light on the sun side
  }
  g.globalAlpha = 1;
}
export const SUN = { u: 0.62, v: 0.4 };
export function drawSky(g, w, h, T, seed = 9) {
  const r = rng(seed);
  const l = g.createLinearGradient(0, 0, 0, h);
  l.addColorStop(0, T.sky[0]); l.addColorStop(0.2, T.sky[1]); l.addColorStop(0.38, T.sky[2]); l.addColorStop(0.5, T.sky[3]); l.addColorStop(0.52, T.haze); l.addColorStop(1, T.haze);
  g.fillStyle = l; g.fillRect(0, 0, w, h);
  const sx = w * (T.sunU ?? SUN.u); const sv = T.sunV ?? SUN.v; // sun glow
  const glow = g.createRadialGradient(sx, h * sv, 0, sx, h * sv, h * 0.5); glow.addColorStop(0, 'rgba(255,236,170,0.9)'); glow.addColorStop(0.25, 'rgba(255,200,110,0.4)'); glow.addColorStop(1, 'rgba(255,190,100,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  const clouds = T.clouds || 12;
  for (let i = 0; i < clouds; i++) cloud(g, w, r() * w, h * (0.16 + r() * 0.26), h * (0.05 + r() * 0.07), T, r);
  for (let i = 0; i < 5; i++) cloud(g, w, r() * w, h * (0.44 + r() * 0.02), h * (0.05 + r() * 0.04), T, r); // low banks on the horizon
  const hz = g.createLinearGradient(0, h * 0.4, 0, h * 0.52); hz.addColorStop(0, 'rgba(255,230,170,0)'); hz.addColorStop(1, T.haze); g.fillStyle = hz; g.fillRect(0, h * 0.4, w, h * 0.12);
}
export function drawSun(g, s) {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.16, 'rgba(255,246,200,1)'); gr.addColorStop(0.2, 'rgba(255,226,140,0.7)'); gr.addColorStop(0.5, 'rgba(255,190,100,0.22)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}
