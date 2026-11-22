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
  const p = JSON.parse(await t.ev(`(() => { const c = document.getElementById('ch-canvas').getBoundingClientRect(); const R = Math.min(c.width, c.height) * 0.47; return JSON.stringify({ x: c.left + c.width / 2, y: c.top + c.height / 2, R }); })()`));
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
