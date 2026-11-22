// Layout and tuning for "The Lamp Merchant's Route" (Mauryan Pataliputra). Text lives in mauryan-spy.json.
// Legend: # wall (buildings, palisade, river bank), o pillar, . road, S start tile, 1 2 3 = top-left tile of a 2x2 checkpoint spot, in order.
// Guard paths are in tile-edge units (world = value * tileSize); alleys are 2 tiles wide so their centres sit on even edges.
export const layout = {
  mode: 'foot', // the player walks; the city is seen from above on a map-style camera
  rules: 2, // combat on. Stealth stays: stay out of a watchman's sight cone and he never fights you. Seen, he calls his mates, and he is armed.
  theme: 'pataliputra', // era look used by the 3D renderer
  tileSize: 72,
  startAngle: 0, // radians, 0 = east
  timeLimit: 300, // seconds in "standard" timer mode; "extended" doubles it
  rows: [
    '##################################',
    '#..........1...................3.#',
    '#................................#',
    '#..####..####..####..####..####..#',
    '#..####..####..####..####..####..#',
    '#..####..####..####..####..####..#',
    '#................................#',
    '#................................#',
    '#..####..####........####..####..#',
    '#..####..####...o.o..####..####..#',
    '#..####..####........####..####..#',
    '#.......................2........#',
    '#S...............................#',
    '##################################',
    '##################################',
  ],
  guards: [
    { kind: 'spearman', speed: 70, path: [[8, 3], [8, 7]] },
    { kind: 'swordsman', speed: 70, path: [[26, 3], [26, 7]] },
    { kind: 'swordsman', speed: 65, path: [[3, 7], [18, 7]] },
    { kind: 'spearman', speed: 70, path: [[4, 12], [20, 12]] },
    { kind: 'shield', speed: 50, path: [[20, 7], [20, 12]] },
    { kind: 'archer', speed: 55, path: [[32, 3], [32, 12]] },
    { kind: 'swordsman', speed: 70, path: [[14, 2], [29, 2]] },
  ],
  objectives: [
    { id: 'unseen', type: 'evade', max: 0, optional: true, text: 'Optional: reach the sluice without being seen' },
  ],
};
