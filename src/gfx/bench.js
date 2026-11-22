// Quick GPU benchmark (about 0.7 s, once per device and app version; the result is cached by tier.js). It draws a fixed synthetic scene with raw WebGL on a
// small off-screen canvas: a full-screen shader with N layers of lit overdraw at 1x, 2x and 4x load. Each step is timed over several repeats ending in a
// 1 x 1 readPixels (a synchronous wait for the GPU, which does not depend on vsync). GPU timer queries are not used: phones do not offer them.
// Returns { steps: [ms, ms, ms], ms } or null when WebGL is unavailable. Aborts early (and reports the partial ladder) after `budgetMs`.
export function runBenchmark({ budgetMs = 450, size = 384, slowCallMs = 70, now = () => performance.now(), makeGL } = {}) {
  try {
    const gl = makeGL ? makeGL(size) : (() => {
      const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
      return c.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' }) || c.getContext('webgl', { antialias: false, alpha: false });
    })();
    if (!gl) return null;
    // Guard for slow phones: every draw ends in a synchronous read-back, and one call slower than `slowCallMs` (a device far below Low) stops the benchmark at once,
    // so the whole thing costs at most about one slow call plus the shader compile, never more than `budgetMs` of repeats.
    const t0 = now(); const prog = (n) => {
      const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4( p, 0.0, 1.0 ); }'); gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, `precision mediump float; varying vec2 v; uniform float t;
        void main(){ vec3 n = normalize( vec3( v * 2.0 - 1.0, 0.6 ) ); vec3 c = vec3( 0.0 );
          for ( int i = 0; i < ${n}; i++ ) { float f = float( i ); vec3 l = normalize( vec3( sin( f + t ), 0.7, cos( f * 1.3 ) ) );
            float d = max( dot( n, l ), 0.0 ); float s = pow( max( dot( reflect( -l, n ), vec3( 0.0, 0.0, 1.0 ) ), 0.0 ), 24.0 );
            c += vec3( 0.6, 0.5, 0.4 ) * d + vec3( s ) + 0.02 * sin( v.xyx * ( f + 8.0 ) ); n = normalize( n + 0.01 * c ); }
          gl_FragColor = vec4( c * 0.05, 1.0 ); }`);
      gl.compileShader(fs); const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p;
    };
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, size, size); const px = new Uint8Array(4); const steps = []; let aborted = false;
    const timed = (loc, k0, reps) => { const a = now(); for (let k = 0; k < reps; k++) { gl.uniform1f(loc, k0 + k); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (now() - a) / reps; };
    for (const layers of [24, 48, 96]) {
      const p = prog(layers); gl.useProgram(p); const loc = gl.getUniformLocation(p, 't');
      const first = timed(loc, 0, 1); // warm-up draw (includes the compile): also the slow-device probe
      // the warm-up includes shader compile, so only an extreme value counts
      if (first > slowCallMs * 6) { steps.push(first, 99, 99); aborted = true; break; }
      const times = [];
      for (let r = 0; r < 5; r++) { const ms = timed(loc, r, r === 0 ? 1 : 3); times.push(ms); if (ms > slowCallMs) { aborted = true; break; } if (now() - t0 > budgetMs) { aborted = true; break; } }
      times.sort((x, y) => x - y); steps.push(times[times.length >> 1]);
      if (aborted) { while (steps.length < 3) steps.push(99); break; }
    }
    gl.getExtension?.('WEBGL_lose_context')?.loseContext();
    return { steps: steps.slice(0, 3), ms: now() - t0, aborted };
  } catch { return null; }
}
