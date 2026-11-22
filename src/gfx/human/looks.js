// Looks: the parameters that make one human different from another. No meshes are copied: a look picks body shells from the one hero.glb,
// a hair or headgear shape, colours and cloth patterns, and small scale changes within believable limits.
export function rng(seed) { let s = (Math.floor(seed) % 2147483647 + 2147483647) % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
export const LIMITS = { height: [0.93, 1.07], build: [0.92, 1.1] };
// Natural dyes and undyed cotton (muted on purpose: modern materials make saturated colour look like plastic).
export const SKINS = ['#d6a77f', '#c48e63', '#b07a52', '#9a6844', '#85563a', '#6f4531'];
export const CLOTH = { madder: '#9c3a2c', indigo: '#2f4170', turmeric: '#c99a2e', cotton: '#e2d6b9', saffron: '#c9651f', green: '#44704a', teal: '#2e716b', maroon: '#6c2b32', ochre: '#a9763c', grey: '#7e7b73', white: '#ece4d2', plum: '#5a3358', sky: '#4f7fa0' };
const CL = Object.values(CLOTH);
export const HAIRS = ['#15100e', '#1b1411', '#241812', '#3a281c', '#4a3322'];
export const EYES = ['#2a1a10', '#3a2416', '#4a3320', '#2c3a2a'];
export const PATTERNS = ['plain', 'stripe', 'check', 'block'];

const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const range = (r, lo, hi) => lo + (hi - lo) * r();
const clampR = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
export const hexMix = (a, b, t) => { const x = parseInt(a.slice(1), 16); const y = parseInt(b.slice(1), 16); const ch = (s) => Math.round((x >> s & 255) * (1 - t) + (y >> s & 255) * t); return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };
const HAIR_MAP = { short: 'short', long: 'long', bun: 'bun', braid: 'braid', crop: 'crop' };

// role: hero | soldier | raider | sparrer | boss | townsperson | keeper | elder
export function makeLook(role, seed = 1, opts = {}) {
  const r = rng(seed * 7919 + 13); const female = opts.female ?? (role === 'townsperson' || role === 'keeper' ? r() < 0.4 : false);
  const L = {
    role, seed, female, height: clampR(1 + (female ? -0.04 : 0) + range(r, -0.04, 0.05), LIMITS.height), build: clampR(1 + (female ? -0.05 : 0) + range(r, -0.04, 0.06), LIMITS.build),
    skin: opts.skin || pick(r, SKINS), eye: opts.eye || pick(r, EYES), hair: { style: female ? pick(r, ['long', 'bun', 'braid']) : pick(r, ['short', 'crop', 'short']), color: opts.hair || pick(r, HAIRS) },
    beard: 'none', headgear: { type: 'none', color: pick(r, CL), color2: '#d9b24a' }, tunic: true, sash: false, cuirass: false, dhoti: 'short', shoes: true,
    tunicColor: pick(r, CL), tunicPattern: pick(r, PATTERNS), border: pick(r, ['#c9a23a', '#9c3a2c', '#2f4170', '#e2d6b9']), dhotiColor: pick(r, [CLOTH.cotton, CLOTH.white, CLOTH.cotton, CLOTH.ochre]), dhotiPattern: pick(r, ['plain', 'plain', 'stripe']),
    sashColor: pick(r, [CLOTH.madder, CLOTH.indigo, CLOTH.turmeric]), leather: pick(r, ['#5a3a22', '#6a4426', '#47301d']), metal: 'steel', right: 'none', left: 'none', carry: 'none', stoop: 0, speed: 1,
  };
  if (L.female) { L.dhoti = 'long'; L.beard = 'none'; }
  const age = role === 'elder' || (role === 'townsperson' && r() < 0.15);
  if (age) { L.stoop = 0.18; L.hair.color = pick(r, ['#8a8580', '#b9b4aa', '#6e6a64']); if (!L.female) L.beard = pick(r, ['full', 'moustache']); L.height *= 0.97; }
  else if (!L.female && r() < 0.35) L.beard = pick(r, ['stubble', 'moustache', 'moustache']);
  if (role === 'townsperson') {
    L.headgear.type = !L.female && r() < 0.55 ? pick(r, ['turban', 'turban', 'cap']) : 'none'; L.sash = r() < 0.5;
    L.carry = r() < 0.2 ? pick(r, ['pot', 'bundle']) : 'none'; if (L.carry !== 'none') L.headgear.type = 'none';
  } else if (role === 'keeper') { L.headgear.type = !L.female && r() < 0.6 ? 'turban' : 'none'; L.sash = true; L.tunic = true; }
  else if (role === 'soldier') { Object.assign(L, { tunic: true, tunicColor: CLOTH.madder, tunicPattern: 'plain', border: '#c9a23a', sash: true, sashColor: CLOTH.turmeric, cuirass: true, dhoti: 'short', dhotiColor: '#5b4a3a', metal: 'bronze', right: 'spear', left: 'shield', female: false, build: clampR(L.build * 1.04, LIMITS.build), height: clampR(L.height * 1.02, LIMITS.height) }); L.headgear = { type: 'helmet', color: '#b08a3a', color2: '#9c3a2c' }; L.beard = L.beard === 'none' && r() < 0.5 ? 'moustache' : L.beard; L.hair.style = 'crop'; }
  else if (role === 'raider') { Object.assign(L, { tunic: true, tunicColor: '#4a5a44', tunicPattern: 'plain', sash: true, sashColor: CLOTH.maroon, dhoti: 'short', dhotiColor: '#3b3026', right: 'club', female: false, build: clampR(L.build * 1.05, LIMITS.build) }); L.headgear = { type: 'turban', color: '#8c3a2a', color2: '#d9b24a' }; L.beard = r() < 0.6 ? 'full' : 'stubble'; }
  else if (role === 'sparrer') { Object.assign(L, { tunic: false, sash: true, tunicColor: '#7a5a8a', right: 'stick', female: false }); L.headgear = { type: 'none' }; L.beard = 'moustache'; }
  else if (role === 'boss') { Object.assign(L, { tunic: true, tunicColor: CLOTH.plum, tunicPattern: 'block', border: '#d9b24a', sash: true, sashColor: '#d9b24a', cuirass: true, metal: 'bronze', dhoti: 'long', dhotiColor: CLOTH.white, female: false, height: clampR(L.height * 1.05, LIMITS.height), build: clampR(L.build * 1.08, LIMITS.build), right: 'sword', left: 'none' }); L.headgear = { type: 'turban', color: '#d9b24a', color2: CLOTH.plum }; L.beard = 'full'; }
  Object.assign(L, opts.override || {});
  return L;
}

// The traveller from characters.js appearance(): skin, hair, hairStyle, eyes, outfitColor, accent, body 'f' | 'm'.
export function heroLook(a, weapon = 'none') {
  const f = a?.body === 'f'; const out = a?.outfitColor || '#ff8a1f'; const muted = (h) => hexMix(h, '#7a6f60', 0.28);
  const style = HAIR_MAP[a?.hairStyle] || 'short';
  const L = makeLook('hero', 4242, { female: f, skin: a?.skin, hair: a?.hair, eye: a?.eyes ? hexMix(a.eyes, '#2a1a10', 0.55) : undefined });
  Object.assign(L, { height: f ? 0.97 : 1.0, build: f ? 0.96 : 1.0, tunic: true, tunicColor: muted(out), tunicPattern: 'plain', border: muted(a?.accent || '#e8432e'), sash: true, sashColor: muted(a?.accent || '#e8432e'), dhoti: f ? 'long' : 'short', dhotiColor: CLOTH.cotton, dhotiPattern: 'plain', carry: 'lamp', beard: f ? 'none' : (a?.id === 'kiran' ? 'stubble' : 'none') });
  L.hair = { style, color: a?.hair || '#1b1210' }; L.headgear = { type: 'none', color: '#c9a23a', color2: '#c9a23a' }; L.right = weaponProp(weapon); L.left = 'lamp';
  return L;
}
export const weaponProp = (w) => ({ staff: 'staff', sword: 'sword', bow: 'bow', none: 'none', spear: 'spear' }[w] || 'none');

// Which GLB shells and body groups a look shows. Covered skin is dropped so crowds stay cheap.
export function shellsFor(L) {
  const shells = ['body']; const drop = new Set(); const groups = new Set(['head', 'hands', 'armup', 'torso', 'torsoTop', 'thigh', 'shin', 'foot']);
  if (L.tunic) { shells.push('tunic'); groups.delete('torso'); }
    if (L.sash) shells.push('sash');
  if (L.cuirass) { shells.push('cuirass'); groups.delete('torso'); }
  if (L.dhoti === 'short') { shells.push('dhoti'); groups.delete('thigh'); } else if (L.dhoti === 'long') { shells.push('dhotiLong'); groups.delete('thigh'); groups.delete('shin'); }
  if (L.shoes) { shells.push('shoes'); groups.delete('foot'); }
  if (L.dhoti === 'long' && !L.shoes) groups.add('foot');
  void drop; return { shells, groups: [...groups] };
}
export function lookKey(L) { return [L.skin, L.eye, L.hair.color, L.beard, L.tunic && L.tunicColor, L.tunicPattern, L.border, L.dhotiColor, L.dhotiPattern, L.sashColor, L.leather, L.metal, L.headgear.type, L.headgear.color, L.headgear.color2, L.cuirass].join('|'); }
export const geometryKey = (L) => { const s = shellsFor(L); return [L.female ? 'f' : 'm', s.shells.join(','), s.groups.join(','), L.hair.style, L.headgear.type, L.carry].join('/'); };
