// Browser smoke test: serves the repo, opens each screen in headless Chrome at phone and desktop size, and checks the project rules that a script can check.
// Run: node tools/smoke.mjs   (needs Chrome; set CHROME=/path/to/chrome if it is not "google-chrome")
// Checks: no console errors or exceptions, no sideways scrolling, touch targets >= 44 px, every control has a name, mission starts, reduced motion loads.
// Screenshots go to tools/out/ (not committed) so a person can look at them. Not a substitute for a real phone.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { launch } from './cdp.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'tools/out'); await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body); // read first: a missing file (such as the optional data/reach.json) must give a clean 404
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
process.env.GAME_URL = `http://localhost:${server.address().port}/index.html`;
process.env.CDP_PORT = String(9400 + Math.floor(Math.random() * 400));

const failures = []; const notes = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

// Runs in the page: returns problems with the visible interactive elements.
const AUDIT = `(() => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways (' + document.documentElement.scrollWidth + ' > ' + innerWidth + ')');
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]') && !e.closest('[inert]'); };
  const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent || e.labels?.[0]?.textContent || e.title || e.value || '').trim();
  for (const e of document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    const id = (e.id || e.dataset.control || e.dataset.action || e.className || e.tagName).toString().slice(0, 30);
    if (e.matches('input[type=radio], input[type=checkbox]')) { const l = e.closest('label') || e.labels?.[0]; const lr = (l || e).getBoundingClientRect(); if (lr.height < 44 || lr.width < 44) out.push('small target ' + id + ' ' + Math.round(lr.width) + 'x' + Math.round(lr.height)); }
    else if (r.width < 44 || r.height < 44) out.push('small target ' + id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (!name(e)) out.push('no accessible name: ' + id);
  }
  return out;
})()`;

async function pass(label, opts, steps) {
  if (process.env.ONLY && !label.includes(process.env.ONLY)) return; // ONLY=chakra runs just the matching passes
  const t = await launch({ tag: label, ...opts });
  try { await steps(t, label); }
  catch (e) { fail(label, `script error ${e.message}`); }
  for (const l of t.logs) if (!/favicon|Failed to load resource.*404/.test(l)) fail(label, `console: ${l}`);
  t.close();
}
const audit = async (t, where) => { for (const p of await t.ev(AUDIT) || []) fail(where, p); };
const setTraveller = (t) => t.ev(`localStorage.setItem('dharmastra.traveller', JSON.stringify({look:'tara',name:'Tara',outfit:'peacock'}))`);

