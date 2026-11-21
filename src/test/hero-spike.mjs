// Checks for the hero spike (assets/characters/hero.glb, prototypes/hero-street/). Self-contained: prints PASS/FAIL lines, sets exitCode on failure.
// Reads the GLB in plain Node (no three.js), so the numbers are from the asset itself.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { measureHero } from '../../prototypes/hero-street/measure.js';
import { BONES, makePose, pose } from '../../prototypes/hero-street/anim.js';

const root = new URL('../../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root));
const out = [];
const t = (name, fn) => { try { fn(); out.push(['PASS', name]); } catch (e) { out.push(['FAIL', name, e.message]); process.exitCode = 1; } };

const glbBuf = rd('assets/characters/hero.glb');
const jl = glbBuf.readUInt32LE(12); const json = JSON.parse(glbBuf.subarray(20, 20 + jl).toString()); const bin = glbBuf.subarray(20 + jl + 8);
const CT = { 5120: Int8Array, 5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array }; const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc(i, normalizedToFloat = false) { // decode an accessor honouring byteStride
  const a = json.accessors[i]; const v = json.bufferViews[a.bufferView]; const C = CT[a.componentType]; const n = NC[a.type]; const stride = v.byteStride || n * C.BYTES_PER_ELEMENT;
  const o = new (normalizedToFloat ? Float32Array : C)(a.count * n); const dv = new DataView(bin.buffer, bin.byteOffset + v.byteOffset + (a.byteOffset || 0));
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5123: 'getUint16', 5126: 'getFloat32' }[a.componentType]; const div = { 5120: 127, 5121: 255, 5123: 65535 }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const x = dv[get](k * stride + c * C.BYTES_PER_ELEMENT, true); o[k * n + c] = normalizedToFloat && a.normalized ? x / div : x; }
  return o;
}
const bodyPrim = json.meshes[0].primitives[0]; const facePrim = json.meshes[1].primitives[0];
const pos = acc(bodyPrim.attributes.POSITION); const uv = acc(bodyPrim.attributes.TEXCOORD_0, true); const joints = acc(bodyPrim.attributes.JOINTS_0); const weights = acc(bodyPrim.attributes.WEIGHTS_0, true);
const idx = acc(bodyPrim.indices); const fidx = acc(facePrim.indices);
const skin = json.skins[0]; const boneNodes = skin.joints.map((j) => json.nodes[j]); const boneNames = boneNodes.map((n) => n.name);
const world = {}; { const par = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (par[c] = i))); const w = (i) => { const n = json.nodes[i]; const p = par[i] !== undefined && skin.joints.includes(par[i]) ? w(par[i]) : [0, 0, 0]; return n.translation.map((v, k) => v + p[k]); }; skin.joints.forEach((j) => (world[json.nodes[j].name] = w(j))); }
const m = measureHero({ pos, uv, joints, weights, boneNames, boneWorld: (n) => world[n] });
const gz = (b) => gzipSync(b).length;

