// The list of playable missions, in the order a player meets them. The page picks one with ?mission=<id>; anything unknown falls back to the first.
// grants: abilities a mission teaches when it is finished. requires: abilities a mission's hurdles need (checked against the saved progress).
export const MISSIONS = [
  { id: 'dvapara-escape', label: 'Escape from Hastinapur', grants: ['vault'], requires: [] },
  { id: 'mauryan-spy', label: 'The Night Report of Pataliputra', grants: ['crouch'], requires: [] },
  { id: 'sangam-staff', label: 'The Pepper Road', grants: ['staff'], requires: ['vault', 'crouch'] },
];

// Playable by link (?mission=gupta-forge) but not yet on the chakra: the chakra data has no event for it, and data/ has its own owner.
// When that event exists, move the entry into MISSIONS (the chakra test then checks it).
export const UNLISTED_MISSIONS = [
  { id: 'gupta-forge', label: 'The Forge Road', grants: ['dodge', 'push', 'climb', 'sword', 'bow'], requires: ['vault', 'crouch', 'staff'] },
];
const ALL = () => [...MISSIONS, ...UNLISTED_MISSIONS];

export function pickMissionId(search) {
  const id = new URLSearchParams(search).get('mission');
  return ALL().some((m) => m.id === id) ? id : MISSIONS[0].id;
}

// Which missions the player must still finish for the abilities this mission needs. Empty means it is open.
export function missingFor(mission, abilities) {
  return (mission.requires || []).filter((a) => !abilities.includes(a))
    .map((a) => ALL().find((m) => m.grants.includes(a))?.label).filter((l, i, all) => l && all.indexOf(l) === i);
}
