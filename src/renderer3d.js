// Three.js renderer implementing the interface in renderer.js.
// A walking mission is shown as a city map: a high, north-up camera follows a person on foot through streets built to match the era
// (see THEMES). The city has buildings, market stalls, trees, lamps, walking townspeople, patrolling guards, shadows and a night sky.
// Everything is built from simple shapes and shared geometry so it stays light; real authored models can replace the people later.
// Meaning is never colour alone: checkpoints change height and style and carry a number or a check mark,
// guards have a spear, a helmet, a ground ring and a facing wedge, and the player shows a ring while protected.
// The caller passes in the THREE namespace so the large library is only downloaded when 3D is used.
import { followCamera, createCameraState, mapView } from './camera.js';

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

export function createRenderer3D(canvas, THREE, { onContextLost } = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const shadowsOn = (navigator.hardwareConcurrency || 8) > 4;
  if (shadowsOn) gl.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 10, 4200);
  const camState = createCameraState();
  const camPos = { x: 0, z: 0, ready: false };

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
  let hero = null; let heroTop = null; let protectRing = null;
  const guards = []; const npcs = []; const cps = []; const lamps = []; const boats = [];
  let lastNow = 0; let lost = false; let spawnAcc = 0;

  const onLost = (e) => { e.preventDefault(); lost = true; onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  // Shared geometry and materials (people reuse these).
  const geoCache = new Map(); const matCache = new Map();
  function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
  function mat(color, extra) { const k = color + (extra ? JSON.stringify(extra) : ''); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...extra })); return matCache.get(k); }
  function box(w, h, d, m) { return new THREE.Mesh(geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), m); }
  function cyl(rt, rb, h, seg, m) { return new THREE.Mesh(geo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m); }
  function ball(r, m, sx = 1, sy = 1, sz = 1) { const s = new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), m); s.scale.set(sx, sy, sz); return s; }
  function glow(color, size, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(size, size, 1); return s;
  }
  function shadowed(o, cast = true, receive = false) { if (shadowsOn) o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; }

  function label(text, bg) {
    return canvasTex(THREE, 128, (g) => {
      g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#fff4de'; g.stroke();
      g.fillStyle = '#140b07'; g.font = 'bold 80px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 64, 70);
    });
  }

  // ---- People ----------------------------------------------------------------------------------------------------------
  // Faces +x. About 62 units tall. Limbs hang from pivots so a walk cycle is just a few rotations.
  function makePerson(o) {
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
    const torso = cyl(6.4, 7.4, 19, 8, top); torso.position.y = 39; upper.add(torso);
    if (o.sash) { const sh = cyl(7.6, 7.6, 3, 8, mat(o.sash)); sh.position.y = 32; upper.add(sh); }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0, 46, side * 9);
      const arm = cyl(2.3, 1.9, 19, 6, o.sleeves ? top : skin); arm.position.y = -9.5; pivot.add(arm);
      const hand = ball(2.4, skin); hand.position.y = -20; pivot.add(hand);
      upper.add(pivot); arms.push(pivot);
    }
    const neck = cyl(2.2, 2.4, 3, 6, skin); neck.position.y = 49.5; upper.add(neck);
    const head = ball(5.6, skin); head.position.y = 55; upper.add(head);
    const nose = box(1.6, 1.6, 1.6, skin); nose.position.set(5.6, 54.5, 0); upper.add(nose);
    for (const z of [-2, 2]) { const eye = box(0.8, 1.2, 1.2, dark); eye.position.set(5, 56, z); upper.add(eye); }
    if (o.turban) { const tb = ball(6.6, mat(o.turban), 1, 0.78, 1); tb.position.y = 58; upper.add(tb); const tc = ball(3.4, mat(o.turban), 1, 0.9, 1); tc.position.y = 63; upper.add(tc); }
    else if (o.helm) { const hm = new THREE.Mesh(geo('helm', () => new THREE.ConeGeometry(6, 12, 8)), mat(o.helm)); hm.position.y = 63; upper.add(hm); const br = cyl(6.4, 6.4, 2, 8, mat(o.helm)); br.position.y = 58; upper.add(br); }
    else { const hr = ball(5.9, mat(o.hair || 0x1b1210), 1, 0.8, 1.02); hr.position.set(-0.6, 57.5, 0); upper.add(hr); if (o.bun) { const bn = ball(2.6, mat(o.hair || 0x1b1210)); bn.position.set(-5.5, 58, 0); upper.add(bn); } }
    const extras = {};
    if (o.scarf) { const sc = box(16, 2.4, 5, mat(o.scarf)); sc.position.set(-10, 47, 0); upper.add(sc); extras.scarf = sc; const sc2 = box(5, 6, 5.4, mat(o.scarf)); sc2.position.set(1, 46, 0); upper.add(sc2); }
    if (o.bag) { const bg = box(7, 9, 4, mat(o.bag)); bg.position.set(-1, 33, 9.5); upper.add(bg); }
    if (o.pot) { const pt = ball(5, mat(0xb4552f), 1, 0.9, 1); pt.position.set(0, 65, 0); upper.add(pt); }
    if (o.bundle) { const bd = ball(6, mat(o.bundle), 1.2, 0.8, 1); bd.position.set(-2, 64, 0); upper.add(bd); }
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
    built = null; guards.length = 0; npcs.length = 0; cps.length = 0; lamps.length = 0; boats.length = 0;
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), new THREE.MeshLambertMaterial({ map: groundTex, color: T.groundTint }));
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
    const n = Math.min(26, Math.floor(segs.length * 1.2));
    for (let k = 0; k < n; k++) {
      const s = segs[Math.floor(rand() * segs.length)];
      const kind = k % 5;
      const p = makePerson({ skin: skins[k % 4], top: tops[Math.floor(rand() * tops.length)], bottom: bottoms[k % 4], skirt: true, legsBare: true, turban: kind === 0 || kind === 3 ? tops[(k + 3) % tops.length] : undefined, hair: 0x1b1210, bun: kind === 2, pot: kind === 2, bundle: kind === 4 ? 0xc9a050 : undefined, sleeves: kind === 1 });
      npcs.push({ g: p, s, len: Math.hypot(s.bx - s.ax, s.by - s.ay), speed: 26 + rand() * 24, off: rand(), idle: k % 7 === 6 });
      built.add(p);
    }
  }

  return {
    resize(w, h, dpr = 1) {
      gl.setPixelRatio(Math.min(dpr, 2));
      gl.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 62 : 46;
      if (h > w) camera.setViewOffset(w, h, 0, Math.round(h * 0.1), w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    setWorld(w) {
      clearBuilt();
      world = w; theme = THEMES[w.theme] || THEMES.default;
      buildCity(w);
      buildCrowd(w);
      const h = theme.hero;
      heroTop = new THREE.MeshLambertMaterial({ color: h.top, emissive: 0x000000 });
      hero = makePerson({ skin: h.skin, top: h.top, topMat: heroTop, bottom: h.bottom, skirt: true, legsBare: true, scarf: h.scarf, bag: 0x6a4630, hair: h.hair, lamp: true, lampColor: theme.lamp, ringColor: 0xfff4de, ring: [24, 28] });
      shadowed(hero); built.add(hero); protectRing = hero.userData.ring;
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
        const g = makePerson({ skin: 0xc08a5a, top: gcfg.top, bottom: gcfg.bottom, skirt: true, legsBare: true, helm: gcfg.helm, sash: 0xffc247, sleeves: true, spear: true, shield: 0xc98a2a, lamp: true, lampColor: theme.lamp, ring: [24, 29], ringAlways: true, wedge: true });
        shadowed(g); built.add(g); guards.push({ g, x: src.x, y: src.y });
      }
      frame.guards.forEach((gd, i) => {
        const gg = guards[i]; const moved = Math.hypot(gd.x - gg.x, gd.y - gg.y);
        gg.g.position.set(gd.x, 0, gd.y); gg.g.rotation.y = -gd.angle;
        animate(gg.g, moved, moved > 0.05 ? 0.8 : 0, t);
        gg.x = gd.x; gg.y = gd.y;
      });

      const c = frame.chariot; // the player (field name kept from the first prototype)
      hero.position.set(c.x, 0, c.y);
      hero.rotation.y = -c.angle;
      const spd = Math.min(1, (c.speed || 0) / 215);
      const moving = (c.speed || 0) > 8;
      animate(hero, (c.speed || 0) * Math.max(dt, 0.001), moving ? 0.35 + spd * 0.65 : 0, t);
      hero.userData.upper.rotation.z = moving ? -0.06 - spd * 0.1 : 0; // lean into a run
      protectRing.visible = c.invulnerable;
      const flash = calm ? 0 : frame.effects.flash;
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
        if (!camPos.ready || calm || dt > 0.25) { camPos.x = c.x; camPos.z = c.y; camPos.ready = true; }
        else { const k = 1 - Math.exp(-7 * dt); camPos.x += (c.x - camPos.x) * k; camPos.z += (c.y - camPos.z) * k; }
        view = mapView({ x: camPos.x, y: camPos.z });
      } else view = followCamera(camState, c, dt, calm);
      const sh = calm ? 0 : frame.effects.shake * 5;
      camera.position.set(view.position.x + (Math.random() - 0.5) * sh, view.position.y + (Math.random() - 0.5) * sh, view.position.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      sky.position.copy(camera.position); stars.position.copy(camera.position);
      moonDisc.position.set(camera.position.x - 1700, 1500, camera.position.z - 1400);
      moon.position.set(c.x - 320, 650, c.y + 260); moon.target.position.set(c.x, 0, c.y);
      gl.render(scene, camera);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      clearBuilt();
      [glowTex, beamTex, mandalaTex].forEach((tx) => tx.dispose());
      geoCache.forEach((g2) => g2.dispose()); matCache.forEach((m2) => m2.dispose());
      gl.dispose();
    },
  };
}
