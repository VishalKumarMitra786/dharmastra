// The list of playable missions. The page picks one with ?mission=<id>; anything unknown falls back to the first.
export const MISSIONS = [
  { id: 'dvapara-escape', label: 'Escape from Hastinapur' },
  { id: 'mauryan-spy', label: 'The Night Report of Pataliputra' },
];

export function pickMissionId(search) {
  const id = new URLSearchParams(search).get('mission');
  return MISSIONS.some((m) => m.id === id) ? id : MISSIONS[0].id;
}
