// One painted daylight street block: a looped road around a block of buildings, painted sky, cel shaded, no PBR and no tone mapping.
// Every texture is drawn on a canvas at load (no download). Units match the game: a person is about 64 units tall.
import * as THREE from '../../src/vendor/three-lite.js';

export const HX = 330; export const HZ = 190; export const CR = 95; export const ROAD = 120;
const rng = (seed) => { let s = seed % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const tex = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; };
const ramp = (() => { const d = new THREE.DataTexture(new Uint8Array([95, 130, 185, 235, 255]), 5, 1, THREE.RedFormat); d.minFilter = d.magFilter = THREE.LinearFilter; d.needsUpdate = true; return d; })();
const toon = (o) => new THREE.MeshToonMaterial({ gradientMap: ramp, ...o });

// ---- the path of the road: a rounded rectangle, parametrised by distance ----
const A = HX; const B = HZ; const R = CR;
const SEGS = [
  { len: 2 * (A - R), at: (u) => [-(A - R) + u, -B, 0] },
  { len: (Math.PI * R) / 2, at: (u) => { const t = -Math.PI / 2 + u / R; return [A - R + R * Math.cos(t), -(B - R) + R * Math.sin(t), t + Math.PI / 2]; } },
  { len: 2 * (B - R), at: (u) => [A, -(B - R) + u, Math.PI / 2] },
  { len: (Math.PI * R) / 2, at: (u) => { const t = u / R; return [A - R + R * Math.cos(t), B - R + R * Math.sin(t), t + Math.PI / 2]; } },
  { len: 2 * (A - R), at: (u) => [A - R - u, B, Math.PI] },
  { len: (Math.PI * R) / 2, at: (u) => { const t = Math.PI / 2 + u / R; return [-(A - R) + R * Math.cos(t), B - R + R * Math.sin(t), t + Math.PI / 2]; } },
  { len: 2 * (B - R), at: (u) => [-A, B - R - u, (3 * Math.PI) / 2] },
  { len: (Math.PI * R) / 2, at: (u) => { const t = Math.PI + u / R; return [-(A - R) + R * Math.cos(t), -(B - R) + R * Math.sin(t), t + Math.PI / 2]; } },
];
export const LOOP = SEGS.reduce((a, s) => a + s.len, 0);
export function ringAt(s, lane = 0, out = {}) { // x, z, heading a (forward = cos a, sin a); lane is a sideways offset in units
  let d = ((s % LOOP) + LOOP) % LOOP; let seg = SEGS[0];
  for (const q of SEGS) { if (d <= q.len) { seg = q; break; } d -= q.len; }
  const [x, z, a] = seg.at(d); out.x = x - Math.sin(a) * lane; out.z = z + Math.cos(a) * lane; out.a = a; return out;
}

