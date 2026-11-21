// Minimal headless-Chrome driver over the DevTools protocol. Used by tools/smoke.mjs. No dependencies.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch({ w = 360, h = 640, mobile = true, noWebgl = false, reduced = false, tag = 'x' } = {}) {
  const PORT = Number(process.env.CDP_PORT || 9333), URL_ = process.env.GAME_URL || 'http://localhost:8765/'; // read at call time: smoke.mjs sets these after importing this file
  const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TMPDIR || '/tmp'}/dharmastra-prof-${tag}-${Date.now()}`,
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', (e) => { throw new Error('could not start Chrome (' + (process.env.CHROME || 'google-chrome') + '): ' + e.message); });
  let targets;
  for (let i = 0; i < 150; i++) { try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
  if (!targets) throw new Error('Chrome did not open its debugging port ' + PORT + ' within 30 s');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type.toUpperCase() + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (noWebgl) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){if(/webgl/.test(t))return null;return g.call(this,t,...a)}})()` });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'EVAL_ERROR ' + r.result.exceptionDetails.text; return r.result.result.value; };
  const shot = async (path) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.result.data, 'base64')); };
  const key = async (k, code, down = true) => send('Input.dispatchKeyEvent', { type: down ? 'rawKeyDown' : 'keyUp', key: k, code, windowsVirtualKeyCode: { ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }[k] });
  await send('Page.navigate', { url: URL_ });
  await sleep(2500);
  return { ev, shot, key, send, logs, sleep, close: () => { ws.close(); chrome.kill(); } };
}
