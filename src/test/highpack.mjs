// Checks for the lazily loaded High head pack: failure falls back to the old head, the slot cap and the distance LOD swap heads without touching the skeleton.
// No GPU: the canvas is a stub, the vendored three-lite builds geometry only. Prints PASS/FAIL lines and sets exitCode on failure.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three-lite.js';
import { createHumanKit } from '../gfx/human/index.js';
import { makeLook, heroLook } from '../gfx/human/looks.js';

const t = async (name, fn) => { try { await fn(); console.log('PASS  highpack: ' + name); } catch (e) { console.log('FAIL  highpack: ' + name + ' ' + (e.stack || e.message)); process.exitCode = 1; } };
const ctx = new Proxy({}, { get: (_, k) => (k === 'createPattern' || k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'measureText' ? () => ({ width: 1 }) : k === 'canvas' ? {} : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const root = new URL('../../', import.meta.url);
const buffer = readFileSync(new URL('assets/characters/hero.glb', root)).buffer.slice(0);
const heroBuf = () => { const b = readFileSync(new URL('assets/characters/hero.glb', root)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const nodeParse = null; void nodeParse; void buffer;
const warn = console.warn; console.warn = () => {};

await t('a missing pack leaves the kit working with the base heads (fallback to the current hero)', async () => {
  const kit = await createHumanKit(THREE, { buffer: heroBuf(), atlas: 64, tier: 'high', highBase: 'file:///nonexistent-pack/', waitHigh: true });
  assert.equal(kit.high, false, 'pack not loaded');
  const h = kit.spawn(heroLook({ body: 'm', skin: '#c68a5a', hair: '#1b1210', hairStyle: 'short', eyes: '#3a7bd8', outfitColor: '#ff8a1f', accent: '#e8432e' }));
  assert.equal(h.headOn, false); assert.ok(h.tris > 0 && h.tris < 8000, 'base tris ' + h.tris);
  h.upgradeHead(); assert.equal(h.headOn, false, 'upgrade is a no-op without a pack');
  h.update(1 / 60, { state: 'idle', speed: 0, time: 0 }); h.dispose();
});
await t('tier low never loads the pack', async () => {
  const kit = await createHumanKit(THREE, { buffer: heroBuf(), atlas: 64, tier: 'low', waitHigh: true });
  assert.equal(kit.high, false); assert.equal(kit.stats().highCap, 0);
});

// With a fetch that reads the real pack from disk and a stub image decoder, the pack loads for real: cap and distance LOD can be checked without a GPU.
await t('cap: the hero always gets the pack head, others only while a slot is free; far humans fall back and near ones come back', async () => {
  const realFetch = globalThis.fetch; globalThis.fetch = async (u) => { if (!String(u).startsWith('file:')) return realFetch(u); const b = readFileSync(new URL(u)); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), blob: async () => new Blob([b]), json: async () => JSON.parse(b.toString()) }; };
  globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close() {} });
  try {
    const kit = await createHumanKit(THREE, { buffer: heroBuf(), atlas: 64, tier: 'high', maxHigh: 2, highBase: new URL('assets/characters/high/', root).href, waitHigh: true });
    assert.equal(kit.high, true, 'pack loaded from disk'); assert.equal(kit.stats().highCap, 2);
    const hero = kit.spawn(heroLook({ body: 'm', skin: '#c68a5a', hair: '#1b1210', hairStyle: 'short', eyes: '#3a7bd8', outfitColor: '#ff8a1f', accent: '#e8432e' }));
    const folk = [1, 2, 3, 4].map((i) => kit.spawn(makeLook('townsperson', 100 + i)));
    assert.equal(hero.headOn, true, 'hero upgraded'); const on = folk.filter((f) => f.headOn).length;
    assert.equal(on, 1, 'cap 2 = the hero plus one townsperson, got ' + on);
    const baseTris = kit.spawn(makeLook('townsperson', 999), { lod: 3 }).tris; assert.ok(hero.tris > 0 && folk.find((f) => f.headOn).tris > 0 && baseTris > 0);
    const far = folk.find((f) => f.headOn); far.setLod(2); assert.equal(far.headOn, false, 'far human drops to the cheap head'); assert.ok(far.headMeshes.every((m) => !m.visible), 'pack meshes hidden');
    const near = folk.find((f) => !f.headOn); near.setLod(0); assert.equal(near.headOn, true, 'a freed slot goes to a near human'); assert.ok(near.headMeshes.some((m) => m.visible));
    hero.setLod(3); assert.equal(hero.headOn, true, 'the hero keeps the pack head at any lod');
    assert.ok(kit.stats().highHeads <= 2, 'slots: ' + kit.stats().highHeads); folk.forEach((f) => f.dispose()); hero.dispose(); assert.equal(kit.stats().highHeads, 0, 'slots released');
    const h2 = kit.spawn(makeLook('townsperson', 5)); h2.update(1 / 60, { state: 'idle', speed: 0, time: 0 }); h2.setExpression('smile', 1); h2.update(0.1, { state: 'idle', speed: 0, time: 0.1 });
  } finally { globalThis.fetch = realFetch; }
});
console.warn = warn;
delete globalThis.document;
