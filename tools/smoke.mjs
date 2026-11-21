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
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file));
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
  await t.ev(`localStorage.clear()`); await t.send('Page.navigate', { url: process.env.GAME_URL }); await t.sleep(2500);
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

server.close();
console.log(notes.join('\n'));
if (failures.length) { console.error(`\nSMOKE TEST FAILED (${failures.length})\n- ${[...new Set(failures)].join('\n- ')}`); process.exit(1); }
console.log('smoke test passed. Screenshots in tools/out/');
process.exit(0);
