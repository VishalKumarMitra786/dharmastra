// Screen-space finishing: a gentle vignette overlay (all levels) and, on high, a colour-grade pass (saturation, warm highlights, cool shadows, vignette).
export function makeVignette(THREE, color = [0.08, 0.04, 0.12], strength = 0.38) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Vector3(...color) }, uA: { value: strength } }, transparent: true, depthTest: false, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 uC; uniform float uA; void main(){ float d = length( vUv - 0.5 ) * 1.45; gl_FragColor = vec4( uC, smoothstep( 0.55, 1.05, d ) * uA ); }',
  }));
  m.frustumCulled = false; m.renderOrder = 9999; return m;
}
export function gradeShader(THREE, { sat = 1.16, contrast = 1.05, vig = 0.3 } = {}) {
  return {
    uniforms: { tDiffuse: { value: null }, uSat: { value: sat }, uCon: { value: contrast }, uVig: { value: vig }, uWarm: { value: new THREE.Vector3(1.05, 1.0, 0.9) }, uCool: { value: new THREE.Vector3(0.9, 0.97, 1.1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uSat; uniform float uCon; uniform float uVig; uniform vec3 uWarm; uniform vec3 uCool;
    void main(){ vec4 c = texture2D( tDiffuse, vUv ); float l = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      c.rgb = mix( vec3( l ), c.rgb, uSat ); c.rgb = ( c.rgb - 0.18 ) * uCon + 0.18;
      c.rgb *= mix( uCool, uWarm, smoothstep( 0.05, 0.9, l ) );
      float d = length( vUv - 0.5 ) * 1.45; c.rgb *= 1.0 - smoothstep( 0.55, 1.05, d ) * uVig; gl_FragColor = vec4( max( c.rgb, 0.0 ), c.a ); }`,
  };
}
