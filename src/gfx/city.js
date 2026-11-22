// The painted city: buildings with plinths, arched and shuttered windows, doors with steps and lanterns, balconies, columns, domes, chhatris,
// roofs with deep eaves; lamp posts, stalls with sagging striped awnings, carts, benches, fences, pots, baskets, crates, trees (some in blossom),
// bamboo, bushes, the Mauryan lion pillar, a river with boats, puddles, petals and contact shadows. All static pieces go into one Batch
// (one merged mesh per material key); only the boats and lamp glows stay separate because they move or flicker.
import { Batch } from './batch.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const SHADE = { // painted ambient occlusion in vertex colours: grime near the ground, undersides darker, lit glass boosted for bloom
  wall: (y) => 0.66 + 0.34 * smooth(y / 48), stone: (y) => 0.72 + 0.28 * smooth(y / 34), roof: (y, ny) => 0.78 + 0.22 * (ny * 0.5 + 0.5),
  leaf: (y, ny) => 0.62 + 0.38 * (ny * 0.5 + 0.5), clay: (y, ny) => 0.75 + 0.25 * (ny * 0.5 + 0.5), lit: () => 1.7,
};
export const HULLS = { wall: 1.2, stone: 1.0, roof: 1.2, wood: 0.7, cloth: 0.6, leaf: 0.9, trunk: 0.8, clay: 0.6, gold: 0.5 };

