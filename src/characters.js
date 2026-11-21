// The traveller the player chooses. Original characters (no existing IP); names are everyday Indian names, none of them a deity.
// Story frame: you walk the chakra of time, and each era needs a courier. In every mission, that courier is you.
export const NAME_MAX = 12;
export const KEY = 'dharmastra.traveller';
export const BODIES = [{ id: 'f', label: 'Female' }, { id: 'm', label: 'Male' }];
export const OUTFITS = [
  { id: 'saffron', label: 'Saffron', color: '#ff8a1f' },
  { id: 'peacock', label: 'Peacock teal', color: '#1fb6a6' },
  { id: 'sindoor', label: 'Sindoor red', color: '#e8432e' },
  { id: 'indigo', label: 'Indigo', color: '#4a5fd8' },
  { id: 'leaf', label: 'Leaf green', color: '#5cae4a' },
];
export const LOOKS = [
  { id: 'meera', body: 'f', name: 'Meera', blurb: 'Quick on her feet and knows every alley.', skin: '#c68a5a', hair: '#1b1210', hairStyle: 'long', eyes: '#2fbf8a', outfit: 'saffron', accent: '#e8432e' },
  { id: 'ira', body: 'f', name: 'Ira', blurb: 'Calm, watchful and good at reading people.', skin: '#9a6440', hair: '#120c0a', hairStyle: 'bun', eyes: '#8a5a2a', outfit: 'peacock', accent: '#f0c04a' },
  { id: 'tara', body: 'f', name: 'Tara', blurb: 'Bold, loud and never lost for a plan.', skin: '#d9a070', hair: '#2a1410', hairStyle: 'braid', eyes: '#9a4ad8', outfit: 'sindoor', accent: '#ffd36a' },
  { id: 'veer', body: 'm', name: 'Veer', blurb: 'Strong and steady; carries the heavy loads.', skin: '#b07448', hair: '#1b1210', hairStyle: 'short', eyes: '#3a7bd8', outfit: 'saffron', accent: '#e8432e' },
  { id: 'kiran', body: 'm', name: 'Kiran', blurb: 'Clever and light-footed; talks his way through.', skin: '#c68a5a', hair: '#120c0a', hairStyle: 'long', eyes: '#2fbf8a', outfit: 'indigo', accent: '#f0c04a' },
  { id: 'neel', body: 'm', name: 'Neel', blurb: 'Quiet, patient and hard to spot in a crowd.', skin: '#9a6440', hair: '#2a1410', hairStyle: 'short', eyes: '#8a5a2a', outfit: 'leaf', accent: '#ffd36a' },
];

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c);
export const outfitColor = (id) => (OUTFITS.find((o) => o.id === id) || OUTFITS[0]).color;
export const lookById = (id) => LOOKS.find((l) => l.id === id);
export function cleanName(raw, fallback) {
  const n = String(raw ?? '').replace(/[^\p{L} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return n || fallback;
}
export const defaultTraveller = () => ({ look: LOOKS[0].id, name: LOOKS[0].name, outfit: LOOKS[0].outfit });

// What gets stored is checked on the way in and out; anything unexpected falls back to the default.
export function sanitize(t) {
  const look = lookById(t?.look) || LOOKS[0];
  const outfit = OUTFITS.some((o) => o.id === t?.outfit) ? t.outfit : look.outfit;
  return { look: look.id, name: cleanName(t?.name, look.name), outfit };
}
export function loadTraveller(storage = globalThis.localStorage) {
  try { const raw = storage?.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveTraveller(t, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(sanitize(t))); } catch { /* private mode: the choice just lasts this visit */ }
}
// Full look for drawing: the chosen preset plus the chosen outfit colour.
export function appearance(t) {
  const s = sanitize(t); const l = lookById(s.look);
  return { ...l, name: s.name, outfitColor: outfitColor(s.outfit) };
}
// Mission text uses {name} for the player. Every other word of the script stays as written.
export const fill = (text, name) => String(text).replaceAll('{name}', name);

// Anime-style bust drawn in SVG, from validated colours only.
export function avatarSvg(a) {
  const c = (v, d) => (isHex(v) ? v : d);
  const skin = c(a.skin, '#c68a5a'), hair = c(a.hair, '#1b1210'), eyes = c(a.eyes, '#3a7bd8'), outfit = c(a.outfitColor || outfitColor(a.outfit), '#ff8a1f'), accent = c(a.accent, '#e8432e');
  const back = { long: `<path d="M26 62C20 100 28 122 40 124L80 124C92 122 100 100 94 62Z" fill="${hair}"/>`, bun: '', braid: `<path d="M84 70C96 84 94 104 88 122" stroke="${hair}" stroke-width="9" fill="none" stroke-linecap="round"/>`, short: '' }[a.hairStyle] || '';
  const bun = a.hairStyle === 'bun' ? `<circle cx="60" cy="16" r="12" fill="${hair}"/>` : '';
  const eye = (cx) => `<ellipse cx="${cx}" cy="64" rx="7.5" ry="10" fill="#fff"/><ellipse cx="${cx}" cy="66" rx="5.5" ry="8.5" fill="${eyes}"/><ellipse cx="${cx}" cy="67" rx="2.7" ry="5" fill="#140a14"/><circle cx="${cx - 2}" cy="62" r="2" fill="#fff"/><path d="M${cx - 8} 56Q${cx} 52 ${cx + 8} 56" stroke="#140a14" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${back}<path d="M18 140C18 112 36 104 60 104C84 104 102 112 102 140Z" fill="${outfit}"/><path d="M40 106L60 124L80 106L74 102L60 112L46 102Z" fill="${accent}"/><rect x="52" y="90" width="16" height="18" rx="6" fill="${skin}"/><ellipse cx="60" cy="62" rx="31" ry="35" fill="${skin}"/>${eye(46)}${eye(74)}<path d="M54 83Q60 87 66 83" stroke="#7a3a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M28 60C26 26 46 14 62 14C80 14 96 28 92 60C88 44 78 36 60 36C44 36 32 44 28 60Z" fill="${hair}"/>${bun}</svg>`;
}
