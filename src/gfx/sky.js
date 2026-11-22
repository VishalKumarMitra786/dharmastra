// Generated sky and image-based light. THREE.Sky (a physically based atmosphere shader) is drawn as the background and also baked once into a PMREM
// environment map, so metal, wet ground and skin pick up the colour of the sky they stand under. No image is downloaded.
// Each era has a look: Hastinapur is a late golden afternoon, Pataliputra is a bright monsoon overcast with soft grey light.
export const SKIES = {
  hastinapur: { elev: 9, azim: 205, turbidity: 6.5, rayleigh: 1.35, mie: 0.0045, g: 0.83, exposure: 0.62, fog: 0xe0b896, fogNear: 360, fogFar: 2500, hemi: [0xaec6ea, 0x6e5a44, 0.55], sun: [0xffc487, 3.4], env: 0.85, bloom: [0.32, 0.5, 0.86], grade: { sat: 1.1, con: 1.06, warm: [1.05, 1.0, 0.9], cool: [0.93, 0.98, 1.08] }, haze: 0xf0c9a0, dust: true, lamp: 0xffa24a },
  pataliputra: { elev: 34, azim: 160, turbidity: 18, rayleigh: 0.55, mie: 0.04, g: 0.78, exposure: 0.5, fog: 0xa9b4b4, fogNear: 260, fogFar: 1800, hemi: [0xb9c8d4, 0x58604f, 0.7], sun: [0xe9eef2, 1.5], env: 1.0, bloom: [0.22, 0.6, 0.9], grade: { sat: 1.05, con: 1.04, warm: [1.0, 1.0, 0.96], cool: [0.92, 1.0, 1.06] }, haze: 0xbac4c4, dust: false, lamp: 0xffa24a },
};
SKIES.default = SKIES.hastinapur;

export function sunVector(THREE, cfg) {
  const phi = (90 - cfg.elev) * Math.PI / 180; const theta = cfg.azim * Math.PI / 180;
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}
export function createSky(THREE, gl, key) {
  const cfg = SKIES[key] || SKIES.default; const sun = sunVector(THREE, cfg);
  const make = () => { const s = new THREE.Sky(); s.scale.setScalar(3600); const u = s.material.uniforms; u.turbidity.value = cfg.turbidity; u.rayleigh.value = cfg.rayleigh; u.mieCoefficient.value = cfg.mie; u.mieDirectionalG.value = cfg.g; u.sunPosition.value.copy(sun); return s; };
  const mesh = make(); mesh.material.fog = false;
  const envScene = new THREE.Scene(); envScene.add(make());
  const pm = new THREE.PMREMGenerator(gl); const env = pm.fromScene(envScene, 0, 1, 8000).texture; pm.dispose();
  envScene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return { mesh, env, sun, cfg, dispose() { env.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } };
}
