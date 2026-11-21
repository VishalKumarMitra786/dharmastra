// Builds assets/characters/hero.glb from the CC0 MakeHuman hm08 base mesh, skeleton and bone weights. No Blender.
// Run: node tools/build-hero.mjs            (needs `npm install meshoptimizer` in a scratch dir, default /tmp/hero-tools)
//   HERO_TOOLS=/path/to/scratch  HERO_CACHE=/path/to/download/cache  node tools/build-hero.mjs
// Steps: download (sha256 pinned) -> licence check -> bind weights to ~22 game bones -> drop the nude base to one
// body shell + a skirt shell (the dhoti) + a hair cap -> reduce with meshoptimizer -> add a face patch for a painted
// face -> write one skinned GLB (quantised normals, weights and UVs; no compression library needed to load it).
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
const BUDGET = { rest: 2200, head: 1100, skirt: 420, hair: 280 }; // target triangles: body below the chin, the head, the dhoti, the hair cap (the whole hero must stay under 5,000)
const HEAD_Y = 6.15; // dm in the base mesh: chin level; everything above is "head" and gets its own budget so the face keeps its shape

// Pinned so the build is reproducible: if upstream changes, the build stops and a person re-checks the licence.
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

// The game rig: MakeHuman's 163 bones are folded onto these 22 (fingers into the wrist, face into the head, twist bones into their parent).
const KEEP = ['root', 'spine05', 'spine03', 'spine01', 'neck01', 'head',
  ...['L', 'R'].flatMap((s) => [`clavicle.${s}`, `upperarm01.${s}`, `lowerarm01.${s}`, `wrist.${s}`, `upperleg01.${s}`, `lowerleg01.${s}`, `foot.${s}`, `toe1-1.${s}`])];
const BONE_NAME = { root: 'hips_root', spine05: 'hips', spine03: 'spine', spine01: 'chest', neck01: 'neck', head: 'head' };
const gameName = (mh) => (BONE_NAME[mh] || mh.replace(/^clavicle/, 'shoulder').replace(/^upperarm01/, 'upperarm').replace(/^lowerarm01/, 'forearm').replace(/^wrist/, 'hand')
  .replace(/^upperleg01/, 'thigh').replace(/^lowerleg01/, 'shin').replace(/^toe1-1/, 'toe')).replace(/\.([LR])$/, '_$1'); // names avoid dots: three.js strips them from node names

