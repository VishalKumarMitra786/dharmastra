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
};
