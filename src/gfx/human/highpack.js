// The High head pack: a full-resolution head from the CC0 MakeHuman base, built in Blender (tools/blender/characters/build_head.py), loaded lazily after the
// first frame. It replaces the 1,500-triangle head of hero.glb for a look: skin with baked pore normals and a cheap subsurface term, eyeballs with an iris and a
// wet cornea, lash and brow cards, teeth. Identity (14 face shapes) is baked into a per-identity geometry at spawn; blink and expressions are 5 morph targets.
// File format: GLB written by Blender plus a compact int16 sparse delta blob for the shape keys (tools/blender/characters/glbpatch.py).
export const DYNAMIC_KEYS = ['blink', 'smile', 'angry', 'worried', 'shout'];
export const EXPRESSIONS = ['neutral', 'smile', 'angry', 'worried', 'shout'];
const REF_SKIN = [0xc4 / 255, 0x8e / 255, 0x63 / 255];                          // the tone the skin albedo was painted in; a look's skin colour divides by this
const IRIS = { dark_brown: '#2b1a0f', brown: '#4a2c16', hazel: '#5a4a22', green_brown: '#3b4a2a', grey: '#5c666c', blue: '#2f5f8f', green: '#2f6a46', amber: '#7a4a14' };
const IRIS_NAMES = Object.keys(IRIS);
const hx = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// Which face shapes a look wears: a primary shape and a small second one, picked by role, sex, age and the look's seed.
export function pickIdentity(L) {
  const f = L.female; const r = ((Math.sin(L.seed * 12.9898) * 43758.5453) % 1 + 1) % 1; const r2 = ((Math.sin(L.seed * 78.233) * 12345.6789) % 1 + 1) % 1;
  const male = ['id_veer', 'id_warrior', 'id_gaunt', 'id_round', 'id_sharp', 'id_youth', 'id_heavy', 'id_hawk']; const fem = ['id_f_soft', 'id_f_strong', 'id_f_round', 'id_f_sharp'];
  let key;
  if (L.role === 'hero') key = f ? 'id_f_strong' : 'id_veer';
  else if (L.role === 'elder' || L.stoop > 0.1) key = f ? 'id_f_elder' : 'id_elder';
  else if (L.role === 'soldier' || L.role === 'boss') key = r < 0.5 ? 'id_warrior' : 'id_heavy';
  else if (L.role === 'raider') key = r < 0.5 ? 'id_hawk' : 'id_gaunt';
  else key = (f ? fem : male)[Math.floor(r * (f ? fem : male).length) % (f ? fem : male).length];
  const second = (f ? fem : male)[Math.floor(r2 * (f ? fem : male).length) % (f ? fem : male).length];
  const w2 = [0, 0.3, 0.6][Math.floor(((r * 7.3) % 1) * 3)];
  return second === key || w2 === 0 ? [[key, 1]] : [[key, 1], [second, w2]];
}
export function irisFor(hex) { const c = hx(hex); let best = 0; let bd = 9; IRIS_NAMES.forEach((n, i) => { const k = hx(IRIS[n]); const d = (k[0] - c[0]) ** 2 + (k[1] - c[1]) ** 2 + (k[2] - c[2]) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }

function recomputeNormals(pos, idx, out) {
  out.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3; const b = idx[t + 1] * 3; const c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2]; const vx = pos[c] - pos[a]; const vy = pos[c + 1] - pos[a + 1]; const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { out[i] += nx; out[i + 1] += ny; out[i + 2] += nz; }
  }
  for (let i = 0; i < out.length; i += 3) { const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1; out[i] /= l; out[i + 1] /= l; out[i + 2] /= l; }
}

