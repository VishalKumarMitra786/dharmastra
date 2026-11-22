// Studio: spawn humans in poses against the generated sky light. ?looks=soldier,hero,townsperson&state=idle&view=front&az=0&dist=1.4&h=1
import * as THREE from '../../src/vendor/three-lite.js';
import { createHumanKit } from '../../src/gfx/human/index.js';
import { makeLook, heroLook } from '../../src/gfx/human/looks.js';
import { createSky, SKIES } from '../../src/gfx/sky.js';
const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c'); const gl = new THREE.WebGLRenderer({ canvas, antialias: true }); gl.setPixelRatio(Math.min(2, Number(q.get('dpr') || 1)));
gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = Number(q.get('exp') || 0.5); gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); { const c = SKIES[q.get('sky') || 'hastinapur']; if (q.has('sunaz')) c.azim = Number(q.get('sunaz')); if (q.has('sunel')) c.elev = Number(q.get('sunel')); } const sky = createSky(THREE, gl, q.get('sky') || 'hastinapur'); scene.add(sky.mesh); scene.environment = sky.env; scene.environmentIntensity = sky.cfg.env;
const sun = new THREE.DirectionalLight(sky.cfg.sun[0], sky.cfg.sun[1]); sun.position.copy(sky.sun).multiplyScalar(300); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -80; sc.right = sc.top = 80; sc.far = 800; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x8d7a62, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const kit = await createHumanKit(THREE, { atlas: Number(q.get('atlas') || 512) });
const roles = (q.get('looks') || 'hero').split(','); const humans = []; const state = q.get('state') || 'idle'; const t = Number(q.get('t') || 0.2);
roles.forEach((r, i) => {
  const L = r === 'hero' ? heroLook({ body: q.get('body') || 'm', skin: '#c68a5a', hair: '#1b1210', hairStyle: q.get('hair') || 'short', eyes: '#3a7bd8', outfitColor: '#ff8a1f', accent: '#e8432e' }, q.get('weapon') || 'none') : makeLook(r.split(':')[0], Number(r.split(':')[1] || i + 1));
  const h = kit.spawn(L); h.root.position.set((i - (roles.length - 1) / 2) * 30, 0, 0); scene.add(h.root); humans.push(h);
});
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') || 35), 1, 1, 6000);
const view = q.get('view') || 'front'; const az = (Number(q.get('az') ?? { front: 0, side: 90, back: 180, three: 40 }[view]) || 0) * Math.PI / 180; const dist = Number(q.get('dist') || 150); const hy = Number(q.get('h') || 34);
const cx = Number(q.get('cx') || 0); cam.position.set(cx + Math.sin(az) * dist, hy + Number(q.get('up') || 6), Math.cos(az) * dist); cam.lookAt(cx, hy, 0);
function resize() { gl.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); } addEventListener('resize', resize); resize();
const atk = state === 'attack' ? { kind: q.get('kind') || 'light', progress: Number(q.get('p') || 0.3), hit: Number(q.get('hit') || 0.4) } : undefined;
let time = 0;
function frame() {
  humans.forEach((h, i) => { h.update(1 / 60, { state, stateT: t, speed: Number(q.get('speed') || 0), time, atk, draw: Number(q.get('draw') || 0.8), weapon: q.get('weapon') || undefined, crouch: state === 'crouch', snap: true, windup: 0.9 }); if (q.has('phase')) h.cycle = Number(q.get('phase')) + i * 0.13; });
  gl.render(scene, cam); time += 1 / 60; window.__frames = (window.__frames || 0) + 1;
}
for (let i = 0; i < 4; i++) frame(); window.__ready = true; window.__info = { calls: gl.info.render.calls, tris: gl.info.render.triangles, tiers: humans.map((h) => h.tris) };
if (q.get('loop') === '1') { const loop = () => { frame(); requestAnimationFrame(loop); }; loop(); }
