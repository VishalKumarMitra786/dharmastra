// World materials: physically based (MeshStandardMaterial) with world-space triplanar maps (so a wall of any size keeps one texel density), baked
// ambient occlusion from vertex colours, damp-and-dust variation by height, and a shared colour grade (tone map, then saturation, contrast, split tone,
// warm highlights, cool shadows, vignette) injected into every material so no extra full-screen pass is needed (modern-look.md, section 2.2 row 8).
import * as S from './surfaces.js';

// One grade object shared by every patched material (people included). The renderer writes it per era and per frame (resolution).
export function createGrade(THREE) {
  return { uSat: { value: 1.1 }, uCon: { value: 1.06 }, uShadow: { value: new THREE.Vector3(0.9, 0.98, 1.1) }, uLight: { value: new THREE.Vector3(1.06, 1.0, 0.88) }, uVig: { value: 0.28 }, uRes: { value: new THREE.Vector2(800, 600) }, uTime: { value: 0 }, uWet: { value: 0 }, uLamp: { value: new THREE.Vector3(1, 0.7, 0.35) } };
}
export const GRADE_GLSL = `
uniform float uSat; uniform float uCon; uniform vec3 uShadow; uniform vec3 uLight; uniform float uVig; uniform vec2 uRes;
vec3 dGrade( vec3 c ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, uSat );
  c = ( c - 0.18 ) * uCon + 0.18;
  c *= mix( uShadow, uLight, smoothstep( 0.04, 0.8, l ) );
  vec2 q = gl_FragCoord.xy / uRes - 0.5; float d = length( q * vec2( 1.0, 1.15 ) ) * 1.35;
  c *= 1.0 - smoothstep( 0.5, 1.0, d ) * uVig;
  return max( c, 0.0 );
}`;
// Adds the grade to a material's compile hook (chains with any hook already there).
export function gradePatch(mat, grade) {
  const prev = mat.onBeforeCompile; const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, { uSat: grade.uSat, uCon: grade.uCon, uShadow: grade.uShadow, uLight: grade.uLight, uVig: grade.uVig, uRes: grade.uRes });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GRADE_GLSL}`).replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n gl_FragColor.rgb = dGrade( gl_FragColor.rgb );');
  };
  mat.customProgramCacheKey = () => prevKey + '|grade';
  return mat;
}

const TRI_VERT = `#include <common>
varying vec3 vTpPos; varying vec3 vTpN;`;
const TRI_FRAG_PARS = `#include <common>
varying vec3 vTpPos; varying vec3 vTpN;
uniform sampler2D tpMap; uniform sampler2D tpNor; uniform float tpScale; uniform float tpNormalK; uniform float tpDamp; uniform float tpWet; uniform float tpRough;
float tpHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float tpNoise( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( tpHash( i ), tpHash( i + vec2( 1, 0 ) ), f.x ), mix( tpHash( i + vec2( 0, 1 ) ), tpHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;
// Replaces the map and normal samples with triplanar ones. The albedo alpha channel carries a roughness variation.
function triplanar(mat, tex, opts, grade) {
  const uniforms = { tpMap: { value: tex.map }, tpNor: { value: tex.nor }, tpScale: { value: opts.scale }, tpNormalK: { value: opts.normalK ?? 1 }, tpDamp: { value: opts.damp ?? 0 }, tpWet: grade.uWet, tpRough: { value: opts.rough ?? 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', TRI_VERT).replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 tpP = vec4( transformed, 1.0 ); vec3 tpNn = objectNormal;
      #ifdef USE_INSTANCING
        tpP = instanceMatrix * tpP; tpNn = mat3( instanceMatrix ) * tpNn; // world-space maps must see the instance transform (obstacles are instanced)
      #endif
      vTpPos = ( modelMatrix * tpP ).xyz; vTpN = normalize( mat3( modelMatrix ) * tpNn );`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', TRI_FRAG_PARS)
      .replace('#include <map_fragment>', `
      vec3 tpW = pow( abs( vTpN ), vec3( 6.0 ) ); tpW /= ( tpW.x + tpW.y + tpW.z );
      vec2 tpUx = vTpPos.zy * tpScale; vec2 tpUy = vTpPos.xz * tpScale; vec2 tpUz = vTpPos.xy * tpScale;
      vec4 tpA = vec4( 0.0 ); vec3 tpNx = vec3( 0.0 ); vec3 tpNy = vec3( 0.0 ); vec3 tpNz = vec3( 0.0 );
      if ( tpW.x > 0.02 ) { tpA += texture2D( tpMap, tpUx ) * tpW.x; tpNx = texture2D( tpNor, tpUx ).xyz * 2.0 - 1.0; }
      if ( tpW.y > 0.02 ) { tpA += texture2D( tpMap, tpUy ) * tpW.y; tpNy = texture2D( tpNor, tpUy ).xyz * 2.0 - 1.0; }
      if ( tpW.z > 0.02 ) { tpA += texture2D( tpMap, tpUz ) * tpW.z; tpNz = texture2D( tpNor, tpUz ).xyz * 2.0 - 1.0; }
      float tpWetMask = 0.0;
      #ifdef TP_GROUND
        float wn = tpNoise( vTpPos.xz * 0.011 ) * 0.65 + tpNoise( vTpPos.xz * 0.041 + 7.0 ) * 0.35; tpWetMask = smoothstep( 0.52 - tpWet * 0.25, 0.7 - tpWet * 0.2, wn ) * ( 0.35 + 0.65 * tpWet );
        tpA.rgb *= 1.0 - tpWetMask * 0.38;
      #else
        float dampH = 1.0 - smoothstep( 0.0, 26.0, vTpPos.y ); float dn = tpNoise( vTpPos.xz * 0.09 + vTpPos.y * 0.05 ); tpWetMask = dampH * ( 0.35 + 0.65 * dn ) * ( tpDamp + tpWet * 0.6 );
        tpA.rgb *= 1.0 - tpWetMask * 0.3; tpA.rgb = mix( tpA.rgb, tpA.rgb * vec3( 0.86, 0.9, 0.86 ), dampH * 0.5 ); // dust and damp gather at the foot of a wall
      #endif
      diffuseColor.rgb *= tpA.rgb;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp( roughness * ( 0.55 + 0.9 * tpA.a ) * tpRough, 0.04, 1.0 ); roughnessFactor = mix( roughnessFactor, 0.3, tpWetMask );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 wn = normalize( vTpN ); float k = tpNormalK * ( 1.0 - tpWetMask * 0.6 );
        // the height gradient is a world-space vector, so each projection plane adds its own two axes (no facing sign is needed)
        vec3 pn = wn + vec3( 0.0, tpNx.y, tpNx.x ) * k * tpW.x + vec3( tpNy.x, 0.0, tpNy.y ) * k * tpW.y + vec3( tpNz.x, tpNz.y, 0.0 ) * k * tpW.z;
        normal = normalize( ( viewMatrix * vec4( normalize( pn ), 0.0 ) ).xyz ); normal *= faceDirection; }`);
    if (opts.ground) sh.fragmentShader = '#define TP_GROUND\n' + sh.fragmentShader;
  };
  mat.customProgramCacheKey = () => 'tp' + (opts.ground ? 'g' : 'w');
  return mat;
}

// Build a DataTexture pair from a surface-map result.
function texPair(THREE, res, S, aniso) {
  const mk = (data, srgb) => { const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  return { map: mk(res.rgba, true), nor: mk(res.normal, false) };
}

// Creates the material set for one era. T is the theme, q the quality profile ({ texSize, aniso }), gl the renderer (for max anisotropy).
// A copy of a patched material that takes instance colours instead of vertex colours (for InstancedMesh obstacles).
export function instanced(mat) { const m = mat.clone(); m.vertexColors = false; m.onBeforeCompile = mat.onBeforeCompile; const k = mat.customProgramCacheKey?.() || ''; m.customProgramCacheKey = () => k + '|inst'; return m; }

export function createWorldMaterials(THREE, T, q, grade, gl, assets = {}) {
  const size = q.texSize || 256; const aniso = Math.min(q.aniso || 4, gl?.capabilities?.getMaxAnisotropy?.() || 4); const owned = []; const own = (o) => { owned.push(o); return o; };
  const wetCity = !!T.rain;
  const surf = {
    plaster: texPair(THREE, S.plaster(size, 2), size, aniso),
    stone: texPair(THREE, S.masonry(size, 3, { rows: 5, brick: false }), size, aniso),
    brick: texPair(THREE, S.masonry(size, 11, { rows: 8, brick: true }), size, aniso),
    roof: texPair(THREE, S.roofTiles(size, 4, wetCity ? [150, 112, 70] : [188, 100, 64]), size, aniso),
    wood: texPair(THREE, S.timber(size, 5), size, aniso),
    bark: texPair(THREE, S.bark(Math.min(size, 128), 7), Math.min(size, 128), aniso),
    weave: texPair(THREE, S.weave(Math.min(size, 128), 8), Math.min(size, 128), aniso),
    ground: assets.ground || texPair(THREE, S.ground(size, T.roof === 'dome' ? 'cobble' : 'earth', 6, T.groundBase || hexToRgb(T.groundTint ?? 0xd8c8b4)), size, aniso),
  };
  Object.entries(surf).forEach(([k, p]) => { if (k === 'ground' && assets.ground) return; own(p.map); own(p.nor); }); // loaded ground maps belong to the renderer
  const std = (extra) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.9, ...extra });
  const tri = (m, tex, o) => gradePatch(triplanar(m, tex, o, grade), grade);
  const mats = {
    wall: tri(std({ roughness: 0.92 }), surf.plaster, { scale: 1 / 70, normalK: 0.9, damp: 0.5 }),
    stone: tri(std({ roughness: 0.88 }), T.roof === 'pitched' ? surf.stone : surf.stone, { scale: 1 / 62, normalK: 1.1, damp: 0.7 }),
    roof: tri(std({ roughness: 0.86 }), surf.roof, { scale: 1 / 46, normalK: 1.1, damp: 0 }),
    wood: tri(std({ roughness: 0.82 }), surf.wood, { scale: 1 / 36, normalK: 1.0, damp: 0.3 }),
    trunk: tri(std({ roughness: 0.95 }), surf.bark, { scale: 1 / 22, normalK: 1.2, damp: 0 }),
    cloth: tri(std({ roughness: 0.94, side: THREE.DoubleSide }), surf.weave, { scale: 1 / 9, normalK: 0.9, damp: 0 }),
    clay: tri(std({ roughness: 0.78 }), surf.plaster, { scale: 1 / 26, normalK: 0.6, damp: 0.2 }),
    gold: gradePatch(std({ roughness: 0.34, metalness: 0.92, envMapIntensity: 1.4 }), grade),
    leaf: gradePatch(std({ roughness: 0.78, side: THREE.DoubleSide }), grade),
    lit: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: true }),
    dark: gradePatch(std({ roughness: 0.08, metalness: 0.0, envMapIntensity: 1.6 }), grade),
    shade: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    decal: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    puddle: gradePatch(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.03, metalness: 0.1, envMapIntensity: 2.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), grade),
    water: gradePatch(new THREE.MeshStandardMaterial({ color: 0x1d6a76, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.8, transparent: true, opacity: 0.92 }), grade),
  };
  // leaf cards: alpha-tested leaf texture, double sided, alpha to coverage under MSAA
  const lc = S.leafCard(128, 9); const leafTex = own(new THREE.DataTexture(lc.rgba, 128, 128, THREE.RGBAFormat)); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.magFilter = THREE.LinearFilter; leafTex.minFilter = THREE.LinearMipmapLinearFilter; leafTex.generateMipmaps = true; leafTex.flipY = false; leafTex.needsUpdate = true;
  mats.card = gradePatch(std({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, alphaToCoverage: true }), grade);
  for (const m of Object.values(mats)) own(m);
  return { mats, surf, groundMat: makeGroundMaterial(THREE, surf.ground, T, grade, own, Boolean(assets.ground)), dispose() { owned.forEach((o) => o.dispose?.()); } };
}
function hexToRgb(h, base) { return base || [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }

// baked: the maps came from the Blender cobble bake (tools/blender/world/bake_ground.py): 2 m per tile, about 73 units, neutral stone colours tinted by the era.
function makeGroundMaterial(THREE, pair, T, grade, own, baked = false) {
  const m = new THREE.MeshStandardMaterial({ color: baked ? (T.groundTint ?? 0xd8c8b4) : 0xffffff, roughness: 0.92, metalness: 0, envMapIntensity: baked ? 0.18 : 0.45 });
  triplanar(m, pair, baked ? { scale: 1 / 40, normalK: 1.0, ground: true, rough: 0.62 } : { scale: 1 / 150, normalK: 1.0, ground: true, rough: 1 }, grade); gradePatch(m, grade); own(m); return m;
}
