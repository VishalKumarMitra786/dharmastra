// The human pipeline: loads hero.glb once, then spawns any number of people from looks. A person is one skinned mesh (one draw call) built from the
// shells and body groups its look selects, plus run-time hair/headgear vertices, painted by its own albedo atlas and lit with the shared normal and
// roughness/metal maps. Cloth tails and long hair ride on short spring bone chains for secondary motion.
import { BONES, REST, pose, makePose, blendPose, copyPose, STRIDE_WALK, STRIDE_RUN } from './anim.js';
import { shellsFor, geometryKey, lookKey } from './looks.js';
import { paintAtlas, paintFace, buildHeightRough, heightToNormal, NORMAL_STRENGTH } from './paint.js';
import { buildHeadgear, buildSashTail, EXTRA_BONES } from './headgear.js';
import { createProps, paintPropsAtlas, PROP_CELL } from './props.js';
import { rng } from './looks.js';

export const UNITS_PER_M = 38.4; // game units per metre: the hero is about 65 units tall
const CT = { 5120: Int8Array, 5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array }; const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const DIV = { 5120: 127, 5121: 255, 5123: 65535 };

// Reads a GLB without a glTF loader (strided and normalised accessors included): the file is ours and tiny, so a 40-line reader is smaller than the loader.
export function parseGlb(buf) {
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jl = dv.getUint32(12, true); const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))); const bin = new DataView(buf, 20 + jl + 8);
  const acc = (i, asFloat = false) => {
    const a = json.accessors[i]; const v = json.bufferViews[a.bufferView]; const C = CT[a.componentType]; const n = NC[a.type]; const stride = v.byteStride || n * C.BYTES_PER_ELEMENT;
    const o = new (asFloat ? Float32Array : C)(a.count * n); const get = { 5120: 'getInt8', 5121: 'getUint8', 5123: 'getUint16', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const x = bin[get](v.byteOffset + (a.byteOffset || 0) + k * stride + c * C.BYTES_PER_ELEMENT, true); o[k * n + c] = asFloat && a.normalized ? Math.max(-1, x / DIV[a.componentType]) : x; }
    return o;
  };
  return { json, acc };
}

