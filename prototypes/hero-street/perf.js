// Frame-time probe. Same output format as the repo's perf.html so a phone result can be pasted back the same way.
export function createProbe() {
  let frames = []; let js = []; let running = false; let end = 0; let last = 0; let onDone = null; let info = { calls: 0, triangles: 0 }; let peak = { calls: 0, triangles: 0 };
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  return {
    get running() { return running; },
    start(seconds, done) { frames = []; js = []; peak = { calls: 0, triangles: 0 }; running = true; last = 0; end = performance.now() + seconds * 1000; onDone = done; },
    frame(now, jsMs, ri) {
      if (!running) return; if (last) frames.push(now - last); last = now; js.push(jsMs);
      peak.calls = Math.max(peak.calls, ri.calls); peak.triangles = Math.max(peak.triangles, ri.triangles);
      if (now > end) { running = false; onDone?.(this.result()); }
    },
    result() {
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      return { frames: frames.length, avgMs: avg(frames), medianMs: q(frames, 0.5), p95Ms: q(frames, 0.95), worstMs: Math.max(...frames), fps: 1000 / avg(frames), jsAvgMs: avg(js), jsP95Ms: q(js, 0.95), peakDrawCalls: peak.calls, peakTriangles: peak.triangles };
    },
  };
}
export function formatResult(r, label) {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return ['Dharmastra hero spike performance probe (' + label + ')', 'device: ' + navigator.userAgent, 'cores: ' + navigator.hardwareConcurrency + ', memory GB: ' + (navigator.deviceMemory || 'n/a'),
    'screen: ' + screen.width + 'x' + screen.height + ' @' + devicePixelRatio + 'x, canvas pixel ratio ' + (window.__pr || 'n/a'), 'gpu: ' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a'),
    'frames: ' + r.frames, 'average fps: ' + r.fps.toFixed(1), 'average frame ms: ' + r.avgMs.toFixed(1), 'median frame ms: ' + r.medianMs.toFixed(1), '95th percentile frame ms: ' + r.p95Ms.toFixed(1), 'worst frame ms: ' + r.worstMs.toFixed(0),
    'JS update+render ms, average / 95th: ' + r.jsAvgMs.toFixed(1) + ' / ' + r.jsP95Ms.toFixed(1), 'draw calls (peak): ' + r.peakDrawCalls, 'triangles (peak): ' + r.peakTriangles, 'Target: average at least 30 fps and 95th percentile under 50 ms.'].join('\n');
}
