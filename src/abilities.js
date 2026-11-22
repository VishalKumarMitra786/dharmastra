// Abilities and the foot-hurdle rules (vault, crouch). Pure: no DOM, no randomness.
export const ABILITY_IDS = ['walk', 'run', 'crouch', 'vault', 'dodge', 'push', 'climb', 'staff', 'sword', 'bow'];
export const START_ABILITIES = ['walk', 'run'];
// Fighting exists from the first level: a fist combo, block and parry need no ability, and a rules-2 run always has the roll and the shove.
// (They stay in the save list as lessons a teacher can still name, but a missing id can never leave the traveller unable to defend.)
export const COMBAT_BASICS = ['dodge', 'push'];
export const WEAPONS = ['none', 'staff', 'sword', 'bow'];
export const WEAPON_ORDER = ['staff', 'sword', 'bow']; // the order they are earned and the order Swap cycles through
// Earned in order: shunya (hands) -> staff -> sword -> bow. A weapon is never granted before the one it builds on.
export const PREREQ = { sword: ['staff'], bow: ['sword'] };
export const HURDLES = { vault: { duration: 0.5 }, climb: { duration: 1.1 }, crouchSpeed: 0.5 };

// Drops abilities whose prerequisite is missing and puts the list in canonical order. Used by progress validation and sim start.
export function closeAbilities(list) {
  const set = new Set(list.filter((a) => ABILITY_IDS.includes(a)));
  let changed = true;
  while (changed) { changed = false; for (const [a, need] of Object.entries(PREREQ)) if (set.has(a) && need.some((n) => !set.has(n))) { set.delete(a); changed = true; } }
  return ABILITY_IDS.filter((a) => set.has(a));
}
// The best weapon an ability list allows (bow over sword over staff), or 'none'.
export const bestWeapon = (list) => [...WEAPON_ORDER].reverse().find((w) => list.includes(w)) || 'none';

export const hasAbility = (sim, id) => sim.abilities.includes(id);

// Grants an ability once. Returns true when it was new. Weapon abilities also equip the weapon.
export function grantAbility(sim, id) {
  if (!ABILITY_IDS.includes(id) || sim.abilities.includes(id)) return false;
  if ((PREREQ[id] || []).some((n) => !sim.abilities.includes(n))) return false; // the teacher will not hand over the sword before the staff
  sim.abilities.push(id);
  if (WEAPON_ORDER.includes(id)) { sim.player.weapon = id; if (id === 'bow' && !sim.player.arrows) sim.player.arrows = 6; }
  return true;
}

// Circle (x,y,r) against an axis-aligned rect {x,y,w,d|h}.
export function circleHitsRect(x, y, r, o) {
  const h = o.d ?? o.h;
  const qx = Math.max(o.x, Math.min(x, o.x + o.w));
  const qy = Math.max(o.y, Math.min(y, o.y + h));
  return (x - qx) ** 2 + (y - qy) ** 2 < r * r;
}

export const inGrass = (world, x, y) => world.obstacles.some((o) => o.kind === 'grass' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.d);

// Beams block a standing player; low walls, marked ledges and pits always block unless vaulting or climbing (pits never can be crossed).
export const solidObstacles = (world, crouching) => world.obstacles.filter((o) => o.kind === 'lowwall' || o.kind === 'ledge' || o.kind === 'pit' || (o.kind === 'beam' && !crouching));
export const inPit = (world, x, y) => world.obstacles.some((o) => o.kind === 'pit' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.d);

export function underBeam(world, x, y, r) {
  return world.obstacles.some((o) => o.kind === 'beam' && circleHitsRect(x, y, r, o));
}

function clearAt(world, x, y, r) {
  if (x < r || y < r || x > world.width - r || y > world.height - r) return false;
  if (world.walls.some((w) => circleHitsRect(x, y, r, w))) return false;
  return !world.obstacles.some((o) => o.kind !== 'grass' && circleHitsRect(x, y, r, o));
}

// Finds a vault: the low wall in front of the player (facing snapped to a compass direction) and a free landing spot beyond it.
// Returns {sx,sy,ex,ey} or null.
export function findVault(world, c, facing) { return findCross(world, c, facing, 'lowwall', world.tileSize * 3); }

