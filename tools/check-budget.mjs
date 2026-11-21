// Size and licence gate. Fails (exit 1) when the first-load files get too big or an asset has no credit line.
// Run: node tools/check-budget.mjs
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
// Budgets in bytes after gzip. First load = what a phone downloads before the first frame.
const BUDGET = { firstLoad: 900 * 1024, anyOneAsset: 1500 * 1024, totalAssets: 4 * 1024 * 1024 };
const FIRST_LOAD = ['index.html', 'src/styles.css', 'src/main.js', 'src/game.js', 'src/sim.js', 'src/world.js', 'src/input.js', 'src/hud.js', 'src/screens.js', 'src/settings.js', 'src/audio.js',
  'src/camera.js', 'src/renderer.js', 'src/renderer2d.js', 'src/characters.js', 'src/picker.js', 'src/mission.js', 'src/missions.js', 'src/progress.js', 'src/objectives.js', 'src/abilities.js', 'src/combat.js', 'src/minimap.js', 'src/loop.js'];
const errors = []; const lines = [];
const gz = async (f) => gzipSync(await readFile(join(ROOT, f))).length;

let first = 0;
for (const f of FIRST_LOAD) { try { first += await gz(f); } catch { /* file not in this build */ } }
lines.push(`first-load files (gzip): ${(first / 1024).toFixed(0)} KB of ${(BUDGET.firstLoad / 1024).toFixed(0)} KB`);
if (first > BUDGET.firstLoad) errors.push(`first-load files are ${(first / 1024).toFixed(0)} KB gzipped, budget is ${(BUDGET.firstLoad / 1024).toFixed(0)} KB`);

// The 3D bundle is lazy-loaded after the first frame, so it has its own line.
for (const f of ['src/vendor/three-lite.js', 'src/renderer3d.js']) { try { lines.push(`lazy ${f} (gzip): ${((await gz(f)) / 1024).toFixed(0)} KB`); } catch { /* optional */ } }

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}
let assets = [];
try { assets = (await walk(join(ROOT, 'assets'))).filter((p) => !/CREDITS\.md$|\.gitkeep$/.test(p)); } catch { /* no assets yet */ }
let credits = '';
try { credits = await readFile(join(ROOT, 'assets/CREDITS.md'), 'utf8'); } catch { /* none */ }
let total = 0;
for (const a of assets) {
  const rel = relative(ROOT, a); const size = gzipSync(await readFile(a)).length; total += size;
  if (size > BUDGET.anyOneAsset) errors.push(`${rel} is ${(size / 1024).toFixed(0)} KB gzipped, over ${(BUDGET.anyOneAsset / 1024).toFixed(0)} KB`);
  if (!credits.includes(rel.replace(/^assets\//, '')) && !credits.includes(rel)) errors.push(`${rel} has no line in assets/CREDITS.md (source URL and licence are required)`);
}
lines.push(`assets: ${assets.length} files, ${(total / 1024).toFixed(0)} KB gzipped`);
if (total > BUDGET.totalAssets) errors.push(`assets total ${(total / 1024).toFixed(0)} KB gzipped, over ${(BUDGET.totalAssets / 1024).toFixed(0)} KB`);

// No secrets in the tree.
for (const f of (await walk(ROOT)).filter((p) => !/node_modules|\.git\/|vendor|\.png$|\.jpg$|\.glb$|\.woff2?$/.test(p))) {
  const s = (await stat(f)).size; if (s > 2e6) continue;
  const text = await readFile(f, 'utf8').catch(() => '');
  if (/(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{32,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----)/.test(text)) errors.push(`possible secret in ${relative(ROOT, f)}`);
}

console.log(lines.join('\n'));
if (errors.length) { console.error('\nBUDGET CHECK FAILED\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('budget check passed');
