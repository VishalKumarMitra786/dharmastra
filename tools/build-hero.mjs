// Builds assets/characters/hero.glb (the one human body for the whole game) from the CC0 MakeHuman hm08 base mesh, skeleton and bone weights. No Blender.
// Run: node tools/build-hero.mjs            (needs `npm install meshoptimizer` in a scratch dir, default /tmp/hero-tools)
//   HERO_TOOLS=/path/to/scratch  HERO_CACHE=/path/to/download/cache  node tools/build-hero.mjs
// What it makes: ONE skinned mesh holding every shell a human can wear, with an index table in the GLB (asset.extras.shells) so the game builds a
// variant (soldier, townsperson, hero...) by choosing shells, not by copying meshes:
//   body (split into groups so covered skin can be dropped), tunic (kurta with short sleeves), uttariya (diagonal chest cloth), sash (waist band),
//   cuirass (soldier armour), dhoti (knee length) and dhoti long (ankle length), shoes (leather, rounded toes).
// Garments are real geometry: offset shells cut from the body triangles and skinned with the body's weights; the dhoti is MakeHuman's skirt helper with
// weights blended toward the hips so it does not stretch between the legs. Hands keep a thumb bone and two finger bones so a fist and an open hand read.
// Hair, turbans, caps and helmets are made at run time (src/gfx/human/headgear.js) from the head frame stored in the GLB.
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const TOOLS = process.env.HERO_TOOLS || '/tmp/hero-tools';
const CACHE = process.env.HERO_CACHE || '/tmp/hero-cache';
const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/';
const OUT = join(ROOT, 'assets/characters');
// Target triangles. The whole hero (soldier with armour and a helmet) must stay under about 6,000 including headgear.
const ARM_K = 1.2; // arm length factor, see the stretch below
const BODY_TARGET = { head: 1500, hands: 1000, armup: 120, torso: 520, thigh: 140, shin: 180, foot: 72 };
const GARMENT_TARGET = { tunic: 650, sash: 96, cuirass: 360, dhoti: 360, dhotiLong: 420, shoes: 240 };

const SOURCES = [['LICENSE.md'], ['LICENSE.ASSETS.md'], ['makehuman/data/3dobjs/base.obj'], ['makehuman/data/rigs/default.mhskel'], ['makehuman/data/rigs/default_weights.mhw']];
const PIN_FILE = join(ROOT, 'assets/characters/hero.sources.json');

function fail(msg) { console.error('BUILD STOPPED: ' + msg); process.exit(1); }

async function fetchSources() {
  mkdirSync(CACHE, { recursive: true });
  const pins = existsSync(PIN_FILE) ? JSON.parse(readFileSync(PIN_FILE, 'utf8')).files : {};
  const files = {}; const manifest = {};
  for (const [path] of SOURCES) {
    const local = join(CACHE, path.replaceAll('/', '__'));
    if (!existsSync(local)) {
      const res = await fetch(RAW + path);
      if (!res.ok) fail(`could not fetch ${RAW + path}: HTTP ${res.status}`);
      writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    }
    const buf = readFileSync(local);
    const sha = createHash('sha256').update(buf).digest('hex');
    if (pins[path] && pins[path].sha256 !== sha) fail(`${path} changed upstream (sha256 ${sha} != pinned ${pins[path].sha256}). Re-check its licence, then delete ${PIN_FILE}.`);
    files[path] = buf.toString('utf8'); manifest[path] = { url: RAW + path, sha256: sha, bytes: buf.length };
  }
  return { files, manifest };
}

function checkLicences(f) {
  const obj = f['makehuman/data/3dobjs/base.obj']; const skel = JSON.parse(f['makehuman/data/rigs/default.mhskel']); const wts = JSON.parse(f['makehuman/data/rigs/default_weights.mhw']);
  const ok = [
    [/explicitly released as CC0/.test(obj.slice(0, 600)), 'base.obj header does not say CC0'],
    [skel.license === 'CC0', `default.mhskel license is "${skel.license}", not CC0`],
    [wts.license === 'CC0', `default_weights.mhw license is "${wts.license}", not CC0`],
    [/CC0 1\.0 Universal/.test(f['LICENSE.md']) && /assets[\s\S]{0,400}CC0 1\.0 Universal/i.test(f['LICENSE.md']), 'LICENSE.md section C does not grant the assets under CC0 1.0'],
    [/^# Creative Commons CC0 1\.0 Universal/.test(f['LICENSE.ASSETS.md']), 'LICENSE.ASSETS.md is not the CC0 1.0 legal text'],
  ];
  for (const [pass, why] of ok) if (!pass) fail('licence check failed: ' + why + '. The advisor described these files as CC0, but this copy does not match.');
  return { skel, wts };
}

// ---------------------------------------------------------------------------------------------------------------------
// OBJ and rig
function parseObj(text) {
  const V = []; const groups = {}; let g = null;
  for (const l of text.split('\n')) {
    if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) { const p = l.split(' '); V.push([+p[1], +p[2], +p[3]]); }
    else if (l.startsWith('g ')) { g = l.slice(2).trim(); groups[g] ??= []; }
    else if (l.charCodeAt(0) === 102 && l.charCodeAt(1) === 32) groups[g].push(l.slice(2).trim().split(/\s+/).map((t) => +t.split('/')[0] - 1));
  }
  return { V, groups };
}
const triangulate = (faces) => faces.flatMap((q) => (q.length === 4 ? [q[0], q[1], q[2], q[0], q[2], q[3]] : q));

