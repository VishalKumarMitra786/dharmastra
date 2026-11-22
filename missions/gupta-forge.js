// Layout for "The Forge Road" (Gupta age, Invented yard): a teaching road, then a test. Text lives in gupta-forge.json.
// Legend: # wall, . ground, S start, 1 2 3 4 = top-left tile of a 2x2 checkpoint spot, H marked ledge (climb it), _ ditch (a shoved raider can fall in; nobody walks in),
// k dodge lesson, l push lesson, m climb lesson, n sword lesson, p bow lesson, q quiver of six arrows (lessons are the teacher's gifts, taken with Do or F),
// t u straw training posts, b the teacher's sparring partner (a wooden stick that never hurts; its blow is telegraphed like any other and does no damage).
// Yards left to right: roll -> push -> climb -> sword (block, parry) -> bow range -> the road. Every lesson yard is safe: nobody there can hurt you.
// The road (right-hand yard) is the test: an arena of three waves (swordsman and spearman; shield bearer and archer; the road captain and a spearman), and the captain is a mini boss
// with three phases. Nobody is killed: a beaten soldier yields and withdraws. A short rest between waves gives some strength back.
export const layout = {
  mode: 'foot',
  rules: 2,
  theme: 'pataliputra', // placeholder look, like the Pepper Road
  tileSize: 72,
  startAngle: 0,
  timeLimit: 600,
  rows: [
    '########################################################',
    '#......#......#......H........#.......#................#',
    '#......#......#......H....t...#....t..#................#',
    '#......#......#......H........#.......#................#',
    '#......#..l...#......H.n......#.p.....#..__............#',
    '#...k................H.............u.....__............#',
    '#.S.........t....m...H......b............__............#',
    '#....................H...................__............#',
    '#......#......#......H........#.q...3.#..__............#',
    '#......#......#......H1...u...#.......#................#',
    '#......#......#......H......2.#....t..#..............4.#',
    '#......#......#......H........#.......#................#',
    '########################################################',
  ],
  entities: {
    k: { kind: 'dodge' }, l: { kind: 'push' }, m: { kind: 'climb' }, n: { kind: 'sword' }, p: { kind: 'bow' }, q: { kind: 'arrows', n: 6 },
    b: { kind: 'sparrer', hp: 3, angle: Math.PI },
  },
  objectives: [
    // unlock: shown once that many checkpoints are reached, so the list never holds more than a few lines on a phone.
    { id: 'roll', type: 'do', event: 'dodge', count: 2, unlock: 0, text: 'Roll twice (Dodge, X)' },
    { id: 'shove', type: 'do', event: 'target-hit', via: 'shove', count: 1, unlock: 0, text: 'Shove the straw post (Push, V)' },
    { id: 'climb', type: 'do', event: 'climb', count: 1, unlock: 0, text: 'Climb the marked ledge (Do)' },
    { id: 'light', type: 'do', event: 'swing', via: 'sword', heavy: false, count: 1, unlock: 1, text: 'Make a light cut (J)' },
    { id: 'heavy', type: 'do', event: 'swing', heavy: true, count: 1, unlock: 1, text: 'Make a heavy cut, slow and tiring (K)' },
    { id: 'block', type: 'do', event: 'blocked', count: 1, unlock: 1, text: 'Block the sparring stick (hold B)' },
    { id: 'parry', type: 'do', event: 'parry', count: 1, unlock: 1, optional: true, text: 'Parry: block just as the stick lands' },
    { id: 'posts', type: 'do', event: 'target-hit', via: 'arrow', count: 2, unlock: 2, text: 'Hit two posts with arrows (hold Z, release)' },
    { id: 'arena', type: 'waves', unlock: 3, zone: { x: 41, y: 6, r: 5 }, gap: 3, heal: 20, text: 'Hold the road against three waves',
      waves: [
        [{ kind: 'swordsman', at: [51.5, 2.5] }, { kind: 'spearman', at: [51.5, 10.5] }],
        [{ kind: 'shield', at: [52.5, 6.5] }, { kind: 'archer', at: [53.5, 2.5] }],
        [{ kind: 'captain', at: [52.5, 6.5] }, { kind: 'spearman', at: [51.5, 10.5] }],
      ] },
    { id: 'captain', type: 'defeat-captain', unlock: 3, text: 'Bring the road captain to yield' },
  ],
};