// Same search for any crossable obstacle kind: a low wall (vault) or a marked ledge (climb).
export function findCross(world, c, facing, kind, max, slack = 14) {
  const dx = Math.abs(Math.cos(facing)) >= Math.abs(Math.sin(facing)) ? Math.sign(Math.cos(facing)) : 0;
  const dy = dx === 0 ? Math.sign(Math.sin(facing)) : 0;
  const reach = c.radius + slack;
  const walls = world.obstacles.filter((o) => o.kind === kind);
  const probe = { x: c.x + dx * reach, y: c.y + dy * reach };
  if (!walls.some((o) => circleHitsRect(probe.x, probe.y, 3, o))) return null;
  let crossed = false;
  for (let d = 4; d <= max; d += 4) {
    const x = c.x + dx * d; const y = c.y + dy * d;
    if (walls.some((o) => circleHitsRect(x, y, c.radius, o))) { crossed = true; continue; }
    if (crossed && clearAt(world, x, y, c.radius)) return { sx: c.x, sy: c.y, ex: x, ey: y };
  }
  return null;
}

// ---------------------------------------------------------------- props: things lying about that a traveller can pick up and fight with (pure data, no randomness)
// A prop is placed in a layout (layout.props), dropped by a beaten or disarmed enemy, or thrown. Every number a person can feel is here.
//   name      shown by the HUD and the captions, at most 2 words (the pick-up prompt is "Take <name>", so at most 3 words)
//   cls       weapon class: stick, club, polearm, blade, shield, missile, heavy, rope, sack, torch
//   twoHands  needs both hands: while held you cannot block and cannot draw a bow
//   uses      durability: a swing that lands wears it by 1 (a heavy blow by 2), a block with a shield wears it by 1; at 0 it breaks (cracks show at 2/3 and 1/3 left)
//   move      walking speed while carrying it (1 = normal); anything under 1 also forbids running
//   enemy     true when an unarmed enemy may pick it up and fight with it (see combat.js ENEMY_PROPS)
//   primary   'throw' for a missile: the light attack throws it, the heavy attack smashes with it
//   melee     steps (light chain; a missile has none) and heavy: hitAt = moment the arc lands, swing = whole action, cancel = from here the next input cuts the recovery,
//             range/halfArc = the hit arc (units, radians), damage/stagger/knock as for the weapons in combat.js (a negative knock pulls), lunge, stamina = cost; disarm = chance to knock a weapon out of an enemy's hand
//   throw     range (units), speed, arc (visual lift 0..1), damage, stagger, knock, stamina; shatter (breaks on impact) with radius (others near the impact are staggered); breaks (spent when thrown); null = cannot be thrown
const st = (o) => ({ halfArc: 0.9, knock: 0, lunge: 0, ...o });
const th = (o) => ({ speed: 380, arc: 0.4, knock: 0, ...o });
export const PROPS = {
  stick: { name: 'Stick', cls: 'stick', twoHands: false, uses: 14, move: 1, enemy: true,
    melee: { steps: [st({ id: 'whack', hitAt: 0.14, swing: 0.36, cancel: 0.22, range: 56, damage: 1, stagger: 0.25, knock: 10, lunge: 6, stamina: 4 }), st({ id: 'backwhack', hitAt: 0.14, swing: 0.36, cancel: 0.22, range: 56, damage: 1, stagger: 0.25, knock: 10, lunge: 6, stamina: 4 })],
      heavy: st({ id: 'smack', hitAt: 0.42, swing: 0.78, range: 58, halfArc: 0.8, damage: 2, stagger: 1.1, knock: 36, lunge: 8, stamina: 18 }) },
    throw: th({ range: 210, damage: 1, stagger: 0.3, knock: 8, stamina: 6 }) },
  'bamboo-staff': { name: 'Bamboo staff', cls: 'stick', twoHands: true, uses: 18, move: 1, enemy: true,
    melee: { steps: [st({ id: 'sweep', hitAt: 0.16, swing: 0.42, cancel: 0.26, range: 70, halfArc: 1.0, damage: 1, stagger: 0.3, knock: 14, lunge: 8, stamina: 5 }), st({ id: 'backsweep', hitAt: 0.16, swing: 0.42, cancel: 0.26, range: 70, halfArc: 1.0, damage: 1, stagger: 0.3, knock: 14, lunge: 8, stamina: 5 })],
      heavy: st({ id: 'overhand', hitAt: 0.5, swing: 0.88, range: 72, halfArc: 0.9, damage: 2, stagger: 1.3, knock: 46, lunge: 12, stamina: 20 }) },
    throw: th({ range: 240, speed: 440, damage: 1, stagger: 0.3, knock: 10, stamina: 8 }) },
  club: { name: 'Club', cls: 'club', twoHands: false, uses: 10, move: 1, enemy: true,
    melee: { steps: [st({ id: 'bash', hitAt: 0.24, swing: 0.58, cancel: 0.58, range: 52, halfArc: 0.95, damage: 2, stagger: 0.7, knock: 30, lunge: 8, stamina: 9 })],
      heavy: st({ id: 'crush', hitAt: 0.5, swing: 0.92, range: 54, damage: 3, stagger: 1.4, knock: 52, lunge: 10, stamina: 24 }) },
    throw: th({ range: 150, speed: 340, damage: 1, stagger: 0.5, knock: 14, stamina: 8 }) },
  'clay-pot': { name: 'Clay pot', cls: 'missile', twoHands: false, uses: 1, move: 1, enemy: false, primary: 'throw',
    melee: { steps: [], heavy: st({ id: 'pot-smash', hitAt: 0.34, swing: 0.7, range: 40, halfArc: 0.8, damage: 1, stagger: 1.0, knock: 16, stamina: 10, shatter: true }) },
    throw: th({ range: 230, speed: 400, arc: 0.7, damage: 1, stagger: 1.0, knock: 12, stamina: 7, shatter: true, radius: 38 }) },
  stone: { name: 'Stone', cls: 'missile', twoHands: false, uses: 6, move: 1, enemy: false, primary: 'throw',
    melee: { steps: [], heavy: st({ id: 'hammer', hitAt: 0.34, swing: 0.7, range: 36, halfArc: 0.8, damage: 1, stagger: 0.7, knock: 18, stamina: 12 }) },
    throw: th({ range: 270, speed: 460, arc: 0.5, damage: 2, stagger: 0.6, knock: 14, stamina: 8 }) },
  'oil-lamp': { name: 'Oil lamp', cls: 'missile', twoHands: false, uses: 3, move: 1, enemy: false, primary: 'throw', fire: true,
    melee: { steps: [], heavy: st({ id: 'lamp-swing', hitAt: 0.34, swing: 0.7, range: 46, halfArc: 0.9, damage: 1, stagger: 0.8, knock: 14, stamina: 10, shatter: true }) },
    throw: th({ range: 210, speed: 380, arc: 0.7, damage: 1, stagger: 0.9, knock: 10, stamina: 7, shatter: true, radius: 34 }) },
  torch: { name: 'Torch', cls: 'torch', twoHands: false, uses: 8, move: 1, enemy: false, fire: true,
    melee: { steps: [st({ id: 'torch-swing', hitAt: 0.2, swing: 0.5, cancel: 0.5, range: 52, halfArc: 1.0, damage: 1, stagger: 0.5, knock: 18, lunge: 6, stamina: 6 })],
      heavy: st({ id: 'torch-overhead', hitAt: 0.46, swing: 0.82, range: 54, damage: 2, stagger: 1.0, knock: 30, lunge: 8, stamina: 18 }) },
    throw: th({ range: 190, speed: 380, damage: 1, stagger: 0.4, knock: 8, stamina: 6 }) },
  spear: { name: 'Spear', cls: 'polearm', twoHands: true, uses: 12, move: 1, enemy: true,
    melee: { steps: [st({ id: 'thrust', hitAt: 0.26, swing: 0.6, cancel: 0.6, range: 84, halfArc: 0.3, damage: 2, stagger: 0.9, knock: 30, lunge: 16, stamina: 9 })],
      heavy: st({ id: 'lunge', hitAt: 0.5, swing: 0.9, range: 90, halfArc: 0.3, damage: 3, stagger: 1.3, knock: 50, lunge: 26, stamina: 24 }) },
    throw: th({ range: 320, speed: 520, arc: 0.25, damage: 3, stagger: 0.6, knock: 20, stamina: 12 }) },
  'fallen-sword': { name: 'Old sword', cls: 'blade', twoHands: false, uses: 12, move: 1, enemy: true,
    melee: { steps: [st({ id: 'cut', hitAt: 0.15, swing: 0.42, cancel: 0.26, range: 54, halfArc: 0.95, damage: 1, stagger: 0.35, knock: 14, lunge: 8, stamina: 8 }), st({ id: 'cut2', hitAt: 0.2, swing: 0.56, cancel: 0.56, range: 56, halfArc: 0.95, damage: 2, stagger: 0.8, knock: 34, lunge: 12, stamina: 11 })],
      heavy: st({ id: 'chop', hitAt: 0.46, swing: 0.82, range: 58, halfArc: 0.95, damage: 3, stagger: 1.5, knock: 48, lunge: 12, stamina: 28 }) },
    throw: th({ range: 200, speed: 420, damage: 2, stagger: 0.4, knock: 10, stamina: 10 }) },
  'wood-shield': { name: 'Wood shield', cls: 'shield', twoHands: false, uses: 14, move: 1, enemy: true, guard: { cost: 7 },
    melee: { steps: [st({ id: 'shield-bash', hitAt: 0.18, swing: 0.5, cancel: 0.5, range: 42, halfArc: 0.9, damage: 1, stagger: 0.8, knock: 40, lunge: 6, stamina: 8 })],
      heavy: st({ id: 'shield-slam', hitAt: 0.4, swing: 0.78, range: 44, halfArc: 0.9, damage: 1, stagger: 1.4, knock: 70, lunge: 8, stamina: 18, disarm: 1 }) },
    throw: null },
  bench: { name: 'Bench', cls: 'heavy', twoHands: true, uses: 5, move: 0.6, enemy: false,
    melee: { steps: [st({ id: 'heave', hitAt: 0.4, swing: 0.85, cancel: 0.85, range: 56, halfArc: 1.1, damage: 2, stagger: 1.4, knock: 70, lunge: 6, stamina: 20 })],
      heavy: st({ id: 'bench-slam', hitAt: 0.62, swing: 1.1, range: 60, halfArc: 1.2, damage: 3, stagger: 1.8, knock: 90, lunge: 8, stamina: 32 }) },
    throw: th({ range: 120, speed: 300, arc: 0.6, damage: 3, stagger: 1.5, knock: 60, stamina: 22, breaks: true }) },
  crate: { name: 'Crate', cls: 'heavy', twoHands: true, uses: 4, move: 0.65, enemy: false,
    melee: { steps: [st({ id: 'heave', hitAt: 0.36, swing: 0.8, cancel: 0.8, range: 50, halfArc: 1.0, damage: 2, stagger: 1.2, knock: 60, lunge: 6, stamina: 18 })],
      heavy: st({ id: 'crate-slam', hitAt: 0.58, swing: 1.05, range: 54, halfArc: 1.1, damage: 3, stagger: 1.6, knock: 80, lunge: 8, stamina: 28 }) },
    throw: th({ range: 140, speed: 320, arc: 0.6, damage: 2, stagger: 1.2, knock: 40, stamina: 18, shatter: true, radius: 30 }) },
  'market-pole': { name: 'Market pole', cls: 'polearm', twoHands: true, uses: 16, move: 1, enemy: false,
    melee: { steps: [st({ id: 'pole-sweep', hitAt: 0.22, swing: 0.56, cancel: 0.56, range: 90, halfArc: 0.5, damage: 1, stagger: 1.0, knock: 50, lunge: 10, stamina: 8 })],
      heavy: st({ id: 'pole-heavy', hitAt: 0.52, swing: 0.92, range: 94, halfArc: 0.8, damage: 2, stagger: 1.5, knock: 70, lunge: 12, stamina: 22 }) },
    throw: th({ range: 220, speed: 420, damage: 1, stagger: 0.5, knock: 14, stamina: 10 }) },
  rope: { name: 'Rope', cls: 'rope', twoHands: false, uses: 10, move: 1, enemy: false,
    melee: { steps: [st({ id: 'lash', hitAt: 0.2, swing: 0.5, cancel: 0.5, range: 80, halfArc: 0.25, damage: 0, stagger: 1.1, knock: -34, stamina: 8, disarm: 1 })],
      heavy: st({ id: 'snare', hitAt: 0.46, swing: 0.84, range: 84, halfArc: 0.3, damage: 0, stagger: 1.6, knock: -50, stamina: 18, disarm: 1 }) },
    throw: null },
  'grain-sack': { name: 'Grain sack', cls: 'sack', twoHands: false, uses: 4, move: 0.85, enemy: false,
    melee: { steps: [st({ id: 'sack-swing', hitAt: 0.3, swing: 0.7, cancel: 0.7, range: 50, halfArc: 1.0, damage: 1, stagger: 1.0, knock: 48, stamina: 12 })],
      heavy: st({ id: 'sack-slam', hitAt: 0.5, swing: 0.9, range: 52, halfArc: 1.0, damage: 2, stagger: 1.5, knock: 60, stamina: 20 }) },
    throw: th({ range: 150, speed: 340, arc: 0.5, damage: 1, stagger: 1.4, knock: 40, stamina: 10, shatter: true, radius: 26 }) },
};
export const PROP_IDS = Object.keys(PROPS);
export const propName = (kind) => PROPS[kind]?.name ?? 'Item';
