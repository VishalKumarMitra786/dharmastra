// Layout and tuning for "Escape from Hastinapur" (docs/design/levels-v2.md, level 1). Text lives in dvapara-escape.json.
// Fight-driven: there are no patrols. The road is a chain of fights that arrive in waves (mouth -> lamp rows -> canal bridge with Captain Kunjara), joined by three short runs.
// `flow` is the order the one-line objective follows. A style meter (src/style.js) scores every hit, parry and finisher; `rank` sets what an S needs.
// Rules 2: the traveller starts with bare hands (a fist combo, block, parry, roll and shove) and every watchman is armed. Nothing hurts by touch:
// a watchman must wind up a visible blow (spear thrust, sword slash, shield bash) and you can roll, block, parry or win the exchange. At most two attack at once.
// Legend: # wall, o pillar, . road, S start tile, 1 2 3 = top-left tile of a 2x2 checkpoint spot, in order.
// Guard paths are in tile-edge units (world = value * tileSize): road centres sit on even-ish edges.
export const layout = {
  mode: 'foot', // the player walks; the city is seen from above on a map-style camera
  rules: 2, // combat on: armed guards, hit windows, no contact damage
  theme: 'hastinapur', // era look used by the 3D renderer
  tileSize: 72,
  // Props (docs/review/prop-hooks.md; tile units): Do takes one, J/K swing it, a beaten or disarmed guard drops its weapon. Sticks lie by the start so a fists-only traveller can arm themselves;
  // the only real weapons are a bamboo staff and a spear rack mid-city, and every prop wears out, so the watch is never trivial. Benches and crates are heavy (slow, two hands). Pots stand in the market lane.
  props: [
    { kind: 'stick', at: [3.5, 1.5] }, { kind: 'stick', at: [2.5, 2.5] }, { kind: 'bamboo-staff', at: [5.5, 2.5] },
    { kind: 'clay-pot', at: [16.5, 1.5] }, { kind: 'clay-pot', at: [17.5, 1.5] }, { kind: 'clay-pot', at: [24.5, 12.5] },
    { kind: 'bench', at: [12.5, 6.5] }, { kind: 'bench', at: [22.5, 6.5] }, { kind: 'crate', at: [2.5, 12.5] },
    { kind: 'spear', at: [8.5, 10.5] }, { kind: 'spear', at: [9.5, 10.5] }, // the spear rack
    { kind: 'oil-lamp', at: [7.5, 13.5] }, { kind: 'stone', at: [5.5, 16.5] }, { kind: 'stone', at: [20.5, 11.5] }, { kind: 'grain-sack', at: [18.5, 7.5] },
  ],
  startAngle: 0, // radians, 0 = east
  timeLimit: 240, // seconds in "standard" timer mode; "extended" doubles it (a fight costs time)
  rows: [
    '############################',
    '#S...........1.............#',
    '#..........................#',
    '#..####..####..####..####..#',
    '#..####..####..####..####..#',
    '#..####..####..####..####..#',
    '#..........................#',
    '#..........................#',
    '#..####........#..#..####..#',
    '#..####...oo...#..#..####..#',
    '#..####........#..#..####..#',
    '#........................2.#',
    '#..........................#',
    '#..####..####..####........#',
    '#..####..####..####...oo...#',
    '#..####..####..####........#',
    '#........................3.#',
    '#..........................#',
    '############################',
  ],
  // Armed watchmen on patrol (kind: spearman = long thrust, swordsman = slash chains of 1 to 3, shield = guards its front, flank it or shove to break the guard).
  guards: [], // fight-driven: every enemy arrives in a wave, aware and coming
  flow: ['mouth', 'cp1', 'rows', 'cp2', 'bridge', 'cp3'],
  rank: { style: 520, combo: 12, parSecs: 190, maxSecs: 320 },
  objectives: [
    { id: 'cp1', type: 'reach', target: 'cp1', text: 'Run to Lamp Rows' },
    { id: 'cp2', type: 'reach', target: 'cp2', text: 'Cross to the bridge' },
    { id: 'cp3', type: 'reach', target: 'cp3', text: 'Out the east gate!' },
    // 1. Bazaar mouth: one spearman (dodge, then hit back), then a spearman and a swordsman.
    { id: 'mouth', type: 'waves', text: 'Break the watch', heal: 8, gap: 2, waves: [
      [{ kind: 'spearman', at: [7.5, 1.5] }],
      [{ kind: 'spearman', at: [8.5, 2.5] }, { kind: 'swordsman', at: [10.5, 1.5] }],
    ] },
    // 2. Lamp rows (the chase becomes a brawl): a shield wall, then three spears from three sides, then swords and a shield.
    { id: 'rows', type: 'waves', after: 'mouth', unlock: 1, text: 'Hold Lamp Rows', heal: 14, gap: 2.5, waves: [
      [{ kind: 'spearman', at: [19.5, 2.5] }, { kind: 'shield', at: [8.5, 6.5] }],
      [{ kind: 'spearman', at: [20.5, 6.5] }, { kind: 'spearman', at: [8.5, 7.5] }, { kind: 'swordsman', at: [14.5, 7.5] }],
      [{ kind: 'swordsman', at: [6.5, 2.5] }, { kind: 'swordsman', at: [22.5, 7.5] }, { kind: 'shield', at: [14.5, 6.5] }],
    ] },
    // 3. Canal bridge: Captain Kunjara. Phase 2 (the bell) brings two spearmen.
    { id: 'bridge', type: 'waves', after: 'rows', unlock: 2, boss: 'Captain Kunjara', text: 'Beat Kunjara', heal: 0, waves: [
      [{ kind: 'captain', at: [21.5, 12.5] }],
    ], reinforce: { 2: [{ kind: 'spearman', at: [19.5, 9.5] }, { kind: 'spearman', at: [19.5, 12.5] }] } },
    { id: 'arm', type: 'do', event: 'prop-pickup', count: 1, optional: true, text: 'Optional: grab a weapon (Do)' },
  ],
};