export function buildScenery(ctx, w, tile, isOpen) {
  const { THREE, G, T, q, mats, built, rand, makePerson, glow, shadowed } = ctx;
  const ts = w.tileSize; const S = Math.max(0.85, Math.min(1.5, ts / 56)); const dens = q.density;
  const B = new Batch(THREE, SHADE);
  const lamps = []; const boats = []; const pillars = [];
  const arch = (r, tube) => G.memo(`arch${r}_${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 14, Math.PI));
  const half = (r) => G.memo(`halfdisc${r}`, () => new THREE.CircleGeometry(r, 14, 0, Math.PI));
  const flat = G.memo('flat1', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; });
  const disc = G.memo('disc1', () => { const g = new THREE.CircleGeometry(1, 18); g.rotateX(-Math.PI / 2); return g; });
  const ico = () => G.memo(`ico${q.ico}`, () => new THREE.IcosahedronGeometry(1, q.ico));
  const onion = G.lathe('onion', [[0.001, 0], [1.0, 0], [1.08, 0.12], [1.0, 0.36], [0.78, 0.62], [0.42, 0.86], [0.16, 1.08], [0.07, 1.25], [0.001, 1.4]], q.lathe);
  const R = rand;

  // ---- A face of a building: a local frame (x along the wall, z out of it) so details can be placed in wall space ----
  const place = (f, key, geo, lx, ly, lz, sx, sy, sz, col, rx = 0, rz = 0) => B.add(key, geo, f.x + lx * f.c + lz * f.s, ly, f.z - lx * f.s + lz * f.c, sx, sy, sz, col, f.ry, rx, rz);
  const SHUT = T.shutters || [0x2f8f7f, 0xc2433a, 0x3a6fb0, 0x6a8f3a];
  const DOOR = T.doors || [0x6a3a1c, 0x8a4a24, 0x4a2a14];

  function windowAt(f, y, lit, k, h) {
    const ww = 12 * S; const wh = 18 * S;
    place(f, 'stone', G.rbox(ww + 6, wh + 5, 3.4, 0.9), 0, y, 1.3, 1, 1, 1, T.trimStone);
    place(f, 'stone', arch(ww / 2 + 1.6, 1.5), 0, y + wh / 2 + 2.2, 1.8, 1, 1, 1, T.trimStone);
    place(f, 'stone', G.rbox(ww + 9, 2, 5.4, 0.7), 0, y - wh / 2 - 3.2, 2.6, 1, 1, 1, T.trimStone); // sill
    place(f, lit ? 'lit' : 'dark', G.plane(ww, wh), 0, y, 2.6, 1, 1, 1, lit ? (T.rain ? 0xffc060 : 0xffd27a) : 0x201634);
    place(f, lit ? 'lit' : 'dark', half(ww / 2), 0, y + wh / 2, 2.6, 1, 1, 1, lit ? (T.rain ? 0xffc060 : 0xffd27a) : 0x201634);
    place(f, 'wood', G.rbox(0.9, wh, 0.9, 0.3, 2), -ww / 5, y, 3.1, 1, 1, 1, 0x3a2414); place(f, 'wood', G.rbox(0.9, wh, 0.9, 0.3, 2), ww / 5, y, 3.1, 1, 1, 1, 0x3a2414);
    place(f, 'wood', G.rbox(ww, 0.9, 0.9, 0.3, 2), 0, y - 1, 3.1, 1, 1, 1, 0x3a2414);
    if (k % 2 === 0) for (const s of [-1, 1]) { // shutters with louvres
      const col = SHUT[(k + (s > 0 ? 1 : 0)) % SHUT.length];
      place(f, 'wood', G.rbox(ww * 0.52, wh + 3, 1.4, 0.5), s * (ww / 2 + ww * 0.3 + 1.2), y, 2.2, 1, 1, 1, col);
      if (dens > 0.6) for (let l = -2; l <= 2; l++) place(f, 'wood', G.rbox(ww * 0.42, 0.7, 0.7, 0.25, 2), s * (ww / 2 + ww * 0.3 + 1.2), y + l * 3.4 * S, 3.1, 1, 1, 1, tintHex(col, 0.62));
    }
    if (T.balcony && y > h * 0.5 && k % 3 === 0 && dens > 0.5) { // a jharokha-style balcony with brackets and balusters
      place(f, 'stone', G.rbox(ww + 16, 2.4, 10, 0.8), 0, y - wh / 2 - 5, 5.6, 1, 1, 1, T.trimStone);
      place(f, 'stone', G.rbox(ww + 16, 1.6, 1.8, 0.6), 0, y - wh / 2 + 5.2, 10.2, 1, 1, 1, T.trimStone);
      for (let b = -3; b <= 3; b++) place(f, 'stone', G.tube('bal', 0.9, 0.6, 7.6, [[0.3, 1.1]], 6, 2), b * (ww + 12) / 6.4, y - wh / 2 + 4.6, 10.2, 1, 1, 1, T.trimStone);
      for (const s of [-1, 1]) place(f, 'stone', G.cone(2.4, 6, 6), s * (ww / 2 + 3), y - wh / 2 - 9, 3.4, 1, 1, 1, T.trimStone, 0, Math.PI);
    }
  }
  function doorAt(f, k, h) {
    const dw = 20 * S; const dh = 38 * S; const col = DOOR[k % DOOR.length];
    place(f, 'stone', G.rbox(dw + 9, dh + 5, 3.8, 0.9), 0, dh / 2 + 1, 1.4, 1, 1, 1, T.trimStone);
    place(f, 'stone', arch(dw / 2 + 3, 2.1), 0, dh + 1, 1.8, 1, 1, 1, T.trimStone);
    place(f, 'wood', half(dw / 2), 0, dh, 3.0, 1, 1, 1, tintHex(col, 0.7));
    for (const s of [-1, 1]) {
      place(f, 'wood', G.rbox(dw / 2 - 0.3, dh, 2.2, 0.5), s * (dw / 4), dh / 2, 2.8, 1, 1, 1, col);
      place(f, 'wood', G.rbox(dw / 2 - 5, dh * 0.38, 1.4, 0.4), s * (dw / 4), dh * 0.28, 3.7, 1, 1, 1, tintHex(col, 0.72));
      place(f, 'wood', G.rbox(dw / 2 - 5, dh * 0.3, 1.4, 0.4), s * (dw / 4), dh * 0.7, 3.7, 1, 1, 1, tintHex(col, 0.72));
      place(f, 'gold', G.torus(1.3, 0.28, 5, 10), s * 2.6, dh * 0.46, 4.1, 1, 1, 1, 0xd9a93a);
    }
    for (let i = 0; i < 6; i++) place(f, 'gold', G.sph(6, 5), (i % 2 ? 1 : -1) * dw / 4, dh * 0.16 + Math.floor(i / 2) * dh * 0.3, 4.2, 0.7, 0.7, 0.7, 0xd9a93a);
    for (let i = -3; i <= 3; i++) { const a = (i / 3) * 1.15; place(f, 'stone', G.rbox(3.6, 5, 3.4, 0.6), Math.sin(a) * (dw / 2 + 5.4), dh + 1 + Math.cos(a) * (dw / 2 + 5.4) - 3, 2.0, 1, 1, 1, i % 2 ? T.trimStone : tintHex(T.trimStone, 0.9), 0, -a); } // voussoirs
    place(f, 'stone', G.rbox(dw + 16, 2.6, 8.5, 0.8), 0, 1.3, 4.6, 1, 1, 1, tintHex(T.trimStone, 0.95)); // steps
    place(f, 'stone', G.rbox(dw + 10, 2.4, 5.2, 0.8), 0, 3.8, 3.2, 1, 1, 1, T.trimStone);
    if (dens > 0.6) { // a hanging lantern beside the door
      place(f, 'wood', G.tube('brk', 0.7, 0.5, 8, null, 5, 2), dw / 2 + 8, dh + 8, 5.5, 1, 1, 1, 0x2a1a10, 0, 0, Math.PI / 2 + 0.05);
      lanternAt(f.x + (dw / 2 + 14) * f.c + 5.5 * f.s, dh + 2, f.z - (dw / 2 + 14) * f.s + 5.5 * f.c, 0.9);
    }
    if (T.balcony && k % 2 === 0 && dens > 0.5) { // cloth awning over the door
      B.addStriped('cloth', G.sheet(dw + 14, 12, 2.4, 0.15, 12, 3), f.x + 6.5 * f.s, dh + 14, f.z + 6.5 * f.c, 1, 1, 1, awn[k % awn.length], 0xf6ecd8, (dw + 14) / 6, f.ry);
    }
  }
  const awn = T.awnings;
  function lanternAt(x, y, z, k = 1) { // lathed lantern: cap, glass, base, ring; hot emissive core for bloom
    B.add('gold', G.cone(2.4 * k, 2.4 * k, 8), x, y + 3.4 * k, z, 1, 1, 1, 0x3a2412);
    B.add('lit', G.lathe('lanternGlass', [[0.001, -2.8], [1.3, -2.6], [1.9, -1.4], [2.1, 0.4], [1.7, 2.3], [0.001, 2.4]], 10), x, y, z, k, k, k, 0xffcf80);
    B.add('gold', G.torus(1.9 * k, 0.28 * k, 4, 10), x, y + 2.4 * k, z, 1, 1, 1, 0x3a2412, 0, Math.PI / 2); B.add('gold', G.cone(1.5 * k, 1.8 * k, 8), x, y - 3.3 * k, z, 1, 1, 1, 0x3a2412, 0, 0, Math.PI);
  }
  function columnAt(f, lx, h, lz = 3.2) { // a fluted column with a lotus capital
    const ch = h * 0.46; const col = G.lathe('colshaft', [[2.6, 0], [2.4, 3], [2.2, ch * 0.5], [2.0, ch]], q.lathe, { n: 8, amp: 0.045 });
    place(f, 'stone', G.rbox(8, 3.4, 8, 0.8), lx, 1.7, lz, 1, 1, 1, T.trimStone); place(f, 'stone', G.torus(3.2, 0.9, 5, 12), lx, 4, lz, 1, 1, 1, T.trimStone, Math.PI / 2);
    place(f, 'stone', col, lx, 4, lz, 1, 1, 1, tintHex(T.trimStone, 1.04));
    place(f, 'stone', G.lathe('lotus', [[1.9, 0], [3.0, 1.2], [3.6, 3.2], [3.2, 4.4], [4.2, 5.2]], q.lathe), lx, 4 + ch, lz, 1, 1, 1, T.trimStone); place(f, 'stone', G.rbox(10, 2.6, 10, 0.7), lx, 4 + ch + 6.4, lz, 1, 1, 1, T.trimStone);
  }

  // ---- Buildings ----
  const bodies = []; let nb = 0;
  w.walls.forEach((wl, i) => {
    const c0 = Math.round(wl.x / ts); const r0 = Math.round(wl.y / ts); const cw = Math.round(wl.w / ts); const rh = Math.round(wl.h / ts);
    let oCount = 0; for (let rr = r0; rr < r0 + rh; rr++) for (let cc = c0; cc < c0 + cw; cc++) if (tile(cc, rr) === 'o') oCount++;
    if (oCount === cw * rh) { pillars.push({ x: wl.x + wl.w / 2, y: wl.y + wl.h / 2 }); return; }
    const edge = c0 === 0 || r0 === 0 || c0 + cw === w.cols || r0 + rh === w.rows;
    const cx = wl.x + wl.w / 2; const cz = wl.y + wl.h / 2;
    if (r0 >= (T.roof === 'pitched' ? w.rows - 2 : Infinity)) { // low stone embankment along the river
      B.add('stone', G.rbox(wl.w, 26, wl.h, 3), cx, 13, cz, 1, 1, 1, 0x8d8372); B.add('stone', G.rbox(wl.w + 4, 5, wl.h + 4, 1.6), cx, 27, cz, 1, 1, 1, 0xb9ae98); return;
    }
    if (edge) {
      const h = T.roof === 'pitched' ? 130 : 150;
      B.add('wall', G.rbox(wl.w, h, wl.h, 2), cx, h / 2, cz, 1, 1, 1, T.roof === 'pitched' ? 0x6a4a2e : T.walls[1]);
      B.add('stone', G.rbox(wl.w + 4, 8, wl.h + 4, 1.5), cx, 4, cz, 1, 1, 1, T.trimStone); B.add('stone', G.rbox(wl.w + 5, 9, wl.h + 5, 2), cx, h, cz, 1, 1, 1, T.trim);
      const long = wl.w >= wl.h; const len = long ? wl.w : wl.h;
      if (T.roof === 'pitched') { const n = Math.floor(len / 22); for (let k = 0; k < n; k++) { const px = long ? wl.x + (k + 0.5) * (wl.w / n) : cx; const pz = long ? cz : wl.y + (k + 0.5) * (wl.h / n); B.add('wood', G.tube('log', 4.2, 3.6, 22, null, 8, 2), px, h + 26, pz, 1, 1, 1, k % 2 ? 0x4a2e18 : 0x5a3a1e); B.add('wood', G.cone(3.6, 9, 8), px, h + 31, pz, 1, 1, 1, 0x5a3a1e); } }
      else { const n = Math.floor(len / 14); for (let k = 0; k < n; k++) B.add('stone', G.rbox(long ? 8 : wl.w * 0.5, 9, long ? wl.h * 0.5 : 8, 1.4), long ? wl.x + (k + 0.5) * (wl.w / n) : cx, h + 9, long ? cz : wl.y + (k + 0.5) * (wl.h / n), 1, 1, 1, T.trim); }
      return;
    }
    const hr = T.heights; const h = hr[0] + Math.floor(R() * (hr[1] - hr[0])); const color = T.walls[i % T.walls.length];
    bodies.push({ x: wl.x, z: wl.y, w: wl.w, d: wl.h });
    B.add('stone', G.rbox(wl.w + 5, 10, wl.h + 5, 1.8), cx, 5, cz, 1, 1, 1, T.trimStone); // plinth
    B.add('wall', G.rbox(wl.w, h, wl.h, 2.2), cx, h / 2 + 4, cz, 1, 1, 1, color);
    B.add('stone', G.rbox(wl.w + 3.5, 4, wl.h + 3.5, 1.2), cx, h * 0.46 + 4, cz, 1, 1, 1, T.trimStone); // string course
    B.add('stone', G.rbox(wl.w + 9, 7, wl.h + 9, 1.8), cx, h + 6, cz, 1, 1, 1, T.trimStone); // cornice
    B.add('stone', G.rbox(wl.w + 5, 3, wl.h + 5, 1), cx, h + 2.4, cz, 1, 1, 1, tintHex(T.trimStone, 0.8));
    if (T.roof === 'pitched') {
      const rh2 = 46 + (i % 3) * 10;
      B.add('wood', G.rbox(wl.w * 1.3, 4, wl.h * 1.3, 1.4), cx, h + 10, cz, 1, 1, 1, 0x3a2414); // deep eaves
      B.add('roof', G.cone(0.7071, 1, 4), cx, h + 12 + rh2 / 2, cz, wl.w * 1.24, rh2, wl.h * 1.24, i % 2 ? T.roofColor : T.roof2, Math.PI / 4);
      B.add('gold', G.cone(2.6, 11, 6), cx, h + 12 + rh2 + 4, cz, 1, 1, 1, 0x3a2414);
    } else {
      for (const [sx, sz, lx, lz] of [[wl.w + 9, 4, 0, -(wl.h + 5) / 2], [wl.w + 9, 4, 0, (wl.h + 5) / 2], [4, wl.h + 5, -(wl.w + 5) / 2, 0], [4, wl.h + 5, (wl.w + 5) / 2, 0]]) B.add('stone', G.rbox(sx, 7, sz, 1.2), cx + lx, h + 13, cz + lz, 1, 1, 1, T.trimStone); // parapet
      if (wl.w >= ts * 2 && wl.h >= ts * 2) {
        const r = Math.min(wl.w, wl.h) * 0.27; const col = i % 2 ? T.dome : T.roofColor;
        B.add('stone', G.cyl(r * 0.9, r * 1.0, 10, 14), cx, h + 14, cz, 1, 1, 1, T.trimStone); B.add('stone', G.torus(r * 0.95, 1.5, 5, 18), cx, h + 19.5, cz, 1, 1, 1, T.trimStone, Math.PI / 2);
        B.add('stone', onion, cx, h + 19, cz, r, r * 0.95, r, col); B.add('gold', G.lathe('kalash', [[0.001, 0], [1.4, 0.3], [2.6, 3], [1.2, 5.6], [0.6, 8], [1.2, 9.4], [0.001, 14]], 10), cx, h + 19 + r * 0.95 * 1.38, cz, 1, 1, 1, 0xf2b93c);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // chhatris on the corners
          const px = cx + sx * (wl.w / 2 - 9); const pz = cz + sz * (wl.h / 2 - 9);
          for (const [ox, oz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) B.add('stone', G.tube('chp', 1.3, 1.1, 13, null, 7, 2), px + ox, h + 29, pz + oz, 1, 1, 1, T.trimStone);
          B.add('stone', G.rbox(11, 2.2, 11, 0.8), px, h + 30.4, pz, 1, 1, 1, T.trimStone); B.add('stone', onion, px, h + 31, pz, 5.6, 5, 5.6, col); B.add('gold', G.cone(0.9, 4, 6), px, h + 38, pz, 1, 1, 1, 0xf2b93c);
        }
      }
    }
    const faces = [];
    const mk = (x, z, ox, oz) => ({ x: x + ox * 0.2, z: z + oz * 0.2, ry: Math.atan2(ox, oz), c: Math.cos(Math.atan2(ox, oz)), s: Math.sin(Math.atan2(ox, oz)) });
    for (let cc = c0; cc < c0 + cw; cc++) { if (isOpen(cc, r0 - 1)) faces.push(mk(wl.x + (cc - c0 + 0.5) * ts, wl.y, 0, -1)); if (isOpen(cc, r0 + rh)) faces.push(mk(wl.x + (cc - c0 + 0.5) * ts, wl.y + wl.h, 0, 1)); }
    for (let rr = r0; rr < r0 + rh; rr++) { if (isOpen(c0 - 1, rr)) faces.push(mk(wl.x, wl.y + (rr - r0 + 0.5) * ts, -1, 0)); if (isOpen(c0 + cw, rr)) faces.push(mk(wl.x + wl.w, wl.y + (rr - r0 + 0.5) * ts, 1, 0)); }
    faces.forEach((f, k) => {
      nb++;
      windowAt(f, h * 0.68 + 4, (k + i) % 4 !== 0, k + i, h);
      if (k % 3 === 1) doorAt(f, k + i, h); else windowAt(f, h * 0.27 + 4, (k + i) % 3 !== 0, k + i + 1, h);
      if (T.balcony && dens > 0.5 && k % 2 === 0) { columnAt(f, -ts / 2 + 3, h); }
    });
  });

  // Contact shadows: soft dark strips hugging the base of every building (a cheap stand-in for ambient occlusion).
  for (const b of bodies) {
    const m = 14; const cx = b.x + b.w / 2; const cz = b.z + b.d / 2;
    B.add('shade', flat, cx, 0.35, b.z + b.d + m / 2, b.w + 2 * m, 1, m, 0x1a0c18, 0);
    B.add('shade', flat, cx, 0.35, b.z - m / 2, b.w + 2 * m, 1, m, 0x1a0c18, Math.PI);
    B.add('shade', flat, b.x - m / 2, 0.35, cz, b.d, 1, m, 0x1a0c18, -Math.PI / 2);
    B.add('shade', flat, b.x + b.w + m / 2, 0.35, cz, b.d, 1, m, 0x1a0c18, Math.PI / 2);
  }

  // ---- Street furniture along building edges ----
  const propSpots = [];
  for (let r = 1; r < w.rows - 1; r++) for (let c = 1; c < w.cols - 1; c++) {
    if (!isOpen(c, r)) continue;
    if (!isOpen(c, r + 1) && tile(c, r + 1) !== 'o') propSpots.push({ x: (c + 0.5) * ts, y: (r + 1) * ts - 12, face: -Math.PI / 2 });
    if (!isOpen(c, r - 1) && tile(c, r - 1) !== 'o') propSpots.push({ x: (c + 0.5) * ts, y: r * ts + 12, face: Math.PI / 2 });
  }
  const protect = (x, y) => Math.hypot(x - w.start.x, y - w.start.y) < 110 || w.checkpoints.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius * 1.4);
  const free = propSpots.filter((p) => !protect(p.x, p.y)).sort(() => R() - 0.5);
  let fi = 0; const take = (n) => free.slice(fi, fi += Math.max(0, n));
  const lampN = Math.min(Math.round(46 * dens), Math.floor(free.length / 5)); const stallN = Math.min(Math.round(18 * dens), Math.floor(free.length / 9));
  const treeN = Math.min(q.trees, Math.floor(free.length / 8));

  take(lampN).forEach((p, k) => { // lamp post: flared base, tapered shaft, collar, bracket arm and a lantern
    B.add('wood', G.lathe('lampPost', [[4.2, 0], [3.4, 3], [2.0, 6], [1.5, 20], [1.4, 38], [2.2, 40.5], [0.001, 41]], 10), p.x, 0, p.y, 1, 1, 1, 0x2e1c12);
    B.add('wood', G.tube('lampArm', 0.9, 0.7, 7, null, 6, 2), p.x, 40, p.y, 1, 1, 1, 0x2e1c12, 0, 0, Math.PI / 2);
    lanternAt(p.x, 46, p.y, 1.5);
    const lg = glow(T.lamp, 80, 0.9); lg.position.set(p.x, 47, p.y); built.add(lg); lamps.push({ s: lg, phase: k * 1.7 });
  });

  const stalls = take(stallN);
  const cols = T.awnings; const goods = [0xe8432e, 0xffa51f, 0x6cc04a, 0xf0c04a, 0xc0407a];
  stalls.forEach((p, k) => {
    const dz = p.face > 0 ? 1 : -1; const x = p.x; const z = p.y;
    B.add('wood', G.rbox(36, 4, 14, 1), x, 15, z, 1, 1, 1, 0x7a4e2c); // counter top
    B.add('wood', G.rbox(34, 13, 12, 1), x, 8, z, 1, 1, 1, 0x5e3a20);
    B.add('cloth', G.plane(34, 11, 6, 1), x, 8.5, z + dz * 6.4, 1, 1, 1, cols[(k + 1) % cols.length], dz > 0 ? 0 : Math.PI); // a cloth skirt on the counter front
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      B.add('wood', G.tube('stallpost', 1.5, 1.3, 36, null, 7, 2), x + sx * 17.5, 40, z + sz * 6.5, 1, 1, 1, 0x4a2e18); B.add('wood', G.rbox(4.2, 2, 4.2, 0.7), x + sx * 17.5, 41.5, z + sz * 6.5, 1, 1, 1, 0x3a2414);
    }
    B.addStriped('cloth', G.sheet(44, 20, 3.4, 0.35, 12, 4), x, 42, z - dz * 2, 1, 1, 1, cols[k % cols.length], 0xf6ecd8, 44 / 12, 0, dz * 0.14);
    B.add('cloth', G.plane(44, 4.2, 12, 1), x, 41, z + dz * 8.6, 1, 1, 1, cols[k % cols.length], dz > 0 ? 0 : Math.PI); // front valance
    for (let g2 = 0; g2 < 5; g2++) { B.add('clay', G.lathe('bowl', [[0.001, 0], [2.6, 0.2], [3.9, 1.6], [4.2, 2.8], [3.6, 2.8], [0.001, 1.4]], 10), x - 13 + g2 * 6.5, 17, z, 1, 1, 1, 0xb4552f); for (let m = 0; m < 4; m++) B.add('leaf', G.sph(7, 5), x - 13 + g2 * 6.5 + (m % 2 - 0.5) * 2.2, 20 + (m > 1 ? 1.2 : 0.6), z + (m % 3 - 1) * 1.2, 1.5, 1.5, 1.5, goods[(g2 + k + m) % 5]); }
    if (dens > 0.6) { lanternAt(x + 12, 36, z + dz * 6, 0.8); B.add('wood', G.rbox(8, 6, 8, 0.8), x + 25, 3, z - dz * 4, 1, 1, 1, 0x7a5a34); B.add('clay', G.lathe('jar', [[0.001, 0], [3.4, 0.2], [5.4, 4], [5.6, 8], [3.6, 12], [3.3, 13], [4.2, 14], [0.001, 14]], q.lathe), x - 26, 0, z - dz * 4, 1, 1, 1, 0xa8502c); }
    const keeper = makePerson({ skin: [0xb98058, 0x9a6440][k % 2], top: cols[(k + 2) % cols.length], bottom: 0xf3ead6, skirt: true, legsBare: true, turban: k % 2 ? 0xf3ead6 : undefined, hair: 0x1b1210, female: k % 3 === 0, bindi: k % 3 === 0, age: k % 5 === 4 ? 'elder' : 'adult', eyes: '#3a2a1a' });
    keeper.position.set(x, 0, z - dz * 15); keeper.rotation.y = dz > 0 ? -Math.PI / 2 : Math.PI / 2; built.add(shadowed(keeper));
  });

  // Props with believable forms: a cart with spoked wheels, benches, crates, barrels, baskets, sacks, pots, haystacks, fences.
  const wheel = (x, y, z, r) => { B.add('wood', G.torus(r, r * 0.12, 6, 18), x, y, z, 1, 1, 1, 0x4a2e18); B.add('wood', G.cyl(r * 0.2, r * 0.2, 4.4, 8), x, y, z, 1, 1, 1, 0x3a2414, 0, Math.PI / 2); for (let s = 0; s < 6; s++) B.add('wood', G.rbox(r * 1.9, 1.1, 1.1, 0.4, 2), x, y, z, 1, 1, 1, 0x5a3a1e, 0, 0, s * Math.PI / 6); };
  const cart = (x, z, ry) => { const c = Math.cos(ry); const s = Math.sin(ry); const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let [px, pz] = P(0, 0); B.add('wood', G.rbox(34, 3, 20, 1), px, 16, pz, 1, 1, 1, 0x7a4e2c, ry);
    for (const sg of [-1, 1]) {
      [px, pz] = P(0, sg * 10); B.add('wood', G.rbox(34, 8, 2, 0.8), px, 21, pz, 1, 1, 1, 0x6a4226, ry); [px, pz] = P(sg * 17, 0); B.add('wood', G.rbox(2, 8, 20, 0.8), px, 21, pz, 1, 1, 1, 0x6a4226, ry);
      [px, pz] = P(0, sg * 12.4); wheel(px, 11, pz, 11);
      [px, pz] = P(-14, sg * 7); B.add('wood', G.tube('shaft', 1.3, 1, 34, null, 6, 2), px, 14, pz, 1, 1, 1, 0x4a2e18, ry, 0, -(Math.PI / 2 - 0.12));
    }
    [px, pz] = P(0, 0); B.add('cloth', G.sph(9, 6), px, 22, pz, 11, 5, 8, 0xd8c08a, ry); };
  const bench = (x, z, ry) => { const c = Math.cos(ry); const s = Math.sin(ry); B.add('wood', G.rbox(30, 3.2, 9, 1.1), x, 12, z, 1, 1, 1, 0x7a5232, ry); for (const sg of [-1, 1]) { B.add('wood', G.tube('benchleg', 1.9, 1.3, 11, null, 6, 2), x + sg * 11 * c, 11, z - sg * 11 * s, 1, 1, 1, 0x4a2e18, ry); B.add('wood', G.rbox(2, 2, 8, 0.6), x + sg * 11 * c, 6, z - sg * 11 * s, 1, 1, 1, 0x4a2e18, ry); } };
  const basket = (x, z, c) => { B.add('clay', G.lathe('basket', [[0.001, 0], [4.4, 0], [5.6, 4], [6.4, 9], [6.8, 10], [6.1, 10], [0.001, 8]], q.lathe, { n: 14, amp: 0.025 }), x, 0, z, 1, 1, 1, 0xb48a4a); B.add('clay', G.torus(6.5, 0.7, 5, 14), x, 10, z, 1, 1, 1, 0x8a6a34, 0, Math.PI / 2); for (let m = 0; m < 5; m++) B.add('leaf', G.sph(7, 5), x + Math.cos(m * 1.3) * 2.4, 10.4, z + Math.sin(m * 1.3) * 2.4, 2.1, 2.1, 2.1, c); };
  const sack = (x, z, c, ry) => { B.add('cloth', G.lathe('sack', [[0.001, 0], [5.2, 0.4], [7.2, 4.5], [6.4, 9], [3.2, 13], [2.0, 14.6], [3.2, 16.2], [2.4, 17.4], [0.001, 17.4]], q.lathe, { n: 5, amp: 0.04, tw: 0.3 }), x, 0, z, 1, 1, 1, c, ry); B.add('cloth', G.torus(2.2, 0.55, 5, 8), x, 14.6, z, 1, 1, 1, 0x6a4a2a, ry, Math.PI / 2); };
  const crate = (x, z, c, ry) => { B.add('wood', G.rbox(13, 11, 13, 0.9), x, 5.5, z, 1, 1, 1, c, ry); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add('wood', G.rbox(1.8, 11.4, 1.8, 0.5), x + (sx * 6 * Math.cos(ry) + sz * 6 * Math.sin(ry)), 5.5, z + (-sx * 6 * Math.sin(ry) + sz * 6 * Math.cos(ry)), 1, 1, 1, tintHex(c, 0.68), ry); B.add('wood', G.rbox(13.4, 1.5, 13.4, 0.5), x, 11, z, 1, 1, 1, tintHex(c, 0.8), ry); };
  const barrel = (x, z, ry) => { B.add('wood', G.lathe('barrel', [[0.001, 0], [5.4, 0], [6.8, 5], [7.3, 10], [6.8, 15], [5.4, 20], [0.001, 20]], q.lathe, { n: 16, amp: 0.012 }), x, 0, z, 1, 1, 1, 0x7a4e2a, ry); for (const y of [3, 17]) B.add('gold', G.torus(6.2 + (y === 3 ? 0.4 : 0.6), 0.5, 5, 14), x, y + 0.3, z, 1, 1, 1, 0x3a3a3e, 0, Math.PI / 2); B.add('gold', G.torus(7.2, 0.6, 5, 14), x, 10, z, 1, 1, 1, 0x3a3a3e, 0, Math.PI / 2); };
  const jar = (x, z, c) => { B.add('clay', G.lathe('jar2', [[0.001, 0], [3.4, 0.2], [5.6, 4.5], [6.0, 8.5], [4.4, 13], [3.2, 15.5], [3.0, 17], [4.2, 18.4], [3.8, 19.2], [3.0, 18.2], [0.001, 17.6]], q.lathe), x, 0, z, 1, 1, 1, c); B.add('clay', G.torus(5.7, 0.5, 4, 14), x, 8.4, z, 1, 1, 1, tintHex(c, 1.25), 0, Math.PI / 2); };
  const hay = (x, z) => { B.add('leaf', G.lathe('hay', [[0.001, 0], [9, 0], [9.6, 5], [7.4, 12], [4, 18], [0.001, 23]], q.lathe, { n: 11, amp: 0.05, tw: 0.4 }), x, 0, z, 1, 1, 1, 0xd8b560); B.add('cloth', G.torus(8.4, 0.5, 4, 14), x, 8, z, 1, 1, 1, 0x8a6a34, 0, Math.PI / 2); };
  const fence = (x, z, ry, n) => { const c = Math.cos(ry); const s = Math.sin(ry); for (let i = 0; i <= n; i++) { const o = (i - n / 2) * 12; const px = x + o * c; const pz = z - o * s; B.add('wood', G.tube('fpost', 2.1, 1.7, 22, null, 6, 2), px, 24, pz, 1, 1, 1, 0x6a4a2c); B.add('wood', G.cone(2.2, 2.6, 6), px, 25.4, pz, 1, 1, 1, 0x7a5a38); } for (const y of [10, 18]) B.add('wood', G.tube('frail', 1.1, 1.1, n * 12, null, 6, 1), x + (n * 6) * c, y, z - (n * 6) * s, 1, 1, 1, 0x7a5a38, ry, 0, -Math.PI / 2); };
  const bush = (x, z, c, k = 1) => { for (let i = 0; i < 4 + q.ico * 2; i++) B.add('leaf', ico(), x + (R() - 0.5) * 14 * k, 6 + R() * 7, z + (R() - 0.5) * 10 * k, (6 + R() * 4) * k, (5 + R() * 3) * k, (6 + R() * 3) * k, tintHex(c, 0.85 + R() * 0.4), R() * 6); if (T.blossom && R() < 0.5) for (let i = 0; i < 7; i++) B.add('leaf', G.sph(6, 5), x + (R() - 0.5) * 18 * k, 8 + R() * 10, z + (R() - 0.5) * 12 * k, 1.5, 1.5, 1.5, T.blossom[i % T.blossom.length]); };
  const tree = (x, z, k) => {
    const sc = 0.85 + R() * 0.5; const lean = (R() - 0.5) * 0.18;
    B.add('trunk', G.lathe('trunk', [[0.001, 0], [7.5, 0], [5.8, 3], [4.2, 10], [3.6, 30], [3.0, 48], [0.001, 50]], 9, { n: 4, amp: 0.05, tw: 0.2 }), x, 0, z, sc, sc, sc, 0x6a452a, R() * 6, 0, lean);
    for (const [a, l] of [[0.9, 22], [-1.1, 18], [2.6, 20]]) B.add('trunk', G.tube('branch', 2.2, 1.0, l, null, 6, 2), x, 40 * sc, z, sc, sc, sc, 0x6a452a, a, 0.9, 0);
    const n = 5 + q.ico * 2; const greens = T.leaves; const spread = 22 * sc;
    for (let i = 0; i < n; i++) { const a = i / n * 6.28 + R(); const rr = i === 0 ? 0 : spread * (0.6 + R() * 0.5); B.add('leaf', ico(), x + Math.cos(a) * rr, (58 + (i === 0 ? 14 : R() * 18)) * sc, z + Math.sin(a) * rr, (15 + R() * 8) * sc, (11 + R() * 5) * sc, (15 + R() * 8) * sc, greens[(i + k) % greens.length], R() * 6); }
    if (T.blossom && k % 2 === 0) for (let i = 0; i < 18; i++) { const a = R() * 6.28; const rr = spread * (0.2 + R() * 0.95); B.add('leaf', G.sph(6, 5), x + Math.cos(a) * rr, (58 + R() * 28) * sc, z + Math.sin(a) * rr, 2.2, 2.2, 2.2, T.blossom[i % T.blossom.length]); }
    for (let i = 0; i < 6; i++) B.add('decal', disc, x + (R() - 0.5) * 70, 0.45, z + (R() - 0.5) * 70, 6 + R() * 5, 1, 3 + R() * 3, tintHex(0x1a1030, 1), R() * 6); // dappled shade on the ground
  };
  const bamboo = (x, z, n) => { for (let i = 0; i < n; i++) { const px = x + (R() - 0.5) * 30; const pz = z + (R() - 0.5) * 22; const hh = 90 + R() * 50; const lean = (R() - 0.5) * 0.1; B.add('trunk', G.tube('bamboo', 1.5, 1.1, hh, null, 7, 1), px, hh, pz, 1, 1, 1, i % 2 ? 0x8fb03c : 0x7aa032, 0, 0, lean); for (let nd = 1; nd < 5; nd++) B.add('trunk', G.torus(1.55, 0.35, 4, 8), px - lean * nd * hh / 5 * 0.7, hh - nd * hh / 5 + 2, pz, 1, 1, 1, 0x6a8a28, 0, Math.PI / 2); for (let l = 0; l < 4; l++) B.add('leaf', G.cone(3.4, 22, 4), px + Math.cos(l * 1.6) * 8, hh * 2 - 14 - l * 5, pz + Math.sin(l * 1.6) * 8, 1, 1, 0.35, 0x5fa83c, l * 1.6, 0, Math.cos(l * 1.6) * 1.0 - 0.2); } };

  const misc = take(Math.round(free.length * 0.55 * dens));
  misc.forEach((p, k) => { const rot = p.face > 0 ? 0 : Math.PI; const kind = k % 11; const x = p.x + (R() - 0.5) * 10; const z = p.y; const c = [0xb48a4a, 0xa8502c, 0x8a6a34][k % 3];
    if (kind === 0) cart(x, z, rot + Math.PI / 2); else if (kind === 1) bench(x, z, rot); else if (kind === 2) crate(x, z, 0x8a6038, R() * 3); else if (kind === 3) barrel(x, z, 0);
    else if (kind === 4) basket(x, z, [0xe8432e, 0xffa51f, 0x6cc04a][k % 3]); else if (kind === 5) sack(x, z, [0xd8c08a, 0xc9a066][k % 2], R() * 6); else if (kind === 6) jar(x, z, c);
    else if (kind === 7) hay(x, z); else if (kind === 8) fence(x, z, 0, 3); else if (kind === 9) bush(x, z, T.leaves[k % T.leaves.length]); else { crate(x, z, 0x7a5232, 0.3); crate(x + 9, z + 3, 0x8a6038, 1.1); crate(x + 3, z + 1, 0x6a4a2c, 0.1); } });
  take(treeN).forEach((p, k) => { if (T.roof === 'pitched' && k % 3 === 0) bamboo(p.x, p.y, Math.max(5, Math.round(9 * dens))); else tree(p.x, p.y, k); });

  // Banners: a pole, finials and a hanging cloth with a gold border (palace streets).
  if (T.banner) take(Math.round(14 * dens)).forEach((p, k) => {
    const y = 118; const col = k % 2 ? T.banner : T.banner2; const z = p.y - Math.sign(p.face) * 8;
    B.add('wood', G.tube('bpole', 1.1, 1.1, 20, null, 6, 1), p.x, y + 20, z, 1, 1, 1, 0x3a2414, 0, 0, Math.PI / 2); B.add('gold', G.sph(7, 5), p.x + 10, y + 20, z, 1.7, 1.7, 1.7, 0xf2b93c); B.add('gold', G.sph(7, 5), p.x - 10, y + 20, z, 1.7, 1.7, 1.7, 0xf2b93c);
    const bg = G.memo('banner', () => { const g = new THREE.PlaneGeometry(14, 46, 3, 8); const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getY(i) * 0.25) * 1.2); g.computeVertexNormals(); return g; });
    B.add('cloth', bg, p.x, y - 3, z, 1, 1, 1, col); B.add('cloth', G.plane(14.6, 3, 1, 1), p.x, y + 18, z + 0.2, 1, 1, 1, 0xf2b93c); B.add('cloth', G.plane(14.6, 3, 1, 1), p.x, y - 25, z + 0.2, 1, 1, 1, 0xf2b93c); for (let t = -2; t <= 2; t++) B.add('gold', G.cone(1, 5, 5), p.x + t * 3, y - 29, z, 1, 1, 1, 0xf2b93c, 0, 0, Math.PI);
  });

  // The Mauryan lion-capital column: lotus base, polished shaft, bell capital, frieze, wheel, four lions.
  pillars.forEach((p) => {
    const x = p.x; const z = p.y; const sand = 0xe9dcbc;
    B.add('stone', G.rbox(58, 8, 58, 3), x, 4, z, 1, 1, 1, 0xcdb98e); B.add('stone', G.lathe('pbase', [[22, 0], [27, 3], [29, 8], [25, 13], [16, 16]], q.lathe), x, 8, z, 1, 1, 1, 0xd8c7a2);
    B.add('stone', G.lathe('pshaft', [[16, 0], [15, 20], [13.6, 120], [12.6, 195]], q.lathe, { n: 10, amp: 0.012 }), x, 22, z, 1, 1, 1, sand);
    B.add('stone', G.lathe('pbell', [[12.6, 0], [17, 6], [22, 16], [24, 30], [20, 40]], q.lathe, { n: 12, amp: 0.03 }), x, 217, z, 1, 1, 1, 0xcdb98e);
    B.add('stone', G.cyl(26, 26, 8, 28), x, 262, z, 1, 1, 1, sand); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; B.add('stone', G.sph(6, 5), x + Math.cos(a) * 26.4, 262, z + Math.sin(a) * 26.4, 3, 3, 1.6, 0xb89c68, -a); }
    B.add('gold', G.torus(14, 1.8, 5, 20), x, 267, z, 1, 1, 1, 0xd9a93a, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const cx = x + Math.cos(a) * 13; const cz = z + Math.sin(a) * 13; const l = 0xe0d0a8;
      B.add('stone', G.sph(10, 7), cx, 282, cz, 12, 11, 8, l, -a); B.add('stone', G.sph(10, 7), x + Math.cos(a) * 7, 280, z + Math.sin(a) * 7, 10, 10, 9, l, -a);
      B.add('stone', G.sph(10, 7), x + Math.cos(a) * 21, 292, z + Math.sin(a) * 21, 6.5, 7, 6.5, l); B.add('stone', G.torus(7.4, 2.4, 6, 14), x + Math.cos(a) * 20.5, 292, z + Math.sin(a) * 20.5, 1, 1, 1, tintHex(l, 0.9), a + Math.PI / 2);
      for (const sd of [-1, 1]) B.add('stone', G.tube('paw', 2.6, 2.1, 7, null, 7, 2), x + Math.cos(a) * 24 - Math.sin(a) * sd * 4, 272, z + Math.sin(a) * 24 + Math.cos(a) * sd * 4, 1, 1, 1, l); }
  });

  // River with painted water (reflective material), embankment already drawn above; boats are built separately because they bob.
  if (T.roof === 'pitched') {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 3, 900), mats.water); water.rotation.x = -Math.PI / 2; water.position.set(w.width / 2, 0.6, (w.rows - 2) * ts + 450); built.add(water); ctx.water = water;
    for (let k = 0; k < 4; k++) {
      const gb = new THREE.Group(); gb.position.set(w.width * (0.12 + k * 0.26), 3, w.height + 120 + (k % 2) * 70);
      const BB = new Batch(THREE, SHADE); const hullG = (G.memo('hull', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)));
      BB.add('wood', hullG, 0, 14, 0, 66, 14, 19, 0x6a4a2a); BB.add('wood', G.torus(1, 0.05, 5, 24), 0, 14.2, 0, 66, 19, 20, 0x8a6038, 0, Math.PI / 2); BB.add('wood', G.cone(5, 22, 6), 62, 22, 0, 1.1, 1, 1, 0x6a4a2a, 0, 0, -1.1); BB.add('wood', G.cone(5, 22, 6), -62, 22, 0, 1.1, 1, 1, 0x6a4a2a, 0, 0, 1.1);
      for (const x of [-30, 0, 30]) BB.add('wood', G.rbox(3, 2, 34, 0.7), x, 13, 0, 1, 1, 1, 0x4a2e18);
      BB.add('wood', G.tube('mast', 2.2, 1.6, 90, null, 8, 2), 6, 100, 0, 1, 1, 1, 0x3a2412); BB.add('wood', G.tube('yard', 1.2, 1.0, 56, null, 6, 1), 6, 98, 0, 1, 1, 1, 0x3a2412, 0, 0, 0);
      BB.add('cloth', G.memo('sail', () => { const g = new THREE.PlaneGeometry(50, 54, 8, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.cos(p.getX(i) / 25 * 1.4) * 5 * (1 - Math.abs(p.getY(i)) / 36)); g.computeVertexNormals(); g.rotateY(Math.PI / 2); return g; }), 6, 68, 0, 1, 1, 1, 0xf1e4c4);
      BB.add('gold', G.lathe('lanternGlassB', [[0.001, -3], [2, -2.6], [2.8, 0], [2, 2.6], [0.001, 3]], 8), -50, 30, 0, 1, 1, 1, 0xffa040);
      const mats2 = { wood: mats.wood, cloth: mats.cloth, gold: mats.gold };
      for (const key of ['wood', 'cloth', 'gold']) { const gm = BB.merged(key, true); if (!gm) continue; const m = new THREE.Mesh(gm, mats2[key]); const o = new THREE.Mesh(gm, ctx.outlines[key]); o.userData.outline = true; m.add(o); gb.add(m); }
      BB.dispose(); built.add(shadowed(gb)); boats.push({ g: gb, phase: k * 1.3 });
      const lg = glow(0xffa040, 70, 0.8); lg.position.set(-50, 30, 0); gb.add(lg);
    }
  }

  // Ground decals: puddles that reflect the sky, fallen petals, scuffs.
  const open = []; for (let r = 1; r < w.rows - 1; r++) for (let c = 1; c < w.cols - 1; c++) if (isOpen(c, r)) open.push([c, r]);
  const nP = Math.round((T.rain ? 26 : 8) * dens);
  for (let i = 0; i < nP && open.length; i++) { const [c, r] = open[Math.floor(R() * open.length)]; B.add('puddle', disc, (c + 0.15 + R() * 0.7) * ts, 0.5, (r + 0.15 + R() * 0.7) * ts, 8 + R() * 16, 1, 5 + R() * 10, 0x6aa0c0, R() * 3); }
  if (T.blossom) for (let i = 0; i < Math.round(160 * dens) && open.length; i++) { const [c, r] = open[Math.floor(R() * open.length)]; B.add('decal', disc, (c + R()) * ts, 0.5, (r + R()) * ts, 1.1, 1, 0.7, T.blossom[i % T.blossom.length], R() * 6); }
  for (let i = 0; i < Math.round(60 * dens) && open.length; i++) { const [c, r] = open[Math.floor(R() * open.length)]; B.add('decal', disc, (c + R()) * ts, 0.45, (r + R()) * ts, 5 + R() * 9, 1, 3 + R() * 5, 0x3a2418, R() * 6); }

  // ---- Finish: one mesh per key, each with its ink outline ----
  const out = [];
  for (const key of Object.keys(mats)) {
    if (key === 'water') continue;
    const geom = B.merged(key, Boolean(HULLS[key])); if (!geom) continue;
    const m = new THREE.Mesh(geom, mats[key]); built.add(m); out.push(m);
    if (HULLS[key]) { const o = new THREE.Mesh(geom, ctx.outlines[key]); o.userData.outline = true; built.add(o); }
    if (key === 'shade' || key === 'decal' || key === 'puddle') { m.renderOrder = key === 'shade' ? 1 : 2; m.userData.noShadowCast = true; }
  }
  B.dispose();
  return { lamps, boats, meshes: out };
}

export function tintHex(hex, k) { const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return (f(hex >> 16 & 255) << 16) | (f(hex >> 8 & 255) << 8) | f(hex & 255); }
