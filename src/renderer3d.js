// Three.js renderer implementing the interface in renderer.js.
// A walking mission is shown as a city map: a high, north-up camera follows a person on foot through streets built to match the era
// (see THEMES). The city has buildings, market stalls, trees, lamps, walking townspeople, patrolling guards, shadows and a night sky.
// Materials are physically based (standard PBR) with filmic tone mapping and an image-based ambient light; capable desktops also get bloom
// on lamps, windows and checkpoint beams. Buildings are built from simple shapes, and people are articulated shapes unless authored
// glTF characters are listed in assets/characters/manifest.json (see docs/assets.md), in which case those are used with their own skeleton animation.
// Meaning is never colour alone: checkpoints change height and style and carry a number or a check mark,
// guards have a spear, a helmet, a ground ring and a facing wedge, and the player shows a ring while protected.
// The caller passes in the THREE namespace so the large library is only downloaded when 3D is used.
import { followCamera, createCameraState, createOrbit, thirdPersonView, enemyIcon, vaultHop, burstSpec, burstColor, MAX_PARTICLES } from './camera.js';

const CP = {
  next: { height: 190, color: 0x28e0d0, wire: false },
  done: { height: 30, color: 0x57e07a, wire: false },
  later: { height: 70, color: 0xd9c48f, wire: true },
};
const DUST = 60;
const RAIN = 260;

// Era looks. Each one is a deliberate choice: Dvapara Yuga is the epic age (a grand palace city in cream stone with gold and saffron),
// the Mauryan city is timber and thatch behind a palisade on a river in the monsoon.
const THEMES = {
  hastinapur: {
    sky: ['#08051f', '#2b1760', '#9a3f6a', '#f5985a'], fog: 0x2a1650, fogNear: 700, fogFar: 2300, bg: 0x120c33,
    hemi: [0xcdb8ff, 0x5a3a3c, 0.95], moon: [0xcdd4ff, 0.8], lamp: 0xffb45a, rain: false,
    walls: [0xe9d9b8, 0xdcc79f, 0xf0e2c4, 0xd6bd92], trim: 0xffc247, roof: 'dome', roofColor: 0xf6ead0, roofTop: 0xb0805c, dome: 0xffc247, ground: '#8d7c62', groundTint: 0xe6d6bc,
    heights: [120, 175], banner: 0xff7a1a, banner2: 0xe8432e, tree: 0x3f8a4a, hero: { top: 0xff8a1f, bottom: 0xf3ead6, scarf: 0xe8432e, skin: 0xc68a5a, hair: 0x1b1210 },
    guard: { top: 0xb02a2a, bottom: 0x5a2a1a, helm: 0xffc247 },
  },
  pataliputra: {
    sky: ['#05101c', '#10304a', '#2c5a6a', '#6aa0a0'], fog: 0x0f2b3a, fogNear: 520, fogFar: 1900, bg: 0x08141f,
    hemi: [0x9fd0e4, 0x3a3a46, 1.45], moon: [0xaad4ff, 0.65], lamp: 0xffa040, rain: true,
    walls: [0x6b4a32, 0x5a3d2a, 0x7a5638, 0x4f3524], trim: 0x2e1d12, roof: 'pitched', roofColor: 0x9a5a3a, roof2: 0xb89a54, ground: '#6a5b48', groundTint: 0xd8c8b4,
    heights: [100, 150], banner: 0x1fb6a6, banner2: 0xf0c04a, tree: 0x2f6e4a, hero: { top: 0x1fb6a6, bottom: 0xe8dcc0, scarf: 0xf0c04a, skin: 0xb87a50, hair: 0x120c0a },
    guard: { top: 0x3a4a5a, bottom: 0x2a2018, helm: 0xb87a3a },
  },
};
THEMES.default = THEMES.hastinapur;

function canvasTex(THREE, size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }


// Icon geometry built from triangles (no textures). Units: about 26 tall, origin at the bottom centre.
function fan(out, pts) { for (let i = 1; i < pts.length - 1; i++) out.push(pts[0][0], pts[0][1], 0, pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1], 0); }
function strip(out, a, b, closed) { const n = a.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; fan(out, [a[i], a[j], b[j], b[i]]); } }
function circlePts(cx, cy, r, n = 8) { const p = []; for (let i = 0; i < n; i++) p.push([cx + Math.cos(i / n * Math.PI * 2) * r, cy + Math.sin(i / n * Math.PI * 2) * r]); return p; }
export function iconVertices(kind) {
  const v = [];
  if (kind === 'bang') { fan(v, [[-4, 26], [4, 26], [2.2, 9], [-2.2, 9]]); fan(v, circlePts(0, 3.4, 3.4)); }
  else if (kind === 'question') {
    const o = []; const inn = [];
    for (let i = 0; i <= 10; i++) { const a = (200 - i * 27) * Math.PI / 180; o.push([Math.cos(a) * 9.5, 19 + Math.sin(a) * 9.5]); inn.push([Math.cos(a) * 5.2, 19 + Math.sin(a) * 5.2]); }
    strip(v, o, inn, false); fan(v, [[-2.2, 5], [2.2, 5], [2.2, 12], [-2.2, 12]]); fan(v, circlePts(0, 1.8, 3.2));
  } else if (kind === 'shield') {
    const o = [[-10, 26], [10, 26], [10, 14], [7, 6], [0, 0], [-7, 6], [-10, 14]];
    const cx = 0; const cy = 15; const inn = o.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5]);
    strip(v, o, inn, true); // outlined shield: a hollow shape, different from the solid '!' and '?'
  }
  return new Float32Array(v);
}

