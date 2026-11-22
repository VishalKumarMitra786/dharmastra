// Which input the person is using right now. Focus rings are for the keyboard: after a tap or a mouse click they stay hidden (CSS reads html[data-input]).
// Nothing is shown until the first key press, so a page that moves focus by script on load never paints a ring that was not asked for.
const MODS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
export function initModality(doc = document) {
  const root = doc.documentElement; const set = (m) => { if (root.dataset.input !== m) root.dataset.input = m; };
  doc.addEventListener('keydown', (e) => { if (!MODS.has(e.key)) set('kbd'); }, true);
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) doc.addEventListener(t, () => set('pointer'), true);
  return { keyboard: () => root.dataset.input === 'kbd' };
}
export const usingKeyboard = (doc = document) => doc.documentElement?.dataset?.input === 'kbd';
