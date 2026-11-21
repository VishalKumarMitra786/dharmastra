// Abilities and the foot-hurdle rules (vault, crouch). Pure: no DOM, no randomness.
export const ABILITY_IDS = ['walk', 'run', 'crouch', 'vault', 'dodge', 'push', 'climb', 'staff', 'sword', 'bow'];
export const START_ABILITIES = ['walk', 'run'];
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