export async function createHumanKit(THREE, { url = new URL('../../../assets/characters/hero.glb', import.meta.url).href, atlas = 512, anisotropy = 4, buffer } = {}) {
  const buf = buffer || await (await fetch(url)).arrayBuffer(); const { json, acc } = parseGlb(buf); const ex = json.asset.extras;
  const prim = json.meshes[0].primitives[0]; const nv = json.accessors[prim.attributes.POSITION].count;
  const base = { pos: acc(prim.attributes.POSITION), nor: acc(prim.attributes.NORMAL, true), uv: acc(prim.attributes.TEXCOORD_0, true), paint: acc(prim.attributes._PAINT, true), jnt: acc(prim.attributes.JOINTS_0), wgt: acc(prim.attributes.WEIGHTS_0, true), idx: acc(prim.indices) };
  const skin = json.skins[0]; const names = skin.joints.map((j) => json.nodes[j].name); const parentOf = new Array(names.length).fill(-1);
  skin.joints.forEach((j, i) => (json.nodes[j].children || []).forEach((c) => { const k = skin.joints.indexOf(c); if (k >= 0) parentOf[k] = i; }));
  const local = skin.joints.map((j) => json.nodes[j].translation); const world = names.map((_, i) => { let p = [0, 0, 0]; for (let k = i; k >= 0; k = parentOf[k]) p = p.map((v, c) => v + local[k][c]); return p; });
  const W = (n) => world[names.indexOf(n)];
  const legs = { l1: W('thigh_L')[1] - W('shin_L')[1], l2: W('shin_L')[1] - W('foot_L')[1] + 0.07 };
  const head = ex.head; const hipsY = W('hips_root')[1];
  // ---- shared textures ----
  const lin = (data, S) => { const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = anisotropy; t.flipY = false; t.needsUpdate = true; return t; };
  const hr = buildHeightRough(atlas); const normalTex = lin(heightToNormal(hr.h, atlas, (k) => NORMAL_STRENGTH[k] * (atlas / 512)), atlas); const ormTex = lin(hr.orm, atlas);
  const propsCanvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }); paintPropsAtlas(propsCanvas.getContext('2d'), 256);
  const propsMap = new THREE.CanvasTexture(propsCanvas); propsMap.flipY = false; propsMap.colorSpace = THREE.SRGBColorSpace; propsMap.anisotropy = 2;
  const propsOrm = (() => { const d = new Uint8Array(4 * 4 * 4); const set = (cell, rough, metal) => { const [cx, cy] = PROP_CELL[cell]; const o = (cy * 4 + cx) * 4; d[o] = 255; d[o + 1] = Math.round(rough * 255); d[o + 2] = Math.round(metal * 255); d[o + 3] = 255; }; for (const c of Object.keys(PROP_CELL)) set(c, 0.8, 0); set('steel', 0.34, 1); set('brass', 0.3, 1); set('leather', 0.6, 0); set('wood', 0.7, 0); const t = new THREE.DataTexture(d, 4, 4, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.flipY = false; t.needsUpdate = true; return t; })();
  const propMat = new THREE.MeshStandardMaterial({ map: propsMap, roughnessMap: propsOrm, metalnessMap: propsOrm, roughness: 1, metalness: 1 });
  const props = createProps(THREE);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd49a });

  const geoCache = new Map(); const matCache = new Map(); const atlasCache = new Map();
  const patchMaterial = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 paint;\nvarying float vCav;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vCav = paint.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCav;').replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.55, 1.0, vCav);')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float skinM = ( ( vMapUv.x < 0.5 && vMapUv.y < 0.5 ) || ( vMapUv.x > 0.5 && vMapUv.x < 0.75 && vMapUv.y < 0.25 ) ) ? 1.0 : 0.0;
          float rim = pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 2.0 );
          totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.36, 0.24 ) * skinM * ( 0.035 + 0.2 * rim ); } // cheap subsurface glow: warm light that stays in thin skin`);
    };
    m.customProgramCacheKey = () => 'human-pbr';
  };
  function atlasFor(L) {
    const key = lookKey(L) + '#' + L.seed; let a = atlasCache.get(key); if (a) return a;
    const canvas = Object.assign(document.createElement('canvas'), { width: atlas, height: atlas }); const g = canvas.getContext('2d'); paintAtlas(g, atlas, L, 0);
    const tex = new THREE.CanvasTexture(canvas); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex, normalMap: normalTex, roughnessMap: ormTex, metalnessMap: ormTex, aoMap: ormTex, roughness: 1, metalness: 1, aoMapIntensity: 0.9, normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: 1 });
    patchMaterial(mat); a = { canvas, tex, mat }; atlasCache.set(key, a); return a;
  }
  const extraBoneNames = (list) => list.flatMap((e) => e.names);
  function geometryFor(L) {
    const key = geometryKey(L); let G = geoCache.get(key); if (G) return G;
    const sel = shellsFor(L); const ranges = [];
    for (const g of sel.groups) ranges.push([ex.groups[g].first, ex.groups[g].count]);
    for (const s of sel.shells) if (s !== 'body') ranges.push([ex.shells[s].first, ex.shells[s].count]);
    if (!L.female) { // a male chest: the garment shells over the chest are flattened a little (the base mesh is neutral)
      for (const sname of ['tunic', 'cuirass', 'sash']) { const sv = ex.shells[sname]; if (!sv) continue; for (let i = sv.vertices[0]; i < sv.vertices[0] + sv.vertices[1]; i++) { const y = base.pos[i * 3 + 1]; if (y > 1.05 && y < 1.34 && Math.abs(base.pos[i * 3]) < 0.19 && base.pos[i * 3 + 2] > 0.14) { /* applied to the copy below */ } } }
    }
    const hg = buildHeadgear(head, { hair: L.hair.style, headgear: L.headgear.type, carry: L.carry });
    const parts = [hg]; if (L.sash && L.role !== 'hero' && L.sash === 'tail') parts.push(buildSashTail(W('hips')[1] + 0.02));
    const extra = parts.flatMap((p) => p.extra); const boneNamesAll = [...names, ...extraBoneNames(extra)];
    const extraV = parts.reduce((a, p) => a + p.pos.length / 3, 0); const total = nv + extraV;
    const pos = new Float32Array(total * 3); const nor = new Float32Array(total * 3); const uv = new Float32Array(total * 2); const paint = new Float32Array(total * 2); const jnt = new Uint16Array(total * 4); const wgt = new Float32Array(total * 4);
    pos.set(base.pos); if (!L.female) for (const sname of ['tunic', 'cuirass', 'sash']) { const sv = ex.shells[sname]; for (let i = sv.vertices[0]; i < sv.vertices[0] + sv.vertices[1]; i++) { const y = pos[i * 3 + 1]; if (y > 1.05 && y < 1.34 && Math.abs(pos[i * 3]) < 0.19 && pos[i * 3 + 2] > 0.14) pos[i * 3 + 2] = 0.14 + (pos[i * 3 + 2] - 0.14) * 0.25; } }
    nor.set(base.nor); if (!L.female) for (const sname of ['tunic', 'cuirass', 'sash']) { const sv = ex.shells[sname]; for (let i = sv.vertices[0]; i < sv.vertices[0] + sv.vertices[1]; i++) { const y = pos[i * 3 + 1]; if (y > 1.02 && y < 1.37 && Math.abs(pos[i * 3]) < 0.21 && pos[i * 3 + 2] > 0.1) { const m = 0.8; const nx = nor[i * 3] * (1 - m); const ny = nor[i * 3 + 1] * (1 - m); const nz = nor[i * 3 + 2] * (1 - m) + m; const l = Math.hypot(nx, ny, nz); nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l; } } } uv.set(base.uv); paint.set(base.paint); jnt.set(base.jnt); wgt.set(base.wgt);
    let vo = nv; const idx = []; for (const [f, c] of ranges) for (let i = 0; i < c; i++) idx.push(base.idx[f + i]);
    for (const p of parts) {
      const n = p.pos.length / 3; pos.set(p.pos, vo * 3); nor.set(p.nor, vo * 3); uv.set(p.uv, vo * 2);
      for (let k = 0; k < n; k++) { paint[(vo + k) * 2] = 1; paint[(vo + k) * 2 + 1] = 1; const w = p.weights[k]; for (let c = 0; c < 4; c++) { if (c < w.length) { jnt[(vo + k) * 4 + c] = boneNamesAll.indexOf(w[c][0]); wgt[(vo + k) * 4 + c] = w[c][1]; } } }
      for (const i of p.idx) idx.push(i + vo); vo += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('paint', new THREE.BufferAttribute(paint, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(jnt, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4)); geo.setIndex(new THREE.BufferAttribute(Uint16Array.from(idx), 1));
    geo.boundingSphere = { center: new THREE.Vector3(0, 0.85, 0.05), radius: 1.45, copy() { return this; } }; // generous: poses move limbs outside the rest bounds
    G = { geo, extra, boneNamesAll, tris: idx.length / 3, headTris: parts.reduce((a, p) => a + p.tris, 0), sel }; geoCache.set(key, G); return G;
  }

  function spawn(L, { lod = 0 } = {}) {
    const G = geometryFor(L); const A = atlasFor(L);
    const root = new THREE.Group(); root.name = 'human';
    const bones = names.map((n, i) => { const b = new THREE.Bone(); b.name = n; b.position.set(...local[i]); return b; });
    names.forEach((_, i) => { if (parentOf[i] >= 0) bones[parentOf[i]].add(bones[i]); }); root.add(bones[0]);
    const all = bones.slice(); const inv = world.map((w) => new THREE.Matrix4().makeTranslation(-w[0], -w[1], -w[2]));
    const chains = [];
    for (const e of G.extra) {
      const par = bones[names.indexOf(e.parent)]; const parW = W(e.parent); let prev = par; let prevW = parW;
      const chain = [];
      e.names.forEach((nm, k) => { const wp = k === 0 ? e.at : [e.at[0], e.at[1] + e.step * k, e.at[2]]; const b = new THREE.Bone(); b.name = nm; b.position.set(wp[0] - prevW[0], wp[1] - prevW[1], wp[2] - prevW[2]); prev.add(b); all.push(b); inv.push(new THREE.Matrix4().makeTranslation(-wp[0], -wp[1], -wp[2])); prev = b; prevW = wp; chain.push({ bone: b, a: [0, 0], v: [0, 0] }); });
      chains.push(chain);
    }
    const skel = new THREE.Skeleton(all, inv); const mesh = new THREE.SkinnedMesh(G.geo, A.mat); mesh.add(root.children[0]); mesh.bind(skel, new THREE.Matrix4()); mesh.frustumCulled = true; mesh.name = 'human-mesh'; root.add(mesh);
    const bmap = {}; for (const n of BONES) bmap[n] = bones[names.indexOf(n)];
    const hips0 = bmap.hips_root.position.clone();
    // ---- held props ----
    const attached = {};
    const hold = (name, bone, pos, rot, scale = 1) => { const m = new THREE.Mesh(props.get(name), name === 'lamp' ? propMat : propMat); m.position.set(...pos); m.rotation.set(...rot); m.scale.setScalar(scale); bone.add(m); m.castShadow = true; attached[name] = m; return m; };
    if (L.right && L.right !== 'none' && L.right !== 'bow') hold(L.right, bmap.hand_R, GRIPS[L.right]?.pos || [0, 0, 0], GRIPS[L.right]?.rot || [0, 0, 0]);
    if (L.right === 'bow' || L.left === 'bow') hold('bow', bmap.hand_L, GRIPS.bow.pos, GRIPS.bow.rot);
    if (L.left === 'shield') hold('shield', bmap.forearm_L, GRIPS.shield.pos, GRIPS.shield.rot);
    if (L.left === 'lamp') { const m = hold('lamp', bmap.hand_L, GRIPS.lamp.pos, GRIPS.lamp.rot); const flame = new THREE.Mesh(props.flame, lampMat); flame.position.set(0, -0.15, 0); m.add(flame); attached.flame = flame; }
    if (L.role === 'hero') { const m = hold('arrow', bmap.hand_R, GRIPS.arrow.pos, GRIPS.arrow.rot); m.visible = false; }
    // ---- state ----
    const H = { look: L, root, mesh, bones: bmap, attached, cycle: ((L.seed * 0.37) % 1), lod, tris: G.tris, atlas: A, weaponShown: null, blink: 0, blinkAt: 2 + (L.seed % 5), blinkT: -1, t: 0 };
    const cur = makePose(); const tgt = makePose(); const rngS = rng(L.seed * 3 + 1); const seed = rngS() * 6; let lastState = ''; let stateT = 0; let lastSpeed = 0; const fall = { yaw: 0 };
    H.setScale = () => { root.scale.set(UNITS_PER_M * L.height * L.build, UNITS_PER_M * L.height, UNITS_PER_M * L.height * L.build); }; H.setScale();
    // ctx: state, stateT?, speed (game units / s), dt, time, weapon, crouch, atk, windup, draw, reduced
    H.update = (dt, c) => {
      const st = c.state || 'idle'; if (st !== lastState) { stateT = 0; lastState = st; } else stateT += dt; if (c.stateT !== undefined) stateT = c.stateT;
      const v = (c.speed || 0) / UNITS_PER_M / L.height; const sp = v < 0.15 ? 0 : v < 1.4 ? (v / 1.4) * 0.5 : Math.min(1, 0.5 + ((v - 1.4) / 2.6) * 0.5);
      const rr = Math.max(0, Math.min(1, (v - 1.8) / 2.2)); const stride = STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * rr;
      if (!c.reduced || c.moving) H.cycle += (v * dt) / stride; // the cycle advances by distance: steps match the ground speed
      const accel = (c.speed - lastSpeed) / Math.max(dt, 1e-3) / UNITS_PER_M; lastSpeed = c.speed || 0;
      pose(tgt, { state: st, t: stateT, cycle: H.cycle, speed: sp, time: (c.time || 0) + seed, weapon: c.weapon || L.right, crouch: c.crouch ? 1 : 0, atk: c.atk, windup: c.windup, draw: c.draw, carry: L.carry === 'none' && L.left === 'lamp' ? 'lamp' : L.carry, stoop: L.stoop, legs, seed });
      const k = dt > 0.2 || c.snap ? 1 : 1 - Math.exp(-(st === 'attack' || st === 'hurt' || st === 'dodge' || st === 'shove' || st === 'parry' || st === 'strike' ? 30 : st === 'down' ? 18 : 14) * dt);
      blendPose(cur, tgt, k);
      for (const n of BONES) { const r = cur.rot[n]; bmap[n].rotation.set(r[0], r[1], r[2]); }
      bmap.hips_root.position.set(hips0.x + cur.sway, hips0.y + cur.lift, hips0.z + cur.fwd);
      // blink (the player's face is repainted; the crowd keeps open eyes)
      if (L.role === 'hero' && !c.reduced) { H.t += dt; if (H.blinkT < 0 && H.t > H.blinkAt) { H.blinkT = 0; } if (H.blinkT >= 0) { H.blinkT += dt; const b = Math.sin(Math.min(1, H.blinkT / 0.16) * Math.PI); const q = Math.round(b * 4) / 4; if (q !== H.blink) { H.blink = q; paintFace(A.canvas.getContext('2d'), atlas, L, q, rng(L.seed * 31 + 7)); A.tex.needsUpdate = true; } if (H.blinkT > 0.16) { H.blinkT = -1; H.t = 0; H.blinkAt = 2.5 + Math.random() * 3.5; } } }
      // props that depend on the pose
      if (attached.arrow) attached.arrow.visible = st === 'aim';
      // secondary motion: hair, braid and cloth tails as damped springs driven by speed and acceleration
      if (lod < 2) for (const ch of chains) { const kk = Math.min(dt, 0.05); ch.forEach((j, n) => {
        const lean = c.reduced ? 0 : 0.28 * sp * (n + 1) / ch.length + 0.012 * Math.max(-10, Math.min(10, accel)) * (n + 1) + (st === 'down' ? 0 : 0);
        const side = c.reduced ? 0 : 0.2 * Math.sin((c.time || 0) * 3 + n * 0.9 + seed) * sp * 0.6 + (c.turn || 0) * 0.12 * (n + 1);
        const K = 90; const D = 9; j.v[0] += ((lean - j.a[0]) * K - j.v[0] * D) * kk; j.a[0] += j.v[0] * kk; j.v[1] += ((side - j.a[1]) * K - j.v[1] * D) * kk; j.a[1] += j.v[1] * kk;
        j.bone.rotation.set(Math.max(-0.7, Math.min(1.1, j.a[0])), 0, Math.max(-0.6, Math.min(0.6, j.a[1]))); }); }
      if (lod >= 2) { for (const n of ['lamp', 'flame']) if (attached[n]) attached[n].visible = false; }
    };
    H.setLod = (l) => { H.lod = l; mesh.castShadow = l < 2; };
    H.dispose = () => { mesh.skeleton.dispose?.(); };
    mesh.castShadow = true; mesh.receiveShadow = true;
    return H;
  }
  const flameGeo = (T) => { const g = new T.SphereGeometry(0.018, 6, 4); g.scale(1, 1.8, 1); return g; };
  props.flame = flameGeo(THREE);
  return { spawn, geometryFor, parse: { json, acc }, extras: ex, legs, names, world, head, atlasSize: atlas, normalTex, ormTex, propMat,
    stats() { return { geometries: geoCache.size, atlases: atlasCache.size }; },
    dispose() { atlasCache.forEach((a) => { a.tex.dispose(); a.mat.dispose(); }); atlasCache.clear(); geoCache.forEach((g) => g.geo.dispose()); geoCache.clear(); normalTex.dispose(); ormTex.dispose(); propsMap.dispose(); propsOrm.dispose(); propMat.dispose(); props.dispose(); } };
}

// Where each prop sits in the hand or on the forearm: [x, y, z] metres and Euler rotation, in the bone's frame. Tuned against renders (see prototypes/gfx-shots).
export const GRIPS = {
  staff: { pos: [0.0, 0.0, 0.0], rot: [0, 0, Math.PI / 2] }, stick: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] }, club: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] }, sword: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] }, spear: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] },
  shield: { pos: [0.04, -0.12, 0.0], rot: [0, Math.PI / 2, 0] }, bow: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] }, lamp: { pos: [0.0, 0.0, 0.0], rot: [0, 0, 0] }, arrow: { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] },
};