// The game rig: MakeHuman's 163 bones are folded onto these 28 (face into the head, twist bones into their parent, the four fingers into two
// bones (knuckle and middle joint), the thumb into one, toes into one).
const SIDES = ['L', 'R'];
const KEEP = ['root', 'spine05', 'spine03', 'spine01', 'neck01', 'head',
  ...SIDES.flatMap((s) => [`clavicle.${s}`, `upperarm01.${s}`, `lowerarm01.${s}`, `wrist.${s}`, `finger1-1.${s}`, `finger3-1.${s}`, `finger3-2.${s}`, `upperleg01.${s}`, `lowerleg01.${s}`, `foot.${s}`, `toe1-1.${s}`])];
const BONE_NAME = { root: 'hips_root', spine05: 'hips', spine03: 'spine', spine01: 'chest', neck01: 'neck', head: 'head' };
const gameName = (mh) => (BONE_NAME[mh] || mh.replace(/^clavicle/, 'shoulder').replace(/^upperarm01/, 'upperarm').replace(/^lowerarm01/, 'forearm').replace(/^wrist/, 'hand')
  .replace(/^finger1-1/, 'thumb').replace(/^finger3-1/, 'fingers').replace(/^finger3-2/, 'fingers2')
  .replace(/^upperleg01/, 'thigh').replace(/^lowerleg01/, 'shin').replace(/^toe1-1/, 'toe')).replace(/\.([LR])$/, '_$1'); // names avoid dots: three.js strips them from node names

function bonePlan(skel, V) {
  const parentOf = (n) => skel.bones[n].parent;
  const collapse = (name) => { // nearest kept bone, walking up the tree
    const side = name.slice(-1);
    if (/^toe/.test(name)) return 'toe1-1.' + side;
    if (/^finger1-/.test(name)) return 'finger1-1.' + side;
    if (/^finger[2-5]-1/.test(name)) return 'finger3-1.' + side;
    if (/^finger[2-5]-[23]/.test(name)) return 'finger3-2.' + side;
    let n = name; while (n && !KEEP.includes(n)) n = parentOf(n); return n || 'root';
  };
  const headOf = (n) => { const idx = skel.joints[skel.bones[n].head]; return [0, 1, 2].map((k) => idx.reduce((a, i) => a + V[i][k], 0) / idx.length); };
  const keepParent = (n) => { let p = parentOf(n); while (p && !KEEP.includes(p)) p = parentOf(p); return p; };
  return { collapse, headOf, keepParent };
}

function bindWeights(wts, collapse) {
  const acc = new Map();
  for (const [bone, list] of Object.entries(wts.weights)) {
    const t = KEEP.indexOf(collapse(bone));
    for (const [v, w] of list) { let m = acc.get(v); if (!m) acc.set(v, m = new Map()); m.set(t, (m.get(t) || 0) + w); }
  }
  const out = new Map(); // vertex -> [[bone, weight] x up to 4], normalised
  for (const [v, m] of acc) { const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4); const s = top.reduce((a, b) => a + b[1], 0); out.set(v, top.map(([b, w]) => [b, w / s])); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Mesh helpers (positions in MakeHuman decimetres until the final write)
function smoothNormals(P, T) { // area-weighted, per vertex index, so shells stay watertight-smooth
  const N = new Float32Array(P.length);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3; const b = T[t + 1] * 3; const c = T[t + 2] * 3;
    const ux = P[b] - P[a]; const uy = P[b + 1] - P[a + 1]; const uz = P[b + 2] - P[a + 2]; const vx = P[c] - P[a]; const vy = P[c + 1] - P[a + 1]; const vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { N[i] += nx; N[i + 1] += ny; N[i + 2] += nz; }
  }
  for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return N;
}
// Cavity term baked into the vertices (armpits, under the chin, between fingers, cloth creases): 1 = open, lower = tucked away.
function cavity(P, N, T) {
  const n = P.length / 3; const sum = new Float32Array(n); const cnt = new Uint16Array(n); const len = new Float32Array(n);
  const edge = (a, b) => { const dx = P[b * 3] - P[a * 3]; const dy = P[b * 3 + 1] - P[a * 3 + 1]; const dz = P[b * 3 + 2] - P[a * 3 + 2]; const l = Math.hypot(dx, dy, dz) || 1;
    sum[a] += (N[a * 3] * dx + N[a * 3 + 1] * dy + N[a * 3 + 2] * dz) / l; cnt[a]++; len[a] += l; };
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = T[t + k]; const b = T[t + ((k + 1) % 3)]; edge(a, b); edge(b, a); }
  return Float32Array.from({ length: n }, (_, i) => { const c = cnt[i] ? sum[i] / cnt[i] : 0; return Math.max(0.45, Math.min(1, 1 - c * 1.1)); });
}

// A standalone shell from triangles of a bigger mesh: compact arrays plus weights.
function makeShell(V, tris, weights) {
  const map = new Map(); const order = [];
  for (const i of tris) if (!map.has(i)) { map.set(i, order.length); order.push(i); }
  const P = new Float32Array(order.length * 3); order.forEach((i, k) => { P[k * 3] = V[i][0]; P[k * 3 + 1] = V[i][1]; P[k * 3 + 2] = V[i][2]; });
  const T = Uint32Array.from(tris, (i) => map.get(i));
  return { P, T, src: order, W: order.map((i) => weights.get(i).map((x) => x.slice())), N: null };
}
function boundaryEdges(T) {
  const seen = new Map();
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = T[t + k]; const b = T[t + ((k + 1) % 3)]; const key = a < b ? a * 1e6 + b : b * 1e6 + a; const e = seen.get(key); if (e) e.n++; else seen.set(key, { a, b, n: 1 }); }
  return [...seen.values()].filter((e) => e.n === 1);
}
function laplacian(sh, iters, lambda, pinned) {
  const n = sh.P.length / 3; const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < sh.T.length; t += 3) for (let k = 0; k < 3; k++) { nb[sh.T[t + k]].add(sh.T[t + ((k + 1) % 3)]); nb[sh.T[t + ((k + 1) % 3)]].add(sh.T[t + k]); }
  const bnd = new Set(boundaryEdges(sh.T).flatMap((e) => [e.a, e.b]));
  for (let it = 0; it < iters; it++) {
    const Q = sh.P.slice();
    for (let i = 0; i < n; i++) { if (bnd.has(i) || (pinned && pinned(i))) continue; const s = nb[i]; if (!s.size) continue; for (let c = 0; c < 3; c++) { let a = 0; for (const j of s) a += sh.P[j * 3 + c]; Q[i * 3 + c] = sh.P[i * 3 + c] + (a / s.size - sh.P[i * 3 + c]) * lambda; } }
    sh.P = Q;
  }
}

