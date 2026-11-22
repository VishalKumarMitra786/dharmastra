// Static scenery is merged into one mesh per material key (vertex colours carry the tint), so a whole city costs a handful of draw calls.
// Each merged mesh can also get an ink outline: an inverted hull pushed out along smoothed normals.
export function smoothHullNormals(geo) {
  const pos = geo.attributes.position; const nor = geo.attributes.normal; const n = pos.count;
  const acc = new Map(); const idx = new Int32Array(n);
  const h = (x, y, z) => ((Math.round(x * 10) * 73856093) ^ (Math.round(y * 10) * 19349663) ^ (Math.round(z * 10) * 83492791)) | 0;
  let m = 0; const sums = [];
  for (let i = 0; i < n; i++) {
    const k = h(pos.getX(i), pos.getY(i), pos.getZ(i));
    let j = acc.get(k); if (j === undefined) { j = m++; acc.set(k, j); sums.push(0, 0, 0); }
    idx[i] = j; sums[j * 3] += nor.getX(i); sums[j * 3 + 1] += nor.getY(i); sums[j * 3 + 2] += nor.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = idx[i] * 3; const x = sums[j]; const y = sums[j + 1]; const z = sums[j + 2]; const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('hullN', new (nor.constructor)(out, 3));
  return geo;
}

export class Batch {
  constructor(THREE, shadeFns = {}) { this.T = THREE; this.lists = new Map(); this.src = new Map(); this.o = new THREE.Object3D(); this.o.rotation.order = 'YXZ'; this.c = new THREE.Color(); this.shadeFns = shadeFns; }
  // Add a copy of `geometry` at (x,y,z) with scale, tint colour (hex) and rotation (radians). Returns this.
  add(key, geometry, x, y, z, sx = 1, sy = 1, sz = 1, color = 0xffffff, ry = 0, rx = 0, rz = 0) {
    let src = this.src.get(geometry); if (!src) { src = geometry.index ? geometry.toNonIndexed() : geometry; this.src.set(geometry, src); }
    const o = this.o; o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.updateMatrix();
    const g = src.clone(); g.applyMatrix4(o.matrix);
    const n = g.attributes.position.count; const col = new Float32Array(n * 3); this.c.setHex(color);
    const fn = this.shadeFns[key]; const p = g.attributes.position; const nr = g.attributes.normal;
    for (let i = 0; i < n; i++) { const k = fn ? fn(p.getY(i), nr.getY(i)) : 1; col[i * 3] = this.c.r * k; col[i * 3 + 1] = this.c.g * k; col[i * 3 + 2] = this.c.b * k; }
    g.setAttribute('color', new this.T.Float32BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new this.T.Float32BufferAttribute(new Float32Array(n * 2), 2));
    let list = this.lists.get(key); if (!list) this.lists.set(key, list = []);
    list.push(g); return this;
  }
  // Like add, but alternates two colours in stripes of `period` along the geometry's local X (chosen per triangle), for cloth awnings and banners.
  addStriped(key, geometry, x, y, z, sx, sy, sz, colA, colB, period, ry = 0, rx = 0, rz = 0) {
    this.add(key, geometry, x, y, z, sx, sy, sz, colA, ry, rx, rz);
    const list = this.lists.get(key); const g = list[list.length - 1]; const src = this.src.get(geometry); const sp = src.attributes.position; const col = g.attributes.color;
    const a = new this.T.Color(colA); const b = new this.T.Color(colB);
    for (let t = 0; t < sp.count; t += 3) { const cx = (sp.getX(t) + sp.getX(t + 1) + sp.getX(t + 2)) / 3; const c = Math.floor(cx / period + 1000) % 2 ? b : a; for (let k = 0; k < 3; k++) col.setXYZ(t + k, c.r, c.g, c.b); }
    return this;
  }
  has(key) { return (this.lists.get(key) || []).length > 0; }
  // Merge one key into a single BufferGeometry (or null when nothing was added), optionally with outline normals.
  merged(key, hull = false) {
    const list = this.lists.get(key); if (!list || !list.length) return null;
    const g = this.T.mergeGeometries(list); list.forEach((x) => x.dispose()); this.lists.set(key, []);
    if (hull) smoothHullNormals(g);
    return g;
  }
  dispose() { this.src.forEach((g, k) => { if (g !== k) g.dispose(); }); this.src.clear(); this.lists.clear(); }
}
