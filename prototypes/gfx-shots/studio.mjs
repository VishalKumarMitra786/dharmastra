// node prototypes/gfx-shots/studio.mjs <out.png> "<query>" [w] [h]
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = createServer(async (req, res) => { try { const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)); const f = join(ROOT, p); const b = await readFile(f); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => server.listen(0, r));
process.env.CDP_PORT = String(12000 + Math.floor(Math.random() * 2000)); process.env.GAME_URL = `http://localhost:${server.address().port}/prototypes/gfx-shots/studio.html`;
const { launch } = await import('../../tools/cdp.mjs');
const [out, query = '', w = '600', h = '800'] = process.argv.slice(2); const pairs = query.split('||');
const t = await launch({ w: Number(w), h: Number(h), mobile: false, tag: 'studio' });
let i = 0; for (const qq of pairs) {
  await t.send('Page.navigate', { url: `${process.env.GAME_URL}?${qq}` }); await t.sleep(1000); for (let k = 0; k < 100 && !(await t.ev('window.__ready===true')); k++) await t.sleep(250);
  await t.sleep(400); const file = pairs.length > 1 ? out.replace('.png', `-${i}.png`) : out; await t.shot(file); console.log(file, await t.ev('JSON.stringify(window.__info)')); i++;
}
if (t.logs.length) console.log('console:', t.logs.slice(0, 8).join(' | ')); t.close(); server.close(); process.exit(0);
