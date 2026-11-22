// The authored world kit: assets/world/kit.glb (modelled and baked in Blender by tools/blender/world/build_kit.py), loaded lazily after the first frame.
// Pieces are bevelled, UV-unwrapped into one atlas, and carry baked normal, ambient-occlusion and curvature maps. They are merged into the same
// per-material batches as the rest of the city (keys k_stone, k_wood, ...), so a whole street is still a handful of draw calls.
// Pure geometry and material helpers; no network code outside loadKit. History labels live in tools/blender/world/pieces.py (Tradition / Invented).
import { gradePatch } from './materials.js';

// Metres to game units: people are 62 units (1.7 m) but doors and windows are drawn about 0.7 of real size so that a building face fits a street tile.
export const UNITS = { win: 25, door: 25, column: 25, awning: 26, stall: 30, cart: 34, lantern: 34, jar: 34, barrel: 34, crate: 34, bench: 34, sack: 34, basket: 34, banner: 30, rope: 34, roof_hip: 1 };
const strip = (n) => n.replace(/\.\d+$/, '');

// Texture from an image file without THREE.TextureLoader (not in three-lite): an Image decoded off the main thread, wrapped in a Texture (not flipped, like glTF).
export async function loadTexture(THREE, url, { srgb = false, repeat = false, aniso = 1, mips = true } = {}) {
  const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
  const t = new THREE.Texture(img); t.flipY = false; t.generateMipmaps = mips; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

export async function loadKit(THREE, { tier = 'medium', grade, gl, base = new URL('../../assets/world/', import.meta.url).href } = {}) {
  const loader = new THREE.GLTFLoader();
  const low = tier === 'low'; const lodOn = tier !== 'high'; // the game version has about 1k triangles a piece; Low and Medium draw the decimated LOD1 (about 40 percent)
  const sfx = low ? '_1k' : '';
  const tex = (f, srgb) => loadTexture(THREE, base + f, { srgb, aniso: low ? 1 : Math.min(4, gl?.capabilities?.getMaxAnisotropy?.() || 1) });
  const [gltf, nor, orm] = await Promise.all([loader.loadAsync(base + 'kit.glb'), tex(`kit_normal${sfx}.jpg`), tex("kit_orm_1k.jpg")]);
  const parts = new Map(); // piece name -> [{ key, geometry }]
  const lods = new Map();
  gltf.scene.updateMatrixWorld(true);
  const take = (obj) => {
    const name = obj.name; const list = [];
    const add = (m) => { if (!m.isMesh) return; const g = m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (g.index) { const ng = g.toNonIndexed(); g.dispose(); list.push({ key: strip(m.material.name), geometry: ng }); } else list.push({ key: strip(m.material.name), geometry: g }); };
    add(obj); obj.children.forEach(add);
    return [name, list];
  };
  gltf.scene.children.forEach((o) => { const [n, list] = take(o); if (!list.length) return; if (n.endsWith('_lod1')) lods.set(n.slice(0, -5), list); else parts.set(n, list); });
  gltf.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });

  const std = (extra) => { const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0, normalMap: nor, aoMap: orm, aoMapIntensity: 1.0, envMapIntensity: 0.9, ...extra }); return m; };
  // The normal map is the standard glTF convention (OpenGL green, textures not flipped), as GLTFLoader would load it. Curvature (green of the ORM map)
  // lifts worn edges, world-space noise breaks up flat tints, and dust gathers at the foot of things.
  const wear = (m) => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKw;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vKw = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vKw; float kH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float kN( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( kH( i ), kH( i + vec2( 1, 0 ) ), f.x ), mix( kH( i + vec2( 0, 1 ) ), kH( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        { float cv = texture2D( aoMap, vAoMapUv ).g; float br = kN( vKw.xz * 0.045 + vKw.y * 0.02 ) * 0.5 + kN( vKw.xz * 0.31 + vKw.y * 0.17 ) * 0.5;
          diffuseColor.rgb *= ( 0.86 + 0.28 * br ) * ( 0.78 + 0.55 * cv ); diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.8, 0.77, 0.7 ), ( 1.0 - smoothstep( 0.0, 14.0, vKw.y ) ) * 0.55 ); }`);
    };
    m.customProgramCacheKey = () => 'kitwear';
    return m;
  };
  const mats = {
    k_stone: std({ roughness: 0.88 }), k_wood: std({ roughness: 0.8 }), k_cloth: std({ roughness: 0.93, side: THREE.DoubleSide }), k_clay: std({ roughness: 0.74 }), k_goods: std({ roughness: 0.62 }),
    k_gold: std({ roughness: 0.34, metalness: 0.9, envMapIntensity: 1.5 }), k_roof: std({ roughness: 0.78 }), k_dark: std({ roughness: 0.1, envMapIntensity: 1.6 }),
    k_lit: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
  };
  for (const [k, m] of Object.entries(mats)) { if (k !== 'k_lit') { wear(m); if (grade) gradePatch(m, grade); } }
  const geom = (name) => parts.get(name);

  // Adds a piece to a Batch. o: { s, ry, rx, rz, tint: { stone, wood, ... }, lit } (lit false = dark glass).
  function place(B, name, x, y, z, o = {}) {
    const list = (lodOn && lods.get(name)) || parts.get(name); if (!list) return false;
    const s = (o.s ?? 1) * (UNITS[name] ?? 30); const t = o.tint || {};
    for (const { key, geometry } of list) {
      let k = 'k_' + key; if (key === 'lit' && o.lit === false) k = 'k_dark';
      const col = t[key] ?? DEFAULT[key] ?? 0xffffff;
      B.add(k, geometry, x, y, z, (o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s, col, o.ry || 0, o.rx || 0, o.rz || 0);
    }
    return true;
  }
  return { mats, place, has: (n) => parts.has(n), geom, names: [...parts.keys()], dispose() { Object.values(mats).forEach((m) => m.dispose()); nor.dispose(); orm.dispose(); parts.forEach((l) => l.forEach((p) => p.geometry.dispose())); lods.forEach((l) => l.forEach((p) => p.geometry.dispose())); } };
}
const DEFAULT = { stone: 0xe8dcc0, wood: 0x8a6a4a, cloth: 0xc2483a, clay: 0xb4663f, goods: 0xe9a23a, gold: 0xd9a93a, lit: 0xffd27a, roof: 0xb87a4a };
