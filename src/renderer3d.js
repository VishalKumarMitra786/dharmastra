// Three.js renderer implementing the interface in renderer.js. A stylised night scene: lapis sky with stars and a moon,
// lit windows and lamp posts, light-beam checkpoints with a turning mandala on the ground, and a dust trail behind the chariot.
// Meaning is never colour alone: checkpoints change height and style and carry a number or a check mark,
// guards have a spear, a ground ring and a facing wedge, and the chariot shows a ring while it is protected.
// All glow is cheap (additive sprites and open cylinders), so it stays light on mid-range phones.
// The caller passes in the THREE namespace so the large library is only downloaded when 3D is used.
import { followCamera, createCameraState } from './camera.js';

const WALL_COLORS = [0xb9714a, 0xa8643f, 0xc98a5c, 0x9a5a3c];
const CP = {
  next: { height: 170, color: 0x28e0d0, wire: false },
  done: { height: 30, color: 0x57e07a, wire: false },
  later: { height: 64, color: 0xd9c48f, wire: true },
};
const DUST = 90;

function canvasTex(THREE, size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// Small seeded random so the ground pattern is the same every run.
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

export function createRenderer3D(canvas, THREE, { onContextLost } = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c33);
  scene.fog = new THREE.Fog(0x1a1245, 380, 1200);
  const camera = new THREE.PerspectiveCamera(58, 1, 5, 3000);
  const camState = createCameraState();

  scene.add(new THREE.HemisphereLight(0x9a8cf0, 0x3a2438, 1.2));
  const moon = new THREE.DirectionalLight(0xbcc8ff, 0.9);
  moon.position.set(-300, 500, 200);
  scene.add(moon);
  const lantern = new THREE.PointLight(0xffb45a, 2.2, 460, 1.5);
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
  const skyTex = canvasTex(THREE, 512, (g, s) => {
    const l = g.createLinearGradient(0, 0, 0, s);
    l.addColorStop(0, '#07051c'); l.addColorStop(0.55, '#2a1a63'); l.addColorStop(0.82, '#8a3d6b'); l.addColorStop(1, '#f0904a');
    g.fillStyle = l; g.fillRect(0, 0, s, s);
  });
  const groundTex = canvasTex(THREE, 256, (g, s) => {
    const rand = rng(7);
    g.fillStyle = '#6f5a3f'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 520; i++) { // earth speckle
      const v = 80 + rand() * 60;
      g.fillStyle = `rgba(${v + 20},${v},${v - 25},0.35)`;
      g.fillRect(rand() * s, rand() * s, 2 + rand() * 5, 2 + rand() * 4);
    }
    g.strokeStyle = 'rgba(30,18,10,0.55)'; g.lineWidth = 3; // flagstone joints
    for (let y = 0; y <= s; y += s / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    for (let row = 0; row < 2; row++) for (let x = (row % 2) * (s / 4); x <= s; x += s / 2) { g.beginPath(); g.moveTo(x, row * s / 2); g.lineTo(x, (row + 1) * s / 2); g.stroke(); }
  }, true);
  const mandalaTex = canvasTex(THREE, 256, (g, s) => {
    const c = s / 2;
    g.translate(c, c);
    g.strokeStyle = '#fff1c9'; g.fillStyle = '#fff1c9';
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, c - 8, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, c * 0.62, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { // lotus petals
      g.save(); g.rotate((i / 12) * Math.PI * 2);
      g.beginPath(); g.moveTo(0, -c * 0.62); g.quadraticCurveTo(c * 0.16, -c * 0.8, 0, -c * 0.97); g.quadraticCurveTo(-c * 0.16, -c * 0.8, 0, -c * 0.62); g.fill();
      g.restore();
    }
    for (let i = 0; i < 8; i++) { g.save(); g.rotate((i / 8) * Math.PI * 2); g.fillRect(-2, -c * 0.6, 4, c * 0.4); g.restore(); }
  });

  // Sky dome, moon and stars. These never move with the world, they follow the camera.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 16, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.DoubleSide, fog: false }));
  scene.add(sky);
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c9, transparent: true, depthWrite: false, fog: false }));
  moonDisc.scale.set(420, 420, 1); scene.add(moonDisc);
  const stars = (() => {
    const rand = rng(99); const pos = [];
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2; const e = 0.12 + rand() * 1.1; const r = 2300;
      pos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff6dd, size: 7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
    scene.add(p); return p;
  })();

  // Dust trail: a ring buffer of points kicked up behind the chariot.
  const dust = (() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32BufferAttributeSafe(DUST * 3);
    geo.setAttribute('position', pos);
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe9c78f, size: 16, map: glowTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false; scene.add(p);
    return { p, pos, life: new Float32Array(DUST), vx: new Float32Array(DUST), vz: new Float32Array(DUST), next: 0 };
  })();
  function Float32BufferAttributeSafe(n) { const a = new THREE.Float32BufferAttribute(new Float32Array(n).fill(-99999), 3); a.setUsage(THREE.DynamicDrawUsage); return a; }

  let world = null;
  let built = null;
  let chariot = null;
  let protectRing = null;
  let bodyMat = null;
  const guards = [];
  const cps = [];
  const lamps = []; // glow sprites that flicker
  let lastNow = 0;
  let lost = false;
  let spawnAcc = 0;

  const onLost = (e) => { e.preventDefault(); lost = true; onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
  function glow(color, size, opacity = 0.9) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(size, size, 1); return s;
  }

  function label(text, bg) {
    return canvasTex(THREE, 128, (g) => {
      g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#fff4de'; g.stroke();
      g.fillStyle = '#140b07'; g.font = 'bold 80px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 64, 70);
    });
  }

  function makeChariot() {
    const g = new THREE.Group();
    bodyMat = mat(0xffa51f, { emissive: 0x000000 });
    const dark = mat(0x3b2a1b);
    const gold = mat(0xffd36a);
    const body = box(40, 14, 28, bodyMat); body.position.set(-4, 16, 0); g.add(body);
    const rail = box(4, 16, 28, bodyMat); rail.position.set(14, 28, 0); g.add(rail);
    const trim = box(42, 3, 30, gold); trim.position.set(-4, 24, 0); g.add(trim);
    const post = box(3, 34, 3, gold); post.position.set(-20, 36, 0); g.add(post);
    const flag = box(1.5, 12, 18, mat(0xe8432e)); flag.position.set(-20, 48, -9); g.add(flag);
    const pole = box(46, 3, 4, dark); pole.position.set(32, 14, 0); g.add(pole);
    for (const z of [-18, 18]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 4, 12), dark);
      w.rotation.x = Math.PI / 2; w.position.set(-4, 14, z); g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6, 8), gold);
      hub.rotation.x = Math.PI / 2; hub.position.set(-4, 14, z * 1.08); g.add(hub);
    }
    const horse = mat(0xf0e6d4); // pale horses read well against dark ground
    const harness = mat(0xe8432e);
    for (const z of [-9, 9]) {
      const hb = box(30, 16, 10, horse); hb.position.set(58, 22, z); g.add(hb);
      const hh = box(12, 12, 8, horse); hh.position.set(78, 32, z); g.add(hh);
      const hs = box(4, 4, 11, harness); hs.position.set(46, 28, z); g.add(hs);
    }
    const head = glow(0xffc46a, 150, 0.55); head.position.set(100, 30, 0); g.add(head);
    protectRing = new THREE.Mesh(new THREE.TorusGeometry(46, 2.2, 6, 28), new THREE.MeshBasicMaterial({ color: 0xfff4de }));
    protectRing.rotation.x = Math.PI / 2; protectRing.position.set(24, 8, 0); protectRing.visible = false; g.add(protectRing);
    return g;
  }

  function makeGuard(radius) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.8, 34, 8), mat(0xc0322a));
    body.position.y = 17; g.add(body);
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.66, 5, 8), mat(0xffd36a));
    sash.position.y = 20; g.add(sash);
    const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.45, 8, 6), mat(0xe8c9a0));
    head.position.y = 42; g.add(head);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.5, 14, 8), mat(0xffd36a));
    helm.position.y = 54; g.add(helm);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 5), mat(0xd8c39a));
    spear.rotation.z = Math.PI / 2; spear.position.set(radius * 0.9 + 18, 30, radius * 0.5); g.add(spear);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 5), mat(0xf4f4f4));
    tip.rotation.z = -Math.PI / 2; tip.position.set(radius * 0.9 + 58, 30, radius * 0.5); g.add(tip);
    const lamp = box(7, 9, 7, new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    lamp.position.set(-radius * 0.2, 36, -radius * 0.9); g.add(lamp);
    const lg = glow(0xffb040, 90, 0.8); lg.position.set(-radius * 0.2, 38, -radius * 0.9); g.add(lg);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.45, radius * 1.75, 24), new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 1.2; g.add(ring);
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.8, radius * 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xff5a48, transparent: true, opacity: 0.85 }));
    wedge.rotation.set(Math.PI / 2, 0, -Math.PI / 2); wedge.position.set(radius * 2.4, 1.5, 0); g.add(wedge);
    return g;
  }

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
    built.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (m) { m.dispose?.(); } // shared textures are kept and disposed with the renderer
    });
    built = null; guards.length = 0; cps.length = 0; lamps.length = 0;
  }

  function spawnDust(x, z, angle, speed) {
    const i = dust.next; dust.next = (dust.next + 1) % DUST;
    const a = angle + Math.PI + (Math.random() - 0.5) * 0.9;
    dust.pos.setXYZ(i, x - Math.cos(angle) * 30, 6 + Math.random() * 6, z - Math.sin(angle) * 30);
    dust.vx[i] = Math.cos(a) * (20 + speed * 0.15); dust.vz[i] = Math.sin(a) * (20 + speed * 0.15);
    dust.life[i] = 1;
  }

  return {
    resize(w, h, dpr = 1) {
      gl.setPixelRatio(Math.min(dpr, 2));
      gl.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 70 : 58;
      if (h > w) camera.setViewOffset(w, h, 0, Math.round(h * 0.14), w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    setWorld(w) {
      clearBuilt();
      world = w;
      built = new THREE.Group();
      groundTex.repeat.set(w.width / 144, w.height / 144);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), new THREE.MeshLambertMaterial({ map: groundTex, color: 0xd8c8b0 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(w.width / 2, 0, w.height / 2); built.add(ground);
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 4, w.height * 4), mat(0x150f30));
      outer.rotation.x = -Math.PI / 2; outer.position.set(w.width / 2, -1, w.height / 2); built.add(outer);

      const n = Math.max(1, w.walls.length);
      const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff), n);
      const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0x5a2f3f), n);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      const lit = [];
      w.walls.forEach((wl, i) => {
        const h = 60 + ((i * 37) % 5) * 12;
        dummy.position.set(wl.x + wl.w / 2, h / 2, wl.y + wl.h / 2);
        dummy.scale.set(wl.w, h, wl.h); dummy.updateMatrix();
        walls.setMatrixAt(i, dummy.matrix);
        walls.setColorAt(i, col.setHex(WALL_COLORS[i % WALL_COLORS.length]));
        dummy.position.set(wl.x + wl.w / 2, h + 3, wl.y + wl.h / 2);
        dummy.scale.set(wl.w + 6, 6, wl.h + 6); dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
        if (wl.w >= 100 && wl.h >= 100 && lit.length < 60) lit.push({ x: wl.x, y: wl.y, w: wl.w, h: wl.h, top: h });
      });
      walls.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
      if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
      built.add(walls); built.add(caps);

      // Warm windows on big buildings, and a glowing lamp at each building corner on the street side.
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffc96a });
      lit.forEach((b, k) => {
        const count = Math.max(2, Math.floor(b.w / 90));
        for (let i = 0; i < count; i++) {
          const x = b.x + (b.w * (i + 0.5)) / count;
          for (const zEdge of [b.y - 0.5, b.y + b.h + 0.5]) {
            if ((i + k) % 3 === 0) continue;
            const win = box(14, 18, 1, winMat); win.position.set(x, b.top * 0.55, zEdge); built.add(win);
          }
        }
        const lampPost = box(3, 38, 3, mat(0x2a1a10)); lampPost.position.set(b.x - 8, 19, b.y - 8); built.add(lampPost);
        const lg = glow(0xffa83a, 70, 0.9); lg.position.set(b.x - 8, 42, b.y - 8); built.add(lg);
        lamps.push({ s: lg, phase: k * 1.7 });
      });

      chariot = makeChariot(); built.add(chariot);
      w.checkpoints.forEach((p, i) => { const c = makeCheckpoint(p, i); cps.push(c); built.add(c.g); applyState(c, 'later', p); });
      scene.add(built);
    },
    render(frame) {
      if (!world || lost) return;
      const now = performance.now() / 1000;
      const dt = lastNow ? Math.min(0.1, now - lastNow) : 0;
      lastNow = now;
      const calm = frame.reducedMotion;

      while (guards.length < frame.guards.length) { const g = makeGuard(frame.guards[guards.length].radius); guards.push(g); built.add(g); }
      frame.guards.forEach((gd, i) => { guards[i].position.set(gd.x, 0, gd.y); guards[i].rotation.y = -gd.angle; });

      const c = frame.chariot;
      chariot.position.set(c.x, 0, c.y);
      chariot.rotation.y = -c.angle;
      protectRing.visible = c.invulnerable;
      const flash = calm ? 0 : frame.effects.flash;
      bodyMat.emissive.setRGB(flash * 0.9, flash * 0.1, flash * 0.1);
      lantern.position.set(c.x + Math.cos(c.angle) * 60, 70, c.y + Math.sin(c.angle) * 60);

      frame.checkpoints.forEach((p, i) => {
        const cp = cps[i];
        if (cp.state !== p.state) applyState(cp, p.state, p);
        if (p.state === 'next' && !calm) {
          const pulse = 1 + Math.sin(frame.time * 4) * 0.06;
          cp.ring.scale.set(pulse, pulse, 1);
          cp.mandala.rotation.z = frame.time * 0.5;
          cp.halo.material.opacity = 0.7 + Math.sin(frame.time * 3) * 0.15;
        } else cp.ring.scale.set(1, 1, 1);
      });

      if (!calm) {
        lamps.forEach((l) => { l.s.material.opacity = 0.8 + Math.sin(frame.time * 7 + l.phase) * 0.1; });
        // Dust: spawn while the chariot moves, drift and fade the rest.
        spawnAcc += dt * 40;
        while (spawnAcc >= 1) { spawnAcc -= 1; spawnDust(c.x, c.y, c.angle, 80); }
        for (let i = 0; i < DUST; i++) {
          if (dust.life[i] <= 0) continue;
          dust.life[i] -= dt * 1.1;
          if (dust.life[i] <= 0) { dust.pos.setXYZ(i, 0, -9999, 0); continue; }
          dust.pos.setXYZ(i, dust.pos.getX(i) + dust.vx[i] * dt, dust.pos.getY(i) + 14 * dt, dust.pos.getZ(i) + dust.vz[i] * dt);
        }
        dust.pos.needsUpdate = true;
      }

      const view = followCamera(camState, c, dt, calm);
      const sh = calm ? 0 : frame.effects.shake * 6;
      camera.position.set(view.position.x + (Math.random() - 0.5) * sh, view.position.y + (Math.random() - 0.5) * sh, view.position.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      moonDisc.position.set(camera.position.x - 1300, 1200, camera.position.z - 900);
      gl.render(scene, camera);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      clearBuilt();
      [glowTex, beamTex, skyTex, groundTex, mandalaTex].forEach((t) => t.dispose());
      gl.dispose();
    },
  };
}
