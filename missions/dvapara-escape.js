// Layout and tuning for "Escape from Hastinapur". Text lives in dvapara-escape.json.
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
    '#3.........................#',
    '#..........................#',
    '############################',
  ],
  // Armed watchmen on patrol (kind: spearman = long thrust, swordsman = slash chains of 1 to 3, shield = guards its front, flank it or shove to break the guard).
  guards: [
    { kind: 'spearman', speed: 70, path: [[8, 2], [8, 7]] },
    { kind: 'swordsman', speed: 70, path: [[20, 2], [20, 12]] },
    { kind: 'spearman', speed: 65, path: [[26, 6], [26, 12]] },
    { kind: 'swordsman', speed: 70, path: [[4, 17], [14, 17]] },
    { kind: 'swordsman', speed: 60, path: [[2, 7], [8, 7], [8, 12], [2, 12]] },
    { kind: 'shield', speed: 50, path: [[10, 12], [24, 12]] },
  ],
  objectives: [
    { id: 'arm', type: 'do', event: 'prop-pickup', count: 1, optional: true, text: 'Optional: pick up a stick or a pole (Do)' },
  ],
};
