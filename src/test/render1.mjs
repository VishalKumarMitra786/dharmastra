// Render-side tests for the phase 1 frame fields. Self-contained: prints PASS/FAIL lines and sets exitCode on failure.
// Covers the pure helpers and the 2D renderer on a recording fake canvas. The 3D renderer needs WebGL, so it is checked in a browser instead.
import assert from 'node:assert/strict';
import { enemyIcon, vaultHop, burstSpec, burstColor, MAX_PARTICLES } from '../camera.js';
import { iconVertices } from '../renderer3d.js';
import { createRenderer2D } from '../renderer2d.js';

const out = [];
const t = (name, fn) => { try { fn(); out.push(['PASS', name]); } catch (e) { out.push(['FAIL', name, e.message]); process.exitCode = 1; } };

function fakeCanvas() {
  const calls = []; const state = { alphaMax: 0 };
  const ctx = new Proxy({}, {
    get: (_, k) => (k === 'createPattern' ? () => ({}) : k === 'canvas' ? {} : (...a) => { calls.push(k); }),
    set: (_, k, v) => { if (k === 'globalAlpha') state.alphaMax = Math.max(state.alphaMax, v); return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, calls, state };
}
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
const world = { width: 800, height: 600, walls: [{ x: 0, y: 0, w: 40, h: 40 }] };
const base = () => ({
  chariot: { x: 200, y: 200, angle: 0, radius: 18, speed: 0, invulnerable: false }, mode: 'foot', guards: [{ x: 300, y: 200, angle: 0, radius: 16 }],
  checkpoints: [{ x: 400, y: 300, radius: 30, state: 'next' }], effects: { shake: 0, flash: 0 }, reducedMotion: false, time: 1,
});
const full = () => ({
  ...base(),
  player: { state: 'crouch', stateT: 0.2, weapon: 'staff', crouch: true },
  enemies: ['patrol', 'alert', 'chase', 'windup', 'stagger', 'down'].map((state, i) => ({ id: i, x: 250 + i * 40, y: 260, angle: 0, hpFrac: 1, state })),
  pickups: [{ id: 'p1', x: 120, y: 120, kind: 'staff', taken: false }, { id: 'p2', x: 160, y: 120, kind: 'staff', taken: true }],
  obstacles: [{ x: 80, y: 300, w: 48, d: 48, kind: 'lowwall' }, { x: 140, y: 300, w: 48, d: 48, kind: 'beam' }, { x: 200, y: 300, w: 48, d: 48, kind: 'grass' }],
  events: [{ type: 'hit-enemy', x: 290, y: 260 }, { type: 'hurt', x: 200, y: 200 }],
  attack: { active: true, progress: 0.4, angle: 0 }, blood: true,
});

t('helpers: icon shapes by state, none for patrol and down', () => {
  assert.equal(enemyIcon('patrol'), null); assert.equal(enemyIcon('down'), null); assert.equal(enemyIcon(undefined), null);
  assert.equal(enemyIcon('alert'), 'bang'); assert.equal(enemyIcon('search'), 'question'); assert.equal(enemyIcon('stagger'), 'shield');
  assert.equal(new Set(['bang', 'question', 'shield'].map((k) => iconVertices(k).length)).size, 3, 'three distinct shapes');
  for (const k of ['bang', 'question', 'shield']) { const v = iconVertices(k); assert.ok(v.length > 0 && v.length % 9 === 0 && v.every(Number.isFinite)); }
});
t('helpers: vault hop peaks mid-vault and is smaller with reduced motion', () => {
  assert.equal(vaultHop(0), 0); assert.ok(Math.abs(vaultHop(0.25) - 22) < 1e-9); assert.ok(vaultHop(0.5) < 1e-9); assert.ok(vaultHop(0.25, true) < vaultHop(0.25, false));
});
t('helpers: bursts cap, fade 300 ms, blood off gives neutral sparks, reduced motion shortens', () => {
  for (const k of ['hit-enemy', 'enemy-down', 'hurt', 'pickup', 'vault']) { const s = burstSpec(k, false); assert.ok(s.n <= MAX_PARTICLES && s.life === 0.3); assert.ok(burstSpec(k, true).life < s.life && burstSpec(k, true).n <= s.n); }
  assert.equal(burstSpec('nope', false), null); assert.equal(MAX_PARTICLES, 24);
  const hit = burstSpec('hit-enemy', false);
  assert.notEqual(burstColor(hit, true), burstColor(hit, false)); assert.equal(burstColor(hit, undefined), burstColor(hit, false));
  assert.equal(burstColor(burstSpec('pickup', false), true), burstColor(burstSpec('pickup', false), false));
});
t('2D: an old frame with no new fields still renders', () => {
  const { canvas } = fakeCanvas(); const r = createRenderer2D(canvas); r.resize(390, 844, 2); r.setWorld(world); r.render(base());
});
t('2D: the full phase 1 frame renders and draws more than the old frame', () => {
  const a = fakeCanvas(); const ra = createRenderer2D(a.canvas); ra.resize(390, 844, 2); ra.setWorld(world); ra.render(base());
  const b = fakeCanvas(); const rb = createRenderer2D(b.canvas); rb.resize(390, 844, 2); rb.setWorld(world); rb.render(full());
  assert.ok(b.calls.length > a.calls.length + 50, `${b.calls.length} vs ${a.calls.length}`);
});
t('2D: renders with blood off, reduced motion, empty arrays and a repeated frame', () => {
  const { canvas } = fakeCanvas(); const r = createRenderer2D(canvas); r.resize(360, 640, 1); r.setWorld(world);
  const f = full(); f.blood = false; f.reducedMotion = true; r.render(f); r.render(f);
  r.render({ ...base(), enemies: [], pickups: [], obstacles: [], events: [], attack: { active: false, progress: 0, angle: 0 }, player: { state: 'idle', stateT: 0, weapon: 'none', crouch: false } });
  r.render({ ...full(), events: Array.from({ length: 30 }, () => ({ type: 'hit-enemy', x: 1, y: 1 })) }); // far more events than the pool: must not throw
});

for (const [s, n, m] of out) console.log(`${s}  render1: ${n}${m ? `\n      ${m}` : ''}`);
