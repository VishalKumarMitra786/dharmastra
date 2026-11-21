// Layout and tuning for "The Lamp Merchant's Route" (Mauryan Pataliputra). Text lives in mauryan-spy.json.
// Legend: # wall (buildings, palisade, river bank), o pillar, . road, S start tile, 1 2 3 = top-left tile of a 2x2 checkpoint spot, in order.
// Guard paths are in tile-edge units (world = value * tileSize); alleys are 2 tiles wide so their centres sit on even edges.
export const layout = {
  tileSize: 72,
  startAngle: 0, // radians, 0 = east
  timeLimit: 180, // seconds in "standard" timer mode; "extended" doubles it
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
    { speed: 80, path: [[8, 3], [8, 7]] },
    { speed: 85, path: [[14, 3], [14, 7]] },
    { speed: 80, path: [[26, 3], [26, 7]] },
    { speed: 70, path: [[3, 7], [18, 7]] },
    { speed: 90, path: [[4, 12], [20, 12]] },
    { speed: 80, path: [[20, 7], [20, 12]] },
    { speed: 85, path: [[14, 2], [29, 2]] },
    { speed: 75, path: [[32, 3], [32, 12]] },
  ],
};
