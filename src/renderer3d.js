// Three.js renderer implementing the interface in renderer.js.
// A walking mission is shown as a city map: a high, north-up camera follows a person on foot through streets built to match the era
// (see THEMES). The city has buildings, market stalls, trees, lamps, walking townspeople, patrolling guards, shadows and a night sky.
// Materials are physically based (standard PBR) with filmic tone mapping and an image-based ambient light; capable desktops also get bloom
// on lamps, windows and checkpoint beams. Buildings are built from simple shapes, and people are articulated shapes unless authored
// glTF characters are listed in assets/characters/manifest.json (see docs/assets.md), in which case those are used with their own skeleton animation.
// Meaning is never colour alone: checkpoints change height and style and carry a number or a check mark,
// guards have a spear, a helmet, a ground ring and a facing wedge, and the player shows a ring while protected.
// The caller passes in the THREE namespace so the large library is only downloaded when 3D is used.
import { createSky, SKIES, sunVector } from './gfx/sky.js';
import { createGeom } from './gfx/geom.js';
import { buildScenery } from './gfx/city.js';
import { createWorldMaterials, createGrade, gradePatch, instanced } from './gfx/materials.js';
import { PROFILES, pickQuality, LEVELS } from './gfx/quality.js';
import { softDisc, skyMap } from './gfx/surfaces.js';
import { TIER_BUDGET, renderRatio, classifyBench, readBenchCache, writeBenchCache, createGovernor } from './gfx/tier.js';
import { runBenchmark } from './gfx/bench.js';
import { createWorldProps, PROP_UNITS, PROP_LONG } from './gfx/city-props.js';
import { followCamera, createCameraState, createOrbit, thirdPersonView, enemyIcon, vaultHop, burstSpec, burstColor, MAX_PARTICLES } from './camera.js';

const CP = {
  next: { height: 190, color: 0x28e0d0, wire: false },
  done: { height: 30, color: 0x57e07a, wire: false },
  later: { height: 70, color: 0xd9c48f, wire: true },
};
const DUST = 60;
const RAIN = 260;

