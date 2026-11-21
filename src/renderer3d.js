// Three.js renderer implementing the interface in renderer.js. Low-poly night scene built only from simple shapes.
// Meaning is never colour alone: checkpoints change height and style and carry a number or a check mark,
// guards have a spear, a ground ring and a facing wedge, and the chariot shows a ring while it is protected.
// The caller passes in the THREE namespace so the large library is only downloaded when 3D is used.
import { followCamera, createCameraState } from './camera.js';

const WALL_COLORS = [0xc08b62, 0xb47e55, 0xcc9870];
const CP = {
  next: { height: 150, color: 0x19c3d6, wire: false },
  done: { height: 28, color: 0x3ec45a, wire: false },
  later: { height: 60, color: 0xd8c39a, wire: true },
};

export function createRenderer3D(canvas, THREE, { onContextLost } = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a1e);
  scene.fog = new THREE.Fog(0x0b0a1e, 420, 1150);
  const camera = new THREE.PerspectiveCamera(58, 1, 5, 2200);
  const camState = createCameraState();

  scene.add(new THREE.HemisphereLight(0x8fa4d8, 0x30283a, 1.25));
  const moon = new THREE.DirectionalLight(0xaec2ff, 0.95);
  moon.position.set(-300, 500, 200);
  scene.add(moon);
  const lantern = new THREE.PointLight(0xffd9a0, 1.6, 420, 1.6);
  scene.add(lantern);

  let world = null;
  let built = null; // group holding everything made by setWorld
  let chariot = null;
  let protectRing = null;
  let bodyMat = null;
  const guards = [];
  const cps = [];
  let lastNow = 0;
  let lost = false;

  const onLost = (e) => { e.preventDefault(); lost = true; onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', onLost);

  function mat(color, extra = {}) { return new THREE.MeshLambertMaterial({ color, ...extra }); }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }

  function label(text, bg) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff4de'; g.stroke();
    g.fillStyle = '#140b07'; g.font = 'bold 80px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeChariot() {
    const g = new THREE.Group();
    bodyMat = mat(0xffc457, { emissive: 0x000000 });
    const dark = mat(0x3b2a1b);
    const body = box(40, 14, 28, bodyMat); body.position.set(-4, 16, 0); g.add(body);
    const rail = box(4, 16, 28, bodyMat); rail.position.set(14, 28, 0); g.add(rail);
    const pole = box(46, 3, 4, dark); pole.position.set(32, 14, 0); g.add(pole);
    for (const z of [-18, 18]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 4, 12), dark);
      w.rotation.x = Math.PI / 2; w.position.set(-4, 14, z); g.add(w);
    }
    const horse = mat(0x6a4630);
    for (const z of [-9, 9]) {
      const hb = box(30, 16, 10, horse); hb.position.set(58, 22, z); g.add(hb);
      const hh = box(12, 12, 8, horse); hh.position.set(78, 32, z); g.add(hh);
    }
    protectRing = new THREE.Mesh(new THREE.TorusGeometry(46, 2.2, 6, 28), new THREE.MeshBasicMaterial({ color: 0xfff4de }));
    protectRing.rotation.x = Math.PI / 2; protectRing.position.set(24, 8, 0); protectRing.visible = false; g.add(protectRing);
    return g;
  }

  function makeGuard(radius) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.8, 34, 8), mat(0xb02a2a));
    body.position.y = 17; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.45, 8, 6), mat(0xe8c9a0));
    head.position.y = 42; g.add(head);
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 5), mat(0xd8c39a));
    spear.rotation.z = Math.PI / 2; spear.position.set(radius * 0.9 + 18, 30, radius * 0.5); g.add(spear);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 5), mat(0xf4f4f4));
    tip.rotation.z = -Math.PI / 2; tip.position.set(radius * 0.9 + 58, 30, radius * 0.5); g.add(tip);
    const lamp = box(7, 9, 7, new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    lamp.position.set(-radius * 0.2, 36, -radius * 0.9); g.add(lamp);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.45, radius * 1.75, 24), new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 1.2; g.add(ring);
    const wedge = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.8, radius * 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xff6a5a, transparent: true, opacity: 0.85 }));
    wedge.rotation.set(Math.PI / 2, 0, -Math.PI / 2); wedge.position.set(radius * 2.4, 1.5, 0); g.add(wedge);
    return g;
  }

  function makeCheckpoint(p, i) {
    const g = new THREE.Group();
    const pillarMat = mat(0xffffff);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(p.radius * 0.28, p.radius * 0.36, 1, 10), pillarMat);
    g.add(pillar);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.radius * 0.85, 3, 6, 28), new THREE.MeshBasicMaterial({ color: 0xfff4de }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 4; g.add(ring);
    const sprites = { num: label(String(i + 1), '#19c3d6'), later: label(String(i + 1), '#d8c39a'), done: label('✓', '#3ec45a') };
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprites.num, transparent: true }));
    sprite.scale.set(46, 46, 1); g.add(sprite);
    g.position.set(p.x, 0, p.y);
    return { g, pillar, pillarMat, ring, sprite, sprites, state: '' };
  }

  function applyState(c, state, p) {
    const s = CP[state];
    c.state = state;
    c.pillar.scale.y = s.height; c.pillar.position.y = s.height / 2;
    c.pillarMat.color.setHex(s.color); c.pillarMat.wireframe = s.wire;
    c.ring.visible = state === 'next';
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
      if (m) { m.map?.dispose?.(); m.dispose?.(); }
    });
    built = null; guards.length = 0; cps.length = 0;
  }

  return {
    resize(w, h, dpr = 1) {
      gl.setPixelRatio(Math.min(dpr, 2));
      gl.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 70 : 58; // a little wider in portrait so the sides stay visible
      if (h > w) camera.setViewOffset(w, h, 0, Math.round(h * 0.14), w, h); // portrait: lift the chariot above the touch pad and captions
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    setWorld(w) {
      clearBuilt();
      world = w;
      built = new THREE.Group();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.width, w.height), mat(0x6e5f45));
      ground.rotation.x = -Math.PI / 2; ground.position.set(w.width / 2, 0, w.height / 2); built.add(ground);
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(w.width * 4, w.height * 4), mat(0x0f0d1c));
      outer.rotation.x = -Math.PI / 2; outer.position.set(w.width / 2, -1, w.height / 2); built.add(outer);

      const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff), Math.max(1, w.walls.length));
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      w.walls.forEach((wl, i) => {
        const h = 60 + ((i * 37) % 5) * 12;
        dummy.position.set(wl.x + wl.w / 2, h / 2, wl.y + wl.h / 2);
        dummy.scale.set(wl.w, h, wl.h);
        dummy.updateMatrix();
        walls.setMatrixAt(i, dummy.matrix);
        walls.setColorAt(i, col.setHex(WALL_COLORS[i % WALL_COLORS.length]));
      });
      walls.instanceMatrix.needsUpdate = true;
      if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
      built.add(walls);

      chariot = makeChariot(); built.add(chariot);
      w.checkpoints.forEach((p, i) => { const c = makeCheckpoint(p, i); cps.push(c); built.add(c.g); applyState(c, 'later', p); });
      scene.add(built);
    },
    render(frame) {
      if (!world || lost) return;
      const now = performance.now() / 1000;
      const dt = lastNow ? now - lastNow : 0;
      lastNow = now;

      while (guards.length < frame.guards.length) { const g = makeGuard(frame.guards[guards.length].radius); guards.push(g); built.add(g); }
      frame.guards.forEach((gd, i) => { guards[i].position.set(gd.x, 0, gd.y); guards[i].rotation.y = -gd.angle; });

      const c = frame.chariot;
      chariot.position.set(c.x, 0, c.y);
      chariot.rotation.y = -c.angle;
      protectRing.visible = c.invulnerable;
      const flash = frame.reducedMotion ? 0 : frame.effects.flash;
      bodyMat.emissive.setRGB(flash * 0.9, flash * 0.1, flash * 0.1);
      lantern.position.set(c.x + Math.cos(c.angle) * 60, 70, c.y + Math.sin(c.angle) * 60);

      frame.checkpoints.forEach((p, i) => {
        const cp = cps[i];
        if (cp.state !== p.state) applyState(cp, p.state, p);
        if (p.state === 'next' && !frame.reducedMotion) {
          const pulse = 1 + Math.sin(frame.time * 4) * 0.06;
          cp.ring.scale.set(pulse, pulse, 1);
        } else cp.ring.scale.set(1, 1, 1);
      });

      const view = followCamera(camState, c, dt, frame.reducedMotion);
      const sh = frame.reducedMotion ? 0 : frame.effects.shake * 6;
      camera.position.set(view.position.x + (Math.random() - 0.5) * sh, view.position.y + (Math.random() - 0.5) * sh, view.position.z);
      camera.lookAt(view.target.x, view.target.y, view.target.z);
      gl.render(scene, camera);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      clearBuilt();
      gl.dispose();
    },
  };
}