t('licence: both MakeHuman licence files are copied and grant the assets under CC0 1.0', () => {
  assert.match(rd('assets/characters/makehuman-LICENSE.md').toString(), /assets[\s\S]*CC0 1\.0 Universal/i);
  assert.match(rd('assets/characters/makehuman-LICENSE.ASSETS.md').toString(), /^# Creative Commons CC0 1\.0 Universal/);
  const s = JSON.parse(rd('assets/characters/hero.sources.json').toString()); assert.equal(Object.keys(s.files).length, 5);
  for (const f of Object.values(s.files)) assert.match(f.sha256, /^[0-9a-f]{64}$/);
});
t('licence: every file in assets/characters has a line in assets/CREDITS.md with a source URL and licence', () => {
  const c = rd('assets/CREDITS.md').toString();
  for (const f of readdirSync(new URL('assets/characters/', root))) assert.ok(c.includes('characters/' + f), `no credit line for ${f}`);
  assert.match(c, /raw\.githubusercontent\.com\/makehumancommunity\/makehuman/); assert.match(c, /CC0/);
});
t('size: hero.glb is at most 80 KB gzipped; the page and its JS at most 60 KB gzipped (without three-lite)', () => {
  assert.ok(gz(glbBuf) <= 80 * 1024, `glb ${gz(glbBuf)}`);
  const dir = new URL('prototypes/hero-street/', root); const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f) && f !== 'shoot.mjs');
  const total = files.reduce((a, f) => a + gz(readFileSync(new URL(f, dir))), 0); assert.ok(total <= 60 * 1024, `page ${total}`);
});
t('geometry: hero at most 5,000 triangles and 30 bones, indices and joints in range, weights sum to 1', () => {
  const tris = (idx.length + fidx.length) / 3; assert.ok(tris <= 5000, `triangles ${tris}`); assert.ok(boneNames.length <= 30 && boneNames.length >= 18, `bones ${boneNames.length}`);
  for (const i of idx) assert.ok(i < pos.length / 3); for (let k = 0; k < weights.length; k += 4) { assert.ok(Math.abs(weights[k] + weights[k + 1] + weights[k + 2] + weights[k + 3] - 1) < 0.01); for (let c = 0; c < 4; c++) if (weights[k + c] > 0) assert.ok(joints[k + c] < boneNames.length); }
});
t('draw calls: the hero is 3 skinned meshes (body, outline, face), at most 4', () => {
  const meshNodes = json.nodes.filter((n) => n.mesh !== undefined); assert.deepEqual(meshNodes.map((n) => n.name).sort(), ['body', 'face', 'outline']); assert.ok(meshNodes.length <= 4);
});
t('proportions: 7 to 7.5 heads tall, shoulders 1.8 to 2.3 head widths, legs 0.45 to 0.52 of height', () => {
  assert.ok(m.headsTall >= 7 && m.headsTall <= 7.5, `heads ${m.headsTall}`); assert.ok(m.shoulderOverHead >= 1.8 && m.shoulderOverHead <= 2.3, `shoulders ${m.shoulderOverHead}`); assert.ok(m.legRatio >= 0.45 && m.legRatio <= 0.52, `legs ${m.legRatio}`);
  assert.ok(m.height > 1.5 && m.height < 1.9, `height ${m.height}`);
});

// ---- animation ----
const P = (c, tm, w) => { const p = makePose(); pose(p, c, tm, w); return p; };
const dist = (a, b) => Math.max(...BONES.flatMap((n) => a.rot[n].map((v, k) => Math.abs(v - b.rot[n][k]))), Math.abs(a.lift - b.lift));
t('animation: the walk loops (cycle 0 equals cycle 1) and moves smoothly: no joint turns more than 0.12 rad per 60 Hz frame', () => {
  assert.ok(dist(P(0, 5, 1), P(1, 5, 1)) < 1e-9); assert.ok(dist(P(0.37, 5, 1), P(3.37, 5, 1)) < 1e-9);
  let worst = 0; for (let f = 0; f < 120; f++) worst = Math.max(worst, dist(P(f / 56, f / 60, 1), P((f + 1) / 56, (f + 1) / 60, 1))); // 0.93 cycles/s at 60 Hz
  assert.ok(worst < 0.12, `worst step ${worst}`);
});
t('animation: idle and the walk/idle blend are smooth too', () => {
  let a = 0; for (let f = 0; f < 600; f++) a = Math.max(a, dist(P(0, f / 60, 0), P(0, (f + 1) / 60, 0))); assert.ok(a < 0.01, `idle step ${a}`);
  let b = 0; for (let f = 0; f < 60; f++) b = Math.max(b, dist(P(0.3, 2, f / 60), P(0.3, 2, (f + 1) / 60))); assert.ok(b < 0.1, `blend step ${b}`);
});

// ---- skinning without three.js: bend the rig through the walk and look for stretched or torn triangles ----
const mul = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const T4 = (x, y, z) => Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const R4 = (x, y, z) => { const [a, b, c] = [Math.cos(x), Math.cos(y), Math.cos(z)]; const [d, e, f] = [Math.sin(x), Math.sin(y), Math.sin(z)]; // Euler XYZ, like three.js
  const m11 = b * c, m12 = -b * f, m13 = e, m21 = a * f + c * d * e, m22 = a * c - d * e * f, m23 = -b * d, m31 = d * f - a * c * e, m32 = c * d + a * e * f, m33 = a * b;
  return Float64Array.from([m11, m21, m31, 0, m12, m22, m32, 0, m13, m23, m33, 0, 0, 0, 0, 1]); };
