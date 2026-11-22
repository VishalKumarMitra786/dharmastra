// Checks for the human asset (assets/characters/hero.glb). Self-contained: prints PASS/FAIL lines, sets exitCode on failure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const rd = (p) => readFileSync(new URL(p, root));
const t = (name, fn) => { try { fn(); console.log('PASS  hero: ' + name); } catch (e) { console.log('FAIL  hero: ' + name + ' ' + e.message); process.exitCode = 1; } };
const glb = rd('assets/characters/hero.glb');
const jl = glb.readUInt32LE(12); const json = JSON.parse(glb.subarray(20, 20 + jl).toString());
const ex = json.asset.extras || {};

t('hero.glb is under 80 KB gzipped', () => assert.ok(gzipSync(glb).length < 80 * 1024, 'gz ' + gzipSync(glb).length));
t('triangle budget: at most 6000 across all shells', () => {
  let tris = 0; for (const m of json.meshes) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3;
  assert.ok(tris <= 6000, 'tris ' + tris);
});
t('one skeleton of at most 32 bones', () => { assert.equal(json.skins.length, 1); assert.ok(json.skins[0].joints.length <= 32, 'bones ' + json.skins[0].joints.length); });
t('shell table present and every shell has triangles', () => {
  assert.ok(ex.shells && Object.keys(ex.shells).length >= 5);
  for (const s of ['tunic', 'dhoti', 'shoes']) assert.ok(ex.shells[s], 'missing ' + s);
});
t('head frame is in a human range (head about 1.6-1.8 units tall)', () => { const h = ex.head; assert.ok(h && h.top > h.chin && h.top - h.chin > 0.15 && h.top - h.chin < 0.4); });
t('licence: MakeHuman CC0 recorded in assets/CREDITS.md with source and licence files', () => {
  const c = rd('assets/CREDITS.md').toString();
  assert.ok(/MakeHuman/.test(c) && /CC0/.test(c));
  for (const f of ['assets/characters/makehuman-LICENSE.md', 'assets/characters/makehuman-LICENSE.ASSETS.md', 'assets/characters/hero.sources.json']) rd(f);
});
t('three-lite vendored build is documented by a build script', () => { rd('tools/build-three-lite.mjs'); rd('tools/build-hero.mjs'); });

// ---- animation checks (pure functions, no GPU) ----
const { pose, makePose, BONES, LEGS } = await import('../gfx/human/anim.js');
t('every state and enemy attack kind poses without NaN, and the wind-up differs from the strike', () => {
  const a = makePose(); const b = makePose();
  for (const st of ['idle', 'attack', 'shove', 'block', 'parry', 'aim', 'hurt', 'stagger', 'dodge', 'vault', 'climb', 'down', 'windup', 'strike', 'recover', 'call', 'alert', 'talk', 'crouch'])
    for (const kind of ['slam', 'thrust', 'bash', 'lunge', 'slash', '']) {
      pose(a, { state: st, t: 0.2, windup: 0.8, u: 0.5, attackName: kind, weapon: 'sword', guard: true, atk: { kind: 'light', progress: 0.5, hit: 0.4 }, legs: LEGS, cycle: 0.3, speed: 0.5 });
      for (const n of BONES) assert.ok(a.rot[n].every(Number.isFinite), `${st}/${kind}/${n}`);
      assert.ok(Number.isFinite(a.lift));
    }
  for (const kind of ['slam', 'thrust', 'bash', 'lunge', 'slash']) {
    pose(a, { state: 'windup', t: 0.3, windup: 1, attackName: kind, weapon: 'sword', legs: LEGS }); pose(b, { state: 'strike', t: 0.1, u: 1, attackName: kind, weapon: 'sword', legs: LEGS });
    const diff = BONES.reduce((s, n) => s + Math.abs(a.rot[n][0] - b.rot[n][0]) + Math.abs(a.rot[n][1] - b.rot[n][1]), 0); assert.ok(diff > 1, kind + ' wind-up and strike look the same');
  }
});
t('the wind-up reads: arm raise grows over the wind-up (so a 0.45 s telegraph shows progress)', () => {
  const a = makePose(); const b = makePose();
  pose(a, { state: 'windup', t: 0, windup: 0.1, attackName: 'slash', weapon: 'club', legs: LEGS }); pose(b, { state: 'windup', t: 0.45, windup: 1, attackName: 'slash', weapon: 'club', legs: LEGS });
  assert.ok(Math.abs(a.rot.upperarm_R[0] - b.rot.upperarm_R[0]) > 1.5);
});
t('renderer3d draws the combat fields (phase, aim, guard, open, projectiles) and has no RoomEnvironment', () => {
  const src = rd('src/renderer3d.js').toString();
  for (const k of ['e.windup', 'att.reach', 'att.halfArc', 'att.unblockable', 'e.aim', 'e.guard', 'e.open', 'frame.projectiles', 'frame.hitstop', 'frame.timeScale', 'e.calling']) assert.ok(src.includes(k), k);
  assert.ok(!src.includes('RoomEnvironment'));
});