async function main() {
  const { MeshoptSimplifier } = await import(pathToFileURL(join(TOOLS, 'node_modules/meshoptimizer/meshopt_simplifier.js')).href).catch(() => fail(`meshoptimizer not found. Run: mkdir -p ${TOOLS} && cd ${TOOLS} && npm init -y && npm install meshoptimizer`));
  await MeshoptSimplifier.ready;
  const { files, manifest } = await fetchSources();
  const { skel, wts } = checkLicences(files);
  const { V, groups } = parseObj(files['makehuman/data/3dobjs/base.obj']);
  if (V.length !== 19158 || !groups.body || !groups['helper-skirt']) fail(`base.obj does not match the advisor's description (vertices ${V.length}, groups ${Object.keys(groups).slice(0, 4)})`);
  const plan = bonePlan(skel, V); const weights = bindWeights(wts, plan.collapse);
  const yFloor = Math.min(...groups.body.flat().map((i) => V[i][1])); // the soles of the body, not the helper vertices below them
  const B = (n) => KEEP.indexOf(n);
  const idxOf = (prefix) => KEEP.map((n, i) => (n.startsWith(prefix) ? i : -1)).filter((i) => i >= 0);
  const GROUP_OF = new Map(); // kept bone index -> body group
  const setG = (g, ...bones) => bones.forEach((b) => GROUP_OF.set(b, g));
  setG('head', B('head'), B('neck01')); setG('torso', B('root'), B('spine05'), B('spine03'), B('spine01'), ...idxOf('clavicle')); setG('armup', ...idxOf('upperarm01'));
  setG('hands', ...idxOf('lowerarm01'), ...idxOf('wrist'), ...idxOf('finger')); setG('thigh', ...idxOf('upperleg01')); setG('shin', ...idxOf('lowerleg01')); setG('foot', ...idxOf('foot'), ...idxOf('toe'));
  const GROUPS = Object.keys(BODY_TARGET);
  const dom = (v) => weights.get(v)[0][0];
  const SPINE = ['root', 'spine05', 'spine03', 'spine01'].map(B).concat(idxOf('clavicle')); const HIPS = B('spine05');

  // ---------------- body shell ----------------
  const bodyTris = triangulate(groups.body); const body = makeShell(V, bodyTris, weights);
  body.N = smoothNormals(body.P, body.T);
  const bodySrcDom = body.src.map((v) => dom(v)); // dominant bone of each shell vertex (shell index -> bone)
  body.AO = cavity(body.P, body.N, body.T);

  // ---------------- garments cut from the body triangles ----------------
  const pickTris = (test) => { const out = []; for (let t = 0; t < bodyTris.length; t += 3) if (test(bodyTris[t]) && test(bodyTris[t + 1]) && test(bodyTris[t + 2])) out.push(bodyTris[t], bodyTris[t + 1], bodyTris[t + 2]); return out; };
  const shellOffset = (sh, d, fn) => { for (let k = 0; k < sh.P.length / 3; k++) { const dd = fn ? fn(k) : d; for (let c = 0; c < 3; c++) sh.P[k * 3 + c] += sh.N[k * 3 + c] * dd; } };
  const armHead = plan.headOf('upperarm01.L'); const elbow = plan.headOf('lowerarm01.L');
  const armLen = Math.hypot(elbow[0] - armHead[0], elbow[1] - armHead[1], elbow[2] - armHead[2]);
  const armT = (v) => { // 0 at the shoulder joint, 1 at the elbow, along the upper arm (left side; right mirrored)
    const x = Math.abs(V[v][0]); return ((x - Math.abs(armHead[0])) * (Math.abs(elbow[0]) - Math.abs(armHead[0])) + (V[v][1] - armHead[1]) * (elbow[1] - armHead[1]) + (V[v][2] - armHead[2]) * (elbow[2] - armHead[2])) / (armLen * armLen);
  };
  const upperArmBones = idxOf('upperarm01'); const armBonesAny = idxOf('upperarm01'); void armBonesAny;
  const torsoSet = new Set(SPINE); const shells = {};
  // Clean cut lines: border vertices of a garment are snapped to exact heights (hems, necklines, belt edges) or onto the plane across the sleeve,
  // so the reduced mesh has straight edges instead of the stair-steps of the original rows.
  const squareBorders = (sh, levels, tol = 0.6) => { const bv = new Set(boundaryEdges(sh.T).flatMap((e) => [e.a, e.b])); for (const v of bv) { const y = sh.P[v * 3 + 1]; let best = null; for (const l of levels) if (Math.abs(y - l) < tol && (best === null || Math.abs(y - l) < Math.abs(y - best))) best = l; if (best !== null) sh.P[v * 3 + 1] = best; } };
  const cutSleeves = (sh, t0) => { const bv = new Set(boundaryEdges(sh.T).flatMap((e) => [e.a, e.b])); const ax = [elbow[0] - armHead[0], elbow[1] - armHead[1], elbow[2] - armHead[2]]; for (const v of bv) { const src = sh.src[v]; if (!upperArmBones.includes(dom(src))) continue; const t = armT(src); if (t < 0.25) continue; const sgn = Math.sign(V[src][0]) || 1; const d = (t0 - t) * armLen; const l = armLen; sh.P[v * 3] += sgn * (ax[0] / l) * d * (Math.abs(ax[0]) / (Math.abs(ax[0]) || 1)); sh.P[v * 3 + 1] += (ax[1] / l) * d; sh.P[v * 3 + 2] += (ax[2] / l) * d; } };
  const mkShell = (name, tris, offset, slot, opts = {}) => {
    const sh = makeShell(V, tris, weights); if (opts.cutSleeves) cutSleeves(sh, opts.cutSleeves); if (opts.square) squareBorders(sh, opts.square); sh.N = smoothNormals(sh.P, sh.T); sh.AO = cavity(sh.P, sh.N, sh.T); sh.slot = slot; sh.name = name;
    if (opts.hem) hemExtension(sh, opts.hem);
    if (opts.laplace) laplacian(sh, opts.laplace[0], opts.laplace[1]);
    if (opts.laplace) sh.N = smoothNormals(sh.P, sh.T);
    shellOffset(sh, offset, opts.offsetFn && ((k) => opts.offsetFn(sh, k)));
    if (opts.laplace || opts.hem) sh.N = smoothNormals(sh.P, sh.T);
    sh.uv = opts.uv; sh.target = GARMENT_TARGET[name]; sh.keepBorder = opts.keepBorder ?? true; shells[name] = sh; return sh;
  };
  // hem: extrude the open lower edge of a torso shell downward and a little outward, weights moved to the hips only (so the tail does not follow the thighs)
  function hemExtension(sh, { below, drop, flare }) {
    const edges = boundaryEdges(sh.T).filter((e) => sh.P[e.a * 3 + 1] < below && sh.P[e.b * 3 + 1] < below);
    const mapNew = new Map(); const addV = (i) => { if (mapNew.has(i)) return mapNew.get(i); const k = sh.P.length / 3; const x = sh.P[i * 3]; const z = sh.P[i * 3 + 2]; const l = Math.hypot(x, z) || 1;
      const P = new Float32Array(sh.P.length + 3); P.set(sh.P); P[k * 3] = x + (x / l) * flare; P[k * 3 + 1] = sh.P[i * 3 + 1] - drop; P[k * 3 + 2] = z + (z / l) * flare; sh.P = P;
      const N = new Float32Array(sh.N.length + 3); N.set(sh.N); N[k * 3] = sh.N[i * 3]; N[k * 3 + 1] = 0; N[k * 3 + 2] = sh.N[i * 3 + 2]; sh.N = N; sh.W.push([[HIPS, 1]]); sh.src.push(sh.src[i]);
      const A = new Float32Array(sh.AO.length + 1); A.set(sh.AO); A[k] = Math.min(sh.AO[i], 0.8); sh.AO = A; mapNew.set(i, k); return k; };
    const hemLevel = Math.min(...[...edges].map((e) => Math.min(sh.P[e.a * 3 + 1], sh.P[e.b * 3 + 1]))) - drop * 0.5;
    const extra = [];
    for (const e of edges) { const a2 = addV(e.a); const b2 = addV(e.b); extra.push(e.a, e.b, b2, e.a, b2, a2); }
    for (const [, k] of mapNew) sh.P[k * 3 + 1] = hemLevel; // one clean hem line
    const T = new Uint32Array(sh.T.length + extra.length); T.set(sh.T); T.set(extra, sh.T.length); sh.T = T;
    for (let k = 0; k < sh.W.length; k++) if (!mapNew.size || k < sh.W.length) { /* original weights stay */ }
  }
  // tunic: torso and short sleeves, hem tail to mid thigh
  const inTunic = (v) => { const y = V[v][1]; const d = dom(v); if (torsoSet.has(d)) return y > -0.35 && y < 5.98; if (upperArmBones.includes(d)) return armT(v) < 0.5 && y < 5.98; return false; };
  mkShell('tunic', pickTris(inTunic), 0.1, 1, { hem: { below: -0.1, drop: 1.25, flare: 0.28 }, uv: 'tunic', cutSleeves: 0.45, square: [5.9] });
  // sash: waist band
  mkShell('sash', pickTris((v) => torsoSet.has(dom(v)) && V[v][1] > 0.75 && V[v][1] < 1.5), 0.24, 5, { uv: 'sash', square: [0.78, 1.48], });
  mkShell('cuirass', pickTris((v) => torsoSet.has(dom(v)) && V[v][1] > 1.45 && V[v][1] < 5.1), 0.3, 4, { uv: 'cuirass', square: [1.5, 5.05] });
  // shoes: leather shoes with a collar, built as lofted sections around the foot (the base mesh's toes are too fine to cover cleanly)
  const makeShoes = () => {
    const SEC = [[-0.72, 0.42, 0.75], [-0.5, 0.56, 1.25], [0.0, 0.62, 1.4], [0.6, 0.62, 1.0], [1.1, 0.6, 0.72], [1.6, 0.54, 0.5], [2.0, 0.4, 0.38], [2.28, 0.15, 0.25]]; const NR = 8; const sole = yFloorBody - 0.1;
    const P = []; const Wt = []; const T = [];
    for (const side of SIDES) {
      const sx = side === 'L' ? 1 : -1; const xc = sx * 2.22; const foot = B('foot.' + side); const toe = B('toe1-1.' + side); const shin = B('lowerleg01.' + side); const base0 = P.length / 3;
      SEC.forEach(([z, hw, h]) => {
        for (let k = 0; k < NR; k++) { const a = (k / NR) * Math.PI * 2; const x = xc + Math.cos(a) * hw * sx; const flat = Math.sin(a) < 0 ? 0.25 : 1; const y = sole + (h / 2) * (1 + Math.sin(a) * flat) + (Math.sin(a) < 0 ? 0 : 0); P.push(x, y, z);
          const tz = Math.max(0, Math.min(1, (z - 1.2) / 0.7)); const hi = y > sole + 1.0 ? 0.4 : 0; const w = []; if (tz > 0) w.push([toe, tz]); w.push([foot, 1 - tz - hi > 0 ? 1 - tz - hi : 0.05]); if (hi > 0) w.push([shin, hi]); const sum = w.reduce((q, e) => q + e[1], 0); Wt.push(w.map(([b, q]) => [b, q / sum])); }
      });
      for (let j = 0; j < SEC.length - 1; j++) for (let k = 0; k < NR; k++) { const a = base0 + j * NR + k; const b = base0 + j * NR + ((k + 1) % NR); const c = base0 + (j + 1) * NR + k; const d = base0 + (j + 1) * NR + ((k + 1) % NR); if (sx > 0) T.push(a, b, c, b, d, c); else T.push(a, c, b, b, c, d); }
      for (const [j, flip] of [[0, true], [SEC.length - 1, false]]) { const c = P.length / 3; const mid = SEC[j]; P.push(xc, sole + mid[2] * 0.5, mid[0]); Wt.push([[foot, 1]]); for (let k = 0; k < NR; k++) { const a = base0 + j * NR + k; const b = base0 + j * NR + ((k + 1) % NR); if (flip === (sx > 0)) T.push(c, b, a); else T.push(c, a, b); } }
    }
    const sh = { P: Float32Array.from(P), T: Uint32Array.from(T), W: Wt, src: Wt.map((_, i) => i) }; sh.N = smoothNormals(sh.P, sh.T); sh.AO = Float32Array.from({ length: P.length / 3 }, (_, i) => 0.85 + 0.15 * Math.min(1, (P[i * 3 + 1] - sole) / 0.8));
    shellOffset(sh, 0.0); sh.slot = 3; sh.name = 'shoes'; sh.uv = 'shoe'; sh.target = 400; sh.keepBorder = true; shells.shoes = sh;
  };
  const yFloorBody = Math.min(...groups.body.flat().map((i) => V[i][1]));
  makeShoes();

  // dhoti: MakeHuman's skirt helper, weights blended toward the hips and the two thighs below the waist so the hem does not stretch between the legs
  const skirtAll = triangulate(groups['helper-skirt']);
  const dhotiShell = (name, cutY) => {
    const keep = []; for (let t = 0; t < skirtAll.length; t += 3) if ([0, 1, 2].every((k) => V[skirtAll[t + k]][1] > cutY)) keep.push(skirtAll[t], skirtAll[t + 1], skirtAll[t + 2]);
    const sh = makeShell(V, keep, weights); sh.N = smoothNormals(sh.P, sh.T);
    const seen = boundaryEdges(sh.T); const hemV = new Set(); for (const e of seen) for (const v of [e.a, e.b]) if (sh.P[v * 3 + 1] < cutY + 1.5) hemV.add(v);
    for (const v of hemV) sh.P[v * 3 + 1] = cutY; // square off the hem
    const thighL = B('upperleg01.L'); const thighR = B('upperleg01.R');
    for (let k = 0; k < sh.P.length / 3; k++) {
      const y = sh.P[k * 3 + 1]; const x = sh.P[k * 3]; const t = Math.max(0, Math.min(1, (0.15 - y) / 2.0)); if (t <= 0) continue;
      const sL = 0.5 + 0.5 * Math.max(-1, Math.min(1, x / 1.1)); const blend = [[HIPS, 0.5], [thighL, 0.5 * sL], [thighR, 0.5 * (1 - sL)]];
      const m = new Map(); for (const [b, w] of sh.W[k]) m.set(b, (m.get(b) || 0) + w * (1 - t)); for (const [b, w] of blend) m.set(b, (m.get(b) || 0) + w * t);
      sh.W[k] = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b, w]) => [b, w]); const s = sh.W[k].reduce((a, b) => a + b[1], 0); sh.W[k].forEach((e) => { e[1] /= s; });
    }
    sh.AO = cavity(sh.P, sh.N, sh.T); sh.slot = 2; sh.name = name; sh.uv = 'dhoti'; sh.target = GARMENT_TARGET[name]; sh.keepBorder = true; shells[name] = sh;
  };
  dhotiShell('dhoti', -5.0); dhotiShell('dhotiLong', -7.1);
  // keep the dhoti's waist under the tunic: pull the top rows in toward the body a little
  for (const nm of ['dhoti', 'dhotiLong']) { const sh = shells[nm]; for (let k = 0; k < sh.P.length / 3; k++) { const y = sh.P[k * 3 + 1]; if (y > -0.2) { const f = Math.min(1, (y + 0.2) / 1.4) * 0.12; sh.P[k * 3] *= 1 - f; sh.P[k * 3 + 2] *= 1 - f; } } }

  // ---------------- reduce everything ----------------
  const reduceOnce = (sh, lock, targetTris, lockBorder) => {
    const n = sh.P.length / 3; const A = new Float32Array(n * 3); for (let k = 0; k < n * 3; k++) A[k] = sh.N[k];
    const flags = lockBorder ? ['LockBorder'] : [];
    return MeshoptSimplifier.simplifyWithAttributes(sh.T, sh.P, 3, A, 3, [0.4, 0.4, 0.4], lock, Math.max(3, targetTris) * 3, 1.0, flags)[0];
  };
  const triGroup = (T, t, vdom) => { const g = [0, 1, 2].map((k) => GROUP_OF.get(vdom[T[t + k]])); return g[0] === g[1] || g[0] === g[2] ? g[0] : g[1] === g[2] ? g[1] : g[0]; };
  const vgroup = bodySrcDom.map((d) => GROUP_OF.get(d));
  let bodyIdx = body.T;
  for (const g of GROUPS) { // one group at a time: everything outside the group is locked
    const lock = Uint8Array.from(vgroup, (vg) => (vg === g ? 0 : 1));
    let cur = 0; for (let t = 0; t < bodyIdx.length; t += 3) if (triGroup(bodyIdx, t, bodySrcDom) === g) cur++;
    const total = bodyIdx.length / 3; const target = total - cur + BODY_TARGET[g];
    bodyIdx = reduceOnce({ P: body.P, N: body.N, T: bodyIdx }, lock, target, true);
  }
  const finish = (sh, idx, extra = {}) => { // compact to used vertices, in order of first use
    const used = new Map(); const keep = []; for (const i of idx) if (!used.has(i)) { used.set(i, keep.length); keep.push(i); }
    const P = new Float32Array(keep.length * 3); const N = new Float32Array(keep.length * 3);
    keep.forEach((i, k) => { for (let c = 0; c < 3; c++) { P[k * 3 + c] = sh.P[i * 3 + c]; N[k * 3 + c] = sh.N[i * 3 + c]; } });
    return { ...sh, P, N, T: Uint32Array.from(idx, (i) => used.get(i)), W: keep.map((i) => sh.W[i]), AO: Float32Array.from(keep, (i) => sh.AO[i]), dom: keep.map((i) => sh.W[i][0][0]), ...extra };
  };
  const rb = finish(body, bodyIdx, { slot: 0, name: 'body' });
  const parts = [{ sh: rb, name: 'body' }];
  for (const [name, sh] of Object.entries(shells)) {
    const lock = new Uint8Array(sh.P.length / 3);
    const idx = sh.T.length / 3 <= sh.target ? sh.T : reduceOnce(sh, lock, sh.target, sh.keepBorder); parts.push({ sh: finish(sh, idx, { slot: sh.slot, name, uv: sh.uv }), name });
  }
  console.log('triangles: ' + parts.map((p) => `${p.name} ${p.sh.T.length / 3}`).join(', '));

  // ---------------- body groups: sort triangles by group so a variant can drop covered skin ----------------
  const SORT_GROUPS = [...GROUPS, 'torsoTop']; const bodyGroups = {}; { const byG = {}; for (const g of SORT_GROUPS) byG[g] = []; for (let t = 0; t < rb.T.length; t += 3) { let g = triGroup(rb.T, t, rb.dom); if (g === 'torso' && Math.max(rb.P[rb.T[t] * 3 + 1], rb.P[rb.T[t + 1] * 3 + 1], rb.P[rb.T[t + 2] * 3 + 1]) > 5.3) g = 'torsoTop'; byG[g].push(rb.T[t], rb.T[t + 1], rb.T[t + 2]); } let o = 0; const T2 = []; for (const g of SORT_GROUPS) { bodyGroups[g] = [o, byG[g].length]; T2.push(...byG[g]); o += byG[g].length; } rb.T = Uint32Array.from(T2); }

  // ---------------- merge into one vertex buffer ----------------
  const nv = parts.reduce((a, p) => a + p.sh.P.length / 3, 0); const ni = parts.reduce((a, p) => a + p.sh.T.length, 0);
  const pos = new Float32Array(nv * 3); const nor = new Int8Array(nv * 4); const uvs = new Uint16Array(nv * 2); const paint = new Uint8Array(nv * 4); const jnt = new Uint8Array(nv * 4); const wgt = new Uint8Array(nv * 4); const idx = new Uint16Array(ni);
  const HEADB = B('head'); const shellTable = {}; let vo = 0; let io = 0;
  const CELL = { skin: [2, 0], tunic: [3, 0], dhoti: [0, 2], leather: [1, 2], metal: [2, 2], sash: [3, 2], hair: [2, 1], cloth2: [3, 1] }; // cells of the 4 x 4 painted atlas; the face uses the 2 x 2 block at 0,0
  const SLOT_CELL = { 0: 'skin', 1: 'tunic', 2: 'dhoti', 3: 'leather', 4: 'metal', 5: 'sash' };
  const FACE = { x0: -0.98, x1: 0.98, y0: 5.8, y1: 8.6 };
  const arm = (x, y, z) => { // sleeve: angle around the arm axis, distance along it
    const ax = Math.sign(x) * (elbow[0] - armHead[0]) / armLen; void ax; const dx = Math.abs(x) - Math.abs(armHead[0]); const dy = y - armHead[1];
    const along = Math.max(0, Math.min(1, (dx * Math.abs(elbow[0] - armHead[0]) + dy * (elbow[1] - armHead[1])) / (armLen * armLen))); return [along, Math.atan2(z - armHead[2], dy * 0.3 + dx * 0.3)];
  };
  const uvOf = (p, x, y, z) => { // returns [u, v] in the whole atlas (v down), inset a little inside the cell
    const frac = (a, b, cell) => { const [cx, cy] = cell; return [(cx + 0.03 + 0.94 * a) / 4, (cy + 0.03 + 0.94 * b) / 4]; };
    const cyl = (cx0, cx1) => Math.max(0, Math.min(1, (Math.atan2(x, z) / (2 * Math.PI) + 0.5 - cx0) / (cx1 - cx0)));
    const hy = (y0, y1) => Math.max(0, Math.min(1, 1 - (y - y0) / (y1 - y0)));
    if (p.slot === 0 && p.name === 'body' && p.headVert) { const a = Math.max(0, Math.min(1, (x - FACE.x0) / (FACE.x1 - FACE.x0))); const b = Math.max(0, Math.min(1, (FACE.y1 - y) / (FACE.y1 - FACE.y0))); const [cx, cy] = [0, 0]; return [(cx + 0.015 + 1.97 * a) / 4, (cy + 0.015 + 1.97 * b) / 4]; }
    switch (p.uv || 'skin') {
      case 'tunic': {
        if (Math.abs(x) > Math.abs(armHead[0]) - 0.1 && y < 5.4) { const [along, ang] = arm(x, y, z); return frac(Math.max(0, Math.min(1, ang / (2 * Math.PI) + 0.5)), 0.5 + along * 0.38, CELL.tunic); } // sleeves map to the lower half, cuff at the end
        return frac(cyl(0, 1), hy(-2.4, 5.7), CELL.tunic);
      }
      case 'dhoti': return frac(cyl(0, 1), hy(p.name === 'dhotiLong' ? -7.2 : -5.1, 1.4), CELL.dhoti);
      case 'cuirass': return frac(cyl(0, 1), hy(1.3, 5.2), CELL.metal);
      case 'sash': return frac(cyl(0, 1), hy(0.7, 1.6), CELL.sash);
      case 'band': return frac(Math.max(0, Math.min(1, (x * 0.5 + (y - 3) * 0.28 + 0.5))), Math.max(0, Math.min(1, 0.5 + (y - (3.0 + 1.85 * x)) / 0.9)), CELL.sash);
      case 'shoe': return frac(Math.max(0, Math.min(1, 0.5 + (z - (-0.3)) / 3.2)), Math.max(0, Math.min(1, 1 - (y + 8.5) / 1.5)), CELL.leather);
      default: return frac(cyl(0, 1), hy(-8.5, 8.6), CELL.skin);
    }
  };
  // Arms 20% longer (MakeHuman's arms total only 0.447 m shoulder to wrist; a real arm is about 25% longer, and two-handed grips need the reach): positions along the
  // shoulder-to-wrist axis scale by ARM_K up to the wrist and the hand moves rigidly. Weighted by how much of a vertex belongs to the arm chain, so the shoulder blends into the torso.
  const armSet = new Set([...idxOf('upperarm01'), ...idxOf('lowerarm01'), ...idxOf('wrist'), ...idxOf('finger')]);
  const armAxis = {}; for (const sd of SIDES) { const S = plan.headOf('upperarm01.' + sd); const Wr = plan.headOf('wrist.' + sd); const d = [Wr[0] - S[0], Wr[1] - S[1], Wr[2] - S[2]]; const L = Math.hypot(...d); armAxis[sd] = { S, u: d.map((v) => v / L), L }; }
  const armShift = (p, sd, w) => { const { S, u, L } = armAxis[sd]; const sPar = (p[0] - S[0]) * u[0] + (p[1] - S[1]) * u[1] + (p[2] - S[2]) * u[2]; const m = (ARM_K - 1) * Math.max(0, Math.min(sPar, L)) * w; return [p[0] + u[0] * m, p[1] + u[1] * m, p[2] + u[2] * m]; };
  for (const { sh, name } of parts) {
    const n = sh.P.length / 3; const isBody = name === 'body'; const start = io;
    for (let k = 0; k < n; k++) {
      const o = vo + k; const x = sh.P[k * 3]; const y = sh.P[k * 3 + 1]; const z = sh.P[k * 3 + 2];
      const aw = sh.W[k].reduce((a, [b, w]) => a + (armSet.has(b) ? w : 0), 0); const [px, py, pz] = aw > 0 ? armShift([x, y, z], x > 0 ? 'L' : 'R', aw) : [x, y, z];
      pos[o * 3] = Math.round(px / 10 * 2048) / 2048; pos[o * 3 + 1] = Math.round((py - yFloor) / 10 * 2048) / 2048; pos[o * 3 + 2] = Math.round(pz / 10 * 2048) / 2048;
      for (let c = 0; c < 3; c++) nor[o * 4 + c] = Math.round(Math.max(-1, Math.min(1, sh.N[k * 3 + c])) * 127);
      const headVert = isBody && GROUP_OF.get(sh.dom[k]) === 'head';
      const [u, v] = uvOf({ slot: sh.slot, name, uv: sh.uv, headVert }, x, y, z); uvs[o * 2] = Math.round(u * 65535); uvs[o * 2 + 1] = Math.round(v * 65535);
      { const f = headVert ? Math.max(0, Math.min(1, Math.max((0.9 - z) / 0.3, (Math.abs(x) - 0.5) / 0.25, (6.3 - y) / 0.3, (y - 7.7) / 0.3))) : 1; paint[o * 4] = Math.round(255 * (headVert ? 0.45 + 0.55 * f : 1)); paint[o * 4 + 1] = Math.round(255 * sh.AO[k]); }
      const ws = sh.W[k]; const q = ws.map(([, w]) => Math.round(w * 255)); const big = q.indexOf(Math.max(...q)); q[big] += 255 - q.reduce((a, b) => a + b, 0);
      ws.forEach(([b], c) => { jnt[o * 4 + c] = b; wgt[o * 4 + c] = q[c]; });
    }
    for (let t = 0; t < sh.T.length; t++) idx[io + t] = sh.T[t] + vo;
    shellTable[name] = { first: start, count: sh.T.length, tris: sh.T.length / 3, vertices: [vo, n] };
    vo += n; io += sh.T.length;
  }
  const bodyStart = shellTable.body.first; const groupsOut = {}; for (const g of SORT_GROUPS) groupsOut[g] = { first: bodyStart + bodyGroups[g][0], count: bodyGroups[g][1] };

  // ---------------- head frame for the run-time hair and headgear (metres, model space) ----------------
  const hv = []; for (let k = 0; k < rb.P.length / 3; k++) if (GROUP_OF.get(rb.dom[k]) === 'head' && rb.P[k * 3 + 1] > 6.1) hv.push(k);
  const bb = (a) => ({ min: Math.min(...a), max: Math.max(...a) });
  const hx = bb(hv.map((k) => rb.P[k * 3])); const hyb = bb(hv.map((k) => rb.P[k * 3 + 1])); const hz = bb(hv.map((k) => rb.P[k * 3 + 2]));
  const m = (v) => +(v / 10).toFixed(4); const my = (v) => +((v - yFloor) / 10).toFixed(4);
  const headFrame = { top: my(hyb.max), chin: my(6.15), eye: my(7.27), brow: my(7.55), mouth: my(6.45), nose: my(6.85), cx: 0, rx: m((hx.max - hx.min) / 2), zBack: m(hz.min), zFront: m(hz.max), earY: my(7.0), faceCell: { ...FACE, unit: 'dm in the base mesh, y raw' } };

  // ---------------- skeleton ----------------
  const bones = KEEP.map((mh) => { let h = plan.headOf(mh); if (/^(upperarm01|lowerarm01|wrist|finger)/.test(mh)) h = armShift(h, mh.slice(-1), 1); return { mh, name: gameName(mh), world: [h[0] / 10, (h[1] - yFloor) / 10, h[2] / 10], parent: plan.keepParent(mh) }; });
  writeGlb({ bones, pos, nor, uvs, paint, jnt, wgt, idx, manifest, extras: { shells: shellTable, groups: groupsOut, head: headFrame, cells: CELL, slotCell: SLOT_CELL, atlasCells: 4, floorDm: +yFloor.toFixed(4), note: 'Index table for variants: a human is the body groups it shows plus the garment shells it wears. Positions are rounded to 1/2048 m.' } });
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(CACHE, 'LICENSE.md'), join(OUT, 'makehuman-LICENSE.md')); copyFileSync(join(CACHE, 'LICENSE.ASSETS.md'), join(OUT, 'makehuman-LICENSE.ASSETS.md'));
  writeFileSync(PIN_FILE, JSON.stringify({ note: 'Pinned sources for tools/build-hero.mjs. Fetched from GitHub raw master; the build stops if a hash changes.', files: manifest }, null, 1) + '\n');
  const glb = readFileSync(join(OUT, 'hero.glb'));
  console.log(`bones ${bones.length}, triangles ${ni / 3} in ${Object.keys(shellTable).length} shells, vertices ${nv}`);
  console.log(`hero.glb ${glb.length} bytes, ${gzipSync(glb).length} bytes gzipped`);
}

