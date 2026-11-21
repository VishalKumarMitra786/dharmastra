// Layout for "The Pepper Road" (Sangam age, Tamilakam). Text lives in sangam-staff.json.
// Legend: # wall, o pillar, . road, S start, 1 2 3 = top-left tile of a 2x2 checkpoint spot, = low wall (vault), ~ low bamboo beam (crouch under),
// , tall grass (cover), k pepper sack, a raider (guards the road, sweeps its gaze).
export const layout = {
  mode: 'foot',
  rules: 2, // hurdles, objectives and the staff are on
  theme: 'pataliputra', // placeholder look: a Sangam harbour theme is still to be made
  tileSize: 72,
  startAngle: 0,
  timeLimit: 240,
  rows: [
    '##############################',
    '#.......=..........#.........#',
    '#.......=..1.......#..k......#',
    '#.......=..........#.......k.#',
    '#.......=..........#....2....#',
    '#...S...=.....a....~.........#',
    '#.......=..........~.........#',
    '#.......=...,,,,...#....a....#',
    '#.......=...,,,,...#.......3.#',
    '#.......=...,,,,o..#..k......#',
    '#.......=...o......#.........#',
    '##############################'
],
  entities: { k: { kind: 'sack' }, a: { kind: 'raider', hp: 3 } },
  objectives: [
    { id: 'sacks', type: 'collect', kind: 'sack', count: 3, text: 'Gather the three scattered pepper sacks' },
    { id: 'unseen', type: 'evade', max: 0, optional: true, text: 'Reach the harbour without being spotted' },
  ],
};