// ---- painters ----
function paintSky() {
  const [c, g] = canvas(1024, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#3f86d4'); gr.addColorStop(0.42, '#8cc3ec'); gr.addColorStop(0.5, '#cfe6f2'); gr.addColorStop(0.55, '#f6e6c4'); gr.addColorStop(1, '#f6e6c4');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512); const r = rng(7);
  for (let i = 0; i < 12; i++) { // painted cumulus: lilac underside, white top, soft edge
    const cx = (i / 12) * 1024 + r() * 40; const cy = 190 + r() * 70; const sc = 0.8 + r() * 0.8;
    for (const [dy, col] of [[10, '#b9bfe0'], [0, '#fdfbf4']]) for (let k = 0; k < 7; k++) { const x = cx + (k - 3) * 22 * sc + r() * 8; const rad = (24 + r() * 16 - Math.abs(k - 3) * 3) * sc; g.fillStyle = col; g.beginPath(); g.arc(x, cy + dy - Math.sin(k / 6 * Math.PI) * 14 * sc, rad, 0, 7); g.fill(); }
  }
  return tex(c, false);
}
function paintGround() { // packed earth with cobbles and a few grass tufts
  const [c, g] = canvas(256, 256); const r = rng(3); g.fillStyle = '#c9a877'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { g.fillStyle = shade('#c9a877', 0.9 + r() * 0.22); g.beginPath(); g.ellipse(r() * 256, r() * 256, 5 + r() * 9, 4 + r() * 6, 0, 0, 7); g.fill(); }
  for (let i = 0; i < 22; i++) { const x = r() * 256; const y = r() * 256; g.strokeStyle = '#6d8a3c'; g.lineWidth = 2; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 3, y); g.lineTo(x + k * 6, y - 8 - r() * 5); g.stroke(); } }
  return tex(c);
}
function paintRoad() { // flagstones, ink joints, kerb along both edges (u across the road, v along it)
  const [c, g] = canvas(256, 256); const r = rng(5); g.fillStyle = '#e6d6b4'; g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = i * 64 + (j % 2) * 32; const y = j * 64; g.fillStyle = shade('#e6d6b4', 0.93 + r() * 0.12); g.fillRect(x + 2, y + 2, 60, 60); g.strokeStyle = '#8a7656'; g.lineWidth = 2.5; g.strokeRect(x + 2, y + 2, 60, 60); }
  g.fillStyle = '#b6a07a'; g.fillRect(0, 0, 14, 256); g.fillRect(242, 0, 14, 256); g.fillStyle = '#7a6648'; g.fillRect(12, 0, 3, 256); g.fillRect(241, 0, 3, 256);
  const t = tex(c); t.wrapS = THREE.ClampToEdgeWrapping; return t;
}
function paintWall(base, seed) { // one bay: plaster, an arched window with shutters, a cornice line (tiles across and up the facade)
  const [c, g] = canvas(128, 160); const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, 128, 160);
  for (let i = 0; i < 40; i++) { g.strokeStyle = shade(base, 0.93 + r() * 0.14); g.globalAlpha = 0.5; g.lineWidth = 6 + r() * 6; g.beginPath(); const x = r() * 128; g.moveTo(x, r() * 160); g.lineTo(x + r() * 8 - 4, r() * 160); g.stroke(); } g.globalAlpha = 1;
  g.fillStyle = shade(base, 0.8); g.fillRect(0, 148, 128, 12); g.fillStyle = shade(base, 1.08); g.fillRect(0, 146, 128, 3); // floor band
  g.fillStyle = '#4a2f26'; g.beginPath(); g.moveTo(40, 120); g.lineTo(40, 58); g.arc(64, 58, 24, Math.PI, 0); g.lineTo(88, 120); g.closePath(); g.fill();
  g.fillStyle = '#f0e4c8'; g.fillRect(34, 120, 60, 7); // sill
  g.fillStyle = '#2f6e68'; g.fillRect(41, 60, 21, 60); g.fillRect(66, 60, 21, 60); g.strokeStyle = '#17302d'; g.lineWidth = 2; for (let y = 68; y < 120; y += 9) { g.beginPath(); g.moveTo(41, y); g.lineTo(62, y); g.moveTo(66, y); g.lineTo(87, y); g.stroke(); }
  g.strokeStyle = '#6a4a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(36, 122); g.lineTo(36, 58); g.arc(64, 58, 28, Math.PI, 0); g.lineTo(92, 122); g.stroke();
  return tex(c);
}
function paintRoof(col) { const [c, g] = canvas(128, 128); const r = rng(11); g.fillStyle = col; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 16) for (let x = (y / 16 % 2) * 8; x < 128; x += 16) { g.fillStyle = shade(col, 0.86 + r() * 0.26); g.beginPath(); g.arc(x + 8, y, 8, 0, Math.PI); g.fill(); g.strokeStyle = shade(col, 0.6); g.lineWidth = 1.6; g.stroke(); } return tex(c); }
function paintBlob() { const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(40,24,30,0.55)'); gr.addColorStop(0.7, 'rgba(40,24,30,0.3)'); gr.addColorStop(1, 'rgba(40,24,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c, false); }