export function createRenderer3D(canvas, THREE, { onContextLost } = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.25;
  const shadowsOn = (navigator.hardwareConcurrency || 8) > 4;
  if (shadowsOn) { gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap; }
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  const fancy = shadowsOn && (fine || /[?&]fx=1/.test(location.search)) && !/[?&]fx=0/.test(location.search); // bloom: desktops by default, phones only on request
  let composer = null;
  const scene = new THREE.Scene();
  { const pm = new THREE.PMREMGenerator(gl); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(48, 1, 10, 4200);
  const camState = createCameraState();
  const orbit = createOrbit();
  let blocked = null; // wall test for the camera boom, set in setWorld

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xffffff, 0.9);
  if (shadowsOn) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera; sc.left = -620; sc.right = 620; sc.top = 620; sc.bottom = -620; sc.near = 50; sc.far = 1800;
    moon.shadow.bias = -0.0008;
  }
  scene.add(moon); scene.add(moon.target);
  const lantern = new THREE.PointLight(0xffb45a, 2.4, 380, 1.5);
  scene.add(lantern);

  // Shared textures.
  const glowTex = canvasTex(THREE, 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const beamTex = canvasTex(THREE, 64, (g, s) => {
    const l = g.createLinearGradient(0, s, 0, 0);
    l.addColorStop(0, 'rgba(255,255,255,0.95)'); l.addColorStop(0.6, 'rgba(255,255,255,0.35)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 0, s, s);
  });
  const mandalaTex = canvasTex(THREE, 256, (g, s) => {
    const c = s / 2;
    g.translate(c, c);
    g.strokeStyle = '#fff1c9'; g.fillStyle = '#fff1c9';
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, c - 8, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, c * 0.62, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      g.save(); g.rotate((i / 12) * Math.PI * 2);
      g.beginPath(); g.moveTo(0, -c * 0.62); g.quadraticCurveTo(c * 0.16, -c * 0.8, 0, -c * 0.97); g.quadraticCurveTo(-c * 0.16, -c * 0.8, 0, -c * 0.62); g.fill();
      g.restore();
    }
    for (let i = 0; i < 8; i++) { g.save(); g.rotate((i / 8) * Math.PI * 2); g.fillRect(-2, -c * 0.6, 4, c * 0.4); g.restore(); }
  });
  let skyTex = null; let groundTex = null; let waterTex = null;

  // Sky dome, moon and stars follow the camera.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false }));
  scene.add(sky);
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c9, transparent: true, depthWrite: false, fog: false }));
  moonDisc.scale.set(600, 600, 1); scene.add(moonDisc);
  const stars = (() => {
    const rand = rng(99); const pos = [];
    for (let i = 0; i < 240; i++) {
      const a = rand() * Math.PI * 2; const e = 0.15 + rand() * 1.0; const r = 3400;
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff6dd, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    scene.add(p); return p;
  })();

  // Rain (monsoon cities only) and dust puffs from running feet.
  const rain = (() => {
    const geo = new THREE.BufferGeometry();
    const a = new THREE.Float32BufferAttribute(new Float32Array(RAIN * 3), 3); a.setUsage(THREE.DynamicDrawUsage);
    const rand = rng(5);
    for (let i = 0; i < RAIN; i++) a.setXYZ(i, (rand() - 0.5) * 1400, rand() * 700, (rand() - 0.5) * 1000);
    geo.setAttribute('position', a);
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe4ff, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
    p.frustumCulled = false; p.visible = false; scene.add(p);
    return { p, a };
  })();
  const dust = (() => {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.Float32BufferAttribute(new Float32Array(DUST * 3).fill(-99999), 3); pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe9c78f, size: 14, map: glowTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false; scene.add(p);
    return { p, pos, life: new Float32Array(DUST), vx: new Float32Array(DUST), vz: new Float32Array(DUST), next: 0 };
  })();

  let world = null; let theme = THEMES.default;
  let built = null;
  let hero = null; let heroTop = null; let protectRing = null; let heroLook = null;
  const enemies = []; const pickups = []; let obstacleGroup = null; let obstacleSig = -1; let heroStaff = null; let heroSword = null; let heroBow = null; let lastEventsFrame = null; const targets3 = []; const arrows3 = [];
  const guards = []; const npcs = []; const cps = []; const lamps = []; const boats = [];
  let lastNow = 0; let lost = false; let spawnAcc = 0;

  const onLost = (e) => { e.preventDefault(); lost = true; onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  // Shared geometry and materials (people reuse these).
  const geoCache = new Map(); const matCache = new Map();
  function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
  function mat(color, extra) { const k = color + (extra ? JSON.stringify(extra) : ''); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, ...extra })); return matCache.get(k); }
  function box(w, h, d, m) { return new THREE.Mesh(geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), m); }
  function cyl(rt, rb, h, seg, m) { return new THREE.Mesh(geo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m); }
  function ball(r, m, sx = 1, sy = 1, sz = 1) { const s = new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), m); s.scale.set(sx, sy, sz); return s; }
  function glow(color, size, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(size, size, 1); return s;
  }
  function shadowed(o, cast = true, receive = false) { if (shadowsOn) o.traverse((m) => { if (m.isMesh && !m.userData.outline) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; }

  function label(text, bg) {
    return canvasTex(THREE, 128, (g) => {
      g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#fff4de'; g.stroke();
      g.fillStyle = '#140b07'; g.font = 'bold 80px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 64, 70);
    });
  }

  // ---- Anime-style look for people: cel shading, a dark outline, big eyes ----
  const toonGradient = (() => { const d = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat); d.minFilter = d.magFilter = THREE.NearestFilter; d.needsUpdate = true; return d; })();
  const toonCache = new Map();
  function toon(color) { if (!toonCache.has(color)) toonCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient })); return toonCache.get(color); }
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a0f1f, side: THREE.BackSide });
  const eyeTexCache = new Map();
  function eyeTex(iris) {
    if (!eyeTexCache.has(iris)) eyeTexCache.set(iris, canvasTex(THREE, 128, (g, sz) => {
      g.clearRect(0, 0, sz, sz);
      for (const cx of [34, 94]) {
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, 66, 17, 24, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = iris; g.beginPath(); g.ellipse(cx, 70, 12, 19, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#140a14'; g.beginPath(); g.ellipse(cx, 72, 6, 11, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 5, 60, 4.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#140a14'; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, 66, 17, 24, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); // upper lash line
        g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 17, 30); g.quadraticCurveTo(cx, 22, cx + 17, 30); g.stroke(); // brow
      }
    }));
    return eyeTexCache.get(iris);
  }

  // ---- People ----------------------------------------------------------------------------------------------------------
  // Faces +x. About 62 units tall. Limbs hang from pivots so a walk cycle is just a few rotations.
  function makePerson(o) {
    const mat = toon; // people are cel shaded
    const g = new THREE.Group();
    const skin = mat(o.skin); const top = o.topMat || mat(o.top); const bot = mat(o.bottom); const dark = mat(0x2a1a10);
    const legs = []; const arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0, 30, side * 4);
      const leg = cyl(2.6, 2.1, 28, 6, o.legsBare ? skin : bot); leg.position.y = -14; pivot.add(leg);
      const foot = box(7, 3, 4.6, dark); foot.position.set(1.8, -29, 0); pivot.add(foot);
      g.add(pivot); legs.push(pivot);
    }
    const upper = new THREE.Group(); g.add(upper);
    if (o.skirt) { const sk = cyl(6.2, 8.6, 17, 8, bot); sk.position.y = 24; upper.add(sk); } else { const hip = box(8, 6, 13, bot); hip.position.y = 31; upper.add(hip); }
    const torso = o.female ? cyl(5.6, 6.6, 19, 8, top) : cyl(6.6, 7.6, 19, 8, top); torso.position.y = 39; upper.add(torso);
    if (o.sash) { const sh = cyl(7.6, 7.6, 3, 8, mat(o.sash)); sh.position.y = 32; upper.add(sh); }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0, 46, side * (o.female ? 8 : 9.4));
      const arm = cyl(2.3, 1.9, 19, 6, o.sleeves ? top : skin); arm.position.y = -9.5; pivot.add(arm);
      const hand = ball(2.4, skin); hand.position.y = -20; pivot.add(hand);
      upper.add(pivot); arms.push(pivot);
    }
    const neck = cyl(2.2, 2.4, 3, 6, skin); neck.position.y = 49.5; upper.add(neck);
    const head = ball(7.4, skin); head.position.y = 57.5; upper.add(head); // anime proportions: a big head
    const face = new THREE.Mesh(geo('face', () => new THREE.PlaneGeometry(11.5, 11.5)), new THREE.MeshBasicMaterial({ map: eyeTex(o.eyes || '#3a7bd8'), transparent: true }));
    face.rotation.y = Math.PI / 2; face.position.set(7.35, 56.5, 0); face.userData.noOutline = true; upper.add(face);
    const hairMat = mat(o.hair || 0x1b1210);
    if (o.turban) { const tb = ball(8.4, mat(o.turban), 1, 0.74, 1); tb.position.y = 62; upper.add(tb); const tc = ball(4.4, mat(o.turban), 1, 0.9, 1); tc.position.y = 68; upper.add(tc); }
    else if (o.helm) { const hm = new THREE.Mesh(geo('helm', () => new THREE.ConeGeometry(7.6, 14, 8)), mat(o.helm)); hm.position.y = 71; upper.add(hm); const br = cyl(8, 8, 2.4, 8, mat(o.helm)); br.position.y = 63.5; upper.add(br); }
    else {
      const hr = ball(7.9, hairMat, 1, 0.82, 1.03); hr.position.set(-0.8, 60.5, 0); upper.add(hr);
      for (const [a, len] of [[-0.9, 9], [-0.35, 11], [0.35, 11], [0.9, 9]]) { const sp = new THREE.Mesh(geo(`hs${len}`, () => new THREE.ConeGeometry(2.6, len, 5)), hairMat); sp.position.set(-6, 60, a * 8); sp.rotation.z = Math.PI / 2 + 0.25; sp.rotation.x = a * 0.4; upper.add(sp); }
      const bang = ball(5, hairMat, 0.8, 0.5, 1.5); bang.position.set(4.4, 64.5, 0); upper.add(bang);
      if (o.bun) { const bn = ball(3.2, hairMat); bn.position.set(-7, 64, 0); upper.add(bn); }
      if (o.hairStyle === 'long') { const lh = cyl(6.4, 4.2, 24, 8, hairMat); lh.position.set(-5.5, 50, 0); upper.add(lh); }
      if (o.hairStyle === 'braid') { for (let b = 0; b < 4; b++) { const bl = ball(3 - b * 0.35, hairMat); bl.position.set(-7 - b * 1.2, 55 - b * 6.5, 5); upper.add(bl); } }
    }
    const extras = {};
    if (o.scarf) { const sc = box(16, 2.4, 5, mat(o.scarf)); sc.position.set(-10, 47, 0); upper.add(sc); extras.scarf = sc; const sc2 = box(5, 6, 5.4, mat(o.scarf)); sc2.position.set(1, 46, 0); upper.add(sc2); }
    if (o.bag) { const bg = box(7, 9, 4, mat(o.bag)); bg.position.set(-1, 33, 9.5); upper.add(bg); }
    if (o.pot) { const pt = ball(5, mat(0xb4552f), 1, 0.9, 1); pt.position.set(0, 72, 0); upper.add(pt); }
    if (o.bundle) { const bd = ball(6, mat(o.bundle), 1.2, 0.8, 1); bd.position.set(-2, 71, 0); upper.add(bd); }
    if (o.spear) {
      const sp = cyl(0.9, 0.9, 80, 5, mat(0xd8c39a)); sp.position.set(2, -10, 0); arms[1].add(sp);
      const tip = new THREE.Mesh(geo('tip', () => new THREE.ConeGeometry(2.6, 9, 5)), mat(0xf4f4f4)); tip.position.set(2, 34, 0); arms[1].add(tip);
      const shield = cyl(8, 8, 1.6, 12, mat(o.shield || 0xc98a2a)); shield.rotation.z = Math.PI / 2; shield.position.set(0, -8, -4); arms[0].add(shield);
    }
    if (o.lamp) { const lm = box(4, 5, 4, new THREE.MeshBasicMaterial({ color: 0xffe08a })); lm.position.set(3, -23, 0); arms[0].add(lm); const lg = glow(o.lampColor || 0xffb040, 60, 0.8); lg.position.set(3, -23, 0); arms[0].add(lg); extras.lampGlow = lg; }
    const ring = new THREE.Mesh(new THREE.RingGeometry(o.ring ? o.ring[0] : 18, o.ring ? o.ring[1] : 22, 24), new THREE.MeshBasicMaterial({ color: o.ringColor || 0xff5a48, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; ring.visible = Boolean(o.ringAlways); g.add(ring);
    if (o.wedge) { const w = new THREE.Mesh(geo('wedge', () => new THREE.ConeGeometry(9, 22, 3)), new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0.85 })); w.rotation.set(Math.PI / 2, 0, -Math.PI / 2); w.position.set(36, 1.5, 0); g.add(w); }
    g.userData = { legs, arms, upper, ring, extras, phase: Math.random() * 6 };
    const hulls = [];
    g.traverse((m) => { if (m.isMesh && m.material?.isMeshToonMaterial) hulls.push(m); });
    hulls.forEach((m) => { const h = new THREE.Mesh(m.geometry, outlineMat); h.scale.setScalar(1.13); h.userData.outline = true; m.add(h); }); // inverted-hull outline
    return g;
  }

  function animate(p, dist, amp, t) {
    const u = p.userData; u.phase += dist * 0.085;
    const s = Math.sin(u.phase) * amp;
    u.legs[0].rotation.z = s * 0.75; u.legs[1].rotation.z = -s * 0.75;
    u.arms[0].rotation.z = -s * 0.6; u.arms[1].rotation.z = s * 0.6;
    u.upper.position.y = Math.abs(Math.sin(u.phase)) * 1.4 * amp;
    if (u.extras.scarf) u.extras.scarf.rotation.z = Math.sin(t * 7) * 0.12 * (amp > 0.1 ? 1 : 0.3) + 0.05 * amp;
  }

  // ---- Checkpoints -----------------------------------------------------------------------------------------------------
  function makeCheckpoint(p, i) {
    const g = new THREE.Group();
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, map: beamTex, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * 0.3, p.radius * 0.38, 1, 16, 1, true), pillarMat);
    g.add(pillar);
    const mandala = new THREE.Mesh(new THREE.PlaneGeometry(p.radius * 2.1, p.radius * 2.1), new THREE.MeshBasicMaterial({ map: mandalaTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    mandala.rotation.x = -Math.PI / 2; mandala.position.y = 1.5; g.add(mandala);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.radius * 0.85, 3, 6, 28), new THREE.MeshBasicMaterial({ color: 0xfff4de }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 4; g.add(ring);
    const halo = glow(0x28e0d0, p.radius * 3.2, 0.75); halo.position.y = 10; g.add(halo);
    const sprites = { num: label(String(i + 1), '#28e0d0'), later: label(String(i + 1), '#d9c48f'), done: label('✓', '#57e07a') };
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprites.num, transparent: true }));
    sprite.scale.set(46, 46, 1); g.add(sprite);
    g.position.set(p.x, 0, p.y);
    return { g, pillar, pillarMat, ring, mandala, halo, sprite, sprites, state: '' };
  }

  function applyState(c, state, p) {
    const s = CP[state];
    c.state = state;
    c.pillar.scale.y = s.height; c.pillar.position.y = s.height / 2;
    c.pillarMat.color.setHex(s.color); c.pillarMat.opacity = state === 'later' ? 0.3 : 0.6;
    c.ring.visible = state === 'next';
    c.halo.material.color.setHex(s.color); c.halo.material.opacity = state === 'next' ? 0.85 : state === 'done' ? 0.5 : 0.25;
    c.mandala.material.color.setHex(s.color);
    c.sprite.material.map = state === 'done' ? c.sprites.done : state === 'next' ? c.sprites.num : c.sprites.later;
    c.sprite.material.needsUpdate = true;
    c.sprite.position.y = s.height + 30;
    c.p = p;
  }

  function clearBuilt() {
    if (!built) return;
    scene.remove(built);
    const shared = new Set(geoCache.values());
    built.traverse((o) => { if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose?.(); });
    built = null; obstacleGroup = null; obstacleSig = -1; enemies.length = 0; pickups.length = 0; targets3.length = 0; arrows3.length = 0; guards.length = 0; npcs.length = 0; cps.length = 0; lamps.length = 0; boats.length = 0;
    skyTex?.dispose(); groundTex?.dispose(); waterTex?.dispose(); skyTex = groundTex = waterTex = null;
  }

  function spawnDust(x, z, angle) {
    const i = dust.next; dust.next = (dust.next + 1) % DUST;
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.2;
    dust.pos.setXYZ(i, x - Math.cos(angle) * 8, 3 + Math.random() * 3, z - Math.sin(angle) * 8);
    dust.vx[i] = Math.cos(a) * 24; dust.vz[i] = Math.sin(a) * 24; dust.life[i] = 1;
  }

  // ---- City ------------------------------------------------------------------------------------------------------------
  function buildCity(w) {
    const ts = w.tileSize; const rand = rng(1234);
    const T = theme;
    const rows = w.rowsText || [];
    const tile = (c, r) => rows[r]?.[c] ?? '#';
    const isOpen = (c, r) => !['#', 'o'].includes(tile(c, r));

    skyTex = canvasTex(THREE, 512, (g, s) => {
      const l = g.createLinearGradient(0, 0, 0, s);
      T.sky.forEach((c, i) => l.addColorStop(i / (T.sky.length - 1), c));
      g.fillStyle = l; g.fillRect(0, 0, s, s);
    });
    sky.material.map = skyTex; sky.material.needsUpdate = true;
    scene.background = new THREE.Color(T.bg);
    scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
    hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
    moon.color.setHex(T.moon[0]); moon.intensity = T.moon[1];
    lantern.color.setHex(T.lamp);
    rain.p.visible = T.rain;

    groundTex = canvasTex(THREE, 256, (g, s) => {
      const r2 = rng(7);
      g.fillStyle = T.ground; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 600; i++) { const v = 70 + r2() * 70; g.fillStyle = `rgba(${v + 25},${v + 5},${v - 20},0.3)`; g.fillRect(r2() * s, r2() * s, 2 + r2() * 5, 2 + r2() * 4); }
      g.strokeStyle = 'rgba(25,15,8,0.5)'; g.lineWidth = 3;
      if (T.roof === 'dome') {
        for (let y = 0; y <= s; y += s / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
        for (let row = 0; row < 2; row++) for (let x = (row % 2) * (s / 4); x <= s; x += s / 2) { g.beginPath(); g.moveTo(x, row * s / 2); g.lineTo(x, (row + 1) * s / 2); g.stroke(); }
      } else {
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,28,30,0.35)'; g.beginPath(); g.ellipse(r2() * s, r2() * s, 6 + r2() * 14, 3 + r2() * 6, 0, 0, Math.PI * 2); g.fill(); } // monsoon puddles on packed earth
      }
    }, true);
    groundTex.repeat.set(w.width / 144, w.height / 144);

    built = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), new THREE.MeshStandardMaterial({ map: groundTex, bumpMap: groundTex, bumpScale: 2.2, color: T.groundTint, roughness: T.rain ? 0.42 : 0.88, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(w.width / 2, 0, w.height / 2);
    if (shadowsOn) ground.receiveShadow = true;
    built.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 5, w.height * 5), mat(0x150f30));
    outer.rotation.x = -Math.PI / 2; outer.position.set(w.width / 2, -1, w.height / 2); built.add(outer);

    // Pillars (marked 'o') and buildings.
    const bodies = []; const roofs = []; const trims = []; const windows = []; const doors = []; const domes = []; const spikes = []; const pillars = [];
    const riverRow = T.roof === 'pitched' ? w.rows - 2 : Infinity; // the Mauryan city has a river along the bottom edge
    w.walls.forEach((wl, i) => {
      const c0 = Math.round(wl.x / ts); const r0 = Math.round(wl.y / ts); const cw = Math.round(wl.w / ts); const rh = Math.round(wl.h / ts);
      let oCount = 0; for (let rr = r0; rr < r0 + rh; rr++) for (let cc = c0; cc < c0 + cw; cc++) if (tile(cc, rr) === 'o') oCount++;
      if (oCount === cw * rh) { pillars.push({ x: wl.x + wl.w / 2, y: wl.y + wl.h / 2 }); return; }
      const edge = c0 === 0 || r0 === 0 || c0 + cw === w.cols || r0 + rh === w.rows;
      if (r0 >= riverRow) { bodies.push({ x: wl.x, y: wl.y, w: wl.w, d: wl.h, h: 26, color: 0x6a665c }); return; } // low stone embankment
      if (edge) {
        const h = T.roof === 'pitched' ? 130 : 150;
        bodies.push({ x: wl.x, y: wl.y, w: wl.w, d: wl.h, h, color: T.roof === 'pitched' ? 0x3a2818 : T.walls[1] });
        trims.push({ x: wl.x + wl.w / 2, y: h - 8, z: wl.y + wl.h / 2, w: wl.w + 4, h: 10, d: wl.h + 4, color: T.trim });
        if (T.roof === 'pitched') { const long = wl.w >= wl.h; const n = Math.floor((long ? wl.w : wl.h) / 22); for (let k = 0; k < n; k++) spikes.push({ x: long ? wl.x + (k + 0.5) * (wl.w / n) : wl.x + wl.w / 2, z: long ? wl.y + wl.h / 2 : wl.y + (k + 0.5) * (wl.h / n), y: h + 12 }); }
        return;
      }
      const hRange = T.heights; const h = hRange[0] + Math.floor(rand() * (hRange[1] - hRange[0]));
      const color = T.walls[i % T.walls.length];
      bodies.push({ x: wl.x, y: wl.y, w: wl.w, d: wl.h, h, color });
      trims.push({ x: wl.x + wl.w / 2, y: h * 0.45, z: wl.y + wl.h / 2, w: wl.w + 3, h: 4, d: wl.h + 3, color: T.trim });
      trims.push({ x: wl.x + wl.w / 2, y: h + 2, z: wl.y + wl.h / 2, w: wl.w + 8, h: 6, d: wl.h + 8, color: T.trim });
      if (T.roof === 'pitched') {
        roofs.push({ x: wl.x + wl.w / 2, y: h + 4, z: wl.y + wl.h / 2, w: wl.w * 1.18, d: wl.h * 1.18, h: 46 + (i % 3) * 10, color: i % 2 ? T.roofColor : T.roof2 });
      } else {
        const big = wl.w >= ts * 2 && wl.h >= ts * 2;
        if (big) domes.push({ x: wl.x + wl.w / 2, y: h + 5, z: wl.y + wl.h / 2, r: Math.min(wl.w, wl.h) * 0.28, color: i % 2 ? T.dome : T.roofColor });
        trims.push({ x: wl.x + wl.w / 2, y: h + 12, z: wl.y + wl.h / 2, w: wl.w + 2, h: 8, d: wl.h + 2, color: T.roofTop });
      }
      // Windows and doors on the street faces. A side counts as a street face when the tile beside it is open.
      const faces = [];
      for (let cc = c0; cc < c0 + cw; cc++) { if (isOpen(cc, r0 - 1)) faces.push({ x: wl.x + (cc - c0 + 0.5) * ts, z: wl.y - 0.6, rot: 0 }); if (isOpen(cc, r0 + rh)) faces.push({ x: wl.x + (cc - c0 + 0.5) * ts, z: wl.y + wl.h + 0.6, rot: 0 }); }
      for (let rr = r0; rr < r0 + rh; rr++) { if (isOpen(c0 - 1, rr)) faces.push({ x: wl.x - 0.6, z: wl.y + (rr - r0 + 0.5) * ts, rot: 1 }); if (isOpen(c0 + cw, rr)) faces.push({ x: wl.x + wl.w + 0.6, z: wl.y + (rr - r0 + 0.5) * ts, rot: 1 }); }
      faces.forEach((f, k) => {
        windows.push({ ...f, y: h * 0.68, lit: (k + i) % 4 !== 0 });
        if (k % 3 === 1) doors.push({ ...f, y: 22 });
        else windows.push({ ...f, y: h * 0.25, lit: (k + i) % 3 !== 0 });
      });
    });

    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    function instanced(geometry, material, list, place, colorOf, cast = true) {
      if (!list.length) return null;
      const m = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((it, i) => { dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); place(it, dummy); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (colorOf) m.setColorAt(i, col.setHex(colorOf(it))); });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (shadowsOn) { m.castShadow = cast; m.receiveShadow = true; }
      built.add(m); return m;
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    instanced(unitBox, mat(0xffffff), bodies, (b, d) => { d.position.set(b.x + b.w / 2, b.h / 2, b.y + b.d / 2); d.scale.set(b.w, b.h, b.d); }, (b) => b.color);
    instanced(unitBox, mat(0xffffff), trims, (t, d) => { d.position.set(t.x, t.y, t.z); d.scale.set(t.w, t.h, t.d); }, (t) => t.color);
    const pyramid = new THREE.ConeGeometry(0.7071, 1, 4);
    instanced(pyramid, mat(0xffffff), roofs, (r, d) => { d.position.set(r.x, r.y + r.h / 2, r.z); d.rotation.y = Math.PI / 4; d.scale.set(r.w, r.h, r.d); }, (r) => r.color);
    const half = new THREE.SphereGeometry(1, 12, 8);
    instanced(half, mat(0xffffff), domes, (r, d) => { d.position.set(r.x, r.y, r.z); d.scale.set(r.r, r.r * 0.85, r.r); }, (r) => r.color);
    domes.forEach((r) => { // kalash finial on each dome
      const fin = new THREE.Mesh(new THREE.ConeGeometry(3, 16, 6), mat(0xffc247)); fin.position.set(r.x, r.y + r.r * 0.85 + 6, r.z); built.add(fin);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 6), mat(0xffc247)); orb.position.set(r.x, r.y + r.r * 0.85 + 1, r.z); built.add(orb);
    });
    const spike = new THREE.ConeGeometry(5, 26, 5);
    instanced(spike, mat(0x2a1a0e), spikes, (s, d) => { d.position.set(s.x, s.y, s.z); }, null);

    // Windows (glow when lit) and doors, flat boxes on the street faces.
    const litWin = windows.filter((x) => x.lit); const darkWin = windows.filter((x) => !x.lit);
    const flat = (f, d, w2, h2) => { d.position.set(f.x, f.y, f.z); d.rotation.y = f.rot ? Math.PI / 2 : 0; d.scale.set(w2, h2, 1.2); };
    instanced(unitBox, new THREE.MeshBasicMaterial({ color: T.rain ? 0xffc060 : 0xffd27a }), litWin, (f, d) => flat(f, d, 13, 19), null, false);
    instanced(unitBox, new THREE.MeshBasicMaterial({ color: 0x1b1428 }), darkWin, (f, d) => flat(f, d, 13, 19), null, false);
    instanced(unitBox, new THREE.MeshBasicMaterial({ color: 0x3a2214 }), doors, (f, d) => flat(f, d, 20, 40), null, false);

    // Lamp posts, stalls, trees and banners along the building edges, kept away from the start and the checkpoints.
    const propSpots = [];
    for (let r = 1; r < w.rows - 1; r++) for (let c = 1; c < w.cols - 1; c++) {
      if (!isOpen(c, r)) continue;
      if (!isOpen(c, r + 1) && tile(c, r + 1) !== 'o') propSpots.push({ x: (c + 0.5) * ts, y: (r + 1) * ts - 12, face: -Math.PI / 2 });
      if (!isOpen(c, r - 1) && tile(c, r - 1) !== 'o') propSpots.push({ x: (c + 0.5) * ts, y: r * ts + 12, face: Math.PI / 2 });
    }
    const protect = (x, y) => Math.hypot(x - w.start.x, y - w.start.y) < 110 || w.checkpoints.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius * 1.4);
    const free = propSpots.filter((p) => !protect(p.x, p.y)).sort(() => rand() - 0.5);
    const lampN = Math.min(46, Math.floor(free.length / 5)); const stallN = Math.min(18, Math.floor(free.length / 9)); const treeN = Math.min(18, Math.floor(free.length / 10));
    free.slice(0, lampN).forEach((p, k) => {
      const post = box(3, 44, 3, mat(0x2a1a10)); post.position.set(p.x, 22, p.y); shadowed(post); built.add(post);
      const lg = glow(T.lamp, 76, 0.9); lg.position.set(p.x, 48, p.y); built.add(lg); lamps.push({ s: lg, phase: k * 1.7 });
    });
    const awn = [0xe8432e, 0xffa51f, 0x1fb6a6, 0xf0c04a, 0xc0407a];
    free.slice(lampN, lampN + stallN).forEach((p, k) => {
      const s = new THREE.Group(); s.position.set(p.x, 0, p.y);
      const table = box(34, 12, 12, mat(0x6a4630)); table.position.y = 10; s.add(table);
      for (const [dx, dz] of [[-15, -5], [15, -5], [-15, 5], [15, 5]]) { const pl = box(2, 30, 2, mat(0x4a3020)); pl.position.set(dx, 15, dz); s.add(pl); }
      const roof = box(42, 2.4, 20, mat(awn[k % awn.length])); roof.position.set(0, 32, 0); roof.rotation.x = p.face > 0 ? -0.18 : 0.18; s.add(roof);
      for (let g2 = 0; g2 < 5; g2++) { const good = ball(3.4, mat([0xe8432e, 0xffa51f, 0x6cc04a, 0xf0c04a, 0xc0407a][(g2 + k) % 5])); good.position.set(-12 + g2 * 6, 18.5, 0); s.add(good); }
      const keeper = makePerson({ skin: 0xb98058, top: awn[(k + 2) % awn.length], bottom: 0xe8dcc0, skirt: true, legsBare: true, turban: k % 2 ? 0xf3ead6 : undefined, hair: 0x1b1210 });
      keeper.position.set(0, 0, p.face > 0 ? -16 : 16); keeper.rotation.y = p.face > 0 ? Math.PI / 2 : -Math.PI / 2; s.add(keeper);
      built.add(shadowed(s, true, false));
    });
    free.slice(lampN + stallN, lampN + stallN + treeN).forEach((p) => {
      const tr = new THREE.Group(); tr.position.set(p.x, 0, p.y);
      const trunk = cyl(3, 4, 34, 6, mat(0x5a3a22)); trunk.position.y = 17; tr.add(trunk);
      const leaf = ball(20, mat(T.tree), 1, 1.1, 1); leaf.position.y = 52; tr.add(leaf);
      const leaf2 = ball(14, mat(T.tree), 1, 1, 1); leaf2.position.set(8, 66, 4); tr.add(leaf2);
      built.add(shadowed(tr));
    });
    if (T.roof === 'dome') { // saffron and red banners hang over the palace streets
      const bannerGeo = new THREE.PlaneGeometry(14, 44);
      free.slice(lampN + stallN + treeN, lampN + stallN + treeN + 14).forEach((p, k) => {
        const b = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ color: k % 2 ? T.banner : T.banner2, side: THREE.DoubleSide })); b.position.set(p.x, 118, p.y - Math.sign(p.face) * 6); built.add(b);
      });
    }
    pillars.forEach((p) => { // the Mauryan lion-capital column in polished sandstone
      const g = new THREE.Group(); g.position.set(p.x, 0, p.y);
      const base = cyl(24, 28, 14, 12, mat(0xd8c7a2)); base.position.y = 7; g.add(base);
      const shaft = cyl(13, 16, 210, 14, mat(0xe9dcbc)); shaft.position.y = 119; g.add(shaft);
      const cap = cyl(20, 14, 12, 14, mat(0xcdb98e)); cap.position.y = 230; g.add(cap);
      const abacus = cyl(22, 22, 8, 16, mat(0xe9dcbc)); abacus.position.y = 240; g.add(abacus);
      for (const a of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) { const lion = box(18, 16, 12, mat(0xe0d0a8)); lion.position.set(Math.cos(a) * 12, 254, Math.sin(a) * 12); lion.rotation.y = -a; g.add(lion); const head = ball(7, mat(0xe0d0a8)); head.position.set(Math.cos(a) * 21, 258, Math.sin(a) * 21); g.add(head); }
      built.add(shadowed(g, true, false));
    });

    if (T.roof === 'pitched') { // river and boats along the south edge
      waterTex = canvasTex(THREE, 256, (g, s) => {
        const l = g.createLinearGradient(0, 0, s, s); l.addColorStop(0, '#12404f'); l.addColorStop(1, '#1d6a72'); g.fillStyle = l; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(190,235,240,0.35)'; g.lineWidth = 2; const r3 = rng(21);
        for (let i = 0; i < 26; i++) { const x = r3() * s; const y = r3() * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 16, y - 5, x + 34, y); g.stroke(); }
      }, true);
      waterTex.repeat.set(10, 4);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 3, 900), new THREE.MeshBasicMaterial({ map: waterTex }));
      water.rotation.x = -Math.PI / 2; water.position.set(w.width / 2, 0.6, (w.rows - 2) * ts + 450); built.add(water);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Group(); b.position.set(w.width * (0.12 + k * 0.26), 3, w.height + 120 + (k % 2) * 70);
        const hull = box(130, 16, 38, mat(0x5a3a22)); hull.position.y = 8; b.add(hull);
        const bow = new THREE.Mesh(geo('bow', () => new THREE.ConeGeometry(19, 30, 4)), mat(0x5a3a22)); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(78, 10, 0); b.add(bow);
        const mast = cyl(2, 2, 80, 6, mat(0x3a2412)); mast.position.set(0, 50, 0); b.add(mast);
        const sail = box(2, 46, 52, mat(0xeadfc4)); sail.position.set(0, 62, 0); b.add(sail);
        const lg = glow(0xffa040, 60, 0.8); lg.position.set(-40, 30, 0); b.add(lg);
        built.add(b); boats.push({ g: b, phase: k * 1.3 });
      }
    }
  }

  // ---- Townspeople ------------------------------------------------------------------------------------------------------
  function buildCrowd(w) {
    const ts = w.tileSize; const rand = rng(777); const rows = w.rowsText || [];
    const open = (c, r) => !['#', 'o'].includes(rows[r]?.[c] ?? '#');
    const segs = [];
    for (let r = 1; r < w.rows - 1; r++) { let c = 1; while (c < w.cols - 1) { if (!open(c, r)) { c++; continue; } const c0 = c; while (c < w.cols - 1 && open(c, r)) c++; if (c - c0 >= 4) segs.push({ ax: (c0 + 0.5) * ts, ay: (r + 0.5) * ts, bx: (c - 0.5) * ts, by: (r + 0.5) * ts }); } }
    for (let c = 1; c < w.cols - 1; c++) { let r = 1; while (r < w.rows - 1) { if (!open(c, r)) { r++; continue; } const r0 = r; while (r < w.rows - 1 && open(c, r)) r++; if (r - r0 >= 4) segs.push({ ax: (c + 0.5) * ts, ay: (r0 + 0.5) * ts, bx: (c + 0.5) * ts, by: (r - 0.5) * ts }); } }
    const tops = [0xe8432e, 0xffa51f, 0x1fb6a6, 0xf0c04a, 0xc0407a, 0x4a7ad8, 0x6cc04a, 0xf3ead6];
    const bottoms = [0xf3ead6, 0xe8dcc0, 0x5a3a22, 0xc9b890];
    const skins = [0xc68a5a, 0xb07448, 0xd9a070, 0x9a6440];
    const n = Math.min(20, Math.floor(segs.length * 1.2));
    for (let k = 0; k < n; k++) {
      const s = segs[Math.floor(rand() * segs.length)];
      const kind = k % 5;
      const p = makePerson({ eyes: ['#3a7bd8', '#8a5a2a', '#3aa86a', '#9a4ad8'][k % 4], skin: skins[k % 4], top: tops[Math.floor(rand() * tops.length)], bottom: bottoms[k % 4], skirt: true, legsBare: true, turban: kind === 0 || kind === 3 ? tops[(k + 3) % tops.length] : undefined, hair: 0x1b1210, bun: kind === 2, pot: kind === 2, bundle: kind === 4 ? 0xc9a050 : undefined, sleeves: kind === 1 });
      npcs.push({ g: p, s, len: Math.hypot(s.bx - s.ax, s.by - s.ay), speed: 26 + rand() * 24, off: rand(), idle: k % 7 === 6 });
      built.add(p);
    }
  }

  // The player's person, drawn from the traveller chosen on the character screen (or the era's default look).
  function buildHero() {
    const h = theme.hero; const L = heroLook;
    const hex = (c) => parseInt(String(c).slice(1), 16);
    if (hero) built?.remove(hero);
    const topColor = L ? hex(L.outfitColor) : h.top;
    heroTop = new THREE.MeshToonMaterial({ color: topColor, gradientMap: toonGradient, emissive: 0x000000 });
    hero = makePerson({
      eyes: L ? L.eyes : '#2fbf8a', skin: L ? hex(L.skin) : h.skin, top: topColor, topMat: heroTop, bottom: h.bottom, skirt: true, legsBare: true,
      scarf: L ? hex(L.accent) : h.scarf, bag: 0x6a4630, hair: L ? hex(L.hair) : h.hair, hairStyle: L ? L.hairStyle : 'short', bun: L?.hairStyle === 'bun', female: L ? L.body === 'f' : false,
      lamp: true, lampColor: theme.lamp, ringColor: 0xfff4de, ring: [24, 28],
    });
    heroStaff = makeStaff(56); heroStaff.position.y = -26; heroStaff.visible = false; hero.userData.arms[1].add(heroStaff);
    heroSword = makeSword(46); heroSword.position.y = -30; heroSword.visible = false; hero.userData.arms[1].add(heroSword);
    heroBow = makeBow(); heroBow.position.y = -26; heroBow.visible = false; hero.userData.arms[1].add(heroBow);
    shadowed(hero); built?.add(hero); protectRing = hero.userData.ring;
  }

  // ---- Phase 1 extras: staff, raiders, obstacles, pickups, icons, bursts ------------------------------------------------
  const unitBox = () => geo('unit', () => new THREE.BoxGeometry(1, 1, 1));
  function makeStaff(len) {
    const g = new THREE.Group();
    const shaft = cyl(1.7, 1.7, len, 6, mat(0x8a5a2a)); g.add(shaft);
    const cap = ball(3, mat(0xffc247)); cap.position.y = len / 2; g.add(cap);
    const foot = ball(2.4, mat(0xffc247)); foot.position.y = -len / 2; g.add(foot);
    const band = cyl(2.3, 2.3, 3, 6, mat(0xffc247)); band.position.y = len * 0.18; g.add(band);
    return g;
  }
  // Sword: a pale blade, a gold guard and a leather grip. Bow: a curved limb (a torus arc) with a thin string.
  function makeSword(len) {
    const g = new THREE.Group();
    const blade = box(3.2, len, 1.2, mat(0xd8dde4, { metalness: 0.3 })); blade.position.y = -len / 2 + 6; g.add(blade);
    const guard = box(15, 3.4, 3.4, mat(0xffc247)); guard.position.y = 7; g.add(guard);
    const grip = cyl(1.8, 1.8, 11, 6, mat(0x5a3a1c)); grip.position.y = 12; g.add(grip);
    return g;
  }
  function makeBow() {
    const g = new THREE.Group();
    const limb = new THREE.Mesh(geo('bowlimb', () => new THREE.TorusGeometry(20, 1.8, 5, 12, Math.PI * 0.8)), mat(0x8a5a2a)); limb.rotation.z = Math.PI / 2 - Math.PI * 0.4; limb.position.x = -6; g.add(limb);
    const string = box(0.8, 24, 0.8, mat(0xfff4de)); string.position.x = -6 + 20 * Math.cos(Math.PI * 0.4) - 1; g.add(string);
    return g;
  }
  // A lesson token: a small symbol on a glowing disc. Sacks and the staff keep their old models.
  function makeToken(kind) {
    const g = new THREE.Group(); const gold = mat(0xffc247);
    const disc = cyl(15, 15, 3, 12, mat(0x2b1d10)); disc.position.y = -6; g.add(disc);
    if (kind === 'sword') { const b = makeSword(30); b.rotation.z = 0.6; b.position.y = 6; g.add(b); }
    else if (kind === 'bow') { const b = makeBow(); b.scale.setScalar(0.7); b.rotation.z = -Math.PI / 2; b.position.set(0, 6, 0); g.add(b); }
    else if (kind === 'arrows') for (let i = -1; i <= 1; i++) { const a = cyl(0.9, 0.9, 30, 5, mat(0xc9a066)); a.rotation.z = 0.5; a.position.set(i * 5, 6, 0); g.add(a); const h = cyl(0, 3, 6, 5, gold); h.rotation.z = 0.5; h.position.set(i * 5 - 7, 21, 0); g.add(h); }
    else if (kind === 'climb') { for (const x of [-6, 6]) { const r = box(2.4, 28, 2.4, mat(0x8a5a2a)); r.position.set(x, 8, 0); g.add(r); } for (const y of [0, 8, 16]) { const r = box(14, 2, 2, gold); r.position.y = y; g.add(r); } }
    else if (kind === 'push') { const sh = box(22, 5, 5, gold); sh.position.y = 8; g.add(sh); const tip = cyl(0, 8, 10, 4, gold); tip.rotation.z = -Math.PI / 2; tip.position.set(14, 8, 0); g.add(tip); }
    else if (kind === 'dodge') { const r = new THREE.Mesh(geo('dodgering', () => new THREE.TorusGeometry(10, 2.2, 5, 12, Math.PI * 1.5)), gold); r.position.y = 8; g.add(r); const tip = cyl(0, 5, 8, 4, gold); tip.position.set(10, 12, 0); g.add(tip); }
    return g;
  }
  const iconFill = new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, fog: false });
  const iconEdge = new THREE.MeshBasicMaterial({ color: 0x1a0f1f, side: THREE.DoubleSide, fog: false });
  function iconGeo(kind) { return geo(`icon_${kind}`, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(iconVertices(kind), 3)); return g; }); }
  function makeIcons() {
    const root = new THREE.Group(); const by = {};
    for (const kind of ['bang', 'question', 'shield']) {
      const k = new THREE.Group();
      const edge = new THREE.Mesh(iconGeo(kind), iconEdge); edge.scale.set(1.3, 1.3, 1); edge.position.set(0, -3.9, -0.3); k.add(edge);
      k.add(new THREE.Mesh(iconGeo(kind), iconFill));
      k.visible = false; root.add(k); by[kind] = k;
    }
    root.visible = false; return { root, by, shown: null };
  }
  function makeEnemy() {
    const top = new THREE.MeshToonMaterial({ color: 0x3f6a4a, gradientMap: toonGradient, emissive: 0x000000 });
    const g = makePerson({ eyes: '#e0a030', skin: 0x8a5a3a, top: 0x3f6a4a, topMat: top, bottom: 0x2b2018, turban: 0xa8402a, sleeves: true, bag: 0x4a3020, sash: 0xd08a2a, ring: [24, 29], ringColor: 0xff9a2a, ringAlways: true, wedge: true });
    const club = cyl(3, 1.6, 34, 6, mat(0x5a3a1c)); club.position.y = -32; g.userData.arms[1].add(club);
    const knob = ball(4.2, mat(0x3a2412)); knob.position.y = -48; g.userData.arms[1].add(knob);
    g.scale.setScalar(1.12);
    shadowed(g); built.add(g);
    const icons = makeIcons(); built.add(icons.root);
    // Telegraph: a flat wedge in front that fills up through the wind-up (outline = full reach, fill = how close the blow is). Ring = the sparring partner's marker.
    const wedge = geo('telewedge', () => new THREE.CircleGeometry(50, 10, -0.7, 1.4));
    const teleFull = new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({ color: 0xfff4de, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const tele = new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const ring = new THREE.Mesh(geo('sparring', () => new THREE.RingGeometry(23, 27, 16)), new THREE.MeshBasicMaterial({ color: 0xfff4de, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    for (const m of [teleFull, tele, ring]) { m.rotation.order = 'XYZ'; m.rotation.x = -Math.PI / 2; m.visible = false; m.position.y = 2; built.add(m); }
    return { g, top, icons, id: null, x: 0, y: 0, flash: 0, tele, teleFull, ring, kind: null };
  }
  // A straw training post: a stake and a target disc with three rings (the rings are shape; they do not depend on colour).
  function makeTarget() {
    const g = new THREE.Group();
    const stake = cyl(3, 3.4, 38, 6, mat(0x5a3a1c)); stake.position.y = 19; g.add(stake);
    const rings = [[16, 0xfff4de, 0], [10, 0x9a3a2a, 1.6], [4, 0xfff4de, 3.2]];
    for (const [r, c, x] of rings) { const d = cyl(r, r, 2.4, 16, mat(c)); d.rotation.z = Math.PI / 2; d.position.set(x, 44, 0); g.add(d); }
    shadowed(g); built.add(g); return g;
  }
  function makeArrow() {
    const g = new THREE.Group();
    const shaft = cyl(0.9, 0.9, 26, 5, mat(0xc9a066)); shaft.rotation.z = Math.PI / 2; g.add(shaft);
    const head = cyl(0, 3, 7, 5, mat(0xd8dde4)); head.rotation.z = -Math.PI / 2; head.position.x = 15; g.add(head);
    const fl = box(7, 0.8, 5, mat(0xfff4de)); fl.position.x = -11; g.add(fl);
    g.visible = false; built.add(g); return g;
  }
  function makePickup(kind) {
    const g = new THREE.Group();
    let s;
    if (kind === 'sack') { // a plain cloth sack with a tied neck
      s = new THREE.Group();
      const body = ball(13, mat(0xc9a066), 1, 1.1, 1); body.position.y = 0; s.add(body);
      const tie = box(7, 3, 7, mat(0x6b4a2a)); tie.position.y = 15; s.add(tie);
      g.add(s);
    } else if (['dodge', 'push', 'climb', 'sword', 'bow', 'arrows'].includes(kind)) { s = makeToken(kind); s.position.y = 0; g.add(s); }
    else { s = makeStaff(44); s.rotation.z = 0.8; s.position.y = 0; g.add(s); }
    const gl = glow(0xffd860, 54, 0.7); g.add(gl);
    built.add(g); return { g, s, kind };
  }

  // Obstacles: four or five instanced meshes in total, built once per list.
  function buildObstacles(list) {
    if (obstacleGroup) { built.remove(obstacleGroup); obstacleGroup.traverse((o) => o.dispose?.()); }
    obstacleGroup = new THREE.Group(); obstacleSig = list.length;
    const walls = []; const beams = []; const grass = []; const ledges = []; const pits = [];
    list.forEach((o, i) => { if (o.kind === 'lowwall') walls.push(o); else if (o.kind === 'beam') beams.push(o); else if (o.kind === 'grass') grass.push({ o, i }); else if (o.kind === 'ledge') ledges.push(o); else if (o.kind === 'pit') pits.push(o); });
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    function inst(geometry, count, fill) {
      if (!count) return;
      const m = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), count);
      let n = 0;
      fill((x, y, z, sx, sy, sz, color, ry = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); m.setColorAt(n, col.setHex(color)); n++; });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (shadowsOn) { m.castShadow = true; m.receiveShadow = true; }
      obstacleGroup.add(m);
    }
    // Low wall: a solid block with a pale cap and a row of notches reads as "step over it".
    inst(unitBox(), walls.length * 2, (put) => walls.forEach((o) => { put(o.x + o.w / 2, 11, o.y + o.d / 2, o.w - 2, 22, o.d - 2, 0x8a7a5e); put(o.x + o.w / 2, 23.5, o.y + o.d / 2, o.w + 2, 5, o.d + 2, 0xd9c79a); }));
    // Marked ledge: a tall stone block with a gold rope band and pale pegs along the top, so it reads as "climb here". Pit: a dark sunken pad with a pale rim.
    inst(unitBox(), ledges.length * 3, (put) => ledges.forEach((o) => { put(o.x + o.w / 2, 40, o.y + o.d / 2, o.w - 2, 80, o.d - 2, 0x6f6a62); put(o.x + o.w / 2, 62, o.y + o.d / 2, o.w + 1, 5, o.d + 1, 0xffc247); put(o.x + o.w / 2, 82, o.y + o.d / 2, o.w + 2, 4, o.d + 2, 0xe6dcc4); }));
    inst(unitBox(), pits.length * 2, (put) => pits.forEach((o) => { put(o.x + o.w / 2, 0.6, o.y + o.d / 2, o.w, 1.2, o.d, 0x0b0812); put(o.x + o.w / 2, 3, o.y + o.d / 2, o.w + 6, 6, o.d + 6, 0xe6dcc4); }));
    // Beam: two posts and a bar at head height that a standing person cannot pass but a crouching one can.
    inst(unitBox(), beams.length * 3, (put) => beams.forEach((o) => {
      const alongX = o.w >= o.d; const cx = o.x + o.w / 2; const cz = o.y + o.d / 2;
      const len = alongX ? o.w : o.d;
      put(cx, 46, cz, alongX ? len : 9, 9, alongX ? 9 : len, 0x5a3a1c);
      for (const sgn of [-1, 1]) put(alongX ? cx + sgn * (len / 2 - 4) : cx, 26, alongX ? cz : cz + sgn * (len / 2 - 4), 8, 52, 8, 0x3a2412);
    }));
    // Tall grass: a darker pad and a scatter of blades (seeded so it never changes).
    inst(unitBox(), grass.length, (put) => grass.forEach(({ o }) => put(o.x + o.w / 2, 0.8, o.y + o.d / 2, o.w, 1.6, o.d, 0x3a6a30)));
    let tufts = 0; grass.forEach(({ o }) => { tufts += Math.max(6, Math.round((o.w * o.d) / 1600 * 9)); });
    const blade = geo('blade', () => new THREE.ConeGeometry(3.2, 24, 4));
    inst(blade, tufts, (put) => grass.forEach(({ o, i }) => {
      const r = rng(77 + i * 13); const n = Math.max(6, Math.round((o.w * o.d) / 1600 * 9));
      for (let k = 0; k < n; k++) put(o.x + 4 + r() * (o.w - 8), 12, o.y + 4 + r() * (o.d - 8), 1, 0.8 + r() * 0.6, 1, [0x4f9a3f, 0x62ad48, 0x3f8438][k % 3], r() * 3);
    }));
    built.add(obstacleGroup);
  }

  // Pooled burst of up to MAX_PARTICLES tiny octahedra in one InstancedMesh; each shrinks to nothing over its life (about 300 ms).
  const pDummy = new THREE.Object3D(); const pCol = new THREE.Color();
  const parts = (() => {
    const m = new THREE.InstancedMesh(geo('spark', () => new THREE.OctahedronGeometry(1, 0)), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), MAX_PARTICLES);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) { pDummy.position.set(0, -9999, 0); pDummy.scale.set(0, 0, 0); pDummy.updateMatrix(); m.setMatrixAt(i, pDummy.matrix); m.setColorAt(i, pCol.setHex(0xfff0b0)); }
    m.visible = false; scene.add(m);
    const f = () => new Float32Array(MAX_PARTICLES);
    return { m, x: f(), y: f(), z: f(), vx: f(), vy: f(), vz: f(), life: f(), max: f(), next: 0, live: 0 };
  })();
  function burst(spec, x, z, color, up) {
    for (let k = 0; k < spec.n; k++) {
      const i = parts.next; parts.next = (parts.next + 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2; const sp = (50 + Math.random() * 70) * spec.speed;
      parts.x[i] = x; parts.y[i] = up; parts.z[i] = z; parts.vx[i] = Math.cos(a) * sp; parts.vz[i] = Math.sin(a) * sp; parts.vy[i] = (40 + Math.random() * 60) * spec.speed;
      parts.life[i] = parts.max[i] = spec.life; parts.m.setColorAt(i, pCol.setHex(color));
    }
    if (parts.m.instanceColor) parts.m.instanceColor.needsUpdate = true;
  }
  function stepParticles(dt) {
    let live = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (parts.life[i] <= 0) continue;
      parts.life[i] -= dt; live++;
      const u = Math.max(0, parts.life[i] / parts.max[i]);
      parts.vy[i] -= 320 * dt;
      parts.x[i] += parts.vx[i] * dt; parts.y[i] = Math.max(1, parts.y[i] + parts.vy[i] * dt); parts.z[i] += parts.vz[i] * dt;
      pDummy.position.set(parts.x[i], parts.y[i], parts.z[i]); const sc = u > 0 ? 3.4 * u : 0; pDummy.scale.set(sc, sc, sc); pDummy.updateMatrix();
      parts.m.setMatrixAt(i, pDummy.matrix);
    }
    parts.live = live; parts.m.visible = live > 0;
    if (live > 0) parts.m.instanceMatrix.needsUpdate = true;
  }
  // Sword-arc flat on the ground, shown while attack.active.
  const swingArc = (() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(18, 60, 14, 1, -Math.PI / 3, (Math.PI * 2) / 3), new THREE.MeshBasicMaterial({ color: 0xff9d1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.order = 'XYZ'; m.rotation.x = -Math.PI / 2; m.visible = false; m.position.y = 14; scene.add(m); return m;
  })();
  let crouchK = 0;
  const flatBox = (len, wid, color, opacity) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false })); m.scale.set(len, 1, wid); m.visible = false; scene.add(m); return m; };
  const aimLine = flatBox(200, 2.5, 0xfff4de, 0.45); const aimBar = flatBox(1, 6, 0xfff4de, 0.9);
  const guardArc = (() => { const m = new THREE.Mesh(new THREE.RingGeometry(26, 33, 12, 1, -1, 2), new THREE.MeshBasicMaterial({ color: 0xfff4de, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })); m.rotation.order = 'XYZ'; m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; })();

  function handleEvents(frame, calm) {
    if (frame === lastEventsFrame) return; // the same frame object drawn twice must not repeat its one-shot events
    lastEventsFrame = frame;
    const ev = frame.events; if (!ev || !ev.length) return;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]; if (!e) continue;
      const spec = burstSpec(e.type, calm); if (!spec) continue;
      burst(spec, e.x || 0, e.y || 0, burstColor(spec, frame.blood), e.type === 'vault' ? 4 : 30);
      if (e.type === 'hit-enemy' || e.type === 'enemy-down') {
        let best = null; let bd = 60 * 60;
        for (let k = 0; k < enemies.length; k++) { const en = enemies[k]; const d = (en.x - e.x) ** 2 + (en.y - e.y) ** 2; if (d < bd) { bd = d; best = en; } }
        if (best) best.flash = 1;
      }
    }
  }

  return {
    setCharacter(look) { heroLook = look; if (built) buildHero(); },
    orbit: true, // tells the game this renderer uses the third-person camera (the 2D renderer keeps the fixed north-up view)
    resize(w, h, dpr = 1) {
      gl.setPixelRatio(Math.min(dpr, 2));
      gl.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 62 : 46;
      if (h > w) camera.setViewOffset(w, h, 0, Math.round(h * 0.1), w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      if (fancy) {
        const pr = Math.min(dpr, 2);
        if (!composer) {
          const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
          composer = new THREE.EffectComposer(gl, target);
          composer.addPass(new THREE.RenderPass(scene, camera));
          composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 0.88));
          composer.addPass(new THREE.OutputPass());
        }
        composer.setPixelRatio(pr); composer.setSize(w, h);
      }
    },
    setWorld(w) {
      clearBuilt();
      world = w; theme = THEMES[w.theme] || THEMES.default;
      blocked = (x, z) => { const col = Math.floor(x / w.tileSize); const row = Math.floor(z / w.tileSize); return !!(w.solid[row] && w.solid[row][col]); };
      buildCity(w);
      buildCrowd(w);
      buildHero();
      if (Array.isArray(w.obstacles) && w.obstacles.length) buildObstacles(w.obstacles);
      w.checkpoints.forEach((p, i) => { const c = makeCheckpoint(p, i); cps.push(c); built.add(c.g); applyState(c, 'later', p); });
      scene.add(built);
    },
    render(frame) {
      if (!world || lost) return;
      const now = performance.now() / 1000;
      const dt = lastNow ? Math.min(0.1, now - lastNow) : 0;
      lastNow = now;
      const calm = frame.reducedMotion;
      const t = frame.time;

      // Guards: soldiers on patrol. The walk cycle follows how far they moved since the last frame.
      const gcfg = theme.guard;
      while (guards.length < frame.guards.length) {
        const src = frame.guards[guards.length];
        const g = makePerson({ eyes: '#d84a3a', skin: 0xc08a5a, top: gcfg.top, bottom: gcfg.bottom, skirt: true, legsBare: true, helm: gcfg.helm, sash: 0xffc247, sleeves: true, spear: true, shield: 0xc98a2a, lamp: true, lampColor: theme.lamp, ring: [24, 29], ringAlways: true, wedge: true });
        shadowed(g); built.add(g); guards.push({ g, x: src.x, y: src.y });
      }
      frame.guards.forEach((gd, i) => {
        const gg = guards[i]; const moved = Math.hypot(gd.x - gg.x, gd.y - gg.y);
        gg.g.position.set(gd.x, 0, gd.y); gg.g.rotation.y = -gd.angle;
        animate(gg.g, moved, moved > 0.05 ? 0.8 : 0, t);
        gg.x = gd.x; gg.y = gd.y;
      });

      // Raiders: club, bandana, orange ring. Pose by state; hit flash is a short white emissive pulse (skipped with reduced motion).
      const E = frame.enemies; const nE = E ? E.length : 0;
      while (enemies.length < nE) enemies.push(makeEnemy());
      for (let i = 0; i < enemies.length; i++) {
        const en = enemies[i];
        if (i >= nE || E[i].state === 'down') { en.g.visible = false; en.tele.visible = en.teleFull.visible = en.ring.visible = false; continue; }
        const e = E[i]; const st = e.state || 'patrol'; const eu = en.g.userData;
        if (en.id !== e.id) { en.id = e.id; en.x = e.x; en.y = e.y; }
        if (en.kind !== e.kind) { en.kind = e.kind; en.top.color.setHex(e.kind === 'sparrer' ? 0x7a5a8a : 0x3f6a4a); en.ring.visible = e.kind === 'sparrer'; }
        if (en.ring.visible) en.ring.position.set(e.x, 2, e.y);
        const wind = st === 'windup';
        en.tele.visible = en.teleFull.visible = wind;
        if (wind) {
          const u = Math.max(0, Math.min(1, e.windup || 0));
          for (const m of [en.tele, en.teleFull]) { m.position.set(e.x, 2, e.y); m.rotation.z = -e.angle; }
          en.tele.scale.set(0.28 + 0.72 * u, 0.28 + 0.72 * u, 1); en.tele.material.opacity = 0.25 + 0.5 * u;
        }
        const moved = Math.hypot(e.x - en.x, e.y - en.y);
        en.g.visible = true; en.g.position.set(e.x, 0, e.y); en.g.rotation.y = -e.angle;
        animate(en.g, moved, moved > 0.05 ? 0.8 : 0, t);
        en.x = e.x; en.y = e.y;
        if (st === 'windup') { eu.arms[1].rotation.z = 2.6; eu.upper.rotation.z = 0.15; }
        else if (st === 'stagger') { eu.arms[0].rotation.z = 2.4; eu.arms[1].rotation.z = 2.7; eu.upper.rotation.z = -0.5; }
        else if (st === 'chase') eu.upper.rotation.z = -0.18;
        en.flash = Math.max(0, en.flash - dt / 0.12);
        const f = calm ? 0 : en.flash;
        en.top.emissive.setRGB(f, f, f);
        en.g.scale.setScalar(1.12 * (1 + 0.12 * f));
      }
      const PK = frame.pickups; const nP = PK ? PK.length : 0;
      while (pickups.length < nP) pickups.push(makePickup(PK[pickups.length].kind));
      for (let i = 0; i < pickups.length; i++) {
        if (i < nP && pickups[i].kind !== (PK[i].kind || 'staff')) { built.remove(pickups[i].g); pickups[i] = makePickup(PK[i].kind); } // the kind changed: swap the model
        const pk = pickups[i];
        if (i >= nP || PK[i].taken) { pk.g.visible = false; continue; }
        pk.g.visible = true; pk.g.position.set(PK[i].x, 30 + (calm ? 0 : Math.sin(t * 2.2 + i) * 5), PK[i].y);
        if (!calm) pk.s.rotation.y = t * 1.2;
      }
      const TG = frame.targets; const nT = TG ? TG.length : 0;
      while (targets3.length < nT) targets3.push(makeTarget());
      for (let i = 0; i < targets3.length; i++) {
        const tg = targets3[i]; if (i >= nT) { tg.visible = false; continue; }
        tg.visible = true; tg.position.set(TG[i].x, 0, TG[i].y); tg.scale.setScalar(calm ? 1 : 1 + 0.18 * TG[i].flash);
      }
      const AR = frame.arrows; const nA = AR ? AR.length : 0;
      while (arrows3.length < Math.min(16, nA)) arrows3.push(makeArrow());
      for (let i = 0; i < arrows3.length; i++) {
        const ar = arrows3[i]; if (i >= nA) { ar.visible = false; continue; }
        ar.visible = true; ar.position.set(AR[i].x, 28, AR[i].y); ar.rotation.y = -(AR[i].angle || 0);
      }
      const OB = frame.obstacles;
      if (OB && OB.length && OB.length !== obstacleSig) buildObstacles(OB);
      handleEvents(frame, calm);
      stepParticles(dt);

      const c = frame.chariot; // the player (field name kept from the first prototype)
      hero.position.set(c.x, 0, c.y);
      hero.rotation.y = -c.angle;
      const spd = Math.min(1, (c.speed || 0) / 215);
      const moving = (c.speed || 0) > 8;
      animate(hero, (c.speed || 0) * Math.max(dt, 0.001), moving ? 0.35 + spd * 0.65 : 0, t);
      hero.userData.upper.rotation.z = moving ? -0.06 - spd * 0.1 : 0; // lean into a run
      protectRing.visible = c.invulnerable;
      const P = frame.player; const pstate = P ? P.state : 'idle';
      const hu = hero.userData;
      // Crouch squashes the whole figure; vault hops and tucks; a staff is held in the right hand and swings while attack.active.
      const crouchT = P && (P.crouch || pstate === 'crouch') ? 1 : 0;
      crouchK = calm ? crouchT : crouchK + (crouchT - crouchK) * Math.min(1, dt * 14);
      hero.scale.set(1 + 0.08 * crouchK, 1 - 0.38 * crouchK, 1 + 0.08 * crouchK);
      if (pstate === 'vault') { hero.position.y = vaultHop(P.stateT, calm); hu.upper.rotation.z = -0.35; hu.legs[0].rotation.z = 0.9; hu.legs[1].rotation.z = 0.7; } else hero.position.y = 0;
      const staffOn = !!P && P.weapon === 'staff'; heroStaff.visible = staffOn;
      const swordOn = !!P && P.weapon === 'sword'; heroSword.visible = swordOn;
      const bowOn = !!P && P.weapon === 'bow'; heroBow.visible = bowOn;
      const A = frame.attack; const swinging = !!(A && A.active);
      const pr = swinging ? Math.max(0, Math.min(1, A.progress || 0)) : 0;
      const charging = swinging && A.kind === 'heavy' && pr < (A.hit || 0.575);
      if (staffOn) hu.arms[1].rotation.z = swinging ? 2.4 - 2.2 * pr : 1.0 + hu.arms[1].rotation.z * 0.15;
      if (swordOn) {
        if (pstate === 'block') { hu.arms[1].rotation.z = 2.2; heroSword.rotation.z = 0; hu.arms[0].rotation.z = 1.4; }
        else if (swinging && A.kind === 'shove') { hu.arms[1].rotation.z = 1.6; hu.arms[0].rotation.z = 1.6; }
        else if (swinging) hu.arms[1].rotation.z = charging ? 2.9 : 2.7 - 2.5 * pr; // heavy: held high first, then it comes down at the moment of impact
        else hu.arms[1].rotation.z = 0.9 + hu.arms[1].rotation.z * 0.15;
      } else if (swinging && A.kind === 'shove') { hu.arms[1].rotation.z = 1.6; hu.arms[0].rotation.z = 1.6; }
      if (bowOn) hu.arms[1].rotation.z = pstate === 'aim' ? 1.55 : 0.8;
      if (pstate === 'aim' && P) { // aim line along the way the arrow will go, and a bar along it that grows with the draw (full draw turns gold)
        const aa = P.aimAngle || c.angle; const d = Math.max(0, Math.min(1, P.draw || 0));
        aimLine.visible = true; aimBar.visible = d > 0.02;
        aimLine.position.set(c.x + Math.cos(aa) * 130, 3, c.y + Math.sin(aa) * 130); aimLine.rotation.y = -aa;
        aimBar.scale.x = Math.max(0.001, 160 * d); aimBar.position.set(c.x + Math.cos(aa) * (20 + 80 * d), 4, c.y + Math.sin(aa) * (20 + 80 * d)); aimBar.rotation.y = -aa; aimBar.material.color.setHex(d >= 0.999 ? 0xffc247 : 0xfff4de);
      } else { aimLine.visible = false; aimBar.visible = false; }
      if (pstate === 'block') { guardArc.visible = true; guardArc.position.set(c.x, 26, c.y); guardArc.rotation.z = -c.angle; } else guardArc.visible = false;
      if (pstate === 'dodge') hero.scale.set(1.12, 0.62, 1.12); // a roll: low and wide
      if (swinging) {
        const shove = A.kind === 'shove';
        swingArc.visible = true; swingArc.position.x = c.x; swingArc.position.z = c.y; swingArc.rotation.z = -(A.angle || 0);
        const k = Math.max(0.4, (A.range || 60) / 60); swingArc.scale.set(k, k, 1);
        swingArc.material.color.setHex(shove ? 0xfff4de : 0xff9d1a);
        swingArc.material.opacity = charging ? 0.3 : calm ? 0.55 : (shove ? 0.5 : 0.75) * (1 - pr * 0.8);
      } else swingArc.visible = false;
      const hurtFlash = P && pstate === 'hurt' ? Math.max(0, 1 - (P.stateT || 0) / 0.2) : 0;
      const flash = calm ? 0 : Math.max(frame.effects.flash, hurtFlash);
      heroTop.emissive.setRGB(flash * 0.9, flash * 0.1, flash * 0.1);
      lantern.position.set(c.x + Math.cos(c.angle) * 18, 52, c.y + Math.sin(c.angle) * 18);

      // Townspeople walk their streets (they stand still with reduced motion) and step aside for you.
      npcs.forEach((n) => {
        const s = n.s;
        let u = 0.25 + n.off * 0.5; let dir = 1;
        if (!calm && !n.idle) { const ph = (t * n.speed / n.len + n.off) % 2; u = ph < 1 ? ph : 2 - ph; dir = ph < 1 ? 1 : -1; }
        let x = s.ax + (s.bx - s.ax) * u; let y = s.ay + (s.by - s.ay) * u;
        const dx = x - c.x; const dy = y - c.y; const d = Math.hypot(dx, dy);
        if (d < 46 && d > 0.01) { x += (dx / d) * (46 - d) * 0.7; y += (dy / d) * (46 - d) * 0.7; }
        n.g.position.set(x, 0, y); n.g.rotation.y = -Math.atan2((s.by - s.ay) * dir, (s.bx - s.ax) * dir);
        animate(n.g, calm || n.idle ? 0 : n.speed * dt, calm || n.idle ? 0 : 0.6, t);
      });

      frame.checkpoints.forEach((p, i) => {
        const cp = cps[i];
        if (cp.state !== p.state) applyState(cp, p.state, p);
        if (p.state === 'next' && !calm) {
          const pulse = 1 + Math.sin(t * 4) * 0.06;
          cp.ring.scale.set(pulse, pulse, 1);
          cp.mandala.rotation.z = t * 0.5;
          cp.halo.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
        } else cp.ring.scale.set(1, 1, 1);
      });

      if (!calm) {
        lamps.forEach((l) => { l.s.material.opacity = 0.8 + Math.sin(t * 7 + l.phase) * 0.1; });
        boats.forEach((b) => { b.g.position.y = 3 + Math.sin(t * 1.4 + b.phase) * 1.6; b.g.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.03; });
        if (waterTex) waterTex.offset.x = (t * 0.01) % 1;
        if (moving && spd > 0.7) { spawnAcc += dt * 18; while (spawnAcc >= 1) { spawnAcc -= 1; spawnDust(c.x, c.y, c.angle); } }
        for (let i = 0; i < DUST; i++) {
          if (dust.life[i] <= 0) continue;
          dust.life[i] -= dt * 1.4;
          if (dust.life[i] <= 0) { dust.pos.setXYZ(i, 0, -9999, 0); continue; }
          dust.pos.setXYZ(i, dust.pos.getX(i) + dust.vx[i] * dt, dust.pos.getY(i) + 10 * dt, dust.pos.getZ(i) + dust.vz[i] * dt);
        }
        dust.pos.needsUpdate = true;
        if (theme.rain) {
          rain.p.position.set(c.x, 0, c.y);
          for (let i = 0; i < RAIN; i++) { let y = rain.a.getY(i) - 620 * dt; if (y < 0) y += 700; rain.a.setY(i, y); }
          rain.a.needsUpdate = true;
        }
      }

      // City-map camera for walking missions; the old chase camera is kept for any world still in chariot mode.
      let view;
      if (frame.mode === 'foot') {
        orbit.yaw = frame.camYaw ?? orbit.yaw; orbit.pitch = frame.camPitch ?? orbit.pitch;
        view = thirdPersonView(c, orbit, dt, blocked, calm);
      } else view = followCamera(camState, c, dt, calm);
      const sh = calm ? 0 : frame.effects.shake * 5;
      camera.position.set(view.position.x + (Math.random() - 0.5) * sh, view.position.y + (Math.random() - 0.5) * sh, view.position.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      for (let i = 0; i < enemies.length; i++) { // icons face the camera; patrol and down show none
        const ic = enemies[i].icons; const live = i < nE && enemies[i].g.visible;
        const kind = live ? enemyIcon(E[i].state) : null;
        if (kind !== ic.shown) { if (ic.shown) ic.by[ic.shown].visible = false; if (kind) ic.by[kind].visible = true; ic.shown = kind; ic.root.visible = !!kind; }
        if (kind) {
          ic.root.position.set(E[i].x, 92, E[i].y); ic.root.quaternion.copy(camera.quaternion);
          const pulse = E[i].state === 'windup' && !calm ? 1.25 + Math.sin(t * 18) * 0.1 : 1;
          ic.root.scale.setScalar(0.62 * pulse);
        }
      }
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      moonDisc.position.set(camera.position.x - 1700, 1500, camera.position.z - 1400);
      moon.position.set(c.x - 320, 650, c.y + 260); moon.target.position.set(c.x, 0, c.y);
      if (composer) composer.render(); else gl.render(scene, camera);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      clearBuilt();
      [glowTex, beamTex, mandalaTex].forEach((tx) => tx.dispose());
      geoCache.forEach((g2) => g2.dispose()); matCache.forEach((m2) => m2.dispose());
      composer?.dispose?.();
      gl.dispose();
    },
  };
}
