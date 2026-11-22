// Tests for the first rules-2 mission, "The Pepper Road", and the level gate. Registered from run.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLayout } from '../world.js';
import { createSim, step } from '../sim.js';
import { validateMission } from '../mission.js';
import { validateObjectiveDefs } from '../objectives.js';
import { MISSIONS, missingFor } from '../missions.js';
import { layout } from '../../missions/sangam-staff.js';

const DT = 1 / 60;
const mission = JSON.parse(await readFile(new URL('../../missions/sangam-staff.json', import.meta.url), 'utf8'));
const A = (o = {}) => ({ attack: false, jump: false, crouch: false, interact: false, ...o });
function run(sim, secs, c = {}, first = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(secs / DT); i++) ev.push(...step(sim, DT, { mx: 0, my: 0, run: false, ...c, action: A(i === 0 ? first : {}) }));
  return ev;
}
const warp = (sim, p) => { sim.chariot.x = p.x; sim.chariot.y = p.y; };

export function registerSangam(test) {
  test('sangam mission: JSON and layout agree (3 checkpoints, 3 sacks, three armed guards, valid objectives)', () => {
    assert.deepEqual(validateMission(mission), []);
    const w = parseLayout(layout);
    assert.equal(w.rules, 2);
    assert.equal(w.checkpoints.length, mission.objectives.length);
    assert.equal(w.pickups.filter((k) => k.kind === 'sack').length, 3);
    assert.deepEqual(w.spawns.map((a) => a.kind).sort(), ['shield', 'spearman', 'swordsman'], 'every guard is armed and has a kind');
    assert.deepEqual(validateObjectiveDefs(layout.objectives, w.checkpoints.length), []);
    for (const d of mission.dialogue) assert.ok(d.text.length <= 140, `${d.id} is ${d.text.length} characters`);
    for (const e of mission.events) assert.ok(['History', 'Tradition', 'Invented'].includes(e.label));
  });

  test('level gate: the Pepper Road needs the lessons of the two earlier levels and names them', () => {
    const m = MISSIONS.find((x) => x.id === 'sangam-staff');
    assert.deepEqual(missingFor(m, ['walk', 'run']), ['Escape from Hastinapur', 'The Night Report of Pataliputra']);
    assert.deepEqual(missingFor(m, ['walk', 'run', 'vault']), ['The Night Report of Pataliputra']);
    assert.deepEqual(missingFor(m, ['walk', 'run', 'vault', 'crouch']), []);
    assert.deepEqual(missingFor(MISSIONS[0], []), []);
    for (const x of MISSIONS) assert.ok(x.grants.length >= 1, `${x.id} teaches something`);
  });

  test('sangam playthrough: vault the wall, crouch under the beam, collect the sacks, finish; the staff is lent', () => {
    const w = parseLayout(layout); const ts = w.tileSize;
    const sim = createSim(w, { timerMode: 'off', abilities: ['crouch', 'vault', 'staff'], weapon: 'staff', seed: 3 });
    assert.equal(sim.rules2, true);
    assert.equal(sim.player.weapon, 'staff');
    sim.enemies = []; // keep this test about the route, not the raiders
    // 1. vault the low wall at column 8 by walking at it and pressing jump
    warp(sim, { x: 7.65 * ts, y: 5.5 * ts });
    const ev1 = run(sim, 0.3, { mx: 1, my: 0 }, { jump: true });
    run(sim, 0.8, { mx: 1, my: 0 });
    assert.ok(ev1.some((e) => e.type === 'vault'), 'vault event');
    assert.ok(sim.chariot.x > 8.5 * ts, `crossed the wall, x=${sim.chariot.x}`);
    // 2. crouch and pass the beam at column 19
    warp(sim, { x: 18.3 * ts, y: 5.5 * ts });
    run(sim, 0.05, {}, { crouch: true });
    run(sim, 2.0, { mx: 1, my: 0 }); // crouched speed is half
    assert.ok(sim.chariot.x > 19.6 * ts, `passed the beam, x=${sim.chariot.x}`);
    // standing, the beam blocks
    const stand = createSim(w, { timerMode: 'off', abilities: ['crouch', 'vault'], seed: 3 }); stand.enemies = [];
    warp(stand, { x: 18.3 * ts, y: 5.5 * ts }); run(stand, 1.2, { mx: 1, my: 0 });
    assert.ok(stand.chariot.x < 19 * ts, 'a standing player is stopped by the beam');
    // 3. collect all sacks and reach every checkpoint
    for (const k of w.pickups) { warp(sim, k); run(sim, 0.1, {}, { interact: true }); }
    assert.equal(sim.objectives.items.find((o) => o.id === 'sacks').state, 'done');
    w.checkpoints.forEach((c) => { warp(sim, c); run(sim, 0.1); });
    assert.equal(sim.status, 'won');
  });

  test('sangam mission without the lessons: the vault is refused, so the level must stay locked', () => {
    const w = parseLayout(layout);
    const sim = createSim(w, { timerMode: 'off', abilities: [], seed: 3 }); sim.enemies = [];
    warp(sim, { x: 7.65 * w.tileSize, y: 5.5 * w.tileSize });
    const ev = run(sim, 1.2, { mx: 1, my: 0 }, { jump: true });
    assert.ok(!ev.some((e) => e.type === 'vault'));
    assert.ok(sim.chariot.x < 8.5 * w.tileSize, 'still on the near side');
  });
}
