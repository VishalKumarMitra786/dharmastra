// Style meter and end-of-level rank. Pure: feed it the sim's events, read the numbers. No DOM, no clock of its own.
// While you fight the meter (0..100) climbs with every hit, parry, finisher and shove, faster the longer your combo and the more kinds of move you mix.
// Standing still bleeds it away, and taking a blow knocks it down and breaks the combo. The meter shows as a live rank, D to S.
// At the end of a won mission `rankResult` turns the whole run into one letter, D to S, from style, best combo, blows taken and time.
export const RANKS = ['D', 'C', 'B', 'A', 'S'];
export const RANK_AT = [0, 22, 45, 68, 88]; // meter value where each live rank starts
export const COMBO_WINDOW = 2.4; // seconds without a scoring move before the combo ends
export const GRACE = 1.6; // seconds without a scoring move before the meter starts to bleed
export const VARIETY_WINDOW = 7; // seconds a kind of move counts toward the variety bonus
export const HURT_PENALTY = 30;
export const rankIndex = (meter) => { let i = 0; for (let k = 0; k < RANK_AT.length; k++) if (meter >= RANK_AT[k]) i = k; return i; };

// base points for the sim events that score. kind feeds the variety bonus.
const SCORING = {
  'hit-enemy': (e) => (e.heavy ? { pts: 5, kind: 'heavy' } : { pts: 3, kind: 'hit' }),
  'shove-hit': () => ({ pts: 3, kind: 'shove' }),
  parry: (e) => ({ pts: e.ranged ? 4 : 9, kind: 'parry' }),
  finisher: () => ({ pts: 12, kind: 'finisher' }),
  'shield-break': () => ({ pts: 7, kind: 'break' }),
  'enemy-down': (e) => ({ pts: e.kind === 'captain' ? 30 : 6, kind: 'down' }),
  disarm: () => ({ pts: 5, kind: 'prop' }),
  'prop-throw': () => ({ pts: 4, kind: 'prop' }),
  'enemy-fell': () => ({ pts: 8, kind: 'shove' }),
};

export function createStyle() {
  return { meter: 0, rank: 0, peak: 0, combo: 0, comboT: 0, idle: 0, maxCombo: 0, total: 0, hurts: 0, parries: 0, finishers: 0, downs: 0, recent: [], clock: 0 };
}

const distinct = (st) => new Set(st.recent.filter((r) => st.clock - r.t <= VARIETY_WINDOW).map((r) => r.kind)).size;
export const multiplier = (st) => 1 + Math.min(st.combo, 20) * 0.1 + Math.min(0.75, 0.25 * Math.max(0, distinct(st) - 1));

// Advance time by dt seconds. Returns events ({type:'style-rank', rank, index, up} and {type:'combo-end', n}).
export function tickStyle(st, dt) {
  const out = []; st.clock += dt;
  if (st.combo > 0) { st.comboT -= dt; if (st.comboT <= 0) { out.push({ type: 'combo-end', n: st.combo }); st.combo = 0; } }
  st.idle += dt;
  if (st.idle > GRACE && st.meter > 0) st.meter = Math.max(0, st.meter - (3 + st.rank * 3.5) * dt); // a higher rank is harder to hold
  setRank(st, out);
  return out;
}

function setRank(st, out) {
  const r = rankIndex(st.meter);
  if (r !== st.rank) { const up = r > st.rank; st.rank = r; st.peak = Math.max(st.peak, r); out.push({ type: 'style-rank', rank: RANKS[r], index: r, up }); }
}

// Feed this tick's sim events. Returns the style events it produced.
export function feedStyle(st, events) {
  const out = [];
  for (const e of events || []) {
    if (!e) continue;
    if (e.type === 'hurt') {
      if (st.combo >= 3) out.push({ type: 'combo-end', n: st.combo, broken: true });
      st.hurts += 1; st.combo = 0; st.comboT = 0; st.meter = Math.max(0, st.meter - HURT_PENALTY); st.recent = [];
      continue;
    }
    if (e.type === 'dodge' && st.combo > 0) { st.comboT = Math.max(st.comboT, 1.0); continue; } // a roll keeps a combo alive, it never builds one
    const s = SCORING[e.type]?.(e);
    if (!s) continue;
    st.combo += 1; st.comboT = COMBO_WINDOW; st.idle = 0; st.maxCombo = Math.max(st.maxCombo, st.combo);
    st.recent.push({ t: st.clock, kind: s.kind }); if (st.recent.length > 24) st.recent.shift();
    const pts = s.pts * multiplier(st);
    st.total += pts; st.meter = Math.min(100, st.meter + pts);
    if (e.type === 'parry') st.parries += 1; else if (e.type === 'finisher') st.finishers += 1; else if (e.type === 'enemy-down') st.downs += 1;
    out.push({ type: 'combo', n: st.combo, pts: Math.round(pts) });
  }
  setRank(st, out);
  return out;
}

// The end rank. goal: {style, combo, parSecs, maxSecs}. 100 points: style 35, best live rank 15, best combo 10, clean 20 (blows taken), time 20.
export const RANK_CUT = { S: 88, A: 72, B: 55, C: 38 };
export function rankResult(st, elapsed, goal = {}) {
  const g = { style: 500, combo: 12, parSecs: 170, maxSecs: 300, ...goal };
  const part = {
    style: Math.min(1, st.total / g.style) * 35,
    peak: (st.peak / (RANKS.length - 1)) * 15,
    combo: Math.min(1, st.maxCombo / g.combo) * 10,
    clean: Math.max(0, 20 - st.hurts * 5),
    time: elapsed <= g.parSecs ? 20 : Math.max(0, 20 * (1 - (elapsed - g.parSecs) / Math.max(1, g.maxSecs - g.parSecs))),
  };
  const score = Math.round(Object.values(part).reduce((a, b) => a + b, 0));
  const rank = score >= RANK_CUT.S ? 'S' : score >= RANK_CUT.A ? 'A' : score >= RANK_CUT.B ? 'B' : score >= RANK_CUT.C ? 'C' : 'D';
  return { rank, score, style: Math.round(st.total), maxCombo: st.maxCombo, peak: RANKS[st.peak], hurts: st.hurts, parries: st.parries, finishers: st.finishers, downs: st.downs, time: elapsed, part: Object.fromEntries(Object.entries(part).map(([k, v]) => [k, Math.round(v)])) };
}
