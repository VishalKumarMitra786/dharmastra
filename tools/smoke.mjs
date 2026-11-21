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

// ---- Chakra home screen: the first screen a player sees ----
const $e = (t, expr) => t.ev(expr);
const chakraVisible = `(() => { const e = document.getElementById('screen-chakra'); return !e.hidden; })()`;
const waitZoom = async (t, z) => { for (let i = 0; i < 20; i++) { if ((await t.ev(`document.getElementById('screen-chakra').dataset.zoom`)) === String(z)) return true; await t.sleep(150); } return false; };
const progressWith = (t, done) => t.ev(`localStorage.setItem('dharmastra.progress.v1', JSON.stringify({v:1,abilities:[],weapon:'none',completed:${JSON.stringify(Object.fromEntries(done.map((d) => [d, { best: 50 }])))}}))`);
// Seeds localStorage on the real origin first (an about:blank page has none), then loads the page fresh.
const seed = async (t, { traveller = true, done = [] } = {}) => { await t.send('Page.navigate', { url: process.env.GAME_URL }); await t.sleep(1200); await t.ev(`localStorage.clear()`); if (traveller) await setTraveller(t); if (done.length) await progressWith(t, done); };
const waitRows = async (t, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if ((await t.ev(`document.querySelectorAll('#ch-rows li').length`)) > 0) return true; await t.sleep(200); } return false; };
const clickRow = (t, nameRe) => t.ev(`(() => { const b = [...document.querySelectorAll('#ch-rows .ch-row')].find((x) => /${nameRe}/.test(x.getAttribute('aria-label'))); if (!b) return false; b.click(); return true; })()`);
for (const [w, h, mobile] of [[360, 740, true], [390, 844, true], [1280, 800, false]]) {
  const size = `${w}x${h}`;
  await pass(`chakra-${size}`, { w, h, mobile }, async (t, l) => {
    await seed(t); await t.send('Page.navigate', { url: process.env.GAME_URL }); await waitRows(t); await t.sleep(2800); // let the unfolding finish
    await t.shot(join(OUT, `${l}-wheel.png`));
    if (!(await t.ev(chakraVisible))) fail(l, 'the chakra is not the first screen');
    if ((await t.ev(`document.getElementById('screen-character').hidden`)) !== true) fail(l, 'the traveller picker is showing before the chakra');
    if (!(await t.ev(`(() => { const c = document.getElementById('ch-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++; return n > 20; })()`))) fail(l, 'the wheel canvas is blank');
    const rows = await t.ev(`document.querySelectorAll('#ch-rows li').length`); if (!(rows > 0 && rows <= 20)) fail(l, `list has ${rows} rows in the DOM`);
    if ((await t.ev(`document.getElementById('screen-chakra').dataset.zoom`)) !== '0') fail(l, 'chakra does not start on the whole wheel');
    await audit(t, l);
    await t.ev(`document.getElementById('ch-in').click()`);
    if (!(await waitZoom(t, 1))) fail(l, 'zoom in does not reach the yuga view'); await t.sleep(1200); await t.shot(join(OUT, `${l}-yuga.png`));
    await audit(t, `${l}-zoomed`);
    if (!(await clickRow(t, 'Level 10'))) fail(l, 'no row for level 10'); await t.sleep(600); await t.shot(join(OUT, `${l}-card.png`));
    const card = await t.ev(`JSON.stringify({ open: !document.getElementById('ch-card').hidden, status: document.getElementById('ch-card-status').textContent, reach: document.getElementById('ch-card-reach').textContent, dis: document.getElementById('ch-play').getAttribute('aria-disabled'), focus: document.activeElement.id })`);
    const c = JSON.parse(card);
    if (!c.open || c.status.trim() !== 'Open' || c.dis !== 'false') fail(l, `level 10 card is wrong: ${card}`);
    if (c.reach !== 'Be among the first') fail(l, `reach line should be the fallback when no data exists, got ${c.reach}`);
    if (c.focus !== 'ch-card-title') fail(l, 'focus did not move to the card heading');
    await audit(t, `${l}-card`);
    await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(4500); await t.shot(join(OUT, `${l}-after-play.png`));
    if (await t.ev(chakraVisible)) fail(l, 'Play did not leave the chakra');
    if (await t.ev(`document.getElementById('screen-start').hidden`)) fail(l, 'Play did not open the mission start screen');
    if (await t.ev(`document.getElementById('start-btn').disabled`)) fail(l, 'Start mission is disabled after Play');
  });
}
await pass('chakra-locked', { w: 390, h: 844, mobile: true }, async (t, l) => {
  await seed(t); await t.send('Page.navigate', { url: process.env.GAME_URL }); await waitRows(t); await t.sleep(600);
  await t.ev(`document.querySelector('.ch-tab[data-y="3"]').click()`); await t.sleep(2000);
  if (!(await clickRow(t, 'Level 14'))) fail(l, 'no row for level 14'); await t.sleep(500); await t.shot(join(OUT, `${l}.png`));
  const c = JSON.parse(await t.ev(`JSON.stringify({ status: document.getElementById('ch-card-status').textContent.trim(), dis: document.getElementById('ch-play').getAttribute('aria-disabled'), intro: document.getElementById('ch-card-intro').textContent.length })`));
  if (c.status !== 'Locked: finish Escape from Hastinapur first' || c.dis !== 'true' || c.intro < 20) fail(l, `locked card wrong: ${JSON.stringify(c)}`);
  await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(300);
  if (!(await t.ev(chakraVisible))) fail(l, 'pressing Play on a locked level left the chakra');
  if (!/Locked/.test(await t.ev(`document.getElementById('ch-live').textContent`))) fail(l, 'locked Play press is not announced');
  await t.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.getElementById('ch-card-close').click()`); await t.sleep(200);
  if (!(await t.ev(`document.getElementById('ch-card').hidden`))) fail(l, 'card did not close');
  // keyboard: plus and minus on the wheel
  await t.ev(`document.getElementById('ch-stage').focus(); for (let i = 0; i < 2; i++) document.getElementById('ch-stage').dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }))`); await t.sleep(1200); // event view, then yuga view, then the whole wheel
  if ((await t.ev(`document.getElementById('screen-chakra').dataset.zoom`)) !== '0') fail(l, 'minus key does not zoom out (twice) to the whole wheel');
  await t.ev(`document.getElementById('ch-stage').dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))`);
  if (!(await waitZoom(t, 1))) fail(l, 'plus key does not zoom in');
  // a finished level opens the next one, and Play on a different mission navigates to it
  await progressWith(t, ['dvapara-escape']); await t.send('Page.navigate', { url: process.env.GAME_URL }); await waitRows(t); await t.sleep(600);
  await t.ev(`document.querySelector('.ch-tab[data-y="3"]').click()`); await t.sleep(2000);
  await clickRow(t, 'Level 14'); await t.sleep(500);
  if ((await t.ev(`document.getElementById('ch-card-status').textContent.trim()`)) !== 'Open') fail(l, 'level 14 is not open after level 10 is done');
  await t.ev(`document.getElementById('ch-play').click()`); await t.sleep(3500);
  if (!(await t.ev(`location.search.includes('mission=mauryan-spy')`))) fail(l, 'Play on level 14 did not go to its mission');
  if (await t.ev(`document.getElementById('start-btn').disabled`)) fail(l, 'level 14 start button is disabled');
});
await pass('chakra-reduced-motion', { w: 390, h: 844, mobile: true, reduced: true }, async (t, l) => {
  await seed(t, { traveller: false }); await t.send('Page.navigate', { url: process.env.GAME_URL }); await waitRows(t); await t.sleep(300);
  await t.shot(join(OUT, `${l}.png`));
  if (!(await t.ev(chakraVisible))) fail(l, 'chakra not shown with reduced motion');
  await t.ev(`document.getElementById('ch-in').click()`); if (!(await waitZoom(t, 1))) fail(l, 'zoom does not work with reduced motion');
  await clickRow(t, 'Level 10'); await t.sleep(300);
  if (await t.ev(`document.getElementById('ch-card').hidden`)) fail(l, 'cards do not open with reduced motion');
});
await pass('chakra-2000-events', { w: 390, h: 844, mobile: true }, async (t, l) => {
  await seed(t, { traveller: false }); await t.send('Page.navigate', { url: `${process.env.GAME_URL}?synth=2000` }); await waitRows(t); await t.sleep(300);
  await t.ev(`document.querySelector('.ch-tab[data-y="3"]').click()`); await t.sleep(2000); await t.shot(join(OUT, `${l}.png`));
  const rows = await t.ev(`document.querySelectorAll('#ch-rows li').length`); if (!(rows > 0 && rows <= 20)) fail(l, `${rows} list rows in the DOM with 2,025 events`);
  if (!/2025/.test(await t.ev(`document.getElementById('ch-count').textContent`))) fail(l, 'the 2,000 extra events did not load');
  const fps = await t.ev(`new Promise((r) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); })`);
  notes.push(`chakra with 2,025 events in headless Chrome (software GL): ${fps} animation frames in 1 s`);
});

server.close();
console.log(notes.join('\n'));
if (failures.length) { console.error(`\nSMOKE TEST FAILED (${failures.length})\n- ${[...new Set(failures)].join('\n- ')}`); process.exit(1); }
console.log('smoke test passed. Screenshots in tools/out/');
process.exit(0);
