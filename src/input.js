// Input: keyboard, on-screen buttons and drag steering merged into one {steer, throttle} reading.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'run', ShiftRight: 'run',
};
const BUTTON_FLAG = { left: 'left', right: 'right', go: 'up', brake: 'down', up: 'up', down: 'down', run: 'run' };
const DRAG_FULL = 50; // px of horizontal drag for full steering
const clamp = (v) => Math.max(-1, Math.min(1, v));

export function createInput({ stage, buttons, onPause }) {
  const down = { left: new Set(), right: new Set(), up: new Set(), down: new Set(), run: new Set() };
  let drag = null;
  let dragSteer = 0;
  let dragVec = { x: 0, y: 0 };
  const state = { enabled: false, autoDrive: false };

  const press = (flag, source) => down[flag].add(source);
  const release = (flag, source) => down[flag].delete(source);

  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { onPause(); return; }
    const flag = KEYS[e.code];
    if (!flag || !state.enabled) return;
    e.preventDefault();
    press(flag, e.code);
  });
  window.addEventListener('keyup', (e) => { const f = KEYS[e.code]; if (f) release(f, e.code); });
  window.addEventListener('blur', reset);

  buttons.forEach((btn) => {
    const flag = BUTTON_FLAG[btn.dataset.control];
    const src = `btn-${btn.dataset.control}`;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); press(flag, src); btn.classList.add('active'); });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, () => { release(flag, src); btn.classList.remove('active'); }));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(flag, src); btn.classList.add('active'); } });
    btn.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') { release(flag, src); btn.classList.remove('active'); } });
  });

  stage.addEventListener('pointerdown', (e) => {
    if (!state.enabled || drag !== null) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    dragSteer = clamp((e.clientX - drag.x) / DRAG_FULL);
    dragVec = { x: clamp((e.clientX - drag.x) / DRAG_FULL), y: clamp((e.clientY - drag.y) / DRAG_FULL) }; // floating stick: where you touch is the centre
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => stage.addEventListener(ev, (e) => {
    if (drag && e.pointerId === drag.id) { drag = null; dragSteer = 0; dragVec = { x: 0, y: 0 }; }
  }));

  function reset() {
    Object.values(down).forEach((s) => s.clear());
    drag = null; dragSteer = 0; dragVec = { x: 0, y: 0 };
    buttons.forEach((b) => b.classList.remove('active'));
  }

  return {
    state,
    reset,
    read() {
      if (!state.enabled) return { steer: 0, throttle: 0, mx: 0, my: 0, run: false };
      const has = (f) => down[f].size > 0;
      const steer = clamp((has('right') ? 1 : 0) - (has('left') ? 1 : 0) + dragSteer);
      const forward = has('up') || state.autoDrive;
      const throttle = has('down') ? -1 : forward ? 1 : 0;
      // On foot: keys and buttons give 8 directions, a drag gives an analog stick. Diagonals are normalised by the sim.
      const kx = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
      const ky = (has('down') ? 1 : 0) - (has('up') ? 1 : 0);
      const stick = Math.hypot(dragVec.x, dragVec.y) > 0.15 ? dragVec : { x: 0, y: 0 };
      const mx = kx || stick.x; const my = ky || stick.y;
      return { steer, throttle, mx, my, run: has('run') || state.autoDrive };
    },
  };
}