function bonePlan(skel, V) {
  const parentOf = (n) => skel.bones[n].parent;
  const collapse = (name) => { // nearest kept bone, walking up the tree
    if (/^toe/.test(name)) return 'toe1-1.' + name.slice(-1);
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

// Build a standalone shell from original vertex ids and triangles: compact arrays, weights, normals.
function makeShell(V, ids, tris, weights) {
  const map = new Map(); const order = [];
  for (const i of tris) if (!map.has(i)) { map.set(i, order.length); order.push(i); }
  const P = new Float32Array(order.length * 3); order.forEach((i, k) => { P[k * 3] = V[i][0]; P[k * 3 + 1] = V[i][1]; P[k * 3 + 2] = V[i][2]; });
  const T = Uint32Array.from(tris, (i) => map.get(i));
  return { P, T, src: order, W: order.map((i) => weights.get(i)), N: null };
}

async function main() {
  const { MeshoptSimplifier } = await import(pathToFileURL(join(TOOLS, 'node_modules/meshoptimizer/meshopt_simplifier.js')).href).catch(() => fail(`meshoptimizer not found. Run: mkdir -p ${TOOLS} && cd ${TOOLS} && npm init -y && npm install meshoptimizer`));
  await MeshoptSimplifier.ready;
  const { files, manifest } = await fetchSources();
  const { skel, wts } = checkLicences(files);
  const { V, groups } = parseObj(files['makehuman/data/3dobjs/base.obj']);
  if (V.length !== 19158 || !groups.body || !groups['helper-skirt']) fail(`base.obj does not match the advisor's description (vertices ${V.length}, groups ${Object.keys(groups).slice(0, 4)})`);
  const plan = bonePlan(skel, V); const weights = bindWeights(wts, plan.collapse);
  const dominant = (v) => weights.get(v)[0][0];

  // ---- shells ----
  const bodyTris = triangulate(groups.body); const body = makeShell(V, null, bodyTris, weights);
  // the dhoti: MakeHuman's skirt helper, cut off just below the knee so the shins and feet stay visible when walking
  const skirtTris = triangulate(groups['helper-skirt']); const keepSkirt = [];
  for (let t = 0; t < skirtTris.length; t += 3) if ([0, 1, 2].every((k) => V[skirtTris[t + k]][1] > -5.0)) keepSkirt.push(skirtTris[t], skirtTris[t + 1], skirtTris[t + 2]);
  const skirt = makeShell(V, null, keepSkirt, weights);
  { // square off the cut: the ring of vertices along the new hem is moved to one height so the hem is a clean line
    const seen = new Map(); for (let t = 0; t < skirt.T.length; t += 3) for (let k = 0; k < 3; k++) { const a = skirt.T[t + k]; const b = skirt.T[t + ((k + 1) % 3)]; const key = a < b ? a * 1e6 + b : b * 1e6 + a; seen.set(key, (seen.get(key) || 0) + 1); }
    for (const [key, c] of seen) if (c === 1) for (const v of [Math.floor(key / 1e6), key % 1e6]) if (skirt.P[v * 3 + 1] < -3) skirt.P[v * 3 + 1] = -5.0;
  }
  body.N = smoothNormals(body.P, body.T); skirt.N = smoothNormals(skirt.P, skirt.T);

  // hair: the skull part of the body (above the ears and behind the hairline), pushed out 1-2 cm
  const HEAD = KEEP.indexOf('head');
  const inHair = (k) => { const y = body.P[k * 3 + 1]; const z = body.P[k * 3 + 2]; return body.W[k][0][0] === HEAD && y > 6.55 && (y > 7.7 || z < 0.45); };
  const hairTris = []; for (let t = 0; t < body.T.length; t += 3) if (inHair(body.T[t]) && inHair(body.T[t + 1]) && inHair(body.T[t + 2])) hairTris.push(body.T[t], body.T[t + 1], body.T[t + 2]);
  const bodyV = [...Array(body.P.length / 3)].map((_, k) => [body.P[k * 3], body.P[k * 3 + 1], body.P[k * 3 + 2]]);
  const hair = makeShell(bodyV, null, hairTris, new Map(body.W.map((w, k) => [k, w])));
  hair.N = smoothNormals(hair.P, hair.T);
  for (let k = 0; k < hair.P.length / 3; k++) { const y = hair.P[k * 3 + 1]; const d = 0.11 + 0.09 * Math.max(0, Math.min(1, (y - 7.4) / 1.0)); for (let c = 0; c < 3; c++) hair.P[k * 3 + c] += hair.N[k * 3 + c] * d; }
  hair.N = smoothNormals(hair.P, hair.T);

  // ---- region slots: 0 skin, 1 top (painted tunic on the torso), 2 dhoti, 3 hair; row 0 main, row 1 trim ----
  const SPINE = ['spine05', 'spine03', 'spine01'].map((n) => KEEP.indexOf(n)); const CLAV = [KEEP.indexOf('clavicle.L'), KEEP.indexOf('clavicle.R')];
  const slotOf = { body: [], skirt: [], hair: [] };
  for (let k = 0; k < body.P.length / 3; k++) {
    const y = body.P[k * 3 + 1]; const d = body.W[k][0][0];
    slotOf.body.push([(SPINE.includes(d) || CLAV.includes(d)) && y > 1.55 && y < 5.55 ? 1 : 0, y > 5.3 && y < 5.55 && (SPINE.includes(d) || CLAV.includes(d)) ? 1 : 0]); // collar trim
  }
  for (let k = 0; k < skirt.P.length / 3; k++) { const y = skirt.P[k * 3 + 1]; slotOf.skirt.push([2, y < -4.55 || y > 1.15 ? 1 : 0]); }
  for (let k = 0; k < hair.P.length / 3; k++) slotOf.hair.push([3, 0]);

  // ---- reduce each shell, keeping its own vertices (so weights and normals survive) ----
  const reduce = (sh, slots, target, lockBorder, twoStage = false) => {
    const n = sh.P.length / 3; const A = new Float32Array(n * 5);
    for (let k = 0; k < n; k++) { A[k * 5] = sh.N[k * 3]; A[k * 5 + 1] = sh.N[k * 3 + 1]; A[k * 5 + 2] = sh.N[k * 3 + 2]; A[k * 5 + 3] = slots[k][0]; A[k * 5 + 4] = slots[k][1]; }
    const run = (T, tris, lock, flags) => MeshoptSimplifier.simplifyWithAttributes(T, sh.P, 3, A, 5, [0.3, 0.3, 0.3, 30, 30], lock, tris * 3, 0.5, flags)[0];
    const flags = lockBorder ? ['LockBorder'] : []; let idx;
    // vertices where the colour region changes are kept, so the neckline, armholes and hems stay as clean as the original mesh
    const edge = new Uint8Array(n); for (let t = 0; t < sh.T.length; t += 3) { const [a, b, c] = [sh.T[t], sh.T[t + 1], sh.T[t + 2]]; if (slots[a][0] !== slots[b][0] || slots[a][0] !== slots[c][0] || slots[a][1] !== slots[b][1] || slots[a][1] !== slots[c][1]) edge[a] = edge[b] = edge[c] = 1; }
    if (!twoStage) idx = run(sh.T, target, edge, flags);
    else { // stage 1 squeezes the body below the chin while the head is locked, stage 2 squeezes the head while the body is locked
      const isHead = new Uint8Array(n); for (let k = 0; k < n; k++) isHead[k] = sh.P[k * 3 + 1] > HEAD_Y ? 1 : 0;
      let headTris = 0; for (let t = 0; t < sh.T.length; t += 3) if (isHead[sh.T[t]] || isHead[sh.T[t + 1]] || isHead[sh.T[t + 2]]) headTris++;
      const lockHead = Uint8Array.from(isHead, (v, k) => v | edge[k]); const lockBody = Uint8Array.from(isHead, (v, k) => (1 - v) | edge[k]);
      const mid = run(sh.T, headTris + target.rest, lockHead, flags); let midHead = 0; for (let t = 0; t < mid.length; t += 3) if (isHead[mid[t]] || isHead[mid[t + 1]] || isHead[mid[t + 2]]) midHead++;
      idx = run(mid, mid.length / 3 - midHead + target.head, lockBody, flags);
    }
    const used = new Map(); const keep = []; for (const i of idx) if (!used.has(i)) { used.set(i, keep.length); keep.push(i); }
    const P = new Float32Array(keep.length * 3); const N = new Float32Array(keep.length * 3);
    keep.forEach((i, k) => { for (let c = 0; c < 3; c++) { P[k * 3 + c] = sh.P[i * 3 + c]; N[k * 3 + c] = sh.N[i * 3 + c]; } });
    return { P, N, T: Uint32Array.from(idx, (i) => used.get(i)), W: keep.map((i) => sh.W[i]), S: keep.map((i) => slots[i]), before: sh.T.length / 3 };
  };
  const rb = reduce(body, slotOf.body, BUDGET, true, true); const rs = reduce(skirt, slotOf.skirt, BUDGET.skirt, true); const rh = reduce(hair, slotOf.hair, BUDGET.hair, true);
  console.log(`triangles: body ${rb.before} -> ${rb.T.length / 3}, skirt ${rs.before} -> ${rs.T.length / 3}, hair ${rh.before} -> ${rh.T.length / 3}`);

  // ---- face patch: a small grid draped over the reduced head, 4 mm proud of it, for a painted face ----
  const headTris = []; for (let t = 0; t < rb.T.length; t += 3) { const a = rb.T[t]; if (rb.P[a * 3 + 1] > 5.8 && rb.P[a * 3 + 2] > -0.5) headTris.push(t); }
  const hit = (x, y) => { // ray from the front along -z, nearest triangle
    let best = null;
    for (const t of headTris) {
      const a = rb.T[t] * 3; const b = rb.T[t + 1] * 3; const c = rb.T[t + 2] * 3; const P = rb.P;
      const d = [0, 0, -1]; const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]]; const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]; const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-9) continue;
      const o = [x - P[a], y - P[a + 1], 4 - P[a + 2]]; const u = (o[0] * pv[0] + o[1] * pv[1] + o[2] * pv[2]) / det; if (u < 0 || u > 1) continue;
      const q = [o[1] * e1[2] - o[2] * e1[1], o[2] * e1[0] - o[0] * e1[2], o[0] * e1[1] - o[1] * e1[0]]; const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) continue;
      const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (dist > 0 && (!best || dist < best.dist)) {
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const nl = Math.hypot(...n) || 1;
        best = { dist, z: 4 - dist, n: n.map((k) => (k / nl) * (n[2] < 0 ? -1 : 1)) };
      }
    }
    return best;
  };
  const FACE = { x0: -0.74, x1: 0.74, y0: 6.12, y1: 7.95, nx: 9, ny: 12 };
  const fp = []; const fuv = [];
  for (let j = 0; j <= FACE.ny; j++) for (let i = 0; i <= FACE.nx; i++) {
    const x = FACE.x0 + (FACE.x1 - FACE.x0) * (i / FACE.nx); const y = FACE.y0 + (FACE.y1 - FACE.y0) * (j / FACE.ny);
    const h = hit(x, y) || { z: 0.3, n: [0, 0, 1] };
    fp.push(x + h.n[0] * 0.04, y + h.n[1] * 0.04, h.z + h.n[2] * 0.04); fuv.push(i / FACE.nx, j / FACE.ny);
  }
  const fi = []; for (let j = 0; j < FACE.ny; j++) for (let i = 0; i < FACE.nx; i++) { const a = j * (FACE.nx + 1) + i; fi.push(a, a + 1, a + FACE.nx + 2, a, a + FACE.nx + 2, a + FACE.nx + 1); }

  // ---- merge the three shells into one skinned mesh ----
  const shells = [[rb, 'body'], [rs, 'skirt'], [rh, 'hair']];
  const nv = shells.reduce((a, [s]) => a + s.P.length / 3, 0); const ni = shells.reduce((a, [s]) => a + s.T.length, 0);
  const pos = new Float32Array(nv * 3); const nor = new Int8Array(nv * 4); const uv = new Uint8Array(nv * 4); const ol = new Uint8Array(nv * 4); const jnt = new Uint8Array(nv * 4); const wgt = new Uint8Array(nv * 4); const idx = new Uint16Array(ni);
  const yFloor = Math.min(...rb.P.filter((_, i) => i % 3 === 1)); let vo = 0; let io = 0;
  for (const [s] of shells) {
    const n = s.P.length / 3;
    for (let k = 0; k < n; k++) {
      const o = vo + k;
      pos[o * 3] = s.P[k * 3] / 10; pos[o * 3 + 1] = (s.P[k * 3 + 1] - yFloor) / 10; pos[o * 3 + 2] = s.P[k * 3 + 2] / 10;
      for (let c = 0; c < 3; c++) nor[o * 4 + c] = Math.round(Math.max(-1, Math.min(1, s.N[k * 3 + c])) * 127);
      uv[o * 4] = Math.round(((s.S[k][0] + 0.5) / 4) * 255); uv[o * 4 + 1] = Math.round(((1.5 - s.S[k][1]) / 2) * 255); // canvas row 0 is the top of the palette, which is v = 0.75
      { // ink thickness factor: thinner over the front of the face, where an inverted hull on a small mesh pokes through as dark creases
        const x = s.P[k * 3]; const y = s.P[k * 3 + 1]; const z = s.P[k * 3 + 2]; const f = Math.max(0, Math.min(1, Math.max((0.9 - z) / 0.3, (Math.abs(x) - 0.5) / 0.25, (6.3 - y) / 0.3, (y - 7.7) / 0.3)));
        ol[o * 4] = Math.round(255 * (s === rb && y > HEAD_Y ? 0.4 + 0.6 * f : 1));
      }
      const ws = s.W[k]; let sum = 0; const q = ws.map(([, w]) => Math.round(w * 255)); const big = q.indexOf(Math.max(...q)); q[big] += 255 - q.reduce((a, b) => a + b, 0);
      ws.forEach(([b], c) => { jnt[o * 4 + c] = b; wgt[o * 4 + c] = q[c]; sum += q[c]; });
    }
    for (let t = 0; t < s.T.length; t++) idx[io + t] = s.T[t] + vo;
    vo += n; io += s.T.length;
  }
  const fpos = Float32Array.from(fp, (v, k) => (k % 3 === 1 ? (v - yFloor) / 10 : v / 10)); const fuvA = Float32Array.from(fuv); const fidx = Uint16Array.from(fi);
  const fj = new Uint8Array((fp.length / 3) * 4); const fw = new Uint8Array((fp.length / 3) * 4); for (let k = 0; k < fp.length / 3; k++) { fj[k * 4] = HEAD; fw[k * 4] = 255; }

  // ---- skeleton ----
  const bones = KEEP.map((mh) => { const h = plan.headOf(mh); return { mh, name: gameName(mh), world: [h[0] / 10, (h[1] - yFloor) / 10, h[2] / 10], parent: plan.keepParent(mh) }; });
  writeGlb({ bones, pos, nor, uv, ol, jnt, wgt, idx, fpos, fuv: fuvA, fj, fw, fidx, manifest });
  mkdirSync(OUT, { recursive: true });
  copyFileSync(join(CACHE, 'LICENSE.md'), join(OUT, 'makehuman-LICENSE.md')); copyFileSync(join(CACHE, 'LICENSE.ASSETS.md'), join(OUT, 'makehuman-LICENSE.ASSETS.md'));
  writeFileSync(PIN_FILE, JSON.stringify({ note: 'Pinned sources for tools/build-hero.mjs. Fetched from GitHub raw master; the build stops if a hash changes.', files: manifest, facePatch: { ...FACE, unitsMetres: false } }, null, 1) + '\n');
  const glb = readFileSync(join(OUT, 'hero.glb'));
  console.log(`bones ${bones.length}, triangles ${(ni + fidx.length) / 3} (body mesh ${ni / 3}, face patch ${fidx.length / 3}), vertices ${nv}`);
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
  const nv = d.pos.length / 3; const [mn, mx] = bbox(d.pos); const [fmn, fmx] = bbox(d.fpos); const nf = d.fpos.length / 3;
  const ibm = new Float32Array(d.bones.length * 16); d.bones.forEach((b, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.world[0], -b.world[1], -b.world[2], 1], i * 16); });
  const aIbm = add(ibm, { ct: 5126, count: d.bones.length, type: 'MAT4' }, null);
  const A = {
    POSITION: add(d.pos, { ct: 5126, count: nv, type: 'VEC3', min: mn, max: mx }),
    NORMAL: add(d.nor, { ct: 5120, count: nv, type: 'VEC3', normalized: true, stride: 4 }),
    TEXCOORD_0: add(d.uv, { ct: 5121, count: nv, type: 'VEC2', normalized: true, stride: 4 }),
    JOINTS_0: add(d.jnt, { ct: 5121, count: nv, type: 'VEC4' }),
    WEIGHTS_0: add(d.wgt, { ct: 5121, count: nv, type: 'VEC4', normalized: true }),
    _OUTLINE: add(d.ol, { ct: 5121, count: nv, type: 'SCALAR', normalized: true, stride: 4 }),
  };
  const aIdx = add(d.idx, { ct: 5123, count: d.idx.length, type: 'SCALAR' }, 34963);
  const F = {
    POSITION: add(d.fpos, { ct: 5126, count: nf, type: 'VEC3', min: fmn, max: fmx }),
    TEXCOORD_0: add(d.fuv, { ct: 5126, count: nf, type: 'VEC2' }),
    JOINTS_0: add(d.fj, { ct: 5121, count: nf, type: 'VEC4' }),
    WEIGHTS_0: add(d.fw, { ct: 5121, count: nf, type: 'VEC4', normalized: true }),
  };
  const aFidx = add(d.fidx, { ct: 5123, count: d.fidx.length, type: 'SCALAR' }, 34963);
  const boneNode = (i) => 1 + i; const nb = d.bones.length;
  const nodes = [{ name: 'Hero', children: [1, nb + 1, nb + 2, nb + 3] }];
  d.bones.forEach((b, i) => { const p = b.parent ? d.bones.find((q) => q.mh === b.parent) : null; const t = p ? b.world.map((v, k) => +(v - p.world[k]).toFixed(5)) : b.world.map((v) => +v.toFixed(5)); nodes.push({ name: b.name, translation: t, ...(d.bones.some((c) => c.parent === b.mh) ? { children: d.bones.map((c, j) => (c.parent === b.mh ? boneNode(j) : -1)).filter((j) => j >= 0) } : {}) }); });
  // Hero node children: only the root bone and the three mesh nodes (the other bones hang off the root bone).
  nodes[0].children = [1, nb + 1, nb + 2, nb + 3];
  nodes.push({ name: 'body', mesh: 0, skin: 0 }, { name: 'outline', mesh: 0, skin: 0 }, { name: 'face', mesh: 1, skin: 0 });
  const json = {
    asset: { version: '2.0', generator: 'dharmastra tools/build-hero.mjs', extras: { source: 'MakeHuman hm08 base mesh, default rig and weights (CC0 1.0)', sources: d.manifest } },
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ nodes: [0] }], nodes,
    skins: [{ joints: d.bones.map((_, i) => boneNode(i)), inverseBindMatrices: aIbm, skeleton: 1 }],
    meshes: [{ name: 'hero', primitives: [{ attributes: A, indices: aIdx, material: 0 }] }, { name: 'face', primitives: [{ attributes: F, indices: aFidx, material: 1 }] }],
    materials: [{ name: 'toon', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }, { name: 'face', alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors, bufferViews: views, buffers: [{ byteLength: off }],
  };
  const j = Buffer.from(JSON.stringify(json)); const jp = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]); const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jp.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jp.length, 0); jh.write('JSON', 4); const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4);
  mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'hero.glb'), Buffer.concat([head, jh, jp, bh, bin]));
}

main().catch((e) => { console.error(e); process.exit(1); });
