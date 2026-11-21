// Hero spike page: a skinned hero (assets/characters/hero.glb) walking a painted street, with the game's current box hero for comparison.
// URL options: view=game|front|side|back|three  mode=walk|idle  phase=0..1 (freezes the walk at that point of the cycle)  heroes=1|12  compare=0|1  ui=0  perf=1  dpr=1
import * as THREE from '../../src/vendor/three-lite.js';
import { createOrbit, thirdPersonView } from '../../src/camera.js';
import { makePose, pose } from './anim.js';
import { createKit, loadHeroTemplate, makeHero, applyPose, rememberRest } from './hero.js';
import { makeBoxHero, animateBox } from './boxhero.js';
import { buildStreet, ringAt, LOOP, HZ } from './street.js';
import { measureHero } from './measure.js';
import { createProbe, formatResult } from './perf.js';

const q = new URLSearchParams(location.search);
const state = { view: q.get('view') || 'game', mode: q.get('mode') || 'walk', heroes: Number(q.get('heroes') || 1), compare: q.get('compare') !== '0', paused: false, phase: q.has('phase') ? Number(q.get('phase')) : null };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduced && !q.has('mode')) state.paused = true;
if (state.phase !== null) state.paused = true;
if (q.get('ui') === '0') document.body.classList.add('clean');

const canvas = document.getElementById('stage'); const hud = document.getElementById('hud'); const out = document.getElementById('out');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); // no tone mapping, no PBR environment: flat, saturated daylight
const PR = Math.min(Number(q.get('dpr')) || devicePixelRatio || 1, 1.5); window.__pr = PR; renderer.setPixelRatio(PR);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(46, 1, 10, 4200);
const street = buildStreet(scene, 16);
const orbit = createOrbit(); const probe = createProbe();
const HERO_H = 64; // model height in game units (the game's people are about 62 to 65)

const template = await loadHeroTemplate('../../assets/characters/hero.glb');
template.updateMatrixWorld(true);
const kit = createKit();
// ---- measure the proportions from the loaded mesh, in the browser, with the same code the Node test runs ----
const body = (() => { let m = null; template.traverse((o) => { if (o.isSkinnedMesh && o.name === 'body') m = o; }); return m; })();
const flat = (a, n) => { const o = new Float32Array(a.count * n); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) o[i * n + k] = a.getComponent(i, k); return o; };
const bn = body.skeleton.bones.map((b) => b.name); const v3 = new THREE.Vector3();
const measured = measureHero({ pos: flat(body.geometry.attributes.position, 3), uv: flat(body.geometry.attributes.uv, 2), joints: flat(body.geometry.attributes.skinIndex, 4), weights: flat(body.geometry.attributes.skinWeight, 4), boneNames: bn, boneWorld: (n) => { template.getObjectByName(n).getWorldPosition(v3); return [v3.x, v3.y, v3.z]; } });
const SCALE = HERO_H / measured.height;

// ---- actors ----
const hero0 = []; // new heroes
function addHero(i) { const h = makeHero(template, kit, i); h.object.scale.setScalar(SCALE); rememberRest(h); h.p = makePose(); h.cycle = i * 0.37; h.s = (i / 12) * LOOP; h.lane = i === 0 ? 0 : (i % 2 ? 26 : -26); h.speed = i === 0 ? 52 : 46 + (i % 5) * 3; h.blinkAt = 2 + i * 0.7; scene.add(h.object); hero0.push(h); return h; }
for (let i = 0; i < 12; i++) addHero(i);
const boxHero = makeBoxHero(); scene.add(boxHero.object);
const poseTmp = makePose(); const walk = { w: state.mode === 'walk' ? 1 : 0 }; const cam = { x: 0, y: 0 }; const o2 = {};
let boxS = 90; const STUDIO = { x: 0, z: -HZ }; const SPACING = 23;