// Era looks. Each one is a deliberate choice: Dvapara Yuga (a mythic imagining, Invented) is a golden-hour palace city in cream stone, gold and saffron with
// long warm shadows over cool blue fill; the Mauryan city (History, c. 4th to 3rd century BCE, to be confirmed by scholarly review) is timber and thatch
// behind a palisade on a river in a grey-green monsoon with wet stone. `grade` is the finishing look: saturation, contrast, shadow tint, highlight tint.
const THEMES = {
  hastinapur: {
    sky: ['#2f4f94', '#5f86c4', '#e8a878', '#f7c27a'], haze: '#f0c9a0', cloudLit: '#fff1dc', cloudShade: '#a8a4c4', cloudRim: '#ffd89a', clouds: 11, skyKey: 'hastinapur',
    fog: 0xd9b38f, fogNear: 420, fogFar: 2300, bg: 0xd9b38f, exposure: 0.9, groundBase: [112, 94, 72], cover: 0.5,
    hemi: [0x9db8e6, 0x6e5a44, 0.62], moon: [0xffb877, 1.9], sunDir: [0.86, 0.30, 0.20], sunU: 0.463, sunV: 0.4, lamp: 0xffa24a, rain: false, wet: 0.08,
    walls: [0xe9d9b8, 0xdcc79f, 0xf0e2c4, 0xd6bd92], trim: 0xe0b45a, trimStone: 0xe8dcc0, roof: 'dome', roofColor: 0xf6ead0, roofTop: 0xb0805c, dome: 0xffc247, ground: '#8d7c62', groundTint: 0xd8c6a6,
    heights: [120, 175], banner: 0xff7a1a, banner2: 0xe8432e, tree: 0x3f8a4a, leaves: [0x4f8a3e, 0x5f9a46, 0x3f7a3c, 0x6aa04a], blossom: [0xf2a6b8, 0xf8d0c8, 0xe97a9a], balcony: true,
    awnings: [0xc2483a, 0xe39a2a, 0x2a8f86, 0xd8b04a, 0xa8406a], shutters: [0x2f8f7f, 0xc2433a, 0x3a6fb0, 0x6a8f3a], doors: [0x6a3a1c, 0x8a4a24, 0x4a2a14],
    grade: { sat: 1.12, con: 1.07, shadow: [0.86, 0.96, 1.12], light: [1.08, 1.0, 0.86], vig: 0.3 },
    hero: { top: 0xff8a1f, bottom: 0xf3ead6, scarf: 0xe8432e, skin: 0xc68a5a, hair: 0x1b1210 },
    guard: { top: 0xb02a2a, bottom: 0x5a2a1a, helm: 0xffc247 },
  },
  pataliputra: { // after the monsoon: the cloud breaks and a low, warm sun lights the wet road (Invented mood; the city itself is History, to be confirmed by scholarly review)
    sky: ['#3f6aa6', '#7fa2cf', '#efb98a', '#fbd08a'], haze: '#f3c9a0', cloudLit: '#fff0d8', cloudShade: '#a6849a', cloudRim: '#ffcf8a', clouds: 14, skyKey: 'pataliputra',
    fog: 0xd8b090, fogNear: 360, fogFar: 2100, bg: 0xd8b090, exposure: 0.92, groundBase: [112, 94, 72], cover: 0.56,
    hemi: [0xcfc8c0, 0x8a6a48, 0.6], moon: [0xffc486, 2.7], sunDir: [0.9, 0.24, 0.2], sunU: 0.463, sunV: 0.42, lamp: 0xffa040, rain: false, wet: 0.55,
    walls: [0x8b6a4a, 0x7a5a3c, 0x9a7650, 0x6f5236], trim: 0x3a2616, trimStone: 0xb8ab92, roof: 'pitched', roofColor: 0xb87a4a, roof2: 0xc8a860, ground: '#6a5b48', groundTint: 0xe8c898,
    heights: [100, 150], banner: 0x1fb6a6, banner2: 0xf0c04a, tree: 0x2f6e4a, leaves: [0x3f7a4a, 0x4a8a50, 0x2f6a40, 0x5a9a58], awnings: [0x2a8f86, 0xd8b04a, 0xb8503a, 0x3a6a9a], shutters: [0x2f6f66, 0x8a5a3a, 0x3a5a7a], doors: [0x4a2a14, 0x5a3318],
    grade: { sat: 1.1, con: 1.07, shadow: [0.86, 0.96, 1.1], light: [1.08, 1.0, 0.86], vig: 0.3 },
    hero: { top: 0x1fb6a6, bottom: 0xe8dcc0, scarf: 0xf0c04a, skin: 0xb87a50, hair: 0x120c0a },
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

// True when a spot is inside the opening shot: within 380 units of the start, or in the cone ahead of the hero (half-angle 0.8 rad, wider than the widest lens) out to 900.
export function inOpeningShot(start, px, py) {
  const dx = px - start.x; const dy = py - start.y; const d = Math.hypot(dx, dy); if (d < 380) return true;
  let da = Math.atan2(dy, dx) - (start.angle || 0); da = Math.atan2(Math.sin(da), Math.cos(da)); return d < 900 && Math.abs(da) < 0.8;
}

export function createRenderer3D(canvas, THREE, { onContextLost } = {}) {
  // Quality tier: ?q= or a saved choice wins; otherwise device hints pick the start tier (src/gfx/quality.js). The frame-time governor may step it down.
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  let saved = null; try { saved = localStorage.getItem('dharmastra.quality'); } catch { /* private mode */ }
  const pick = pickQuality({ dpr: window.devicePixelRatio || 1, cores: navigator.hardwareConcurrency || 4, fine, memory: navigator.deviceMemory || 4, search: location.search, saved });
  // Automatic tier: unless ?q= or the Settings override locks it, a quick GPU benchmark (src/gfx/bench.js, cached per device) picks Low, Medium or High.
  let benchInfo = null;
  if (!pick.locked) {
    let store = null; try { store = localStorage; } catch { /* private mode */ }
    let tier = readBenchCache(store);
    if (!tier) { const b = runBenchmark(); if (b) { tier = classifyBench(b.steps, { thin: (navigator.deviceMemory || 8) <= 3 }); benchInfo = b; writeBenchCache(store, tier); } }
    if (tier) pick.level = tier;
  }
  const qual = { level: pick.level, locked: pick.locked, profile: PROFILES[pick.level], budget: TIER_BUDGET[pick.level], bench: benchInfo };
  let infoAt = 0; const govOn = !/[?&]gov=0/.test(location.search); let shadowsDropped = false; // ?gov=0 switches the governor off (screenshot rig)
  const gov = createGovernor(); let lastSize = { w: 0, h: 0, dpr: 1 }; let govScale = 1;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: qual.budget.msaa, powerPreference: 'high-performance' });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1;
  let shadowsOn = qual.profile.shadows;
  if (shadowsOn) { gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; }
  const fancy = qual.profile.post && !/[?&]fx=0/.test(location.search); // bloom: High tier only
  let composer = null;
  const grade = createGrade(THREE); const G = createGeom(THREE); const statics = [];
  const scene = new THREE.Scene();
  if (/[?&]dev=1/.test(location.search)) window.__gfxScene = scene; // debugging aid for the screenshot rig
  // Image-based light: the generated sky is baked once per era into a PMREM environment (no sky shader is drawn per frame; the backdrop is the cheap dome below).
  const envCache = new Map();
  function setEnvironment(key) {
    if (!envCache.has(key)) { const s = createSky(THREE, gl, key); envCache.set(key, s.env); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    scene.environment = envCache.get(key); scene.environmentIntensity = 0.3;
  }
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  scene.add(sky);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe6b0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunSprite.scale.set(1100, 1100, 1); scene.add(sunSprite);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6dc, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); sunDisc.scale.set(230, 230, 1); scene.add(sunDisc); // the bright core of the sun
  const poolMat = new THREE.MeshBasicMaterial({ map: (() => { const d = softDisc(64, 2); const t = new THREE.DataTexture(d, 64, 64, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })(), color: 0xffa24a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
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

  // Ambient motes: pale dust drifting in the light around the hero, and embers rising from the lamps. One additive Points draw, count by tier (40 / 120 / 240),
  // frozen (no drift) with reduced motion. Dust and embers are part of the look gate's "atmosphere gives depth" rule.
  const amb = (() => {
    const N = qual.budget.particles; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3); const rand = rng(31); const seed = new Float32Array(N * 3); const ember = new Uint8Array(N);
    for (let i = 0; i < N; i++) { ember[i] = i % 3 === 0 ? 1 : 0; seed[i * 3] = rand(); seed[i * 3 + 1] = rand(); seed[i * 3 + 2] = rand(); if (ember[i]) { col[i * 3] = 1; col[i * 3 + 1] = 0.52; col[i * 3 + 2] = 0.18; } else { col[i * 3] = 0.95; col[i * 3 + 1] = 0.88; col[i * 3 + 2] = 0.72; } }
    const a = new THREE.Float32BufferAttribute(pos, 3); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('position', a); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 5, map: glowTex, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    p.frustumCulled = false; p.visible = N > 0; scene.add(p); return { p, a, seed, ember, N };
  })();
  function stepAmbient(t, cx, cz, calm, rainy) {
    const { a, seed, ember, N } = amb; const arr = a.array; amb.p.visible = N > 0 && !rainy; if (!amb.p.visible) return;
    const lamp = lamps.length;
    for (let i = 0; i < N; i++) {
      const sx = seed[i * 3]; const sy = seed[i * 3 + 1]; const sz = seed[i * 3 + 2]; const k = calm ? 0 : t;
      if (ember[i] && lamp) { const l = lamps[(i * 7) % lamp].s.position; const u = (k * (0.08 + sy * 0.1) + sx) % 1; arr[i * 3] = l.x + Math.sin(k * 1.3 + sx * 40) * 6 * u; arr[i * 3 + 1] = 48 + u * 70; arr[i * 3 + 2] = l.z + Math.cos(k * 1.1 + sz * 40) * 6 * u; }
      else { const bx = ((sx * 700 + k * (4 + sy * 6) + 700) % 700) - 350; const bz = ((sz * 700 + k * 2.5 + 700) % 700) - 350; arr[i * 3] = cx + bx; arr[i * 3 + 1] = 8 + sy * 110 + Math.sin(k * 0.6 + sx * 30) * 6; arr[i * 3 + 2] = cz + bz; }
    }
    a.needsUpdate = true;
  }

  // ---- Pickable props (docs/review/prop-hooks.md): frame.props on the ground, in flight and broken; frame.player.held in the hand ----
  const wprops = createWorldProps(THREE, grade); let propsGroup = null; const propNodes = new Map(); let heldNode = null; let gripTable = null;
  const CARRY = new Set(['clay-pot', 'stone', 'bench', 'crate', 'rope', 'grain-sack']); const LEFT = new Set(['wood-shield', 'oil-lamp', 'torch']);
  const GRIP_OF = { stick: 'stick', 'bamboo-staff': 'staff', club: 'club', spear: 'spear', 'market-pole': 'staff', 'fallen-sword': 'sword', 'wood-shield': 'shield', 'oil-lamp': 'lamp', torch: 'lamp' };
  function showCracks(g, crack, flameOn, t, calm) {
    const c = g.userData.cracks; if (c) { c.visible = crack >= 1 && crack < 3; const n = crack === 1 ? 2 : 5; c.children.forEach((m) => { m.visible = m.userData.n < n; }); }
    for (const f of g.userData.flames || []) { f.visible = !!flameOn; if (flameOn && !calm) f.scale.set(1 + Math.sin(t * 17 + f.id) * 0.12, 1.7 + Math.sin(t * 23 + f.id) * 0.25, 1); }
  }
  function stepProps(frame, dt, calm, t) {
    if (!propsGroup) return; const list = frame.props || []; const seen = new Set(); let nRings = 0; // idle rings: one instanced draw for all props
    for (const p of list) {
      seen.add(p.id); let n = propNodes.get(p.id);
      if (!n || n.kind !== p.kind) {
        if (n) propsGroup.remove(n.root);
        const root = new THREE.Group(); const prop = wprops.make(p.kind); const long = PROP_LONG.has(p.kind); const hold = new THREE.Group(); hold.add(prop); hold.scale.setScalar(PROP_UNITS); root.add(hold);
        if (long) { prop.rotation.z = Math.PI / 2; prop.position.y = 0.03; }
        const ring = null; const deb = wprops.debris(p.kind); deb.scale.setScalar(PROP_UNITS); deb.visible = false; root.add(deb);
        n = { kind: p.kind, root, prop, hold, ring, deb, long }; propNodes.set(p.id, n); propsGroup.add(root);
      }
      const held = p.state === 'held' || p.holder; n.root.visible = !held;
      if (held) continue;
      const broken = p.state === 'broken' || p.crack >= 3; const thrown = p.state === 'thrown';
      n.root.position.set(p.x, thrown ? 10 + (p.z || 0) * 34 : 0, p.y); n.root.rotation.y = -(p.angle || 0);
      n.hold.visible = !broken; n.deb.visible = broken; if (p.state === 'idle' && !broken && nRings < RING_MAX) { rDum.position.set(p.x, 0.012, p.y); const k = (n.long ? 18 : 15) * (calm ? 1 : 1 + Math.sin(t * 3 + p.x) * 0.05); rDum.scale.set(k, k, k); rDum.rotation.set(-Math.PI / 2, 0, 0); rDum.updateMatrix(); ringInst.setMatrixAt(nRings++, rDum.matrix); }
      if (thrown && !calm) n.prop.rotation.x += dt * 14;
      else if (!thrown) { n.prop.rotation.x = 0; if (n.long) n.prop.rotation.z = Math.PI / 2; }
      showCracks(n.prop, p.crack || 0, p.fire, t, calm);
    }
    for (const [id, n] of propNodes) if (!seen.has(id)) { propsGroup.remove(n.root); propNodes.delete(id); }
    ringInst.count = nRings; ringInst.instanceMatrix.needsUpdate = true; ringInst.visible = nRings > 0;
  }
  const RING_MAX = 48; const rDum = new THREE.Object3D(); const ringInst = new THREE.InstancedMesh(new THREE.RingGeometry(0.86, 1, 24), wprops.mats.ring, RING_MAX); ringInst.frustumCulled = false; ringInst.count = 0;
  function dropHeld() { if (heldNode) { heldNode.mesh.parent?.remove(heldNode.mesh); heldNode = null; } }
  function stepHeld(frame, calm, t) {
    const h = frame.player && frame.player.held;
    if (!h || !hero) { dropHeld(); return; }
    const H = hero.userData.H;
    if (!heldNode || heldNode.id !== h.id || heldNode.hero !== hero || !heldNode.mesh.parent) {
      dropHeld(); const mesh = wprops.make(h.kind); const kitHero = !!H;
      if (kitHero) {
        const bone = LEFT.has(h.kind) ? H.bones.hand_L : H.bones.hand_R; const gk = GRIP_OF[h.kind]; const gr = gk && gripTable?.[gk];
        if (CARRY.has(h.kind) || !gr) { mesh.position.set(0.02, -0.04, 0.08); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(CARRY.has(h.kind) ? 0.7 : 1); } else { mesh.position.set(...gr.pos); mesh.rotation.set(...gr.rot); }
        bone?.add(mesh);
      } else { mesh.scale.setScalar(PROP_UNITS); mesh.position.set(2, -20, 0); const arm = hero.userData.arms?.[1]; (arm || hero).add(mesh); }
      heldNode = { id: h.id, kind: h.kind, mesh, hero };
    }
    showCracks(heldNode.mesh, h.crack || 0, h.fire, t, calm);
  }
  let world = null; let theme = THEMES.default;
  let built = null;
  let hero = null; let heroWeapon = 'none'; let lastWeapon = 'none'; let heroTop = null; let protectRing = null; let heroLook = null;
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
  const toonCache = new Map();
  function toon(color) { if (!toonCache.has(color)) toonCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 })); return toonCache.get(color); }
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

  // ---- Authored humans: assets/characters/hero.glb through src/gfx/human. Loaded lazily after the first frame. Until it arrives (or if it fails) the
  // articulated-shape people below are drawn, so the game never waits on it. Each person is a Group (game position and heading) holding the skinned model.
  let kit = null; let humanLib = null; let disposed = false;
  const ENEMY_LOOK = {
    raider: ['raider', {}], spearman: ['soldier', { right: 'spear', left: 'none' }], swordsman: ['soldier', { right: 'sword', left: 'none' }], shield: ['soldier', { right: 'sword', left: 'shield' }],
    archer: ['raider', { right: 'bow', left: 'none', tunicColor: '#6a5a3a' }], captain: ['boss', {}], sparrer: ['sparrer', {}],
  };
  function wrapHuman(L, scale = 1) { const H = kit.spawn(L); const g = new THREE.Group(); H.root.rotation.y = Math.PI / 2; g.add(H.root); if (scale !== 1) g.scale.setScalar(scale); g.userData = { H, human: true }; return g; }
  function enemyHuman(kind, slot) { const [role, ov] = ENEMY_LOOK[kind] || ENEMY_LOOK.raider; return wrapHuman(humanLib.makeLook(role, 300 + slot * 7 + kind.length, { override: ov }), kind === 'captain' ? 1.1 : 1); }
  const flashMat = (H, f) => { H.atlas.mat.emissive.setRGB(f, f * 0.9, f * 0.8); };

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
    built = null; lampBatch = null; obstacleGroup = null; obstacleSig = -1; enemies.length = 0; pickups.length = 0; targets3.length = 0; arrows3.length = 0; guards.length = 0; npcs.length = 0; cps.length = 0; lamps.length = 0; boats.length = 0; statics.length = 0;
    skyTex?.dispose(); groundTex?.dispose(); waterTex?.dispose(); skyTex = groundTex = waterTex = null;
  }

  function spawnDust(x, z, angle) {
    const i = dust.next; dust.next = (dust.next + 1) % DUST;
    const a = angle + Math.PI + (Math.random() - 0.5) * 1.2;
    dust.pos.setXYZ(i, x - Math.cos(angle) * 8, 3 + Math.random() * 3, z - Math.sin(angle) * 8);
    dust.vx[i] = Math.cos(a) * 24; dust.vz[i] = Math.sin(a) * 24; dust.life[i] = 1;
  }

  // ---- City ------------------------------------------------------------------------------------------------------------
  // The world is built by src/gfx/city.js into one merged mesh per material (plaster, stone, roof, wood, cloth, metal, foliage cards...), lit with a
  // key light, a cool fill and the baked sky, textured by world-space triplanar maps (src/gfx/materials.js) and graded in the material shaders.
  let worldMats = null; let worldKit = null; let groundPair = null; // the authored Blender kit and baked ground maps, loaded lazily (src/gfx/city-kit.js)
  function applyGrade(T) {
    const g = T.grade; grade.uSat.value = g.sat; grade.uCon.value = g.con; grade.uShadow.value.set(...g.shadow); grade.uLight.value.set(...g.light); grade.uVig.value = g.vig * (qual.level === 'low' ? 0.8 : 1); grade.uWet.value = T.wet || 0;
    gl.toneMappingExposure = T.exposure || 1;
  }
  function buildCity(w) {
    const ts = w.tileSize; const T = theme;
    const rows = w.rowsText || [];
    const tile = (c, r) => rows[r]?.[c] ?? '#';
    const isOpen = (c, r) => !['#', 'o'].includes(tile(c, r));
    const rand = rng(1234);

    // painted sky dome (equirect), fog and light colours come from the era
    const sm = skyMap(qual.level === 'low' ? 384 : 640, T); skyTex?.dispose();
    skyTex = new THREE.DataTexture(sm.rgba, sm.w, sm.h, THREE.RGBAFormat); skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.magFilter = skyTex.minFilter = THREE.LinearFilter; skyTex.wrapS = THREE.RepeatWrapping; skyTex.flipY = false; skyTex.needsUpdate = true;
    sky.material.map = skyTex; sky.material.needsUpdate = true;
    scene.background = new THREE.Color(T.bg);
    scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
    hemi.color.setHex(T.hemi[0]); hemi.groundColor.setHex(T.hemi[1]); hemi.intensity = T.hemi[2];
    moon.color.setHex(T.moon[0]); moon.intensity = T.moon[1];
    lantern.color.setHex(T.lamp);
    rain.p.visible = T.rain; stars.visible = false;
    applyGrade(T);
    sunSprite.visible = true; sunDisc.visible = !T.rain || true; sunSprite.material.color.setHex(T.rain ? 0xffe6b0 : 0xffd48a);

    built = new THREE.Group();
    worldMats?.dispose(); worldMats = createWorldMaterials(THREE, T, qual.profile, grade, gl, { ground: groundPair });
    if (worldKit) Object.assign(worldMats.mats, worldKit.mats);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), worldMats.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(w.width / 2, 0, w.height / 2);
    if (qual.profile.shadows) ground.receiveShadow = true;
    built.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 5, w.height * 5), new THREE.MeshBasicMaterial({ color: T.fog })); outer.material.fog = false;
    outer.rotation.x = -Math.PI / 2; outer.position.set(w.width / 2, -1, w.height / 2); built.add(outer);

    const ctx = {
      THREE, G, T, q: qual.profile, mats: worldMats.mats, built, rand, glow, shadowed, kit: worldKit,
      makePerson: (o) => { if (!kit) return new THREE.Group(); if (kit) { const g = wrapHuman(humanLib.makeLook('keeper', Math.floor(rand() * 400) + 20, { female: !!o.female })); statics.push(g); return g; } return makePerson(o); },
    };
    const res = buildScenery(ctx, w, tile, isOpen);
    res.lamps.forEach((l) => lamps.push(l)); res.boats.forEach((b) => boats.push(b));
    // meshes that receive and cast the real shadow
    const BIG = new Set(['wall', 'stone', 'roof', 'trunk', 'k_stone', 'k_roof']); // only the big forms cast into the one shadow map (the shadow pass re-draws every caster); everything receives
    res.meshes.forEach((m) => { if (qual.profile.shadows && !m.userData.noShadowCast) { m.castShadow = BIG.has(m.name); m.receiveShadow = true; } });
    if (qual.profile.shadows) built.traverse((m) => { if (m.isMesh && m.material === worldMats.mats.lit) m.castShadow = false; });
    // lantern light pools on the ground, one additive soft disc per lamp (the real warm light is the lantern that follows the hero)
    const poolGeo = geo('pool', () => { const g2 = new THREE.PlaneGeometry(1, 1); g2.rotateX(-Math.PI / 2); return g2; });
    // All lamp pools are one instanced draw and all lamp glows one Points draw (they were 2 draws per lamp); flicker is written into per-instance colours.
    lampBatch = null;
    if (lamps.length) {
      const N = lamps.length; const pools = new THREE.InstancedMesh(poolGeo, poolMat, N); const dm = new THREE.Object3D();
      lamps.forEach((l, i) => { dm.position.set(l.s.position.x, 0.8, l.s.position.z); dm.scale.set(210, 1, 210); dm.updateMatrix(); pools.setMatrixAt(i, dm.matrix); pools.setColorAt(i, lampCol.setRGB(1, 1, 1)); });
      pools.renderOrder = 3; pools.frustumCulled = false; built.add(pools);
      const gp = new Float32Array(N * 3); const gc = new Float32Array(N * 3); lamps.forEach((l, i) => { gp[i * 3] = l.s.position.x; gp[i * 3 + 1] = l.s.position.y; gp[i * 3 + 2] = l.s.position.z; });
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
      const glows = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 90, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      glows.frustumCulled = false; built.add(glows); lampBatch = { pools, glows }; flickerLamps(0, true);
    }
  }
  const lampCol = new THREE.Color(); let lampBatch = null;
  function flickerLamps(t, calm) {
    if (!lampBatch) return; const gc = lampBatch.glows.geometry.attributes.color; const warm = new THREE.Color(theme.lamp);
    lamps.forEach((l, i) => {
      const fl = calm ? 0.88 : 0.86 + Math.sin(t * 9 + l.phase) * 0.06 + Math.sin(t * 23.7 + l.phase * 2.3) * 0.04 + Math.sin(t * 3.1 + l.phase) * 0.04;
      lampBatch.pools.setColorAt(i, lampCol.setRGB(fl, fl, fl)); gc.setXYZ(i, warm.r * fl * 0.9, warm.g * fl * 0.9, warm.b * fl * 0.9);
    });
    if (lampBatch.pools.instanceColor) lampBatch.pools.instanceColor.needsUpdate = true; gc.needsUpdate = true;
  }

  // ---- Townspeople ------------------------------------------------------------------------------------------------------
  function buildCrowd(w) {
    if (!kit) return; // no placeholder crowd: the authored people arrive a moment later and the world is rebuilt with them
    const ts = w.tileSize; const rand = rng(777); const rows = w.rowsText || [];
    const open = (c, r) => !['#', 'o'].includes(rows[r]?.[c] ?? '#');
    const segs = [];
    for (let r = 1; r < w.rows - 1; r++) { let c = 1; while (c < w.cols - 1) { if (!open(c, r)) { c++; continue; } const c0 = c; while (c < w.cols - 1 && open(c, r)) c++; if (c - c0 >= 4) segs.push({ ax: (c0 + 0.5) * ts, ay: (r + 0.5) * ts, bx: (c - 0.5) * ts, by: (r + 0.5) * ts }); } }
    for (let c = 1; c < w.cols - 1; c++) { let r = 1; while (r < w.rows - 1) { if (!open(c, r)) { r++; continue; } const r0 = r; while (r < w.rows - 1 && open(c, r)) r++; if (r - r0 >= 4) segs.push({ ax: (c + 0.5) * ts, ay: (r0 + 0.5) * ts, bx: (c + 0.5) * ts, by: (r - 0.5) * ts }); } }
    // Keep the crowd out of the opening shot: a walking segment is cut to its longest piece outside KEEP_OUT of the start, and dropped if that is short.
    // The opening camera sits behind the hero looking along the start heading: nobody may walk inside a radius of KEEP_OUT, or in the cone ahead of the hero
    // (a half-angle wider than the widest lens, 0.8 rad) out to 900 units, so no townsperson can stand in the first frame or cross the lens in the first seconds.
    const KEEP_OUT = 380; const keep = [];
    const inShot = (px, py) => inOpeningShot(w.start, px, py);
    for (const sg of segs) {
      const len = Math.hypot(sg.bx - sg.ax, sg.by - sg.ay); const N = Math.max(2, Math.round(len / 8)); let best = null; let cur = null;
      for (let i = 0; i <= N; i++) { const u = i / N; const px = sg.ax + (sg.bx - sg.ax) * u; const py = sg.ay + (sg.by - sg.ay) * u; const out = !inShot(px, py); if (out) { if (!cur) cur = [u, u]; cur[1] = u; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur; } else cur = null; }
      if (best && (best[1] - best[0]) * len >= ts * 3) keep.push({ ax: sg.ax + (sg.bx - sg.ax) * best[0], ay: sg.ay + (sg.by - sg.ay) * best[0], bx: sg.ax + (sg.bx - sg.ax) * best[1], by: sg.ay + (sg.by - sg.ay) * best[1] });
    }
    segs.length = 0; segs.push(...keep);
    const tops = [0xe8432e, 0xffa51f, 0x1fb6a6, 0xf0c04a, 0xc0407a, 0x4a7ad8, 0x6cc04a, 0xf3ead6];
    const bottoms = [0xf3ead6, 0xe8dcc0, 0x5a3a22, 0xc9b890];
    const skins = [0xc68a5a, 0xb07448, 0xd9a070, 0x9a6440];
    const crowdCap = { low: 4, medium: 8, high: 16 }[qual.level] ?? 8; // skinned people are the biggest triangle cost, so the crowd follows the tier
    const n = segs.length ? Math.min(qual.profile.crowd, crowdCap, Math.floor(segs.length * 1.2)) : 0;
    for (let k = 0; k < n; k++) {
      const s = segs[Math.floor(rand() * segs.length)];
      const kind = k % 5;
      const useKit = !!kit; const kitSeed = (k % 10) + 1;
      const p = useKit ? wrapHuman(humanLib.makeLook(k % 9 === 4 ? 'elder' : 'townsperson', kitSeed)) : makePerson({ eyes: ['#3a7bd8', '#8a5a2a', '#3aa86a', '#9a4ad8'][k % 4], skin: skins[k % 4], top: tops[Math.floor(rand() * tops.length)], bottom: bottoms[k % 4], skirt: true, legsBare: true, turban: kind === 0 || kind === 3 ? tops[(k + 3) % tops.length] : undefined, hair: 0x1b1210, bun: kind === 2, pot: kind === 2, bundle: kind === 4 ? 0xc9a050 : undefined, sleeves: kind === 1 });
      npcs.push({ H: p.userData.H, g: p, s, len: Math.hypot(s.bx - s.ax, s.by - s.ay), speed: 26 + rand() * 24, off: rand(), idle: k % 7 === 6 });
      built.add(p);
    }
  }

  // The player's person, drawn from the traveller chosen on the character screen (or the era's default look).
  function buildHero() {
    const h = theme.hero; const L = heroLook;
    const hex = (c) => parseInt(String(c).slice(1), 16);
    if (hero) { built?.remove(hero); hero.userData.H?.dispose(); }
    if (kit) {
      heroWeapon = lastWeapon; const L2 = humanLib.heroLook(L ? { ...L } : { body: 'm', skin: '#c68a5a', hair: '#1b1210', hairStyle: 'short', eyes: '#3a7bd8', outfitColor: '#ff8a1f', accent: '#e8432e' }, heroWeapon);
      hero = wrapHuman(L2); const ring = new THREE.Mesh(new THREE.RingGeometry(24, 28, 24), new THREE.MeshBasicMaterial({ color: 0xfff4de, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; ring.visible = false; hero.add(ring); hero.userData.ring = ring; heroTop = null; heroStaff = heroSword = heroBow = null;
      shadowed(hero); built?.add(hero); protectRing = ring; return;
    }
    const topColor = L ? hex(L.outfitColor) : h.top;
    heroTop = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.85, emissive: 0x000000 });
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
    if (kit) return makeEnemyKit();
    const top = new THREE.MeshStandardMaterial({ color: 0x3f6a4a, roughness: 0.85, emissive: 0x000000 });
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
  function makeEnemyKit() {
    const g = new THREE.Group(); built.add(g);
    const ringE = new THREE.Mesh(geo('enemyring', () => new THREE.RingGeometry(24, 29, 20)), new THREE.MeshBasicMaterial({ color: 0xff9a2a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ringE.rotation.x = -Math.PI / 2; ringE.position.y = 0.8; g.add(ringE);
    const nose = new THREE.Mesh(geo('wedge', () => new THREE.ConeGeometry(9, 22, 3)), new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0.85 })); nose.rotation.set(Math.PI / 2, 0, -Math.PI / 2); nose.position.set(36, 1.5, 0); g.add(nose); // facing wedge: shape, not colour
    const icons = makeIcons(); built.add(icons.root);
    const teleFull = new THREE.Mesh(wedgeGeo(0.9), new THREE.MeshBasicMaterial({ color: 0xfff4de, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const tele = new THREE.Mesh(wedgeGeo(0.9), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const ring = new THREE.Mesh(geo('sparring', () => new THREE.RingGeometry(23, 27, 16)), new THREE.MeshBasicMaterial({ color: 0xfff4de, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    for (const m of [teleFull, tele, ring]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.position.y = 2; built.add(m); }
    const aim = flatBox(1, 2.5, 0xfff4de, 0.5); aim.visible = false; built.add(aim);
    const open = new THREE.Sprite(new THREE.SpriteMaterial({ map: openTex(), transparent: true, depthWrite: false, fog: false })); open.scale.set(56, 28, 1); open.visible = false; built.add(open);
    return { g, top: null, icons, id: null, x: 0, y: 0, flash: 0, tele, teleFull, ring, kind: null, hg: null, H: null, aim, open, ringE, nose, hurtT: 0, kbx: 0, kby: 0, downT: 0, lastState: '', animDt: 0 };
  }
  const wedgeCache = new Map();
  function wedgeGeo(half) { const q = Math.round(Math.min(Math.PI, half) * 20) / 20; if (!wedgeCache.has(q)) wedgeCache.set(q, q >= Math.PI - 0.01 ? new THREE.CircleGeometry(1, 24) : new THREE.CircleGeometry(1, 14, -q, q * 2)); return wedgeCache.get(q); }
  let openTexCache = null; const openTex = () => openTexCache || (openTexCache = canvasTex(THREE, 128, (g) => { g.fillStyle = '#ffc247'; g.beginPath(); g.moveTo(64, 20); g.lineTo(118, 64); g.lineTo(64, 108); g.lineTo(10, 64); g.closePath(); g.fill(); g.lineWidth = 7; g.strokeStyle = '#140b07'; g.stroke(); g.fillStyle = '#140b07'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OPEN', 64, 66); }));
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
    function inst(geometry, count, fill, material) {
      if (!count) return;
      const m = new THREE.InstancedMesh(geometry, material ? instanced(material) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }), count); // masonry and timber materials of the world, so a wall to vault reads as stone
      let n = 0;
      fill((x, y, z, sx, sy, sz, color, ry = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix); m.setColorAt(n, col.setHex(color)); n++; });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (shadowsOn) { m.castShadow = true; m.receiveShadow = true; }
      obstacleGroup.add(m);
    }
    // Low wall: a solid block with a pale cap and a row of notches reads as "step over it".
    inst(unitBox(), walls.length * 2, (put) => walls.forEach((o) => { put(o.x + o.w / 2, 11, o.y + o.d / 2, o.w - 2, 22, o.d - 2, 0x8a7a5e); put(o.x + o.w / 2, 23.5, o.y + o.d / 2, o.w + 2, 5, o.d + 2, 0xd9c79a); }), worldMats?.mats.stone);
    // Marked ledge: a tall stone block with a gold rope band and pale pegs along the top, so it reads as "climb here". Pit: a dark sunken pad with a pale rim.
    inst(unitBox(), ledges.length * 3, (put) => ledges.forEach((o) => { put(o.x + o.w / 2, 40, o.y + o.d / 2, o.w - 2, 80, o.d - 2, 0x6f6a62); put(o.x + o.w / 2, 62, o.y + o.d / 2, o.w + 1, 5, o.d + 1, 0xffc247); put(o.x + o.w / 2, 82, o.y + o.d / 2, o.w + 2, 4, o.d + 2, 0xe6dcc4); }), worldMats?.mats.stone);
    inst(unitBox(), pits.length * 2, (put) => pits.forEach((o) => { put(o.x + o.w / 2, 0.6, o.y + o.d / 2, o.w, 1.2, o.d, 0x0b0812); put(o.x + o.w / 2, 3, o.y + o.d / 2, o.w + 6, 6, o.d + 6, 0xe6dcc4); }));
    // Beam: two posts and a bar at head height that a standing person cannot pass but a crouching one can.
    inst(unitBox(), beams.length * 3, (put) => beams.forEach((o) => {
      const alongX = o.w >= o.d; const cx = o.x + o.w / 2; const cz = o.y + o.d / 2;
      const len = alongX ? o.w : o.d;
      put(cx, 46, cz, alongX ? len : 9, 9, alongX ? 9 : len, 0x5a3a1c);
      for (const sgn of [-1, 1]) put(alongX ? cx + sgn * (len / 2 - 4) : cx, 26, alongX ? cz : cz + sgn * (len / 2 - 4), 8, 52, 8, 0x3a2412);
    }), worldMats?.mats.wood);
    // Tall grass: a darker pad and a scatter of blades (seeded so it never changes).
    inst(unitBox(), grass.length, (put) => grass.forEach(({ o }) => put(o.x + o.w / 2, 0.8, o.y + o.d / 2, o.w, 1.6, o.d, 0x3a6a30)));
    // Tall grass: soft crossed leaf cards (alpha-tested leaf clusters in three greens), dense, instead of hard cone blades.
    let tufts = 0; grass.forEach(({ o }) => { tufts += Math.max(10, Math.round((o.w * o.d) / 200)); });
    const tuft = geo('tuft', () => { const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0); const b2 = a.clone(); b2.rotateY(Math.PI / 2); return THREE.mergeGeometries([a, b2]); });
    if (worldMats?.mats.card) inst(tuft, tufts, (put) => grass.forEach(({ o, i }) => {
      const r = rng(77 + i * 13); const n = Math.max(10, Math.round((o.w * o.d) / 200));
      for (let k = 0; k < n; k++) { const sz = 14 + r() * 14; put(o.x + 4 + r() * (o.w - 8), 0, o.y + 4 + r() * (o.d - 8), sz, sz * (0.8 + r() * 0.5), sz, [0x6f9a46, 0x84aa52, 0x5c8a3c][k % 3], r() * 3); }
    }), worldMats.mats.card);
    if (grass.length) { const lastG = obstacleGroup.children[obstacleGroup.children.length - 1]; if (lastG) lastG.castShadow = false; }
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

  // One enemy from the frame: the human's pose follows the attack phase, the ground wedge shows the reach and arc, the archer's aim line is drawn, the
  // shield is raised while guarding, an OPEN marker shows after a parry, and a hit gives a flinch and a short shove away from the player.
  let parryT = 0;
  function drivePlayer(frame, c, P, A, swinging, pr, gdt, dt, calm, t, moving) {
    const H = hero.userData.H; const pst = P ? P.state : 'idle'; const weapon = P ? P.weapon : 'none';
    if (weapon !== heroWeapon) { lastWeapon = weapon; buildHero(); return; } // a different weapon in hand: respawn with that prop (geometry and textures are cached)
    parryT = Math.max(0, parryT - dt);
    const ctx = { speed: c.speed || 0, time: t, weapon, reduced: calm, moving, crouch: !!(P && P.crouch), draw: P ? P.draw : 0, snap: false };
    let ps = 'idle';
    if (pst === 'attack' || pst === 'shove') {
      ps = pst; const kind = A && A.kind === 'shove' ? 'shove' : A && A.kind === 'heavy' ? 'heavy' : weapon === 'staff' ? 'staff' : 'light';
      ctx.atk = { kind, progress: swinging ? pr : Math.min(1, (P.stateT || 0) / 0.45), hit: (A && A.hit) || 0.4 };
    } else if (pst === 'finisher') { ps = 'attack'; ctx.atk = { kind: 'heavy', progress: Math.min(1, (P.stateT || 0) / 0.9), hit: 0.5 }; }
    else if (pst === 'block') ps = parryT > 0 ? 'parry' : 'block';
    else if (pst === 'aim' || pst === 'dodge' || pst === 'hurt' || pst === 'vault' || pst === 'climb' || pst === 'crouch') ps = pst;
    if (['dodge', 'hurt', 'vault', 'climb', 'block', 'parry', 'aim', 'finisher', 'attack', 'shove'].includes(pst)) ctx.stateT = P.stateT;
    ctx.state = ps;
    if (gdt > 0 || !H.primed) { H.update(gdt > 0 ? gdt : 1 / 60, ctx); H.primed = true; }
  }
  const AIM_COL = [0xfff4de, 0xffc247];
  function driveEnemy(en, i, e, gdt, dt, calm, t, frame) {
    const hideAll = () => { en.g.visible = false; en.tele.visible = en.teleFull.visible = en.ring.visible = en.aim.visible = en.open.visible = false; };
    if (!e) { hideAll(); return; }
    if (en.id !== e.id) { en.id = e.id; en.x = e.x; en.y = e.y; en.downT = 0; en.kb = 0; }
    if (e.state === 'down') { en.downT += dt; if (en.downT > 6) { hideAll(); return; } } else en.downT = 0;
    if (!en.hg || en.kind !== e.kind) {
      if (en.hg) { en.g.remove(en.hg); en.hg.userData.H.dispose(); }
      en.kind = e.kind; en.hg = enemyHuman(e.kind, i); en.g.add(en.hg); en.H = en.hg.userData.H; shadowed(en.hg); en.ring.visible = false;
    }
    const H = en.H; const st = e.state || 'patrol'; const wind = st === 'windup'; const att = e.attack;
    en.g.visible = true; en.ringE.visible = st !== 'down'; en.nose.visible = st !== 'down';
    // knock-back: a short visual shove away from the player that fades quickly (none with reduced motion)
    en.hurtT = Math.max(0, en.hurtT - dt);
    const pl = frame.chariot; let kx = 0; let ky = 0;
    if (!calm && en.kb > 0.001) { const d = Math.hypot(e.x - pl.x, e.y - pl.y) || 1; kx = (e.x - pl.x) / d * en.kb * 12; ky = (e.y - pl.y) / d * en.kb * 12; en.kb *= Math.exp(-dt * 9); }
    en.g.position.set(e.x + kx, 0, e.y + ky); en.g.rotation.y = -e.angle;
    const moved = Math.hypot(e.x - en.x, e.y - en.y); const speed = dt > 0 ? moved / dt : 0; en.x = e.x; en.y = e.y;
    // telegraph wedge: outline = the full reach and arc, fill = how close the blow is. Unblockable attacks are a full circle (shape, not colour).
    const showTele = wind && att && !att.ranged;
    en.tele.visible = en.teleFull.visible = showTele;
    if (showTele) {
      const u = Math.max(0, Math.min(1, e.windup || 0)); const g2 = wedgeGeo(att.unblockable ? Math.PI : att.halfArc);
      if (en.tele.geometry !== g2) { en.tele.geometry = g2; en.teleFull.geometry = g2; }
      for (const m of [en.tele, en.teleFull]) { m.position.set(e.x, 2, e.y); m.rotation.z = att.unblockable ? 0 : -e.angle; }
      en.teleFull.scale.set(att.reach, att.reach, 1); const k = att.reach * (0.25 + 0.75 * u); en.tele.scale.set(k, k, 1); en.tele.material.opacity = 0.25 + 0.5 * u;
    }
    // archer aim line: thicker and brighter once locked
    const am = e.aim; en.aim.visible = !!am;
    if (am) { const len = Math.hypot(am.x1 - am.x0, am.y1 - am.y0); en.aim.position.set((am.x0 + am.x1) / 2, 3, (am.y0 + am.y1) / 2); en.aim.rotation.y = -Math.atan2(am.y1 - am.y0, am.x1 - am.x0); en.aim.scale.set(Math.max(1, len), 1, am.locked ? 7 : 2.5); en.aim.material.color.setHex(AIM_COL[am.locked ? 1 : 0]); en.aim.material.opacity = am.locked ? 0.9 : 0.5; }
    // the person
    const ctx = { speed, time: t, weapon: H.look.right, reduced: calm, moving: speed > 8, guard: !!e.guard, snap: false };
    let ps = 'idle';
    if (st === 'down') ps = 'down';
    else if (st === 'stagger') ps = 'stagger';
    else if (wind) { ps = 'windup'; ctx.windup = e.windup || 0; }
    else if (st === 'active') { ps = 'strike'; ctx.u = e.phaseT || 0; }
    else if (st === 'recover') { ps = 'recover'; ctx.u = e.phaseT || 0; }
    else if (e.calling) ps = 'call';
    else if (en.hurtT > 0) ps = 'hurt';
    else if (st === 'alert') ps = 'alert';
    if (att && (wind || st === 'active' || st === 'recover')) { ctx.attackName = att.id; ctx.chain = att.idx; }
    if (H.look.right === 'bow' && (wind || st === 'active')) { ps = 'aim'; ctx.draw = wind ? (e.windup || 0) : 0.15; } // an archer draws during the wind-up and looses at the active phase
    ctx.state = ps; ctx.stateT = undefined;
    if (gdt > 0 || !H.primed) { H.update(gdt > 0 ? gdt : 1 / 60, ctx); H.primed = true; }
    en.flash = Math.max(0, en.flash - dt / 0.12); flashMat(H, calm ? 0 : en.flash * 0.5);
    // OPEN marker after a parry: a diamond with the word OPEN
    en.open.visible = !!e.open && st !== 'down'; if (en.open.visible) { en.open.position.set(e.x, 96 + (calm ? 0 : Math.sin(t * 6) * 3), e.y); }
    en.ring.visible = e.kind === 'sparrer' && st !== 'down'; if (en.ring.visible) en.ring.position.set(e.x, 2, e.y);
    if (H.lod !== 0) H.setLod(0);
  }
  
  function handleEvents(frame, calm) {
    if (frame === lastEventsFrame) return; // the same frame object drawn twice must not repeat its one-shot events
    lastEventsFrame = frame;
    const ev = frame.events; if (!ev || !ev.length) return;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]; if (!e) continue;
      if (e.type === 'parry') parryT = 0.3;
      if (e.type === 'prop-shatter' || e.type === 'prop-break') { burst({ n: calm ? 5 : 14, speed: 0.9, life: 0.6 }, e.x || 0, e.y || 0, e.type === 'prop-shatter' ? 0xb4663f : 0x8a6a44, 14); continue; } // clay shards, wood splinters
      const spec = burstSpec(e.type, calm); if (!spec) continue;
      burst(spec, e.x || 0, e.y || 0, burstColor(spec, frame.blood), e.type === 'vault' ? 4 : 30);
      if (e.type === 'hit-enemy' || e.type === 'enemy-down') {
        let best = null; let bd = 60 * 60;
        for (let k = 0; k < enemies.length; k++) { const en = enemies[k]; const d = (en.x - e.x) ** 2 + (en.y - e.y) ** 2; if (d < bd) { bd = d; best = en; } }
        if (best) { best.flash = 1; if (kit) { best.hurtT = 0.3; best.kb = 1; } }
      }
    }
  }

  function loadWorld(w) {
      clearBuilt();
      world = w; theme = THEMES[w.theme] || THEMES.default; setEnvironment(w.theme in THEMES ? w.theme : 'default');
      blocked = (x, z) => { const col = Math.floor(x / w.tileSize); const row = Math.floor(z / w.tileSize); return !!(w.solid[row] && w.solid[row][col]); };
      buildCity(w);
      buildCrowd(w);
      buildHero();
      propNodes.clear(); heldNode = null; propsGroup = new THREE.Group(); propsGroup.add(ringInst); built.add(propsGroup);
      if (Array.isArray(w.obstacles) && w.obstacles.length) buildObstacles(w.obstacles);
      w.checkpoints.forEach((p, i) => { const c = makeCheckpoint(p, i); cps.push(c); built.add(c.g); applyState(c, 'later', p); });
      scene.add(built);
  }
  // The authored world kit (assets/world/kit.glb) and the baked cobble ground load after the first frame; the city is rebuilt once when they arrive.
  // Until then (or if they fail) the code-built city is drawn, so the game never waits on them.
  import('./gfx/city-kit.js').then(async (m) => {
    try {
      const base = new URL('../assets/world/', import.meta.url).href; const low = qual.level === 'low';
      const ld = (f, srgb) => m.loadTexture(THREE, base + f, { srgb, repeat: true, aniso: low ? 1 : Math.min(8, gl.capabilities.getMaxAnisotropy()) });
      const [kr, gr] = await Promise.allSettled([m.loadKit(THREE, { tier: qual.level, grade, gl }), Promise.all([ld('ground_cobble_albedo.jpg', true), ld('ground_cobble_normal.jpg', false)])]); // either may fail on its own
      if (kr.status === 'rejected') console.warn('world kit unavailable', kr.reason);
      if (disposed) { kr.value?.dispose(); gr.value?.forEach((t) => t.dispose()); return; }
      if (kr.status === 'fulfilled') worldKit = kr.value; if (gr.status === 'fulfilled') groundPair = { map: gr.value[0], nor: gr.value[1] };
      if (world && (worldKit || groundPair)) loadWorld(world);
    } catch (err) { console.warn('world kit unavailable, drawing the code-built city', err); }
  });
  // Load the human kit after the first frame; when it arrives the world is rebuilt once with the authored people.
  Promise.all([import('./gfx/human/index.js'), import('./gfx/human/looks.js')]).then(async ([m, lk]) => {
    try { const k = await m.createHumanKit(THREE, { atlas: 512 }); if (disposed) { k.dispose(); return; } humanLib = lk; gripTable = m.GRIPS; kit = k; if (world) loadWorld(world); } catch (err) { console.warn('human kit unavailable, drawing the simple people', err); }
  });

  // Settings override: Automatic, Low, Medium or High (the select #set-quality in the Settings screen). Saved in localStorage; applied live where it can be
  // (pixel budget, density, texture size, shadows, the world is rebuilt). MSAA is fixed when the WebGL context is made, so it changes on the next start.
  function applyQuality(choice) {
    try { if (choice === 'auto') localStorage.removeItem('dharmastra.quality'); else localStorage.setItem('dharmastra.quality', choice); } catch { /* blocked */ }
    let lvl = choice;
    if (choice === 'auto') { let store = null; try { store = localStorage; } catch { /* none */ } lvl = readBenchCache(store) || pickQuality({ dpr: lastSize.dpr, cores: navigator.hardwareConcurrency || 4, fine, memory: navigator.deviceMemory || 4, search: '', saved: null }).level; }
    qual.level = lvl; qual.locked = choice !== 'auto'; qual.profile = PROFILES[lvl]; qual.budget = TIER_BUDGET[lvl]; gov.reset(); govScale = 1; shadowsDropped = false;
    shadowsOn = qual.profile.shadows; gl.shadowMap.enabled = shadowsOn; if (!gl.shadowMap.type) gl.shadowMap.type = THREE.PCFShadowMap; moon.castShadow = shadowsOn;
    if (shadowsOn && !moon.shadow.map) { moon.shadow.mapSize.set(qual.profile.shadowMap, qual.profile.shadowMap); const sc = moon.shadow.camera; sc.left = -620; sc.right = 620; sc.top = 620; sc.bottom = -620; sc.near = 50; sc.far = 1800; moon.shadow.bias = -0.0008; }
    if (lastSize.w) { gl.setPixelRatio(renderRatio(lvl, lastSize.w, lastSize.h, lastSize.dpr, 1)); gl.setSize(lastSize.w, lastSize.h, false); }
    if (world) loadWorld(world);
    return lvl;
  }
  const qSel = typeof document !== 'undefined' ? document.getElementById('set-quality') : null;
  if (qSel) { qSel.value = ['low', 'medium', 'high'].includes(saved) ? saved : 'auto'; qSel.addEventListener('change', () => { const lvl = applyQuality(qSel.value); const n = document.getElementById('set-quality-note'); if (n) n.textContent = qSel.value === 'auto' ? `Automatic: ${lvl} on this device. Anti-aliasing updates next start.` : `${lvl[0].toUpperCase() + lvl.slice(1)} is fixed. Anti-aliasing updates next start.`; }); }

  return {
    setQuality: applyQuality,
    quality: () => ({ level: qual.level, locked: qual.locked, scale: govScale }),
    setCharacter(look) { heroLook = look; if (built) buildHero(); },
    orbit: true, // tells the game this renderer uses the third-person camera (the 2D renderer keeps the fixed north-up view)
    resize(w, h, dpr = 1) {
      lastSize = { w, h, dpr }; gl.setPixelRatio(renderRatio(qual.level, w, h, dpr, govScale));
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
    setWorld(w) { loadWorld(w); },
    render(frame) {
      if (!world || lost) return;
      const now = performance.now() / 1000;
      const rawDt = lastNow ? now - lastNow : 0;
      if (govOn) { // dynamic resolution protects 30 fps: lower the render scale, then (once) drop the shadow map, when frames run long
        const g = gov.push(rawDt);
        if (g.tierDown && moon.castShadow) { moon.castShadow = false; shadowsDropped = true; }
        if (g.changed) { govScale = g.scale; if (lastSize.w) { gl.setPixelRatio(renderRatio(qual.level, lastSize.w, lastSize.h, lastSize.dpr, govScale)); gl.setSize(lastSize.w, lastSize.h, false); } }
      }
      const dt = lastNow ? Math.min(0.1, now - lastNow) : 0;
      lastNow = now;
      const calm = frame.reducedMotion;
      const t = frame.time;
      const frozen = !!frame.hitstop; const gdt = frozen ? 0 : dt * (frame.timeScale || 1); // hit-stop freezes the people; slow motion slows them

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
      for (let i = 0; kit && i < enemies.length; i++) driveEnemy(enemies[i], i, i < nE ? E[i] : null, gdt, dt, calm, t, frame);
      for (let i = 0; !kit && i < enemies.length; i++) {
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
      const AR = frame.projectiles || frame.arrows; const nA = AR ? AR.length : 0; // every arrow in flight, the enemies' as well as the player's
      while (arrows3.length < Math.min(16, nA)) arrows3.push(makeArrow());
      for (let i = 0; i < arrows3.length; i++) {
        const ar = arrows3[i]; if (i >= nA) { ar.visible = false; continue; }
        ar.visible = true; ar.position.set(AR[i].x, 28, AR[i].y); ar.rotation.y = -(AR[i].angle || 0);
      }
      const OB = frame.obstacles;
      if (OB && OB.length && OB.length !== obstacleSig) buildObstacles(OB);
      handleEvents(frame, calm);
      stepParticles(dt);
      stepAmbient(t, frame.chariot.x, frame.chariot.y, calm, theme.rain);
      stepProps(frame, dt, calm, t); stepHeld(frame, calm, t);

      const c = frame.chariot; // the player (field name kept from the first prototype)
      hero.position.set(c.x, 0, c.y);
      hero.rotation.y = -c.angle;
      const spd = Math.min(1, (c.speed || 0) / 215);
      const moving = (c.speed || 0) > 8;
      const kitHero = !!hero.userData.H;
      if (!kitHero) { animate(hero, (c.speed || 0) * Math.max(dt, 0.001), moving ? 0.35 + spd * 0.65 : 0, t); hero.userData.upper.rotation.z = moving ? -0.06 - spd * 0.1 : 0; } // lean into a run
      protectRing.visible = c.invulnerable;
      const P = frame.player; const pstate = P ? P.state : 'idle';
      const hu = hero.userData; hero.visible = true;
      // Crouch squashes the whole figure; vault hops and tucks; a staff is held in the right hand and swings while attack.active.
      const crouchT = P && (P.crouch || pstate === 'crouch') ? 1 : 0;
      crouchK = calm ? crouchT : crouchK + (crouchT - crouchK) * Math.min(1, dt * 14);
      const staffOn = !kitHero && !!P && P.weapon === 'staff'; const swordOn = !kitHero && !!P && P.weapon === 'sword'; const bowOn = !kitHero && !!P && P.weapon === 'bow';
      if (!kitHero) {
        hero.scale.set(1 + 0.08 * crouchK, 1 - 0.38 * crouchK, 1 + 0.08 * crouchK);
        if (pstate === 'vault') { hero.position.y = vaultHop(P.stateT, calm); hu.upper.rotation.z = -0.35; hu.legs[0].rotation.z = 0.9; hu.legs[1].rotation.z = 0.7; } else hero.position.y = 0;
        heroStaff.visible = staffOn; heroSword.visible = swordOn; heroBow.visible = bowOn;
      }
      const A = frame.attack; const swinging = !!(A && A.active);
      const pr = swinging ? Math.max(0, Math.min(1, A.progress || 0)) : 0;
      const charging = swinging && A.kind === 'heavy' && pr < (A.hit || 0.575);
      if (kitHero) drivePlayer(frame, c, P, A, swinging, pr, gdt, dt, calm, t, moving);
      if (!kitHero) if (staffOn) hu.arms[1].rotation.z = swinging ? 2.4 - 2.2 * pr : 1.0 + hu.arms[1].rotation.z * 0.15;
      if (swordOn) {
        if (pstate === 'block') { hu.arms[1].rotation.z = 2.2; heroSword.rotation.z = 0; hu.arms[0].rotation.z = 1.4; }
        else if (swinging && A.kind === 'shove') { hu.arms[1].rotation.z = 1.6; hu.arms[0].rotation.z = 1.6; }
        else if (swinging) hu.arms[1].rotation.z = charging ? 2.9 : 2.7 - 2.5 * pr; // heavy: held high first, then it comes down at the moment of impact
        else hu.arms[1].rotation.z = 0.9 + hu.arms[1].rotation.z * 0.15;
      } else if (!kitHero && swinging && A.kind === 'shove') { hu.arms[1].rotation.z = 1.6; hu.arms[0].rotation.z = 1.6; }
      if (bowOn) hu.arms[1].rotation.z = pstate === 'aim' ? 1.55 : 0.8;
      if (pstate === 'aim' && P) { // aim line along the way the arrow will go, and a bar along it that grows with the draw (full draw turns gold)
        const aa = P.aimAngle || c.angle; const d = Math.max(0, Math.min(1, P.draw || 0));
        aimLine.visible = true; aimBar.visible = d > 0.02;
        aimLine.position.set(c.x + Math.cos(aa) * 130, 3, c.y + Math.sin(aa) * 130); aimLine.rotation.y = -aa;
        aimBar.scale.x = Math.max(0.001, 160 * d); aimBar.position.set(c.x + Math.cos(aa) * (20 + 80 * d), 4, c.y + Math.sin(aa) * (20 + 80 * d)); aimBar.rotation.y = -aa; aimBar.material.color.setHex(d >= 0.999 ? 0xffc247 : 0xfff4de);
      } else { aimLine.visible = false; aimBar.visible = false; }
      if (pstate === 'block') { guardArc.visible = true; guardArc.position.set(c.x, 26, c.y); guardArc.rotation.z = -c.angle; } else guardArc.visible = false;
      if (!kitHero && pstate === 'dodge') hero.scale.set(1.12, 0.62, 1.12); // a roll: low and wide
      if (swinging) {
        const shove = A.kind === 'shove';
        swingArc.visible = true; swingArc.position.x = c.x; swingArc.position.z = c.y; swingArc.rotation.z = -(A.angle || 0);
        const k = Math.max(0.4, (A.range || 60) / 60); swingArc.scale.set(k, k, 1);
        swingArc.material.color.setHex(shove ? 0xfff4de : 0xff9d1a);
        swingArc.material.opacity = charging ? 0.3 : calm ? 0.55 : (shove ? 0.5 : 0.75) * (1 - pr * 0.8);
      } else swingArc.visible = false;
      const hurtFlash = P && pstate === 'hurt' ? Math.max(0, 1 - (P.stateT || 0) / 0.2) : 0;
      const flash = calm ? 0 : Math.max(frame.effects.flash, hurtFlash);
      if (heroTop) heroTop.emissive.setRGB(flash * 0.9, flash * 0.1, flash * 0.1); else if (kitHero) flashMat(hero.userData.H, flash * 0.5);
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
        if (n.H) { // townspeople far away are not animated; mid distance skips the cloth and hair springs
          if ((d < 900 && gdt > 0) || !n.H.primed) { n.H.setLod(d > 450 ? 2 : d > 260 ? 1 : 0); n.H.update(gdt || 1 / 60, { state: n.idle ? 'talk' : 'idle', speed: calm || n.idle ? 0 : n.speed, time: t, reduced: calm, moving: !(calm || n.idle) }); n.H.primed = true; }
        } else animate(n.g, calm || n.idle ? 0 : n.speed * dt, calm || n.idle ? 0 : 0.6, t);
      });

      for (const sg of statics) { const H = sg.userData.H; if (!H) continue; const dd = Math.hypot(sg.position.x - c.x, sg.position.z - c.y); if (dd < 700 && (gdt > 0 || !H.primed)) { H.setLod(dd > 400 ? 2 : 1); H.update(gdt || 1 / 60, { state: 'talk', speed: 0, time: t, reduced: calm }); H.primed = true; } }
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
        flickerLamps(t, false);
        lantern.intensity = 2.4 * (0.92 + Math.sin(t * 11) * 0.05 + Math.sin(t * 29) * 0.03);
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
      { const sd = theme.sunDir; const l3 = Math.hypot(...sd); sunDisc.position.set(camera.position.x + sd[0] / l3 * 3290, camera.position.y + sd[1] / l3 * 3290, camera.position.z + sd[2] / l3 * 3290); sunSprite.position.set(camera.position.x + sd[0] / l3 * 3300, camera.position.y + sd[1] / l3 * 3300, camera.position.z + sd[2] / l3 * 3300); }
      { // one tuned shadow map follows the hero, snapped to whole shadow texels in light space so the edges do not shimmer when he moves
        const sd = theme.sunDir; const l3 = Math.hypot(...sd); const dx = sd[0] / l3; const dy = sd[1] / l3; const dz = sd[2] / l3;
        let rx = dz; let rz = -dx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // light-space right (horizontal)
        const ux = -dy * rz; const uy = dz * rx - dx * rz; const uz = dy * rx; const ul = Math.hypot(ux, uy, uz) || 1; // light-space up
        const texel = 1240 / (moon.shadow.mapSize.x || 1024); const pr = c.x * rx + c.y * rz; const pu = (c.x * ux + 0 * uy + c.y * uz) / ul;
        const sr = Math.round(pr / texel) * texel - pr; const su = Math.round(pu / texel) * texel - pu;
        const tx = c.x + rx * sr + (ux / ul) * su; const tz = c.y + rz * sr + (uz / ul) * su;
        moon.position.set(tx + dx * 900, dy * 900 + (uy / ul) * su, tz + dz * 900); moon.target.position.set(tx, (uy / ul) * su, tz);
      }
      if (composer) composer.render(); else gl.render(scene, camera);
      if (now - infoAt > 0.4) { infoAt = now; const i = gl.info; window.__gfxInfo = { tier: qual.level, locked: qual.locked, bench: qual.bench, scale: +govScale.toFixed(2), ratio: +gl.getPixelRatio().toFixed(2), calls: i.render.calls, tris: i.render.triangles, programs: i.programs?.length, textures: i.memory.textures, kit: !!worldKit, shadowsDropped }; }
    },
    dispose() {
      disposed = true; wprops.dispose(); kit?.dispose(); worldKit?.dispose(); groundPair?.map.dispose(); groundPair?.nor.dispose(); envCache.forEach((tx) => tx.dispose());
      canvas.removeEventListener('webglcontextlost', onLost);
      clearBuilt();
      [glowTex, beamTex, mandalaTex].forEach((tx) => tx.dispose());
      geoCache.forEach((g2) => g2.dispose()); matCache.forEach((m2) => m2.dispose());
      composer?.dispose?.();
      gl.dispose();
    },
  };
}
