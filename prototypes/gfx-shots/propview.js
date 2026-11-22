// Evaluated in the page by shoot.mjs: draws every prop kind (intact, cracked, nearly broken, broken) over the game for a quick look. Not shipped.
(async () => {
  const THREE = await import('/src/vendor/three-lite.js'); const { createWorldProps } = await import('/src/gfx/city-props.js'); const { createGrade } = await import('/src/gfx/materials.js');
  const c = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999'; document.body.appendChild(c);
  const W = innerWidth; const H = innerHeight; const gl = new THREE.WebGLRenderer({ canvas: c, antialias: true }); gl.setPixelRatio(2); gl.setSize(W, H, false); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.NeutralToneMapping;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x8d8472); sc.add(new THREE.HemisphereLight(0xdde8ff, 0x6a5a44, 1.6)); const d = new THREE.DirectionalLight(0xffe2b8, 2.4); d.position.set(2, 4, 3); sc.add(d);
  const wp = createWorldProps(THREE, createGrade(THREE));
  const kinds = ['stick', 'bamboo-staff', 'club', 'clay-pot', 'stone', 'oil-lamp', 'torch', 'spear', 'fallen-sword', 'wood-shield', 'bench', 'crate', 'market-pole', 'rope', 'grain-sack'];
  const cols = W < 600 ? 3 : 5; const rows = Math.ceil(kinds.length / cols); const gap = 1.6;
  kinds.forEach((k, i) => { const g = wp.make(k); const x = (i % cols - (cols - 1) / 2) * gap; const y = -(Math.floor(i / cols) - (rows - 1) / 2) * gap * (W < 600 ? 1.2 : 1);
    const crack = i % 4; const root = new THREE.Group(); root.add(g); const long = ['stick', 'bamboo-staff', 'spear', 'market-pole'].includes(k); if (long) g.scale.setScalar(0.55); root.position.set(x, y - 0.3, 0); root.rotation.y = -0.5;
    const c2 = g.userData.cracks; if (c2) { c2.visible = crack >= 1 && crack < 3; c2.children.forEach((m) => { m.visible = m.userData.n < (crack === 1 ? 2 : 5); }); }
    for (const f of g.userData.flames) f.visible = true; if (crack === 3) { g.visible = false; root.add(wp.debris(k)); } sc.add(root); });
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50); cam.position.set(0, 0.4, W < 600 ? 19 : 11); cam.lookAt(0, 0, 0); gl.render(sc, cam); return 'drawn ' + kinds.length;
})()
