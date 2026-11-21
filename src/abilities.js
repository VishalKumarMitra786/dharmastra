// Abilities and the foot-hurdle rules (vault, crouch). Pure: no DOM, no randomness.
export const ABILITY_IDS = ['walk', 'run', 'crouch', 'vault', 'staff'];
export const START_ABILITIES = ['walk', 'run'];
export const WEAPONS = ['none', 'staff'];
export const HURDLES = { vault: { duration: 0.5 }, crouchSpeed: 0.5 };

export const hasAbility = (sim, id) => sim.abilities.includes(id);

// Grants an ability once. Returns true when it was new. Weapon abilities also equip the weapon.
export function grantAbility(sim, id) {
  if (!ABILITY_IDS.includes(id) || sim.abilities.includes(id)) return false;
  sim.abilities.push(id);
  if (id === 'staff') sim.player.weapon = 'staff';
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

// Beams block a standing player; low walls always block unless vaulting.
export const solidObstacles = (world, crouching) => world.obstacles.filter((o) => o.kind === 'lowwall' || (o.kind === 'beam' && !crouching));

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
export function findVault(world, c, facing) {
  const dx = Math.abs(Math.cos(facing)) >= Math.abs(Math.sin(facing)) ? Math.sign(Math.cos(facing)) : 0;
  const dy = dx === 0 ? Math.sign(Math.sin(facing)) : 0;
  const reach = c.radius + 14;
  const walls = world.obstacles.filter((o) => o.kind === 'lowwall');
  const probe = { x: c.x + dx * reach, y: c.y + dy * reach };
  if (!walls.some((o) => circleHitsRect(probe.x, probe.y, 3, o))) return null;
  let crossed = false;
  const max = world.tileSize * 3;
  for (let d = 4; d <= max; d += 4) {
    const x = c.x + dx * d; const y = c.y + dy * d;
    if (walls.some((o) => circleHitsRect(x, y, c.radius, o))) { crossed = true; continue; }
    if (crossed && clearAt(world, x, y, c.radius)) return { sx: c.x, sy: c.y, ex: x, ey: y };
  }
  return null;
}
