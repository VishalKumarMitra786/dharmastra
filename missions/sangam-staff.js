// Layout for "The Pepper Road" (Sangam age, Tamilakam). Text lives in sangam-staff.json.
// Legend: # wall, o pillar, . road, S start, 1 2 3 = top-left tile of a 2x2 checkpoint spot, = low wall (vault), ~ low bamboo beam (crouch under),
// , tall grass (cover), k pepper sack, a spearman (guards the road, sweeps its gaze), b swordsman (harbour watch), c shield bearer (guards the scales: flank it).
// Everyone is armed and fights with a visible wind-up; nothing hurts by touch. The staff is lent: sweep, back-sweep, thrust (J, J, J), overhead (K), block (B), roll (X).
export const layout = {
  mode: 'foot',
  rules: 2, // hurdles, objectives and the staff are on
  theme: 'pataliputra', // placeholder look: a Sangam harbour theme is still to be made
  tileSize: 72,
  // Props (docs/review/prop-hooks.md; tile units): the staff is lent, so the road offers other tools: a market pole, a rope, sacks to swing, stones and pots to throw, a torch, a bench and a crate at the scales.
  props: [
    { kind: 'market-pole', at: [14.5, 4.5] }, { kind: 'rope', at: [2.5, 9.5] }, { kind: 'grain-sack', at: [17.5, 8.5] }, { kind: 'grain-sack', at: [6.5, 2.5] },
    { kind: 'stone', at: [3.5, 8.5] }, { kind: 'stone', at: [10.5, 6.5] }, { kind: 'clay-pot', at: [24.5, 5.5] }, { kind: 'clay-pot', at: [25.5, 8.5] },
    { kind: 'bench', at: [23.5, 10.5] }, { kind: 'crate', at: [21.5, 6.5] }, { kind: 'torch', at: [9.5, 2.5] },
  ],
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
    '#.......=...,,,,...#....b....#',
    '#.......=...,,,,...#.......3.#',
    '#.......=...,,,,o..#..k...c..#',
    '#.......=...o......#.........#',
    '##############################'
],
  entities: { k: { kind: 'sack' }, a: { kind: 'spearman' }, b: { kind: 'swordsman', angle: Math.PI }, c: { kind: 'shield', angle: Math.PI } },
  objectives: [
    { id: 'sacks', type: 'collect', kind: 'sack', count: 3, text: 'Gather the three scattered pepper sacks' },
    { id: 'unseen', type: 'evade', max: 0, optional: true, text: 'Reach the harbour without being spotted' },
  ],
};
