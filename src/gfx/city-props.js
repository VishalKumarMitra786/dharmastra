// Pickable props in 3D (docs/review/prop-hooks.md): stick, bamboo staff, club, clay pot, stone, oil lamp, torch, spear, fallen sword, wood shield, bench, crate,
// market pole, rope coil, grain sack. Each is built in METRES (long things along +Y, centred on the grip), so the same mesh can sit on the ground
// (scaled by UNITS) or in a hero's hand (the hero bones are in metres too). Three crack states are shown by SHAPE, never colour alone: thin dark fracture slabs
// (cracked, nearly broken) and a debris pile (broken). Idle props carry a pale ground ring, a shape cue that also reads on dark ground.
// History/Tradition labels: every prop is a plain everyday object (Tradition, no date); the designs are Invented.
import { gradePatch } from './materials.js';
export const PROP_UNITS = 36.5; // game units per metre (a person is 62 units)
export const PROP_LONG = new Set(['stick', 'bamboo-staff', 'spear', 'fallen-sword', 'club', 'market-pole', 'torch']); // lie on the ground along their length

export function createWorldProps(THREE, grade) {
  const mats = {}; const std = (c, o = {}) => gradePatch(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, envMapIntensity: 0.8, ...o }), grade);
  mats.wood = std(0x8a6a44); mats.dark = std(0x5a3d22); mats.bamboo = std(0xb9b85a, { roughness: 0.55 }); mats.steel = std(0xb9bec6, { roughness: 0.32, metalness: 0.95 }); mats.brass = std(0xd9a93a, { roughness: 0.32, metalness: 0.9 });
  mats.clay = std(0xb4663f, { roughness: 0.7 }); mats.stone = std(0x8b8780, { roughness: 0.95 }); mats.cloth = std(0xc2483a, { roughness: 0.92, side: THREE.DoubleSide }); mats.sack = std(0xcdb27a, { roughness: 0.95 });
  mats.crack = new THREE.MeshBasicMaterial({ color: 0x120a06 }); mats.ring = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  mats.flame = new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false });
  const geos = []; const G = (g) => { geos.push(g); return g; };
  const lathe = (pts, seg = 14) => G(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const cylG = (r1, r2, h, s = 8) => G(new THREE.CylinderGeometry(r1, r2, h, s)); const boxG = (w, h, d) => G(new THREE.BoxGeometry(w, h, d));

  const build = {
    stick: () => { const g = new THREE.Group(); g.add(M(cylG(0.016, 0.02, 1.0, 6), mats.wood)); g.add(M(G(new THREE.SphereGeometry(0.024, 6, 4)), mats.dark, 0.0, 0.18, 0.012)); return g; },
    'bamboo-staff': () => { const g = new THREE.Group(); g.add(M(cylG(0.02, 0.022, 1.8, 8), mats.bamboo)); for (let i = -4; i <= 4; i++) g.add(M(G(new THREE.TorusGeometry(0.023, 0.006, 4, 10)), mats.dark, 0, i * 0.2, 0)).rotation.x = Math.PI / 2; return g; },
    club: () => { const g = new THREE.Group(); g.add(M(lathe([[0.001, -0.3], [0.02, -0.3], [0.022, -0.1], [0.04, 0.12], [0.065, 0.3], [0.06, 0.42], [0.001, 0.44]], 10), mats.dark)); g.add(M(G(new THREE.TorusGeometry(0.052, 0.008, 4, 10)), mats.brass, 0, 0.34, 0)).rotation.x = Math.PI / 2; return g; },
    'clay-pot': () => { const g = new THREE.Group(); g.add(M(lathe([[0.001, 0], [0.08, 0], [0.15, 0.1], [0.17, 0.2], [0.12, 0.31], [0.08, 0.35], [0.1, 0.39], [0.075, 0.4], [0.001, 0.37]], 14), mats.clay)); return g; },
    stone: () => { const g = new THREE.Group(); const s = M(G(new THREE.IcosahedronGeometry(0.11, 1)), mats.stone, 0, 0.07, 0); s.scale.set(1.1, 0.7, 0.9); g.add(s); return g; },
    'oil-lamp': () => { const g = new THREE.Group(); g.add(M(lathe([[0.001, 0], [0.05, 0], [0.07, 0.03], [0.05, 0.065], [0.02, 0.075], [0.001, 0.075]], 10), mats.brass)); g.add(M(boxG(0.09, 0.012, 0.02), mats.brass, 0.07, 0.06, 0)); const f = M(G(new THREE.SphereGeometry(0.014, 6, 4)), mats.flame, 0.115, 0.08, 0); f.scale.set(1, 1.8, 1); f.userData.flame = true; g.add(f); return g; },
    torch: () => { const g = new THREE.Group(); g.add(M(cylG(0.02, 0.025, 0.85, 6), mats.wood, 0, -0.1, 0)); g.add(M(cylG(0.045, 0.03, 0.14, 8), mats.dark, 0, 0.38, 0)); const f = M(G(new THREE.SphereGeometry(0.045, 7, 5)), mats.flame, 0, 0.5, 0); f.scale.set(1, 1.7, 1); f.userData.flame = true; g.add(f); return g; },
    spear: () => { const g = new THREE.Group(); g.add(M(cylG(0.014, 0.017, 1.9, 6), mats.wood, 0, 0.1, 0)); g.add(M(G(new THREE.ConeGeometry(0.03, 0.2, 5)), mats.steel, 0, 1.15, 0)); g.add(M(cylG(0.026, 0.026, 0.03, 6), mats.brass, 0, 1.03, 0)); return g; },
    'fallen-sword': () => { const g = new THREE.Group(); g.add(M(boxG(0.045, 0.72, 0.008), mats.steel, 0, 0.42, 0)); g.add(M(G(new THREE.ConeGeometry(0.0225, 0.07, 4)), mats.steel, 0, 0.8, 0)).rotation.y = Math.PI / 4; g.add(M(boxG(0.16, 0.022, 0.03), mats.brass, 0, 0.055, 0)); g.add(M(cylG(0.017, 0.017, 0.16, 6), mats.dark, 0, -0.03, 0)); g.add(M(G(new THREE.SphereGeometry(0.024, 6, 4)), mats.brass, 0, -0.12, 0)); return g; },
    'wood-shield': () => { const g = new THREE.Group(); const d = M(cylG(0.3, 0.3, 0.035, 18), mats.wood); d.rotation.x = Math.PI / 2; g.add(d); const r = M(G(new THREE.TorusGeometry(0.3, 0.014, 4, 22)), mats.brass); g.add(r); const b = M(G(new THREE.SphereGeometry(0.06, 8, 5)), mats.brass, 0, 0, 0.03); b.scale.z = 0.5; g.add(b); const band = M(boxG(0.6, 0.06, 0.04), mats.dark); g.add(band); return g; },
    bench: () => { const g = new THREE.Group(); for (let k = -1; k <= 1; k++) g.add(M(boxG(1.3, 0.04, 0.12), mats.wood, 0, 0.43, k * 0.13)); for (const sx of [-0.55, 0.55]) { g.add(M(boxG(0.07, 0.42, 0.4), mats.dark, sx, 0.21, 0)); } g.add(M(boxG(1.1, 0.05, 0.05), mats.dark, 0, 0.18, 0)); return g; },
    crate: () => { const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const z = 0.06 + k * 0.1; for (const s of [-1, 1]) { g.add(M(boxG(0.56, 0.085, 0.025), mats.wood, 0, z, s * 0.28)); g.add(M(boxG(0.025, 0.085, 0.56), mats.wood, s * 0.28, z, 0)); } } for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(M(boxG(0.06, 0.42, 0.06), mats.dark, sx * 0.26, 0.21, sz * 0.26)); g.add(M(boxG(0.52, 0.03, 0.52), mats.wood, 0, 0.03, 0)); return g; },
    'market-pole': () => { const g = new THREE.Group(); g.add(M(cylG(0.03, 0.04, 2.4, 8), mats.wood, 0, 0.1, 0)); g.add(M(boxG(0.6, 0.03, 0.03), mats.dark, 0.3, 1.2, 0)); const f = new THREE.Mesh(G(new THREE.PlaneGeometry(0.52, 0.8, 4, 4)), mats.cloth); f.position.set(0.3, 0.8, 0); g.add(f); g.add(M(G(new THREE.SphereGeometry(0.05, 6, 4)), mats.brass, 0, 1.33, 0)); return g; },
    rope: () => { const g = new THREE.Group(); for (let k = 0; k < 3; k++) { const t = M(G(new THREE.TorusGeometry(0.18 - k * 0.012, 0.03, 6, 18)), mats.sack, 0, 0.03 + k * 0.05, 0); t.rotation.x = Math.PI / 2; g.add(t); } return g; },
    'grain-sack': () => { const g = new THREE.Group(); const s = M(lathe([[0.001, 0], [0.16, 0.005], [0.23, 0.12], [0.21, 0.3], [0.12, 0.45], [0.07, 0.5], [0.11, 0.56], [0.06, 0.62], [0.001, 0.58]], 10), mats.sack); s.scale.z = 0.85; g.add(s); return g; },
  };
  // Each prop is flattened to at most three draws (matte, metal, flame) with vertex colours, so a street of props stays cheap.
  mats.matte = gradePatch(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.8, side: THREE.DoubleSide }), grade);
  mats.metal = gradePatch(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0.92, envMapIntensity: 1.2 }), grade);
  function flatten(group) {
    group.updateMatrixWorld(true); const buckets = { matte: [], metal: [] }; const keep = new THREE.Group(); const flames = [];
    group.traverse((o) => {
      if (!o.isMesh) return; if (o.userData.flame) { flames.push(o); return; }
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); const n = g.attributes.position.count; const col = new Float32Array(n * 3); const c = o.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      (o.material === mats.steel || o.material === mats.brass ? buckets.metal : buckets.matte).push(g);
    });
    for (const [k, list] of Object.entries(buckets)) { if (!list.length) continue; const mg = THREE.mergeGeometries(list); geos.push(mg); list.forEach((x) => x.dispose()); const m = new THREE.Mesh(mg, mats[k]); m.castShadow = true; keep.add(m); }
    flames.forEach((f) => { f.removeFromParent(); f.position.applyMatrix4(group.matrixWorld); keep.add(f); });
    return keep;
  }
  const cache = new Map();
  // A fresh Group for a prop kind (geometry and materials are shared; only the Group and its fracture marks are new). `h` is its height, for the crack marks.
  function make(kind) {
    const f = build[kind] || build.stick; if (!cache.has(kind)) { const raw = f(); const bx = new THREE.Box3().setFromObject(raw); cache.set(kind, Object.assign(flatten(raw), { userData: { box: bx } })); }
    const src = cache.get(kind); const g = src.clone(true); g.userData = { kind, flames: [] };
    g.traverse((o) => { if (o.userData?.flame) g.userData.flames.push(o); });
    const box = src.userData.box; const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
    const cracks = new THREE.Group(); cracks.visible = false; const R = Math.max(size.x, size.y, size.z); const lists = [[], []];
    for (let i = 0; i < 5; i++) for (const zz of [box.max.z + 0.004, box.min.z - 0.004]) { const s2 = boxG(0.008, R * (0.1 + (i % 3) * 0.04), 0.004); const gg = s2.clone(); gg.rotateZ((i % 2 ? 0.5 : -0.5) + i * 0.15); gg.translate(ctr.x + (i - 2) * size.x * 0.16, ctr.y + (i % 2 ? 0.2 : -0.2) * size.y, zz); lists[i < 2 ? 0 : 1].push(gg); }
    lists.forEach((l, k) => { const mg = THREE.mergeGeometries(l); geos.push(mg); const m = new THREE.Mesh(mg, mats.crack); m.userData.n = k === 0 ? 0 : 2; cracks.add(m); });
    g.add(cracks); g.userData.cracks = cracks;
    return g;
  }
  // The pile left when a prop breaks (crack 3): a handful of shards in the prop's own material.
  function debris(kind) {
    const g = new THREE.Group(); const m = kind === 'clay-pot' ? mats.clay : kind === 'stone' ? mats.stone : mats.wood; const r = kind === 'bench' || kind === 'crate' ? 0.25 : 0.12;
    for (let i = 0; i < 7; i++) { const s = M(boxG(0.05 + (i % 3) * 0.03, 0.02, 0.04 + (i % 2) * 0.04), m, Math.cos(i * 2.4) * r, 0.012, Math.sin(i * 2.4) * r); s.rotation.set(0, i * 1.7, (i % 3) * 0.12); g.add(s); }
    return flatten(g);
  }
  function ring(radius) { const r = new THREE.Mesh(G(new THREE.RingGeometry(radius * 0.86, radius, 24)), mats.ring); r.rotation.x = -Math.PI / 2; r.position.y = 0.012; return r; }
  return { make, debris, ring, mats, dispose() { geos.forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); cache.clear(); } };
}
