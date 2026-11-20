// Input: keyboard, on-screen buttons and drag steering merged into one {steer, throttle} reading.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
};
const BUTTON_FLAG = { left: 'left', right: 'right', go: 'up', brake: 'down' };
const DRAG_FULL = 50; // px of horizontal drag for full steering
const clamp = (v) => Math.max(-1, Math.min(1, v));

export function createInput({ stage, buttons, onPause }) {
  const down = { left: new Set(), right: new Set(), up: new Set(), down: new Set() };
  let drag = null;
  let dragSteer = 0;
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
    drag = { id: e.pointerId, x: e.clientX };
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) dragSteer = clamp((e.clientX - drag.x) / DRAG_FULL); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => stage.addEventListener(ev, (e) => {
    if (drag && e.pointerId === drag.id) { drag = null; dragSteer = 0; }
  }));

  function reset() {
    Object.values(down).forEach((s) => s.clear());
    drag = null; dragSteer = 0;
    buttons.forEach((b) => b.classList.remove('active'));
  }

  return {
    state,
    reset,
    read() {
      if (!state.enabled) return { steer: 0, throttle: 0 };
      const has = (f) => down[f].size > 0;
      const steer = clamp((has('right') ? 1 : 0) - (has('left') ? 1 : 0) + dragSteer);
      const forward = has('up') || state.autoDrive;
      const throttle = has('down') ? -1 : forward ? 1 : 0;
      return { steer, throttle };
    },
  };
}
