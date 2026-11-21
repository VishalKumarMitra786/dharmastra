// Loads assets/characters/hero.glb and dresses it: cel shading with a two-band ramp, a skinned ink outline, a painted face.
import * as THREE from '../../src/vendor/three-lite.js';
import { BONES, REST } from './anim.js';

// Two flat bands with a narrow soft edge between them. Read by MeshToonMaterial at dot(N, L) * 0.5 + 0.5.
export function celRamp(shade = 0.6) {
  const n = 64; const d = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; const k = Math.min(1, Math.max(0, (x - 0.5) / 0.07)); d[i] = Math.round(255 * (shade + (1 - shade) * k)); }
  const t = new THREE.DataTexture(d, n, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

// 4 x 2 palette. Columns: skin, top, dhoti, hair. Row 0 main colour, row 1 trim. The mesh's uv picks a texel, Nearest filtering keeps the edges crisp.
export const LOOKS = [
  { name: 'saffron', skin: '#c98d62', top: '#e8792a', topTrim: '#f6d27a', dhoti: '#f1e8d2', dhotiTrim: '#b3342b', hair: '#1c1311', iris: '#4a2f1d' },
  { name: 'teal', skin: '#a8714a', top: '#1f9c8f', topTrim: '#f0c04a', dhoti: '#e9dfc6', dhotiTrim: '#2a5aa0', hair: '#14100f', iris: '#3b2a1c' },
  { name: 'indigo', skin: '#dba67c', top: '#4a54b8', topTrim: '#f2e2a0', dhoti: '#efe6d8', dhotiTrim: '#d08a2a', hair: '#3a2418', iris: '#2c5a46' },
];
export function paletteTexture(look) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 2; const g = c.getContext('2d');
  [[look.skin, look.top, look.dhoti, look.hair], [look.skin, look.topTrim, look.dhotiTrim, look.hair]].forEach((row, y) => row.forEach((col, x) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
}

// Painted face on the patch that the build script drapes over the head. u spans x -0.74..0.74 dm, v spans y 6.12..7.95 dm of the original mesh.
const FACE = { w: 256, h: 320, x0: -0.74, x1: 0.74, y0: 6.12, y1: 7.95 };
const fx = (x) => ((x - FACE.x0) / (FACE.x1 - FACE.x0)) * FACE.w; const fy = (y) => (1 - (y - FACE.y0) / (FACE.y1 - FACE.y0)) * FACE.h;
export function createFace(look) {
  const canvas = document.createElement('canvas'); canvas.width = FACE.w; canvas.height = FACE.h; const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const ink = '#2a1612'; const unit = FACE.w / (FACE.x1 - FACE.x0);
  function draw(blink = 0) {
    g.clearRect(0, 0, FACE.w, FACE.h);
    for (const side of [-1, 1]) { // blush
      const gr = g.createRadialGradient(fx(side * 0.42), fy(6.7), 0, fx(side * 0.42), fy(6.7), 0.2 * unit); gr.addColorStop(0, 'rgba(226,100,90,0.38)'); gr.addColorStop(1, 'rgba(226,100,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, FACE.w, FACE.h);
    }
    for (const side of [-1, 1]) {
      const cx = fx(side * 0.31); const cy = fy(7.27); const rx = 0.205 * unit; const ry = (0.235 * (1 - blink * 0.92)) * unit; // eyes: tall ovals, a little larger than life
      if (blink < 0.8) {
        g.fillStyle = '#fbf6ee'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.clip();
        g.fillStyle = look.iris; g.beginPath(); g.ellipse(cx, cy + ry * 0.12, rx * 0.72, ry * 0.88, 0, 0, TAU); g.fill();
        g.fillStyle = '#120a0a'; g.beginPath(); g.ellipse(cx, cy + ry * 0.16, rx * 0.34, ry * 0.46, 0, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - rx * 0.26, cy - ry * 0.28, rx * 0.2, 0, TAU); g.fill(); g.restore();
      }
      g.strokeStyle = ink; g.lineCap = 'round'; g.lineWidth = 5; g.beginPath(); // upper lash line, thicker at the outer corner
      g.ellipse(cx, cy + (blink > 0.8 ? ry * 0.7 : 0), rx * 1.02, Math.max(2, ry * 1.02), 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
      g.lineWidth = 3.4; g.beginPath(); g.moveTo(cx - side * rx * 1.18, cy - ry * 1.14); g.quadraticCurveTo(cx, cy - ry * 1.5, cx + side * rx * 1.15, cy - ry * 1.22); g.stroke(); // brow
    }
    g.strokeStyle = '#8a3a34'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(fx(-0.17), fy(6.5)); g.quadraticCurveTo(fx(0), fy(6.4), fx(0.17), fy(6.5)); g.stroke(); // small mouth
    g.strokeStyle = 'rgba(120,60,40,0.5)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(fx(-0.05), fy(6.9)); g.quadraticCurveTo(fx(0), fy(6.84), fx(0.05), fy(6.9)); g.stroke(); // nose mark
    tex.needsUpdate = true;
  }
  draw(0); return { tex, draw };
}
const TAU = Math.PI * 2;

// Skinned ink outline: the back faces pushed out along the (smoothed) normals, after skinning. Thickness is in model metres and is updated per frame.
export function outlineMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0x24141e, side: THREE.BackSide });
  m.userData.thick = { value: 0.012 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uThick = m.userData.thick;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uThick;\nattribute float _outline;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += normalize( objectNormal ) * uThick * _outline;');
  };
  m.customProgramCacheKey = () => 'hero-outline';
  return m;
}

export async function loadHeroTemplate(url) {
  const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().load(url, res, undefined, rej));
  return gltf.scene;
}

// Everything shared between heroes: ramp, outline, one palette material per look, one face material per look.
export function createKit() {
  const ramp = celRamp(); const outline = outlineMaterial();
  const looks = LOOKS.map((look) => {
    const body = new THREE.MeshToonMaterial({ map: paletteTexture(look), gradientMap: ramp, side: THREE.DoubleSide });
    const face = createFace(look); const faceMat = new THREE.MeshBasicMaterial({ map: face.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return { body, face, faceMat };
  });
  return { ramp, outline, looks };
}

// A hero instance: its own bones (cloneSkinned), shared geometry and materials. Returns { object, bones, face, blink(k) }.
export function makeHero(template, kit, lookIndex = 0) {
  const object = THREE.cloneSkinned(template); const look = kit.looks[lookIndex % kit.looks.length];
  const bones = {}; for (const n of BONES) bones[n] = object.getObjectByName(n);
  object.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.frustumCulled = false;
    if (o.name === 'body') o.material = look.body; else if (o.name === 'outline') o.material = kit.outline; else if (o.name === 'face') { o.material = look.faceMat; o.renderOrder = 2; }
  });
  return { object, bones, look, restPose: REST };
}
export function applyPose(hero, p) { for (const n of BONES) { const r = p.rot[n]; hero.bones[n].rotation.set(r[0], r[1], r[2]); } hero.bones.hips_root.position.y = hero.bones.hips_root.userData.y0 + p.lift; hero.bones.hips_root.position.x = hero.bones.hips_root.userData.x0 + p.sway; }
export function rememberRest(hero) { const b = hero.bones.hips_root; b.userData.y0 = b.position.y; b.userData.x0 = b.position.x; }