export async function loadHighPack(THREE, { parse, base, size = 1024, anisotropy = 4 }) {
  const buf = await (await fetch(base + 'head-high.glb')).arrayBuffer(); const { json, acc, bin } = parse(buf);
  const morphView = json.bufferViews[json.asset.extras.morphView]; const mv = morphView.byteOffset;
  const jointNames = json.skins[0].joints.map((j) => json.nodes[j].name);
  const meshes = {};
  for (const m of json.meshes) {
    const p = m.primitives[0]; const A = p.attributes; const nv = json.accessors[A.POSITION].count;
    const mesh = { name: m.name, nv, pos: acc(A.POSITION, true), nor: acc(A.NORMAL, true), uv: A.TEXCOORD_0 !== undefined ? acc(A.TEXCOORD_0, true) : null, col: A.COLOR_0 !== undefined ? acc(A.COLOR_0, true) : null, colN: A.COLOR_0 !== undefined ? 4 : 0,
      jnt: acc(A.JOINTS_0), wgt: acc(A.WEIGHTS_0, true), idx: acc(p.indices), morphs: new Map() };
    for (const e of m.extras?.morphs || []) { // sparse int8 deltas: indices (u16), padding to 4, then 3 x int8 per entry (scaled per key)
      const io = mv + e.offset; const idx = new Uint16Array(e.count); for (let i = 0; i < e.count; i++) idx[i] = bin.getUint16(io + i * 2, true);
      const dOff = io + ((e.count * 2 + 3) & ~3); const d = new Float32Array(e.count * 3); for (let i = 0; i < e.count * 3; i++) d[i] = bin.getInt8(dOff + i) * e.scale;
      mesh.morphs.set(e.name, { idx, d });
    }
    meshes[m.name] = mesh;
  }
  // ---- textures (lazy: the pack is already after the first frame) ----
  const tload = async (file, srgb) => { const blob = await (await fetch(base + file)).blob(); const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); const t = new THREE.Texture(bmp); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = anisotropy; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const [albedo, normal, orm, eye, eyeOrm, cards] = await Promise.all([tload(`skin_albedo_${size}.webp`, true), tload(`skin_normal_${size}.webp`, false), tload(`skin_orm_${size}.webp`, false), tload('eye_atlas.webp', true), tload('eye_orm.webp', false), tload('cards.webp', true)]);
  eye.wrapS = THREE.ClampToEdgeWrapping; cards.wrapS = cards.wrapT = THREE.ClampToEdgeWrapping;
  return { json, meshes, jointNames, tex: { albedo, normal, orm, eye, eyeOrm, cards }, size, base };
}

