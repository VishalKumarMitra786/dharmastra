// Procedural geometry helpers: lathed and tapered forms, rounded boxes, folded cloth. Everything is cached by key.
// `THREE` is injected so this file loads in Node tests too.
export function createGeom(THREE) {
  const cache = new Map();
  const memo = (k, f) => { let g = cache.get(k); if (!g) cache.set(k, g = f()); return g; };

  // Average normals of vertices that share a position, so a lathe seam (and a displaced fold) shades smoothly.
  function weld(g) {
    const p = g.attributes.position; const nr = g.attributes.normal; const m = new Map();
    const key = (i) => `${Math.round(p.getX(i) * 50)},${Math.round(p.getY(i) * 50)},${Math.round(p.getZ(i) * 50)}`;
    for (let i = 0; i < p.count; i++) { const k = key(i); const a = m.get(k) || [0, 0, 0]; a[0] += nr.getX(i); a[1] += nr.getY(i); a[2] += nr.getZ(i); m.set(k, a); }
    for (let i = 0; i < p.count; i++) { const a = m.get(key(i)); const l = Math.hypot(a[0], a[1], a[2]) || 1; nr.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
    return g;
  }
  // pts: [[radius, y], ...] ordered bottom to top. fold: {n, amp, tw} displaces the radius with sin(n*angle + tw*y) for cloth pleats.
  function lathe(key, pts, seg, fold, phiLength = Math.PI * 2) {
    return memo(`L${key}|${seg}|${phiLength}`, () => {
      const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, 0, phiLength);
      if (fold) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i); const k = 1 + fold.amp * Math.sin(Math.atan2(x, z) * fold.n + (fold.tw || 0) * y); p.setXYZ(i, x * k, y, z * k); }
        g.computeVertexNormals();
      }
      return weld(g);
    });
  }
  // A limb that hangs from y=0 down to y=-len: radius r0 at the top, r1 at the bottom, optional [t, radius] bulges (t in 0..1); rounded ends.
  function tube(key, r0, r1, len, bulges, seg, cap = 3) {
    return memo(`T${key}|${seg}|${cap}`, () => {
      const rad = (t) => { let r = r0 + (r1 - r0) * t; if (bulges) for (const [bt, br] of bulges) r += (br - (r0 + (r1 - r0) * bt)) * Math.max(0, 1 - Math.abs(t - bt) * 3.2); return r; };
      const pts = []; const N = 9;
      for (let i = cap; i >= 1; i--) { const a = i / cap * Math.PI / 2; pts.push([r1 * Math.cos(a), -len - r1 * Math.sin(a)]); }
      for (let i = N; i >= 0; i--) { const t = i / N; pts.push([rad(t), -len * t]); }
      for (let i = 1; i <= cap; i++) { const a = i / cap * Math.PI / 2; pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }
      pts[0][0] = Math.max(pts[0][0], 0.001); pts[pts.length - 1][0] = Math.max(pts[pts.length - 1][0], 0.001);
      return weld(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
    });
  }
  // Box with rounded edges (radius r): a segmented box whose vertices are pushed out from an inner box. Smooth normals.
  function rbox(w, h, d, r, seg = 3) {
    return memo(`R${w}_${h}_${d}_${r}_${seg}`, () => {
      const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg); const p = g.attributes.position; const nr = g.attributes.normal;
      const ix = w / 2 - r; const iy = h / 2 - r; const iz = d / 2 - r;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
        const cx = Math.max(-ix, Math.min(ix, x)); const cy = Math.max(-iy, Math.min(iy, y)); const cz = Math.max(-iz, Math.min(iz, z));
        let dx = x - cx; let dy = y - cy; let dz = z - cz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        p.setXYZ(i, cx + dx * r, cy + dy * r, cz + dz * r); nr.setXYZ(i, dx, dy, dz);
      }
      return g;
    });
  }
  const sph = (w = 12, h = 8) => memo(`S${w}_${h}`, () => new THREE.SphereGeometry(1, w, h));
  const hemi = (w = 14, h = 6) => memo(`H${w}_${h}`, () => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2));
  const torus = (R, t, a = 8, b = 16) => memo(`O${R}_${t}_${a}_${b}`, () => new THREE.TorusGeometry(R, t, a, b));
  const cylg = (rt, rb, h, s = 8) => memo(`C${rt}_${rb}_${h}_${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
  const cone = (r, h, s = 8) => memo(`N${r}_${h}_${s}`, () => new THREE.ConeGeometry(r, h, s));
  const plane = (w, h, sx = 1, sy = 1) => memo(`P${w}_${h}_${sx}_${sy}`, () => new THREE.PlaneGeometry(w, h, sx, sy));
  // A cloth sheet (w x d) hanging between two edges with a sag, used for awnings and banners. Lies in XZ facing up.
  function sheet(w, d, sag, ripple = 0, sx = 10, sz = 3) {
    return memo(`Q${w}_${d}_${sag}_${ripple}`, () => {
      const g = new THREE.PlaneGeometry(w, d, sx, sz); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w * 2; p.setY(i, -sag * (1 - u * u) + Math.sin(p.getX(i) * 0.9) * ripple + (p.getZ(i) / d + 0.5) * -sag * 0.4); }
      g.computeVertexNormals(); return g;
    });
  }
  return { memo, lathe, tube, rbox, sph, hemi, torus, cyl: cylg, cone, plane, sheet, weld, cache, dispose() { cache.forEach((g) => g.dispose()); cache.clear(); } };
}