// ---- geometry ----
function wallBox(w, h, d, bay = 44, floor = 56) { // a box whose side uv tile one bay at a time
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * (dims[f][0] / bay), uv.getY(i) * (dims[f][1] / floor)); }
  return g;
}
function hipRoof(w, d, h, over = 10) {
  const x = w / 2 + over; const z = d / 2 + over; const P = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]]; const apex = [0, h, 0]; const pos = []; const uv = [];
  for (let i = 0; i < 4; i++) { const a = P[i]; const b = P[(i + 1) % 4]; pos.push(...a, ...b, ...apex); const l = Math.hypot(b[0] - a[0], b[2] - a[2]) / 40; uv.push(0, 0, l, 0, l / 2, h / 24); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function roadStrip(width, step = 6) { // a flat ribbon along the loop
  const pos = []; const uv = []; const idx = []; const o = {}; const n = Math.ceil(LOOP / step);
  for (let i = 0; i <= n; i++) { const s = (i / n) * LOOP; for (const side of [-1, 1]) { ringAt(s, side * width / 2, o); pos.push(o.x, 0.6, o.z); uv.push(side < 0 ? 0 : 1, s / 128); } if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function buildStreet(scene, maxShadows = 16) {
  const horizon = new THREE.Color('#f1e3c2'); scene.background = horizon; scene.fog = new THREE.Fog(horizon, 900, 2800);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 24, 12), new THREE.MeshBasicMaterial({ map: paintSky(), side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -1; scene.add(sky);
  const gt = paintGround(); gt.repeat.set(2600 / 128, 2600 / 128);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), toon({ map: gt })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  scene.add(new THREE.Mesh(roadStrip(ROAD), toon({ map: paintRoad() })));
  const bases = ['#f1e2c2', '#efc9a0', '#e6b98a', '#dfe3c8', '#f3d9b8', '#e9c0b0']; const roofCols = ['#c4573a', '#b84a32', '#cf7a45'];
  const wallTex = bases.map((b, i) => paintWall(b, 20 + i)); const roofTex = roofCols.map(paintRoof); const wallMat = wallTex.map((t) => toon({ map: t })); const roofMat = roofTex.map((t) => toon({ map: t, side: THREE.DoubleSide }));
  const domeMat = toon({ color: 0xf6ead0 }); const gold = toon({ color: 0xe8a93a }); let count = 0;
  const building = (x, z, w, d, floors, k, facing) => { // facing: unused, kept so the layout reads as data
    const h = floors * 56; const m = new THREE.Mesh(wallBox(w, h, d), wallMat[k % wallMat.length]); m.position.set(x, h / 2, z); scene.add(m);
    if (k % 3 === 2) { // flat roof with a parapet and a small domed chhatri
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 7, d + 6), toon({ color: 0xf0dfbd })); p.position.set(x, h + 3.5, z); scene.add(p);
      const dm = new THREE.Mesh(new THREE.SphereGeometry(13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dm.position.set(x, h + 24, z); scene.add(dm);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 16, 10), gold); base.position.set(x, h + 15, z); scene.add(base); count += 3;
    } else { const roof = new THREE.Mesh(hipRoof(w, d, 34 + (k % 2) * 8), roofMat[k % roofMat.length]); roof.position.set(x, h, z); scene.add(roof); count += 1; }
    count += 1;
  };
  // inner block (inside the loop), then the two long outer rows and the short ends
  [[-175, 0, 130, 170, 3], [-35, 0, 130, 170, 2], [105, 0, 140, 170, 3], [235, 0, 70, 120, 2]].forEach(([x, z, w, d, f], i) => building(x, z, w, d, f, i));
  for (let i = 0; i < 5; i++) { building(-300 + i * 150, -300, 124, 120, 2 + (i % 3), i + 1); building(-300 + i * 150, 300, 124, 120, 3 - (i % 2), i + 4); }
  for (const s of [-1, 1]) for (let j = 0; j < 2; j++) building(s * 470, -90 + j * 180, 120, 150, 2 + ((j + (s > 0 ? 1 : 0)) % 2), j + (s > 0 ? 2 : 0));
  // trees: one instanced mesh for trunks, one for crowns
  const spots = []; const o = {}; for (let i = 0; i < 26; i++) { ringAt((i / 26) * LOOP, (i % 2 ? 1 : -1) * (ROAD / 2 + 12), o); if (Math.hypot(o.x, o.z + HZ) > 240) spots.push([o.x, o.z]); } // none in the close-up area at the bottom of the loop
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.6, 3.4, 26, 6), toon({ color: 0x6b4630 }), spots.length); const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(15, 1), toon({ color: 0xffffff }), spots.length);
  const m4 = new THREE.Matrix4(); const greens = ['#5f9a3c', '#6faa45', '#4f8a3a', '#7bb04a']; const col = new THREE.Color(); const r = rng(9);
  spots.forEach(([x, z], i) => { m4.makeTranslation(x, 13, z); trunk.setMatrixAt(i, m4); const s = 0.85 + r() * 0.5; m4.makeScale(s, s * 1.1, s); m4.setPosition(x, 38 * s, z); crown.setMatrixAt(i, m4); crown.setColorAt(i, col.set(greens[i % 4])); });
  scene.add(trunk, crown); count += 2;
  // contact shadows for people: one instanced mesh of soft dark discs
  const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: paintBlob(), transparent: true, depthWrite: false, fog: false }), maxShadows); shadows.frustumCulled = false; shadows.count = 0; shadows.renderOrder = 1; scene.add(shadows);
  const mm = new THREE.Matrix4();
  const setShadow = (i, x, z, size) => { mm.makeScale(size, 1, size); mm.setPosition(x, 1.1, z); shadows.setMatrixAt(i, mm); shadows.instanceMatrix.needsUpdate = true; };
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0xe3c597, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.6); sun.position.set(-260, 420, 340); scene.add(sun, sun.target);
  return { sky, shadows, setShadow, sun, sceneDraws: count + 7 };
}
