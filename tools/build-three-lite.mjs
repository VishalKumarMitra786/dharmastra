// Rebuilds src/vendor/three-lite.js: three.js (MIT) tree-shaken to only the names the game uses, plus the post-processing add-ons the modern look needs.
// Run: node tools/build-three-lite.mjs        (needs `npm install three@0.187.0 esbuild` in a scratch dir, default /tmp/three-build)
//   THREE_TOOLS=/path/to/scratch node tools/build-three-lite.mjs
// Names come from three core, plus examples/jsm: EffectComposer, RenderPass, ShaderPass, OutputPass, UnrealBloomPass, GTAOPass (ambient occlusion),
// BokehPass (depth of field), FXAAPass, Sky (generated sky for the image-based light), GLTFLoader, SkeletonUtils.clone, BufferGeometryUtils.mergeGeometries.
// The licence file stays at src/vendor/three.LICENSE.txt (three.js is MIT, 2010-2026 three.js authors).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
const ROOT = new URL('..', import.meta.url).pathname;
const TOOLS = process.env.THREE_TOOLS || '/tmp/three-build';
const CORE = `ACESFilmicToneMapping AdditiveBlending AgXToneMapping AmbientLight AnimationMixer BackSide Bone Box3 BoxGeometry BufferAttribute BufferGeometry CanvasTexture CapsuleGeometry CircleGeometry
ClampToEdgeWrapping Clock Color ConeGeometry CylinderGeometry DataTexture DepthTexture DirectionalLight DoubleSide DynamicDrawUsage Euler Float32BufferAttribute Fog FogExp2 Group HalfFloatType
HemisphereLight IcosahedronGeometry InstancedBufferAttribute InstancedMesh LatheGeometry LinearFilter LinearMipmapLinearFilter LoopRepeat MathUtils Matrix3 Matrix4 Mesh MeshBasicMaterial MeshDepthMaterial
MeshLambertMaterial MeshPhysicalMaterial MeshStandardMaterial MirroredRepeatWrapping NearestFilter NeutralToneMapping NoToneMapping NormalBlending Object3D OctahedronGeometry PCFSoftShadowMap PMREMGenerator
PerspectiveCamera PlaneGeometry PointLight Points PointsMaterial Quaternion REVISION RGBADepthPacking RGBAFormat RedFormat RepeatWrapping RingGeometry SRGBColorSpace LinearSRGBColorSpace Scene ShaderMaterial
Skeleton SkinnedMesh Sphere SphereGeometry SpotLight Sprite SpriteMaterial TorusGeometry UnsignedByteType UnsignedShortType Vector2 Vector3 Vector4 WebGLRenderTarget WebGLRenderer Texture FloatType Frustum Spherical`.split(/\s+/);
const entry = `export { ${CORE.join(', ')} } from 'three';
export { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
export { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
export { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
export { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
export { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
export { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
export { Sky } from 'three/examples/jsm/objects/Sky.js';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
export { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
`;
mkdirSync(join(TOOLS, 'entry'), { recursive: true });
writeFileSync(join(TOOLS, 'entry/three-lite-entry.js'), entry);
const esbuild = await import(pathToFileURL(join(TOOLS, 'node_modules/esbuild/lib/main.js')).href).catch(() => { console.error(`esbuild not found. Run: mkdir -p ${TOOLS} && cd ${TOOLS} && npm init -y && npm install three@0.187.0 esbuild`); process.exit(1); });
await esbuild.build({ entryPoints: [join(TOOLS, 'entry/three-lite-entry.js')], bundle: true, minify: true, format: 'esm', outfile: join(ROOT, 'src/vendor/three-lite.js'), legalComments: 'inline', absWorkingDir: TOOLS });
const out = readFileSync(join(ROOT, 'src/vendor/three-lite.js'));
console.log(`three-lite.js ${out.length} bytes, ${gzipSync(out).length} bytes gzipped`);
