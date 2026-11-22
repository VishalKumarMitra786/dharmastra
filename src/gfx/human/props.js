// Held weapons and props as small merged meshes (metres, grip at the origin, long axis +Y). One shared 4 x 4 painted atlas covers wood, steel, brass,
// leather, cloth and clay; each prop is one draw call. Proportions follow real objects at a 1.67 m person: sword blade 0.82 m, spear 2.0 m, staff 1.75 m.
export const PROP_CELL = { wood: [0, 0], steel: [1, 0], brass: [2, 0], leather: [3, 0], cloth: [0, 1], clay: [1, 1], red: [2, 1], dark: [3, 1] };
export const PROP_NAMES = ['staff', 'sword', 'spear', 'shield', 'bow', 'arrow', 'lamp', 'club', 'stick'];

export function createProps(THREE) {
  const cache = new Map();
  const part = (geo, cell, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); const m = new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)); g.applyMatrix4(m);
    const uv = g.attributes.uv; const [cx, cy] = PROP_CELL[cell]; for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + 0.12 + 0.76 * (((uv.getX(i) % 1) + 1) % 1)) / 4, (cy + 0.12 + 0.76 * (((uv.getY(i) % 1) + 1) % 1)) / 4);
    g.deleteAttribute('tangent'); return g;
  };
  const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s, 1);
  const merge = (parts) => { const g = THREE.mergeGeometries(parts.map((p) => { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k); return p; })); parts.forEach((p) => p.dispose()); return g; };
  const make = {
    staff: () => merge([part(cyl(0.017, 0.019, 1.75, 8), 'wood', 0, 0.32, 0), part(cyl(0.023, 0.023, 0.05, 8), 'brass', 0, 1.2, 0), part(cyl(0.023, 0.023, 0.05, 8), 'brass', 0, -0.55, 0), part(cyl(0.022, 0.022, 0.2, 8), 'leather', 0, 0, 0), part(new THREE.SphereGeometry(0.03, 8, 6), 'brass', 0, 1.24, 0)]),
    stick: () => merge([part(cyl(0.015, 0.017, 1.2, 6), 'wood', 0, 0.2, 0), part(cyl(0.019, 0.019, 0.14, 6), 'leather', 0, 0, 0)]),
    club: () => merge([part(cyl(0.05, 0.024, 0.62, 8), 'wood', 0, 0.3, 0), part(cyl(0.02, 0.02, 0.16, 6), 'leather', 0, -0.02, 0), part(new THREE.SphereGeometry(0.03, 6, 5), 'dark', 0, -0.12, 0), part(cyl(0.056, 0.056, 0.02, 8), 'dark', 0, 0.5, 0)]),
    sword: () => { // tapered blade (0.82 m), brass guard, leather grip, pommel; the blade has a raised spine so it catches the light
      const blade = new THREE.BufferGeometry(); const w0 = 0.022; const w1 = 0.012; const th = 0.005; const L = 0.82; const y0 = 0.05;
      const v = [[-w0, y0, 0], [w0, y0, 0], [w1, y0 + L * 0.93, 0], [-w1, y0 + L * 0.93, 0], [0, y0 + L, 0], [0, y0, th], [0, y0 + L * 0.93, th * 0.8], [0, y0, -th], [0, y0 + L * 0.93, -th * 0.8]]; const f = [0, 5, 6, 0, 6, 3, 5, 1, 2, 5, 2, 6, 3, 6, 4, 6, 2, 4, 0, 3, 8, 0, 8, 7, 7, 8, 2, 7, 2, 1, 3, 4, 8, 8, 4, 2];
      blade.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3)); blade.setIndex(f); blade.setAttribute('uv', new THREE.Float32BufferAttribute(v.flatMap((p) => [0.5 + p[0] * 8, p[1]]), 2)); blade.computeVertexNormals();
      return merge([part(blade, 'steel'), part(new THREE.BoxGeometry(0.13, 0.018, 0.026), 'brass', 0, 0.05, 0), part(cyl(0.013, 0.013, 0.11, 8), 'leather', 0, -0.02, 0), part(new THREE.SphereGeometry(0.02, 8, 6), 'brass', 0, -0.085, 0)]);
    },
    spear: () => merge([part(cyl(0.014, 0.015, 2.0, 6), 'wood', 0, 0.3, 0), part(cyl(0.02, 0.016, 0.07, 8), 'brass', 0, 1.31, 0), part(new THREE.SphereGeometry(1, 8, 6), 'steel', 0, 1.46, 0, 0, 0, 0, 0.026, 0.15, 0.007), part(cyl(0.021, 0.021, 0.025, 8), 'brass', 0, 1.2, 0), part(new THREE.ConeGeometry(0.03, 0.2, 8, 1, true), 'red', 0, 1.1, 0, Math.PI, 0, 0), part(cyl(0.017, 0.017, 0.06, 6), 'brass', 0, -0.68, 0)]),
    shield: () => { // round shield, face toward +Z: dished disc, rim, boss; origin at its centre
      const prof = [[0.001, 0.05], [0.07, 0.055], [0.1, 0.03], [0.3, 0.012], [0.32, 0.0], [0.31, -0.02], [0.001, -0.02]].map(([r, y]) => new THREE.Vector2(r, y));
      const body = new THREE.LatheGeometry(prof, 20); body.rotateX(Math.PI / 2);
      return merge([part(body, 'leather'), part(new THREE.TorusGeometry(0.315, 0.014, 5, 20), 'brass', 0, 0, -0.003), part(new THREE.SphereGeometry(0.065, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'brass', 0, 0, 0.04, Math.PI / 2, 0, 0), part(cyl(0.012, 0.012, 0.3, 6), 'dark', 0, 0, -0.04, 0, 0, Math.PI / 2)]);
    },
    bow: () => { // a recurve limb as an arc; grip wrapped in leather; the string is a thin box between the tips
      const R = 0.55; const arc = 1.75; const limb = new THREE.TorusGeometry(R, 0.013, 5, 16, arc); limb.rotateZ(Math.PI / 2 - arc / 2); limb.translate(-R * Math.cos(arc / 2) * 0 - R + 0.0, 0, 0);
      const tip = (s) => [-R + R * Math.cos(arc / 2) * 1, s * R * Math.sin(arc / 2)];
      const sy = tip(1)[1] * 2;
      return merge([part(limb, 'wood', R * 0.0, 0, 0), part(cyl(0.017, 0.017, 0.14, 8), 'leather', -R * 0.0 + 0, 0, 0, 0, 0, 0), part(new THREE.BoxGeometry(0.003, sy, 0.003), 'cloth', tip(1)[0] + R, 0, 0)]);
    },
    arrow: () => merge([part(cyl(0.0045, 0.0045, 0.72, 5), 'wood', 0, 0.36, 0), part(new THREE.ConeGeometry(0.011, 0.045, 5), 'steel', 0, 0.745, 0), part(new THREE.BoxGeometry(0.03, 0.09, 0.001), 'red', 0, 0.06, 0), part(new THREE.BoxGeometry(0.001, 0.09, 0.03), 'red', 0, 0.06, 0)]),
    lamp: () => merge([part(cyl(0.042, 0.032, 0.09, 10), 'brass', 0, -0.17, 0), part(cyl(0.035, 0.045, 0.02, 10), 'brass', 0, -0.115, 0), part(new THREE.ConeGeometry(0.048, 0.04, 10), 'brass', 0, -0.095, 0), part(new THREE.TorusGeometry(0.05, 0.004, 4, 10, Math.PI), 'brass', 0, -0.1, 0), part(cyl(0.0025, 0.0025, 0.12, 4), 'brass', 0, -0.05, 0)]),
  };
  return {
    get(name) { if (!cache.has(name)) cache.set(name, make[name]()); return cache.get(name); },
    dispose() { cache.forEach((g) => g.dispose()); cache.clear(); },
  };
}
// Painted props atlas: 256 px, cells of 64 px. Returns draw instructions for a 2D context so the same code runs in the browser and in tests with a fake context.
export function paintPropsAtlas(g, S = 256) {
  const c = S / 4; const R = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const fill = (cell, a, b, fn) => { const [cx, cy] = PROP_CELL[cell]; const gr = g.createLinearGradient(cx * c, 0, (cx + 1) * c, 0); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(cx * c, cy * c, c, c); fn?.(cx * c, cy * c); };
  fill('wood', '#8a5f35', '#6a4426', (x, y) => { for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${R() < 0.5 ? '40,22,8' : '200,150,90'},0.25)`; g.lineWidth = 0.8 + R(); const yy = y + R() * c; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + c, yy + (R() - 0.5) * 3); g.stroke(); } });
  fill('steel', '#aab0b8', '#7d848c', (x, y) => { for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y + R() * c); g.lineTo(x + c, y + R() * c); g.stroke(); } });
  fill('brass', '#d2a444', '#8e6a22'); fill('leather', '#5a3b22', '#3e2816'); fill('cloth', '#d9ceb0', '#b9ac8c'); fill('clay', '#b0532f', '#8c3d22'); fill('red', '#9c3a2c', '#6c2420'); fill('dark', '#2e221a', '#1a120e');
}