for (const [w, h, mobile] of [[360, 740, true], [1280, 800, false]]) {
  const size = `${w}x${h}`;
  await pass(`start-${size}`, { w, h, mobile }, async (t, l) => {
    await setTraveller(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=dvapara-escape` }); await t.sleep(2500);
    await t.shot(join(OUT, `${l}.png`));
    if (await t.ev(`document.getElementById('start-btn').disabled`)) fail(l, 'Start button is disabled on the first mission');
    await audit(t, l);
  });
  await pass(`play-${size}`, { w, h, mobile }, async (t, l) => {
    await setTraveller(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=sangam-staff&dev=1` }); await t.sleep(2500);
    await t.ev(`document.getElementById('start-btn').click()`); await t.sleep(3500);
    await t.shot(join(OUT, `${l}.png`));
    if (!(await t.ev(`!!document.getElementById('hud') && !document.getElementById('hud').hidden`))) fail(l, 'HUD is not visible after starting');
    await audit(t, l);
    if ((await t.ev(`document.getElementById('game').dataset.cam`)) === 'orbit') { const vis = await t.ev(`(() => { const b = document.getElementById('cam-reset'); const r = b.getBoundingClientRect(); return getComputedStyle(b).display !== 'none' && r.width >= 44 && r.height >= 44; })()`); if (mobile && !vis) fail(l, 'the camera reset button is not shown on a phone in third-person view'); await t.key('g', 'KeyG'); await t.sleep(300); if (!/Camera behind you/.test(await t.ev(`document.getElementById('announcer').textContent`))) notes.push(`${l}: pressing G did not announce the camera reset (the key event may not reach the page in headless mode)`); await t.shot(join(OUT, `${l}-after-reset.png`)); }
  });
}
await pass('picker-360', { w: 360, h: 740, mobile: true }, async (t, l) => {
  await t.ev(`localStorage.clear()`); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=dvapara-escape` }); await t.sleep(2500);
  await t.shot(join(OUT, `${l}.png`));
  if (await t.ev(`document.getElementById('screen-character').hidden`)) fail(l, 'first visit does not show the traveller picker');
  await audit(t, l);
});
await pass('reduced-motion', { w: 360, h: 740, mobile: true, reduced: true }, async (t, l) => {
  await setTraveller(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=mauryan-spy` }); await t.sleep(2500);
  await t.ev(`document.getElementById('start-btn').click()`); await t.sleep(2500);
  await t.shot(join(OUT, `${l}.png`));
});
await pass('no-webgl-fallback', { w: 360, h: 740, mobile: true, noWebgl: true }, async (t, l) => {
  await setTraveller(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=dvapara-escape` }); await t.sleep(2500);
  await t.ev(`document.getElementById('start-btn').click()`); await t.sleep(2000);
  await t.shot(join(OUT, `${l}.png`));
  if ((await t.ev(`document.getElementById('game').dataset.graphics`)) !== '2d') fail(l, 'no 2D fallback when WebGL is missing');
});

// ---- Chakra home screen: concentric rings that open like a vault (no zoom, no pan). Run with ?dev=1 so tools can read the ring state. ----
const chakraVisible = `(() => { const e = document.getElementById('screen-chakra'); return !e.hidden; })()`;
const progressWith = (t, done) => t.ev(`localStorage.setItem('dharmastra.progress.v1', JSON.stringify({v:1,abilities:[],weapon:'none',completed:${JSON.stringify(Object.fromEntries(done.map((d) => [d, { best: 50 }])))}}))`);
// Seeds localStorage on the real origin first (an about:blank page has none), then loads the page fresh.
const seed = async (t, { traveller = true, done = [] } = {}) => { await t.send('Page.navigate', { url: process.env.GAME_URL }); await t.sleep(1200); await t.ev(`localStorage.clear()`); if (traveller) await setTraveller(t); if (done.length) await progressWith(t, done); };
const waitItems = async (t, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if ((await t.ev(`document.querySelectorAll('#ch-items li').length`)) > 0) return true; await t.sleep(200); } return false; };
const st = async (t) => JSON.parse(await t.ev(`JSON.stringify(window.__chakra._state())`));
const waitLevel = async (t, lv, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { const s = await st(t); if (s.level === lv && !s.anim) return s; await t.sleep(100); } return null; };
const tapWheel = async (t, ring, theta) => { // a real mouse tap on the canvas at a ring (0 outer, 1 middle, 2 inner) and angle (radians clockwise from the top)
  const p = JSON.parse(await t.ev(`(() => { const c = document.getElementById('ch-canvas').getBoundingClientRect(); const top = window.__chakra._state().top || 0; const avail = Math.max(60, c.height - top); const R = Math.min(c.width, avail) * 0.48; return JSON.stringify({ x: c.left + c.width / 2, y: c.top + top + avail / 2, R }); })()`)); // mirrors dialGeom() in src/chakra/scene.js: the dial is centred below the floating bar
  const L = Number(await t.ev(`document.getElementById('screen-chakra').dataset.level`));
  const bands = L === 0 ? [[1, 0.7], [0.68, 0.595], [0.575, 0.49]] : L === 1 ? [[1, 0.915], [0.895, 0.625], [0.605, 0.52]] : [[1, 0.915], [0.895, 0.81], [0.79, 0.49]]; // mirrors ringLayout() in src/chakra/scene.js
  const r = ((bands[ring][0] + bands[ring][1]) / 2) * p.R; const x = p.x + Math.sin(theta) * r, y = p.y - Math.cos(theta) * r;
  await t.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await t.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await t.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const keyTo = (t, key) => t.ev(`document.getElementById('ch-stage').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);
const canvasInk = `(() => { const c = document.getElementById('ch-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++; return n > 20; })()`;
for (const [w, h, mobile] of [[360, 740, true], [390, 844, true], [1280, 800, false]]) {
  const size = `${w}x${h}`;
  await pass(`chakra-${size}`, { w, h, mobile }, async (t, l) => {
    await seed(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(800);
    await t.shot(join(OUT, `${l}-wheel.png`));
    if (!(await t.ev(chakraVisible))) fail(l, 'the chakra is not the first screen');
    if ((await t.ev(`document.getElementById('screen-character').hidden`)) !== true) fail(l, 'the traveller picker is showing before the chakra');
    if (!(await t.ev(canvasInk))) fail(l, 'the wheel canvas is blank');
    if ((await t.ev(`document.getElementById('screen-chakra').dataset.level`)) !== '0') fail(l, 'the chakra does not start with the yuga ring open');
    if (await t.ev(`!!document.querySelector('#ch-in, #ch-out, #ch-zoom, input[type=range]')`)) fail(l, 'zoom controls are still on the chakra screen');
    const cv = JSON.parse(await t.ev(`(() => { const r = document.getElementById('ch-canvas').getBoundingClientRect(); return JSON.stringify({ w: r.width, h: r.height }); })()`)); if (cv.w < w * 0.9 || cv.h < Math.min(h * 0.55, 300)) fail(l, `the wheel does not fill the page (${Math.round(cv.w)}x${Math.round(cv.h)})`);
    await audit(t, l);
    await tapWheel(t, 0, 0.9); let s = await waitLevel(t, 1); if (!s) { fail(l, 'tapping a yuga does not open the era ring'); return; }
    await t.shot(join(OUT, `${l}-eras.png`)); await audit(t, `${l}-eras`);
    await tapWheel(t, 1, 0.2); s = await waitLevel(t, 2); if (!s) { fail(l, 'tapping an era does not open the event ring'); return; }
    await t.sleep(300); await t.shot(join(OUT, `${l}-events.png`)); await audit(t, `${l}-events`);
    if (!(await t.ev(canvasInk))) fail(l, 'the event ring is blank');
    await keyTo(t, 'Escape'); await t.sleep(300);
    s = await st(t); if (s.level !== 1) fail(l, `Escape does not close the event ring (level ${s.level})`);
    await t.ev(`document.getElementById('ch-back').click()`); if (!(await waitLevel(t, 0))) fail(l, 'Back does not close the era ring');
    // a level card through the list-free keyboard path, then Play
    await t.ev(`window.__chakra._go.openYuga(2)`); await waitLevel(t, 1); await t.ev(`window.__chakra._go.openEra(0)`); await waitLevel(t, 2);
    await t.ev(`window.__chakra._go.setFocus(3, { announce: false })`); await keyTo(t, 'Enter'); await t.sleep(500); await t.shot(join(OUT, `${l}-card.png`));
    const c = JSON.parse(await t.ev(`JSON.stringify({ open: !document.getElementById('ch-card').hidden, title: document.getElementById('ch-card-title').textContent, status: document.getElementById('ch-card-status').textContent, reach: document.getElementById('ch-card-reach').textContent, dis: document.getElementById('ch-play').getAttribute('aria-disabled'), focus: document.activeElement.id, meta: document.getElementById('ch-card-meta').textContent })`));
    if (!c.open || c.title !== 'Escape from Hastinapur' || c.status.trim() !== 'Open' || c.dis !== 'false') fail(l, `level 10 card is wrong: ${JSON.stringify(c)}`);
    if (c.reach !== 'Be among the first') fail(l, `reach line should be the fallback when no data exists, got ${c.reach}`);
    if (c.focus !== 'ch-card-title') fail(l, 'focus did not move to the card heading');
    if (!/^(History|Tradition|Invented) \u00b7 /.test(c.meta)) fail(l, `card meta lacks kind and year: ${c.meta}`);
    await audit(t, `${l}-card`);
    await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(4500); await t.shot(join(OUT, `${l}-after-play.png`));
    if (await t.ev(chakraVisible)) fail(l, 'Play did not leave the chakra');
    if (await t.ev(`document.getElementById('screen-start').hidden`)) fail(l, 'Play did not open the mission start screen');
    if (await t.ev(`document.getElementById('start-btn').disabled`)) fail(l, 'Play is disabled after choosing level 10');
    await audit(t, `${l}-start`);
  });
}
await pass('chakra-locked', { w: 390, h: 844, mobile: true }, async (t, l) => {
  await seed(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(500);
  await t.ev(`window.__chakra._go.openYuga(3)`); await waitLevel(t, 1); await t.ev(`window.__chakra._go.openEra(1)`); await waitLevel(t, 2);
  await t.ev(`window.__chakra._go.setFocus(0, { announce: false })`); await keyTo(t, 'Enter'); await t.sleep(500); await t.shot(join(OUT, `${l}.png`));
  const c = JSON.parse(await t.ev(`JSON.stringify({ title: document.getElementById('ch-card-title').textContent, status: document.getElementById('ch-card-status').textContent.trim(), dis: document.getElementById('ch-play').getAttribute('aria-disabled'), intro: document.getElementById('ch-card-intro').textContent.length, lines: Math.round(document.getElementById('ch-card-intro').getBoundingClientRect().height / parseFloat(getComputedStyle(document.getElementById('ch-card-intro')).lineHeight)) })`));
  if (c.title !== 'The Night Report of Pataliputra' || c.status !== 'Locked: finish Escape from Hastinapur first' || c.dis !== 'true' || c.intro < 20) fail(l, `locked card wrong: ${JSON.stringify(c)}`);
  if (c.lines > 2) fail(l, `the card intro shows ${c.lines} lines, the limit is 2`);
  await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(300);
  if (!(await t.ev(chakraVisible))) fail(l, 'pressing Play on a locked level left the chakra');
  if (!/Locked/.test(await t.ev(`document.getElementById('ch-live').textContent`))) fail(l, 'locked Play press is not announced');
  await t.ev(`document.getElementById('screen-chakra').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await t.sleep(200);
  if (!(await t.ev(`document.getElementById('ch-card').hidden`))) fail(l, 'Escape did not close the card');
  // the list of the same rings: open it, it names the yuga, the era and the events
  await t.ev(`document.getElementById('ch-list-btn').click()`); await t.sleep(300); await t.shot(join(OUT, `${l}-list.png`)); await audit(t, `${l}-list`);
  if ((await t.ev(`document.querySelectorAll('#ch-rows .ch-row').length`)) < 1) fail(l, 'the list shows no events for the open era');
  // a finished level opens the next one, and Play on a different mission navigates to it
  await progressWith(t, ['dvapara-escape']); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(500);
  await t.ev(`window.__chakra._go.openYuga(3)`); await waitLevel(t, 1); await t.ev(`window.__chakra._go.openEra(1)`); await waitLevel(t, 2); await t.ev(`window.__chakra._go.setFocus(0, { announce: false })`); await keyTo(t, 'Enter'); await t.sleep(500);
  if ((await t.ev(`document.getElementById('ch-card-status').textContent.trim()`)) !== 'Open') fail(l, 'level 14 is not open after level 10 is done');
  await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(3500);
  if (!(await t.ev(`location.search.includes('mission=mauryan-spy')`))) fail(l, 'Play on level 14 did not go to its mission');
  if (await t.ev(`document.getElementById('start-btn').disabled`)) fail(l, 'level 14 start button is disabled');
});
// ---- Smoothness: per-frame deltas during a ring turn, compared with an idle baseline; an interrupted and reversed turn must not jump either. ----
const RECORD = `(async (ms, action) => { const out = { dt: [], th: [] }; let last = performance.now(); const t0 = last; let n = 0; window.__chakra._perf.start();
  await new Promise((r) => { const f = (now) => { out.dt.push(now - last); last = now; out.th.push(window.__chakra._state().th[1]); if (++n === 6 && action) action(); if (now - t0 < ms) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  out.perf = window.__chakra._perf.stop(); return JSON.stringify(out); })`;
const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
const speed = (r) => { let worst = 0; for (let i = 1; i < r.th.length; i++) worst = Math.max(worst, Math.abs(r.th[i] - r.th[i - 1]) / Math.max(0.004, r.dt[i] / 1000)); return worst; };
await pass('chakra-smooth', { w: 390, h: 844, mobile: true }, async (t, l) => {
  await seed(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(800);
  // Timing in a shared headless box is noisy, so the frame test gets up to three tries and the notes say how many it took. Each try measures its own idle baseline first.
  // Pass: 90% of the turn's frames within 4x the baseline median, and no single gap over max(8x the baseline median, 250 ms) (a freeze).
  let run = null, tries = 0, ok = false, why = '';
  while (tries < 3 && !ok) {
    tries++; if ((await st(t)).level !== 0) { await t.ev(`window.__chakra._go.closeRing()`); await waitLevel(t, 0, 4000); }
    const base = JSON.parse(await t.ev(`${RECORD}(1200, null)`)); const bd = base.dt.slice(3); const med = pct(bd, 0.5), p95 = pct(bd, 0.95);
    run = JSON.parse(await t.ev(`${RECORD}(1800, () => window.__chakra._go.openYuga(2))`)); const rd = run.dt.slice(3);
    const gap = Math.max(...rd), p90 = pct(rd, 0.9), gapLimit = Math.max(8 * med, 250), p90Limit = 4 * med; const drawMed = pct(run.perf.draw, 0.5), drawMax = Math.max(...run.perf.draw);
    ok = gap <= gapLimit && p90 <= p90Limit; why = `p90 ${p90.toFixed(1)} ms (limit ${p90Limit.toFixed(1)}), worst gap ${gap.toFixed(1)} ms (limit ${gapLimit.toFixed(1)})`;
    notes.push(`chakra turn at 390x844 (headless Chrome, software GL, try ${tries}): baseline ${med.toFixed(1)} ms median / ${p95.toFixed(1)} ms p95; turn ${pct(rd, 0.5).toFixed(1)} ms median, ${why}; draw ${drawMed.toFixed(2)} ms median, ${drawMax.toFixed(2)} ms max; ${rd.length} frames`);
  }
  if (!ok) fail(l, `frame times during the ring turn were not smooth in 3 tries: ${why}`);
  if (run.th[run.th.length - 1] < 0.299 || run.th[0] > 0.1) fail(l, `ring did not grow from thin to thick (${run.th[0]} to ${run.th[run.th.length - 1]})`);
  if (speed(run) > 0.9) fail(l, `ring thickness jumps (${speed(run).toFixed(2)} per second)`);
  for (let i = 3; i < run.th.length; i++) if (run.th[i] < run.th[i - 1] - 0.002) { fail(l, 'ring thickness goes backwards during an opening turn'); break; }
  // interrupt: open, then reverse 250 ms in. No jump, and it ends closed.
  const rev = JSON.parse(await t.ev(`${RECORD}(2200, () => { window.__chakra._go.openEra(0); setTimeout(() => window.__chakra._go.closeRing(), 250); })`));
  if (speed(rev) > 1.2) fail(l, `an interrupted turn jumps (${speed(rev).toFixed(2)} per second)`);
  const s = await waitLevel(t, 1, 4000); if (!s) fail(l, 'the reversed turn did not settle back on the era ring');
  else if (Math.abs(s.th[1] - 0.3) > 1e-6 || Math.abs(s.th[2] - 0.085) > 1e-6 || s.bloom !== 0) fail(l, `reversed turn did not settle cleanly: ${JSON.stringify(s.th)}`);
  await t.shot(join(OUT, `${l}.png`));
});
// ---- Focus: no outline after a tap or click anywhere; a ring only for the keyboard, drawn on the dial ----
const outlineOf = (t) => t.ev(`(() => { const e = document.activeElement; const s = getComputedStyle(e); return JSON.stringify({ id: e.id || e.tagName, style: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow, input: document.documentElement.dataset.input || '' }); })()`).then(JSON.parse);
const clickAt = async (t, sel) => { const p = JSON.parse(await t.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`)); await t.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await t.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); };
await pass('focus-rings', { w: 360, h: 740, mobile: false }, async (t, l) => {
  await seed(t); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(800);
  let o = await outlineOf(t); if (o.style !== 'none') fail(l, `the dial is outlined on load before any key (${JSON.stringify(o)})`);
  await tapWheel(t, 0, 0.9); await waitLevel(t, 1); await t.sleep(300); o = await outlineOf(t);
  if (o.style !== 'none' || o.shadow !== 'none') fail(l, `a box is drawn around the dial after a tap: ${JSON.stringify(o)}`);
  if ((await st(t)).kbdRing) fail(l, 'the keyboard ring is drawn after a tap');
  await t.shot(join(OUT, `${l}-after-tap.png`));
  await t.key('ArrowRight', 'ArrowRight'); await t.sleep(200); o = await outlineOf(t);
  if (o.input !== 'kbd') fail(l, 'a key press did not switch to keyboard mode'); if (o.style !== 'none') fail(l, `the dial gets a box outline for the keyboard (${JSON.stringify(o)}); the ring must be drawn on the dial`);
  if (!(await st(t)).kbdRing) fail(l, 'no keyboard ring on the dial while using the keyboard'); await t.shot(join(OUT, `${l}-keyboard.png`));
  await t.ev(`window.__chakra._go.openEra(0)`); await waitLevel(t, 2); await t.ev(`window.__chakra._go.setFocus(2, { announce: false })`); await t.sleep(300); await t.shot(join(OUT, `${l}-keyboard-events.png`));
  await keyTo(t, 'Enter'); await t.sleep(400); o = await outlineOf(t); if (o.id !== 'ch-card-title') fail(l, `focus is on ${o.id}, not the card title`);
  await t.shot(join(OUT, `${l}-card-keyboard.png`));
  await clickAt(t, '#ch-card-close'); await t.sleep(300);
  await tapWheel(t, 0, 0.9); await t.sleep(300); o = await outlineOf(t); if (o.style !== 'none') fail(l, `outline after a mouse tap following keyboard use: ${JSON.stringify(o)}`);
  // other screens: a mouse click on their buttons leaves no outline
  await t.ev(`document.querySelector('[data-action=chakra-skip]').click()`); await t.sleep(1500);
  for (const sel of ['#start-btn', '[data-action=settings]']) { if (!(await t.ev(`!!document.querySelector(${JSON.stringify(sel)}) && document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().width > 0`))) continue; await t.ev(`document.querySelector(${JSON.stringify(sel)}).focus()`); await clickAt(t, sel); await t.sleep(300); o = await outlineOf(t); if (o.style !== 'none') fail(l, `outline after clicking ${sel}: ${JSON.stringify(o)}`); break; }
});
await pass('chakra-reduced-motion', { w: 390, h: 844, mobile: true, reduced: true }, async (t, l) => {
  await seed(t, { traveller: false }); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1` }); await waitItems(t); await t.sleep(600);
  await t.shot(join(OUT, `${l}.png`));
  if (!(await t.ev(chakraVisible))) fail(l, 'chakra not shown with reduced motion');
  const a = await st(t); await t.sleep(1500); const b = await st(t); if (JSON.stringify(a.idle) !== JSON.stringify(b.idle) || a.idle.some((v) => v !== 0)) fail(l, 'the rings turn with reduced motion on');
  await t.ev(`window.__chakra._go.openYuga(3)`); await t.sleep(400); const s = await st(t);
  if (s.level !== 1 || s.anim) fail(l, 'with reduced motion the ring should open at once, without animation');
  if ((await t.ev(`document.documentElement.dataset.anim || document.getElementById('screen-chakra').dataset.anim`)) === '1') fail(l, 'animation flag is on');
  await t.ev(`window.__chakra._go.openEra(0)`); await t.ev(`window.__chakra._go.setFocus(0, { announce: false })`); await keyTo(t, 'Enter'); await t.sleep(300);
  if (await t.ev(`document.getElementById('ch-card').hidden`)) fail(l, 'cards do not open with reduced motion');
  if (await t.ev(`(() => { for (const e of document.querySelectorAll('.dial-r1')) if (getComputedStyle(e).animationName !== 'none') return true; return false; })()`)) fail(l, 'the dial still turns with reduced motion');
});
await pass('chakra-2000-events', { w: 390, h: 844, mobile: true }, async (t, l) => {
  await seed(t, { traveller: false }); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?dev=1&synth=2000` }); await waitItems(t); await t.sleep(300);
  await t.ev(`window.__chakra._go.openYuga(3)`); await waitLevel(t, 1); await t.ev(`window.__chakra._go.openEra(0)`); await waitLevel(t, 2); await t.sleep(300);
  await t.ev(`document.getElementById('ch-list-btn').click()`); await t.sleep(300); await t.shot(join(OUT, `${l}.png`));
  const s = await st(t); if (!(s.ring > s.cap)) fail(l, `the first era holds only ${s.ring} events`);
  const rows = await t.ev(`document.querySelectorAll('#ch-rows li').length`); if (!(rows > 0 && rows <= 20)) fail(l, `${rows} list rows in the DOM with 2,025 events`);
  await t.ev(`document.getElementById('ch-list-btn').click()`); await t.sleep(200);
  for (let i = 0; i < 4; i++) await t.ev(`document.getElementById('ch-next').click()`); await t.sleep(400); const s2 = await st(t); if (s2.focus <= s.focus) fail(l, 'Next did not page the ring');
  const fps = await t.ev(`new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })`);
  notes.push(`chakra rings with 2,025 events in headless Chrome (software GL): ${fps} animation frames in 1 s`);
});

server.close();
console.log(notes.join('\n'));
if (failures.length) { console.error(`\nSMOKE TEST FAILED (${failures.length})\n- ${[...new Set(failures)].join('\n- ')}`); process.exit(1); }
console.log('smoke test passed. Screenshots in tools/out/');
process.exit(0);
