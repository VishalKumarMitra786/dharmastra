// Screenshot driver for the graphics work: real game camera, headless Chrome (software GL). Not shipped.
// Run: node prototypes/gfx-shots/shoot.mjs <label> [mission] [script-file]   Output: prototypes/gfx-shots/out/<label>-<size>.png
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname; const OUT = join(ROOT, 'prototypes/gfx-shots/out'); await mkdir(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => {
  try { const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, ''); const f = join(ROOT, p.endsWith('/') ? p + 'index.html' : p); const b = await readFile(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, r));
process.env.GAME_URL = `http://localhost:${server.address().port}/index.html`;
process.env.CDP_PORT = String(11000 + Math.floor(Math.random() * 2000));
const { launch } = await import('../../tools/cdp.mjs');
const [label = 'x', mission = 'dvapara-escape', scriptFile] = process.argv.slice(2);
const script = scriptFile ? (await readFile(scriptFile, 'utf8')) : '';
for (const [w, h, mobile] of [[390, 844, true], [1280, 800, false]]) {
  const t = await launch({ w, h, mobile, tag: 'shot' });
  try {
    await t.ev(`localStorage.setItem('dharmastra.traveller', JSON.stringify({look:'veer',name:'Veer',outfit:'saffron'}))`);
    await t.send('Page.navigate', { url: `${process.env.GAME_URL}?mission=${mission}&dev=1` }); await t.sleep(3000);
    await t.ev(`document.getElementById('start-btn').click()`); await t.sleep(2500);
    if (script) { const r = await t.ev(script); if (r) console.log('script:', r); await t.sleep(1800); }
    await t.shot(join(OUT, `${label}-${w}x${h}.png`));
    console.log(label, w, h, await t.ev(`JSON.stringify(window.__gfxInfo||null)`));
  } catch (e) { console.log('ERR', e.message); }
  if (t.logs.length) console.log('console:', t.logs.slice(0, 5).join(' | '));
  t.close();
}
server.close(); process.exit(0);