// Materials: one shared skin program for all looks (colour, hair-root and stubble strengths are uniforms per material).
export function createHeadMaterials(THREE, pack) {
  const skinCache = new Map(); const eyeCache = new Map(); let cardMat = null; let mouthMat = null; const cardCache = new Map();
  function skinMaterial(L) {
    const key = [L.skin, L.hair.color, L.beard, L.hair.style].join('|'); let m = skinCache.get(key); if (m) return m;
    const sk = hx(L.skin); const col = [0, 1, 2].map((i) => lin(sk[i]) / lin(REF_SKIN[i]));
    m = new THREE.MeshStandardMaterial({ map: pack.tex.albedo, normalMap: pack.tex.normal, roughnessMap: pack.tex.orm, aoMap: pack.tex.orm, roughness: 1, metalness: 0, aoMapIntensity: 0.8, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 1 });
    m.color.setRGB(col[0], col[1], col[2]); const hair = hx(L.hair.color); const hairLin = [lin(hair[0]), lin(hair[1]), lin(hair[2])];
    const beard = L.beard === 'stubble' ? 1.0 : L.beard === 'none' || !L.beard ? 0.0 : 0.5; const scalp = hairNames(L).some((n) => !/beard|moustache|goatee/.test(n)) ? 1.0 : 0.0;
    m.onBeforeCompile = (sh) => {
      m.userData.shader = sh; sh.uniforms.uSunDirV = { value: new THREE.Vector3(0, 1, 0) }; sh.uniforms.uSunCol = { value: new THREE.Vector3(0, 0, 0) }; sh.uniforms.uHair = { value: new THREE.Vector3(...hairLin) }; sh.uniforms.uBeard = { value: beard }; sh.uniforms.uScalp = { value: scalp };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 vdata;\nvarying vec3 vVd;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vVd = vdata;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vVd;\nuniform vec3 uHair; uniform float uBeard; uniform float uScalp; uniform vec3 uSunDirV; uniform vec3 uSunCol;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix( 0.6, 1.0, vVd.x );')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { float hairMask = clamp( texelRoughness.b * uBeard + smoothstep( 0.25, 0.95, vVd.z ) * uScalp, 0.0, 1.0 );
          diffuseColor.rgb = mix( diffuseColor.rgb, uHair * 0.5, hairMask * 0.97 ); roughnessFactor = mix( roughnessFactor, 0.8, hairMask ); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 2.0 );
          totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.30, 0.16 ) * ( 0.025 + 0.16 * rim + 0.35 * vVd.y );
          float ndl = dot( normal, uSunDirV ); float wrap = saturate( ( ndl + 0.5 ) / 1.5 );          // light that bends around the terminator: red, because it travelled through flesh
          totalEmissiveRadiance += uSunCol * diffuseColor.rgb * RECIPROCAL_PI * max( 0.0, wrap * wrap - saturate( ndl ) ) * vec3( 1.0, 0.38, 0.22 ) * 0.8; }`);
    };
    m.customProgramCacheKey = () => 'head-skin'; skinCache.set(key, m); return m;
  }
  function eyeMaterial(L) {
    const cell = irisFor(L.eye); let m = eyeCache.get(cell); if (m) return m;
    const t = pack.tex.eye.clone(); t.repeat.set(1 / 8, 1); t.offset.set(cell / 8, 0); t.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({ map: t, roughnessMap: pack.tex.eyeOrm, aoMap: pack.tex.eyeOrm, roughness: 1, metalness: 0, envMapIntensity: 1.6 }); eyeCache.set(cell, m); return m;
  }
  function cardMaterial(L) {
    const key = L.hair.color; let m = cardCache.get(key); if (m) return m;
    m = new THREE.MeshStandardMaterial({ map: pack.tex.cards, color: new THREE.Color(L.hair.color), roughness: 0.55, metalness: 0, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, envMapIntensity: 0.8 });
    m.color.multiplyScalar(1.0); cardCache.set(key, m); return m;
  }
  function mouthMaterial() { return (mouthMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, envMapIntensity: 1 })); }
  const _d = new THREE.Vector3(); const _t = new THREE.Vector3(); let sun = null; let sunScene = null;
  // called by a head mesh's onBeforeRender: finds the scene's first directional light once and passes its view-space direction and colour to the skin shader
  function feedSun(material, scene, camera) {
    const sh = material.userData.shader; if (!sh) return;
    if (sunScene !== scene) { sunScene = scene; sun = null; scene.traverse((o) => { if (!sun && o.isDirectionalLight) sun = o; }); }
    if (!sun) return; sun.getWorldPosition(_d); sun.target.getWorldPosition(_t); _d.sub(_t).normalize().transformDirection(camera.matrixWorldInverse);
    sh.uniforms.uSunDirV.value.copy(_d); sh.uniforms.uSunCol.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  }
  return { feedSun, skinMaterial, eyeMaterial, cardMaterial, mouthMaterial, dispose() { for (const m of skinCache.values()) m.dispose(); for (const m of eyeCache.values()) m.dispose(); for (const m of cardCache.values()) m.dispose(); mouthMat?.dispose(); } };
}

// Per-look geometry: identity baked into the vertices, expression keys kept as morph targets. boneIndex: name -> index in the human's skeleton.
export function buildHeadGeometry(THREE, pack, L, boneIndex) {
  const ids = pickIdentity(L); const out = [];
  const remap = pack.jointNames.map((n) => boneIndex[n] ?? boneIndex.head);
  for (const name of ['skin', 'eyes', 'cards', 'mouth']) {
    const m = pack.meshes[name]; if (!m) continue;
    const pos = Float32Array.from(m.pos);
    for (const [k, w] of ids) { const e = m.morphs.get(k); if (!e) continue; for (let i = 0; i < e.idx.length; i++) { const v = e.idx[i] * 3; pos[v] += e.d[i * 3] * w; pos[v + 1] += e.d[i * 3 + 1] * w; pos[v + 2] += e.d[i * 3 + 2] * w; } }
    const idx = Uint16Array.from(m.idx); const nor = name === 'skin' ? new Float32Array(m.nv * 3) : Float32Array.from(m.nor);
    if (name === 'skin') { // averaged normals per position (UV seams split vertices, so weld by quantised position first)
      const acc = new Map(); const tmp = new Float32Array(m.nv * 3); recomputeNormals(pos, idx, tmp);
      const keyOf = (i) => `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
      for (let i = 0; i < m.nv; i++) { const k = keyOf(i); const a = acc.get(k) || [0, 0, 0]; a[0] += tmp[i * 3]; a[1] += tmp[i * 3 + 1]; a[2] += tmp[i * 3 + 2]; acc.set(k, a); }
      for (let i = 0; i < m.nv; i++) { const a = acc.get(keyOf(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; nor[i * 3] = a[0] / l; nor[i * 3 + 1] = a[1] / l; nor[i * 3 + 2] = a[2] / l; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
    if (name === 'skin' && m.col) { const vd = new Float32Array(m.nv * 3); for (let i = 0; i < m.nv; i++) { vd[i * 3] = m.col[i * 4]; vd[i * 3 + 1] = m.col[i * 4 + 1]; vd[i * 3 + 2] = m.col[i * 4 + 2]; } g.setAttribute('vdata', new THREE.BufferAttribute(vd, 3)); }
    if (name === 'mouth' && m.col) { const c = new Float32Array(m.nv * 3); for (let i = 0; i < m.nv; i++) { c[i * 3] = m.col[i * 4]; c[i * 3 + 1] = m.col[i * 4 + 1]; c[i * 3 + 2] = m.col[i * 4 + 2]; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const jn = new Uint16Array(m.nv * 4); for (let i = 0; i < m.nv * 4; i++) jn[i] = remap[m.jnt[i]]; g.setAttribute('skinIndex', new THREE.BufferAttribute(jn, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(m.wgt), 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const names = []; const targets = [];
    for (const k of DYNAMIC_KEYS) { const e = m.morphs.get(k) || (k === 'shout' && name === 'mouth' ? m.morphs.get('jaw') : null); if (!e) continue; const d = new Float32Array(m.nv * 3); for (let i = 0; i < e.idx.length; i++) { const v = e.idx[i] * 3; d[v] = e.d[i * 3]; d[v + 1] = e.d[i * 3 + 1]; d[v + 2] = e.d[i * 3 + 2]; } targets.push(new THREE.BufferAttribute(d, 3)); names.push(k); }
    if (targets.length) { g.morphAttributes.position = targets; g.morphTargetsRelative = true; }
    g.boundingSphere = { center: new THREE.Vector3(0, 1.55, 0.06), radius: 0.7, copy() { return this; } };
    out.push({ name, geo: g, keys: names, tris: idx.length / 3 });
  }
  return out;
}

// Face animation state for one human: blink timer, expression blend, drives morph influences on every head mesh.
export function createFace(meshes, seed) {
  const cur = { blink: 0, smile: 0, angry: 0, worried: 0, shout: 0 }; const want = { smile: 0, angry: 0, worried: 0, shout: 0 };
  let t = 0; let blinkAt = 1.5 + (seed % 5) * 0.7; let blinkT = -1; let override = null;
  const api = {
    set(name, w = 1) { override = name === 'neutral' ? { name: 'neutral', w: 0 } : { name, w }; },
    clear() { override = null; },
    update(dt, { state = 'idle', reduced = false, expression } = {}) {
      t += dt; for (const k of Object.keys(want)) want[k] = 0;
      const ex = expression || override?.name; const w = expression ? 1 : override?.w ?? 1;
      if (ex && want[ex] !== undefined) want[ex] = w;
      else if (state === 'attack' || state === 'strike') want.angry = 0.55; else if (state === 'hurt' || state === 'down') { want.worried = 0.6; } else if (state === 'parry' || state === 'dodge') want.angry = 0.3;
      const k = 1 - Math.exp(-12 * dt); for (const n of Object.keys(want)) cur[n] += (want[n] - cur[n]) * k;
      if (!reduced) { if (blinkT < 0 && t > blinkAt) blinkT = 0; if (blinkT >= 0) { blinkT += dt; const u = Math.min(1, blinkT / 0.22); cur.blink = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6; if (blinkT > 0.22) { blinkT = -1; cur.blink = 0; t = 0; blinkAt = 2.2 + ((Math.sin(seed + t * 17) + 1) * 2.2); } } }
      else cur.blink = 0;
      const eyesShut = Math.max(cur.blink, state === 'down' ? 0.9 : 0);
      for (const { mesh, keys } of meshes) { const inf = mesh.morphTargetInfluences; if (!inf) continue; keys.forEach((n, i) => { inf[i] = n === 'blink' ? eyesShut : cur[n]; }); }
    },
    get current() { return cur; },
  };
  return api;
}

// ---- hair and beard cards (assets/characters/high/hair.glb): one mesh per style, merged per look into one draw call ----
export const HAIR_STYLES = ['crop', 'short', 'long', 'bun', 'topknot', 'braid'];
export const BEARD_STYLES = { moustache: 'moustache', goatee: 'goatee', short: 'beard_short', full: 'beard_full' };
export function hairNames(L) {
  const hg = L.headgear?.type || 'none'; const out = [];
  if (hg === 'none' || hg === 'cap') { const st = L.hair.style; if (HAIR_STYLES.includes(st)) out.push('hair_' + st); }
  const b = BEARD_STYLES[L.beard]; if (b) out.push('hair_' + b);
  return out;
}
export async function loadHairPack(THREE, { parse, base, anisotropy = 4 }) {
  const { json, acc } = parse(await (await fetch(base + 'hair.glb')).arrayBuffer()); const jointNames = json.skins[0].joints.map((j) => json.nodes[j].name); const meshes = {}; const box = json.asset.extras.posBox;
  for (const m of json.meshes) { const A = m.primitives[0].attributes; const q = acc(A.POSITION, true); const nv = json.accessors[A.POSITION].count; const pos = new Float32Array(nv * 3); const nor = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { let l = 0; for (let c = 0; c < 3; c++) { pos[i * 3 + c] = box.center[c] + q[i * 3 + c] * box.half[c]; } const dx = pos[i * 3]; const dy = pos[i * 3 + 1] - 1.52; const dz = pos[i * 3 + 2] - 0.04; l = Math.hypot(dx, dy, dz) || 1; nor[i * 3] = dx / l; nor[i * 3 + 1] = dy / l; nor[i * 3 + 2] = dz / l; }
    meshes[m.name] = { name: m.name, nv, pos, nor, uv: acc(A.TEXCOORD_0, true), jnt: acc(A.JOINTS_0), wgt: acc(A.WEIGHTS_0, true), idx: acc(m.primitives[0].indices) }; }
  const blob = await (await fetch(base + 'hair_strands.webp')).blob(); const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  return { meshes, jointNames, tex };
}
// nearest skin vertex for every vertex of a hair mesh (spatial hash of the skin's rest positions): hair follows the face shape and the beard follows the jaw
function nearestSkin(skin, pos) {
  const cell = 0.006; const grid = new Map(); const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < skin.nv; i++) { const k = key(Math.floor(skin.pos[i * 3] / cell), Math.floor(skin.pos[i * 3 + 1] / cell), Math.floor(skin.pos[i * 3 + 2] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const out = new Uint32Array(pos.length / 3);
  for (let v = 0; v < out.length; v++) {
    const x = pos[v * 3]; const y = pos[v * 3 + 1]; const z = pos[v * 3 + 2]; const cx = Math.floor(x / cell); const cy = Math.floor(y / cell); const cz = Math.floor(z / cell); let best = -1; let bd = 1e9;
    for (let r = 1; r <= 4 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) { const l = grid.get(key(cx + a, cy + b, cz + c)); if (!l) continue; for (const i of l) { const d = (skin.pos[i * 3] - x) ** 2 + (skin.pos[i * 3 + 1] - y) ** 2 + (skin.pos[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
    out[v] = best < 0 ? 0 : best;
  }
  return out;
}
export function buildHairGeometry(THREE, pack, hairPack, names, L, boneIndex) {
  const skin = pack.meshes.skin; const ids = pickIdentity(L); const parts = names.map((n) => hairPack.meshes[n]).filter(Boolean); if (!parts.length) return null;
  const nvT = parts.reduce((a, m) => a + m.nv, 0); const pos = new Float32Array(nvT * 3); const nor = new Float32Array(nvT * 3); const uv = new Float32Array(nvT * 2); const jn = new Uint16Array(nvT * 4); const wg = new Float32Array(nvT * 4); const idx = []; const near = new Uint32Array(nvT);
  const remap = hairPack.jointNames.map((n) => boneIndex[n] ?? boneIndex.head); let o = 0; const beardRange = [];
  for (const m of parts) { pos.set(m.pos, o * 3); nor.set(m.nor, o * 3); uv.set(m.uv, o * 2); wg.set(m.wgt, o * 4); for (let i = 0; i < m.nv * 4; i++) jn[o * 4 + i] = remap[m.jnt[i]]; for (const i of m.idx) idx.push(i + o); near.set(nearestSkin(skin, m.pos), o); if (/moustache|goatee|beard/.test(m.name)) beardRange.push([o, m.nv]); o += m.nv; }
  const dense = (k) => { const e = skin.morphs.get(k); if (!e) return null; const d = new Float32Array(skin.nv * 3); for (let i = 0; i < e.idx.length; i++) { d[e.idx[i] * 3] = e.d[i * 3]; d[e.idx[i] * 3 + 1] = e.d[i * 3 + 1]; d[e.idx[i] * 3 + 2] = e.d[i * 3 + 2]; } return d; };
  for (const [k, w] of ids) { const d = dense(k); if (!d) continue; for (let v = 0; v < nvT; v++) { const s = near[v] * 3; pos[v * 3] += d[s] * w; pos[v * 3 + 1] += d[s + 1] * w; pos[v * 3 + 2] += d[s + 2] * w; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(jn, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(wg, 4)); g.setIndex(new THREE.BufferAttribute(Uint16Array.from(idx), 1));
  const keys = []; const targets = [];
  if (beardRange.length) for (const k of ['smile', 'angry', 'worried', 'shout']) { const d = dense(k); if (!d) continue; const t = new Float32Array(nvT * 3); for (const [s0, n] of beardRange) for (let v = s0; v < s0 + n; v++) { const s = near[v] * 3; t[v * 3] = d[s]; t[v * 3 + 1] = d[s + 1]; t[v * 3 + 2] = d[s + 2]; } targets.push(new THREE.BufferAttribute(t, 3)); keys.push(k); }
  if (targets.length) { g.morphAttributes.position = targets; g.morphTargetsRelative = true; }
  g.boundingSphere = { center: new THREE.Vector3(0, 1.45, 0), radius: 0.9, copy() { return this; } };
  return { geo: g, keys, tris: idx.length / 3, chain: names.some((n) => /long|braid/.test(n)) };
}
export function hairMaterial(THREE, hairPack, L, cache) {
  const key = L.hair.color; let m = cache.get(key); if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: hairPack.tex, color: new THREE.Color(L.hair.color), roughness: 0.62, metalness: 0, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, envMapIntensity: 0.55 }); m.color.multiplyScalar(1.3); cache.set(key, m); return m;
}
