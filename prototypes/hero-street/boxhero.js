// A copy of the game's current hero ("makePerson" in src/renderer3d.js, Hastinapur hero, short hair, with scarf and bag; lantern, ring and staff left out)
// built from the same primitives, sizes, toon ramp and inverted-hull outline, so the comparison is like for like. Rotated to face +z like the new hero.
import * as THREE from '../../src/vendor/three-lite.js';

const ramp = (() => { const d = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat); d.minFilter = d.magFilter = THREE.NearestFilter; d.needsUpdate = true; return d; })();
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a0f1f, side: THREE.BackSide });
const mats = new Map(); const geos = new Map();
const toon = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: ramp })); return mats.get(c); };
const geo = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
const box = (w, h, d, m) => new THREE.Mesh(geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), m);
const cyl = (rt, rb, h, seg, m) => new THREE.Mesh(geo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m);
const ball = (r, m, sx = 1, sy = 1, sz = 1) => { const s = new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), m); s.scale.set(sx, sy, sz); return s; };

let eyes = null;
function eyeTex() {
  if (eyes) return eyes;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (const cx of [34, 94]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, 66, 17, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2fbf8a'; g.beginPath(); g.ellipse(cx, 70, 12, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#140a14'; g.beginPath(); g.ellipse(cx, 72, 6, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 5, 60, 4.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#140a14'; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, 66, 17, 24, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 17, 30); g.quadraticCurveTo(cx, 22, cx + 17, 30); g.stroke();
  }
  eyes = new THREE.CanvasTexture(c); eyes.colorSpace = THREE.SRGBColorSpace; return eyes;
}

export function makeBoxHero() {
  const skin = toon(0xc68a5a); const top = toon(0xff8a1f); const bot = toon(0xf3ead6); const dark = toon(0x2a1a10); const hairMat = toon(0x1b1210);
  const g = new THREE.Group(); const legs = []; const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 30, side * 4);
    const leg = cyl(2.6, 2.1, 28, 6, skin); leg.position.y = -14; pivot.add(leg);
    const foot = box(7, 3, 4.6, dark); foot.position.set(1.8, -29, 0); pivot.add(foot); g.add(pivot); legs.push(pivot);
  }
  const upper = new THREE.Group(); g.add(upper);
  const sk = cyl(6.2, 8.6, 17, 8, bot); sk.position.y = 24; upper.add(sk);
  const torso = cyl(6.6, 7.6, 19, 8, top); torso.position.y = 39; upper.add(torso);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(0, 46, side * 9.4);
    const arm = cyl(2.3, 1.9, 19, 6, skin); arm.position.y = -9.5; pivot.add(arm); const hand = ball(2.4, skin); hand.position.y = -20; pivot.add(hand); upper.add(pivot); arms.push(pivot);
  }
  const neck = cyl(2.2, 2.4, 3, 6, skin); neck.position.y = 49.5; upper.add(neck);
  const head = ball(7.4, skin); head.position.y = 57.5; upper.add(head);
  const face = new THREE.Mesh(geo('face', () => new THREE.PlaneGeometry(11.5, 11.5)), new THREE.MeshBasicMaterial({ map: eyeTex(), transparent: true }));
  face.rotation.y = Math.PI / 2; face.position.set(7.35, 56.5, 0); face.userData.noOutline = true; upper.add(face);
  const hr = ball(7.9, hairMat, 1, 0.82, 1.03); hr.position.set(-0.8, 60.5, 0); upper.add(hr);
  for (const [a, len] of [[-0.9, 9], [-0.35, 11], [0.35, 11], [0.9, 9]]) { const sp = new THREE.Mesh(geo(`hs${len}`, () => new THREE.ConeGeometry(2.6, len, 5)), hairMat); sp.position.set(-6, 60, a * 8); sp.rotation.z = Math.PI / 2 + 0.25; sp.rotation.x = a * 0.5; upper.add(sp); }
  const bang = ball(5, hairMat, 0.8, 0.5, 1.5); bang.position.set(4.4, 64.5, 0); upper.add(bang);
  const sc = box(16, 2.4, 5, toon(0xe8432e)); sc.position.set(-10, 47, 0); upper.add(sc); const sc2 = box(5, 6, 5.4, toon(0xe8432e)); sc2.position.set(1, 46, 0); upper.add(sc2);
  const bg = box(7, 9, 4, toon(0x6a4630)); bg.position.set(-1, 33, 9.5); upper.add(bg);
  const hulls = []; g.traverse((m) => { if (m.isMesh && m.material?.isMeshToonMaterial) hulls.push(m); });
  hulls.forEach((m) => { const h = new THREE.Mesh(m.geometry, outlineMat); h.scale.setScalar(1.13); m.add(h); });
  const wrap = new THREE.Group(); g.rotation.y = -Math.PI / 2; wrap.add(g); // the game's hero faces +x, ours faces +z
  g.userData = { legs, arms, upper, phase: 0 };
  return { object: wrap, inner: g };
}
// The game's own walk, from its animate(): distance drives a phase, limbs rotate about z (the hero faces +x).
export function animateBox(h, dist, amp) {
  const u = h.inner.userData; u.phase += dist * 0.085; const s = Math.sin(u.phase) * amp;
  u.legs[0].rotation.z = s * 0.75; u.legs[1].rotation.z = -s * 0.75; u.arms[0].rotation.z = -s * 0.6; u.arms[1].rotation.z = s * 0.6; u.upper.position.y = Math.abs(Math.sin(u.phase)) * 1.4 * amp;
}