// ---------------------------------------------------------------------------------------------------------------------
function writeGlb(d) {
  const chunks = []; const views = []; const accessors = []; let off = 0;
  const add = (arr, extra = {}, target = 34962) => { // one bufferView + one accessor
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (bytes.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, ...(extra.stride ? { byteStride: extra.stride } : {}), ...(target ? { target } : {}) });
    chunks.push(bytes, Buffer.alloc(pad)); off += bytes.length + pad;
    accessors.push({ bufferView: views.length - 1, componentType: extra.ct, count: extra.count, type: extra.type, ...(extra.normalized ? { normalized: true } : {}), ...(extra.min ? { min: extra.min, max: extra.max } : {}) });
    return accessors.length - 1;
  };
  const bbox = (p) => { const a = [1e9, 1e9, 1e9]; const b = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { a[k] = Math.min(a[k], p[i + k]); b[k] = Math.max(b[k], p[i + k]); } return [a, b]; };
  const nv = d.pos.length / 3; const [mn, mx] = bbox(d.pos);
  const ibm = new Float32Array(d.bones.length * 16); d.bones.forEach((b, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.world[0], -b.world[1], -b.world[2], 1], i * 16); });
  const aIbm = add(ibm, { ct: 5126, count: d.bones.length, type: 'MAT4' }, null);
  const A = {
    POSITION: add(d.pos, { ct: 5126, count: nv, type: 'VEC3', min: mn, max: mx }),
    NORMAL: add(d.nor, { ct: 5120, count: nv, type: 'VEC3', normalized: true, stride: 4 }),
    TEXCOORD_0: add(d.uvs, { ct: 5123, count: nv, type: 'VEC2', normalized: true, stride: 4 }),
    JOINTS_0: add(d.jnt, { ct: 5121, count: nv, type: 'VEC4' }),
    WEIGHTS_0: add(d.wgt, { ct: 5121, count: nv, type: 'VEC4', normalized: true }),
    _PAINT: add(d.paint, { ct: 5121, count: nv, type: 'VEC2', normalized: true, stride: 4 }), // x: ink thickness factor, y: cavity (1 open .. 0.45 tucked)
  };
  const aIdx = add(d.idx, { ct: 5123, count: d.idx.length, type: 'SCALAR' }, 34963);
  const boneNode = (i) => 1 + i; const nb = d.bones.length;
  const nodes = [{ name: 'Hero', children: [1, nb + 1] }];
  d.bones.forEach((b, i) => { const p = b.parent ? d.bones.find((q) => q.mh === b.parent) : null; const t = p ? b.world.map((v, k) => +(v - p.world[k]).toFixed(5)) : b.world.map((v) => +v.toFixed(5)); nodes.push({ name: b.name, translation: t, ...(d.bones.some((c) => c.parent === b.mh) ? { children: d.bones.map((c, j) => (c.parent === b.mh ? boneNode(j) : -1)).filter((j) => j >= 0) } : {}) }); });
  nodes.push({ name: 'human', mesh: 0, skin: 0 });
  const json = {
    asset: { version: '2.0', generator: 'dharmastra tools/build-hero.mjs', extras: { source: 'MakeHuman hm08 base mesh, default rig and weights (CC0 1.0)', sources: d.manifest, ...d.extras } },
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes,
    skins: [{ joints: d.bones.map((_, i) => boneNode(i)), inverseBindMatrices: aIbm, skeleton: 1 }],
    meshes: [{ name: 'human', primitives: [{ attributes: A, indices: aIdx, material: 0 }] }],
    materials: [{ name: 'toon', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    accessors, bufferViews: views, buffers: [{ byteLength: off }],
  };
  const j = Buffer.from(JSON.stringify(json)); const jp = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]); const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jp.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jp.length, 0); jh.write('JSON', 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
  mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'hero.glb'), Buffer.concat([head, jh, jp, bh, bin]));
}

main().catch((e) => { console.error(e); process.exit(1); });
