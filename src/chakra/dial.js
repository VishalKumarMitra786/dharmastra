// The compact chakra dial shown on every screen that is not the game itself: the outer ring has the five yugas, the current one is lit and carries
// a progress arc, two inner rings turn slowly in opposite directions (CSS only, and off with reduced motion). Pure string builder, no DOM.
import { YUGAS } from './model.js';
const TAU = Math.PI * 2;
const pt = (r, a) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
export const arcD = (r, a0, a1) => `M${pt(r, a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(r, a1)}`;

// cur: index of the current yuga (-1 for none). fracs: progress 0..1 per yuga. Returns an <svg> string (aria-hidden: the wrapper carries the name).
export function dialSvg({ cur = -1, fracs = [] } = {}) {
  const n = YUGAS.length; const gap = 0.12; let segs = '', prog = '';
  for (let i = 0; i < n; i++) {
    const a0 = (TAU * i) / n + gap / 2, a1 = (TAU * (i + 1)) / n - gap / 2; const on = i === cur;
    segs += `<path class="dial-seg${on ? ' on' : ''}" d="${arcD(42, a0, a1)}"/>`;
    const f = Math.max(0, Math.min(1, fracs[i] || 0));
    if (f > 0) prog += `<path class="dial-prog" d="${arcD(35, a0, a0 + (a1 - a0) * f)}"/>`;
  }
  let ticks = ''; for (let i = 0; i < 24; i++) { const a = (TAU * i) / 24; ticks += `M${pt(21, a)}L${pt(i % 6 === 0 ? 27 : 25, a)}`; }
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">${segs}${prog}`
    + `<g class="dial-r1"><circle class="dial-ring" r="30" stroke-dasharray="2 5"/></g>`
    + `<g class="dial-r2"><path class="dial-ring" d="${ticks}"/></g><circle class="dial-hub" r="9"/></svg>`;
}

// Words for the dial's accessible name.
export function dialLabel({ cur = -1, fracs = [], levels = [] } = {}) {
  if (cur < 0) return 'Chakra of the yugas';
  const lv = levels[cur] || 0; const done = Math.round((fracs[cur] || 0) * lv);
  return `Chakra. ${YUGAS[cur].name}${lv ? `, ${done} of ${lv} levels done` : ''}`;
}
