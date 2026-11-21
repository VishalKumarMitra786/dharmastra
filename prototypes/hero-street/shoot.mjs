// Screenshot and performance driver for the hero spike (headless Chrome, software GL). Not part of the page.
// Run (server on 8779 from the repo root):  node prototypes/hero-street/shoot.mjs shots | perf | one "<query>" <w> <h> <file>
import { mkdirSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8779/prototypes/hero-street/index.html';
const OUT = new URL('./shots/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
process.env.CDP_PORT ||= String(10200 + Math.floor(Math.random() * 1500)); // tools/cdp.mjs reads the port when it is imported, so import it only now
process.env.GAME_URL ||= BASE;
const { launch } = await import('../../tools/cdp.mjs');
async function page(query, w, h, mobile, fn) {
  process.env.GAME_URL = BASE; // tools/cdp.mjs reads this once at import; each page is then opened with its own query below
  const t = await launch({ w, h, mobile, tag: 'hero' });
  try {
    await t.send('Page.navigate', { url: `${BASE}?${query}` }); await t.sleep(800);
    for (let i = 0; i < 80 && !(await t.ev('window.__ready === true')); i++) await t.sleep(250);
    console.log('shot', query, w, h);
    await t.sleep(600); return await fn(t);
  } finally { if (t.logs.length) console.log('console:', t.logs.join(' | ')); t.close(); }
}
const mode = process.argv[2];
if (mode === 'one') { const [, , , query, w, h, file] = process.argv; await page(query, Number(w), Number(h), Number(w) < 700, async (t) => { await t.shot(OUT + file); console.log(await t.ev('JSON.stringify(window.__info)')); }); }
if (mode === 'shots') {
  for (const [w, h, mobile] of [[360, 740, true], [1280, 800, false]]) {
    const s = `${w}x${h}`;
    for (const view of ['front', 'side', 'back', 'three']) await page(`view=${view}&mode=walk&phase=0.1&ui=0&dpr=2`, w, h, mobile, (t) => t.shot(`${OUT}${view}-${s}.png`));
    await page('view=game&ui=0&dpr=2', w, h, mobile, async (t) => { await t.sleep(2500); await t.shot(`${OUT}game-${s}.png`); });
    await page('view=game&heroes=12&ui=0&dpr=2', w, h, mobile, async (t) => { await t.sleep(2500); await t.shot(`${OUT}crowd-${s}.png`); });
  }
  await page('view=game&dpr=2', 360, 740, true, async (t) => { await t.sleep(1500); await t.shot(`${OUT}ui-360x740.png`); });
  for (const p of [0, 0.25, 0.5, 0.75]) await page(`view=side&mode=walk&phase=${p}&ui=0&dpr=2&compare=0`, 390, 844, true, (t) => t.shot(`${OUT}phase-${String(p).replace('.', '')}-390x844.png`));
}
if (mode === 'perf') {
  const results = {};
  for (const heroes of [1, 12]) await page(`view=game&heroes=${heroes}&compare=0&ui=0&dpr=1`, 390, 844, true, async (t) => {
    await t.ev('window.__hero.runPerf()'); await t.sleep(21500);
    results[heroes] = JSON.parse(await t.ev('JSON.stringify(window.__perf)')); results[heroes].info = JSON.parse(await t.ev('JSON.stringify(window.__info)'));
    results[heroes].text = await t.ev("document.getElementById('out').textContent");
  });
  console.log(JSON.stringify(results, null, 1));
}