function skinned(p) {
  const wm = {}; const parent = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const calc = (j) => { const node = json.nodes[j]; if (wm[j]) return wm[j]; const r = p.rot[node.name]; let loc = mul(T4(...node.translation), R4(...r)); if (node.name === 'hips_root') loc = mul(T4(0, p.lift, p.sway), loc); const pa = parent[j]; return (wm[j] = skin.joints.includes(pa) ? mul(calc(pa), loc) : loc); };
  const ibm = acc(skin.inverseBindMatrices); const bone = skin.joints.map((j, i) => mul(calc(j), ibm.subarray(i * 16, i * 16 + 16)));
  const o = new Float32Array(pos.length);
  for (let v = 0; v < pos.length / 3; v++) for (let c = 0; c < 4; c++) { const w = weights[v * 4 + c]; if (!w) continue; const M = bone[joints[v * 4 + c]]; const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    o[v * 3] += w * (M[0] * x + M[4] * y + M[8] * z + M[12]); o[v * 3 + 1] += w * (M[1] * x + M[5] * y + M[9] * z + M[13]); o[v * 3 + 2] += w * (M[2] * x + M[6] * y + M[10] * z + M[14]); }
  return o;
}
const edgeLen = (P2, a, b) => Math.hypot(P2[a * 3] - P2[b * 3], P2[a * 3 + 1] - P2[b * 3 + 1], P2[a * 3 + 2] - P2[b * 3 + 2]);
export const skinStats = (() => { // exported for the report: worst edge stretch over 4 phases of the walk, and the identity check
  const rest = skinned(makePose()); let worst = 0; let restErr = 0; for (let i = 0; i < pos.length; i++) restErr = Math.max(restErr, Math.abs(rest[i] - pos[i])); 
  const REST = P(0, 0, 0); void REST;
  let dh = 0; const ratios = []; for (const ph of [0, 0.25, 0.5, 0.75]) { const s = skinned(P(ph, 3, 1)); let w = 0; for (let k = 0; k < idx.length; k += 3) for (let e = 0; e < 3; e++) { const a = idx[k + e], b = idx[k + ((e + 1) % 3)]; const l0 = edgeLen(pos, a, b); if (l0 > 0.01) { const r = edgeLen(s, a, b) / l0; if (uv[a * 2] < 0.5) w = Math.max(w, r); else dh = Math.max(dh, r); } } ratios.push(w); worst = Math.max(worst, w); }
  return { worst, ratios, dhotiWorst: dh, restErr };
})();
t('skinning: at 4 phases of the walk no body edge of 1 cm or more (skin and top: elbows, knees, shoulders) stretches beyond 1.75x, and the dhoti stays under 4x', () => {
  assert.ok(skinStats.restErr < 1e-4, `rest pose error ${skinStats.restErr}`); assert.ok(skinStats.dhotiWorst < 4, `dhoti ${skinStats.dhotiWorst}`); assert.ok(skinStats.worst < 1.75, `worst stretch ${skinStats.worst.toFixed(2)} (${skinStats.ratios.map((r) => r.toFixed(2))})`);
});

if (process.env.HERO_DEBUG) { const s = skinned(P(0.25, 3, 1)); const rows = []; for (let k = 0; k < idx.length; k += 3) for (let e = 0; e < 3; e++) { const a = idx[k + e], b = idx[k + ((e + 1) % 3)]; const l0 = edgeLen(pos, a, b); if (l0 > 0.004 && uv[a * 2] < 0.5) rows.push([edgeLen(s, a, b) / l0, l0, pos[a * 3 + 1], boneNames[joints[a * 4]], uv[a * 2]]); }
  rows.sort((x, y) => y[0] - x[0]); console.log(rows.slice(0, 12).map((r) => r.map((v) => (typeof v === 'number' ? v.toFixed(3) : v)).join(' ')).join('\n')); console.log('over 1.75:', rows.filter((r) => r[0] > 1.75).length, 'of', rows.length); }
if (process.env.HERO_VERBOSE) console.log(JSON.stringify({ m, skinStats, gz: gz(glbBuf), tris: (idx.length + fidx.length) / 3, bones: boneNames.length }, null, 1));
for (const [s, n, e] of out) console.log(`${s === 'PASS' ? 'ok' : 'FAIL'} hero-spike: ${n}${e ? ' - ' + e : ''}`);