function resize() { const w = innerWidth; const h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 62 : 46; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const AZ = { front: 0, side: Math.PI / 2, back: Math.PI, three: Math.PI / 4 }; if (q.has('az')) AZ.front = Number(q.get('az')) * Math.PI / 180;
let time = 0; let blinkT = 0; let lastNow = performance.now(); let thickDist = 270;

function setHeroPose(h, dt, moving) {
  pose(poseTmp, h.cycle, time + h.cycle * 3.1, walk.w); applyPose(h, poseTmp);
}

function update(dt) {
  if (!state.paused) time += dt;
  const target = state.mode === 'walk' ? 1 : 0; walk.w += (target - walk.w) * (1 - Math.exp(-6 * dt)); if (state.phase !== null) walk.w = target;
  const n = state.heroes; const studio = state.view !== 'game';
  hero0.forEach((h, i) => {
    h.object.visible = i < n; if (i >= n) return;
    if (state.phase !== null && i === 0) h.cycle = state.phase;
    else if (!state.paused) { const adv = h.speed * dt * walk.w; h.s += adv; h.cycle += adv / 56; }
    if (i === 0 && studio) h.object.position.set(STUDIO.x, 0, STUDIO.z); // set below with the pair layout
    else if (n > 1 || !studio || i > 0) { ringAt(h.s, h.lane, o2); h.object.position.set(o2.x, 0, o2.z); h.object.rotation.y = Math.PI / 2 - o2.a; }
    setHeroPose(h, dt);
  });
  const h0 = hero0[0];
  // pair layout for the studio views: the new hero on the left of the screen, the box hero on the right
  const az = AZ[state.view] ?? 0; const rx = Math.cos(az); const rz = -Math.sin(az);
  if (studio) {
    const half = state.compare ? SPACING : 0;
    h0.object.position.set(STUDIO.x - rx * half, 0, STUDIO.z - rz * half); h0.object.rotation.y = 0;
    boxHero.object.position.set(STUDIO.x + rx * half, 0, STUDIO.z + rz * half); boxHero.object.rotation.y = 0;
  } else {
    if (n === 1) { ringAt(h0.s, 0, o2); h0.object.position.set(o2.x, 0, o2.z); h0.object.rotation.y = Math.PI / 2 - o2.a; }
    if (!state.paused) boxS = h0.s + 95; ringAt(boxS, 18, o2); boxHero.object.position.set(o2.x, 0, o2.z); boxHero.object.rotation.y = Math.PI / 2 - o2.a;
  }
  boxHero.object.visible = state.compare && n === 1;
  if (state.phase !== null) { boxHero.inner.userData.phase = state.phase * Math.PI * 2; animateBox(boxHero, 0, walk.w); }
  else if (!state.paused) animateBox(boxHero, 52 * dt * walk.w, walk.w); else animateBox(boxHero, 0, walk.w);
  // blink
  blinkT += dt; const bl = Math.max(0, 1 - Math.abs(((time * 1.0) % 4.2) - 0.1) / 0.1); const blink = state.paused ? 0 : bl;
  kit.looks.forEach((l, k) => { if ((l.last || 0) !== Math.round(blink * 4)) { l.last = Math.round(blink * 4); l.face.draw(blink); } });
  // shadows
  let k = 0; hero0.forEach((h, i) => { if (i < n) street.setShadow(k++, h.object.position.x, h.object.position.z, 38); }); if (boxHero.object.visible) street.setShadow(k++, boxHero.object.position.x, boxHero.object.position.z, 38); street.shadows.count = k;
  // camera
  if (!studio) {
    ringAt(h0.s, 0, o2); cam.x = o2.x; cam.y = o2.z; const dyaw = ((o2.a - orbit.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; orbit.yaw += dyaw * Math.min(1, dt * 3); if (dt > 0.2 || reduced) orbit.yaw = o2.a;
    const v = thirdPersonView(cam, orbit, dt, null, reduced); camera.position.set(v.position.x, v.position.y, v.position.z); camera.lookAt(v.target.x, v.target.y, v.target.z);
    thickDist = Math.hypot(v.position.x - cam.x, v.position.y, v.position.z - cam.y);
  } else {
    const d = Number(q.get('dist')) || (innerWidth < innerHeight ? 150 : 100); const ly = Number(q.get('ly')) || 33; const cx = STUDIO.x; const cz = STUDIO.z;
    const lx = q.has('dist') ? -rx * SPACING * (state.compare ? 1 : 0) : 0; const lz = q.has('dist') ? -rz * SPACING * (state.compare ? 1 : 0) : 0; // close-ups aim at the new hero
    camera.position.set(cx + lx + Math.sin(az) * d, ly + 3, cz + lz + Math.cos(az) * d); camera.lookAt(cx + lx, ly, cz + lz); thickDist = d;
  }
  street.sky.position.copy(camera.position);
  kit.outline.userData.thick.value = Math.min(2.4, Math.max(0.3, thickDist * 0.0042)) / SCALE;
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now; const t0 = performance.now();
  update(dt); renderer.render(scene, camera); const t1 = performance.now();
  probe.frame(now, t1 - t0, renderer.info.render);
  const r = renderer.info.render; window.__info = { calls: r.calls, triangles: r.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  hud.textContent = `draw calls ${r.calls}  triangles ${r.triangles}  pixel ratio ${PR}\nhero ${measured.height.toFixed(3)} m, ${measured.headsTall.toFixed(2)} heads tall, legs ${(measured.legRatio * 100).toFixed(0)}%, shoulders ${measured.shoulderOverHead.toFixed(2)} heads wide`;
  requestAnimationFrame(frame);
}

// ---- controls ----
const group = (sel, attr, fn) => document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { document.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset[attr]); }));
group('[data-view]', 'view', (v) => { state.view = v; }); group('[data-mode]', 'mode', (v) => { state.mode = v; }); group('[data-heroes]', 'heroes', (v) => { state.heroes = Number(v); });
const press = (id, fn) => { const b = document.getElementById(id); b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); fn(on); }); };
press('pause', (on) => { state.paused = on; }); press('compare', (on) => { state.compare = on; });
const sync = () => { const set = (sel, attr, val) => document.querySelectorAll(sel).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val)))); set('[data-view]', 'view', state.view); set('[data-mode]', 'mode', state.mode); set('[data-heroes]', 'heroes', state.heroes); document.getElementById('pause').setAttribute('aria-pressed', String(state.paused)); document.getElementById('compare').setAttribute('aria-pressed', String(state.compare)); }; sync();
function runPerf() {
  out.textContent = 'Measuring for 20 seconds...'; document.getElementById('run').disabled = true;
  probe.start(20, (r) => { window.__perf = r; out.textContent = formatResult(r, `${state.heroes} hero${state.heroes > 1 ? 'es' : ''}${state.compare && state.heroes === 1 ? ' + box hero' : ''}, ${state.view} camera`); document.getElementById('run').disabled = false; });
}
document.getElementById('run').addEventListener('click', runPerf);
window.__hero = { measured, state, scale: SCALE, sceneDraws: street.sceneDraws, runPerf, info: () => window.__info };
requestAnimationFrame(frame); setTimeout(() => { window.__ready = true; if (q.get('perf') === '1') runPerf(); }, 1500);
