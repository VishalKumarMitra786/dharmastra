// Layout and tuning for "Escape from Hastinapur". Text lives in dvapara-escape.json.
// Legend: # wall, o pillar, . road, S start tile, 1 2 3 = top-left tile of a 2x2 checkpoint spot, in order.
// Guard paths are in tile-edge units (world = value * tileSize): road centres sit on even-ish edges.
export const layout = {
  tileSize: 72,
  startAngle: 0, // radians, 0 = east
  timeLimit: 150, // seconds in "standard" timer mode; "extended" doubles it
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
  guards: [
    { speed: 80, path: [[8, 2], [8, 7]] },
    { speed: 85, path: [[20, 2], [20, 12]] },
    { speed: 75, path: [[26, 6], [26, 12]] },
    { speed: 90, path: [[4, 17], [14, 17]] },
    { speed: 70, path: [[2, 7], [8, 7], [8, 12], [2, 12]] },
    { speed: 85, path: [[10, 12], [24, 12]] },
  ],
};
