// Input: keyboard, on-screen buttons and drag steering merged into one {steer, throttle} reading.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'run', ShiftRight: 'run',
  KeyQ: 'lookLeft', KeyE: 'lookRight', // turn the camera without a mouse or a touch drag
  KeyB: 'block', KeyZ: 'aim', // held: guard with the sword, draw the bow (release looses the arrow)
};
const BUTTON_FLAG = { left: 'left', right: 'right', go: 'up', brake: 'down', up: 'up', down: 'down', run: 'run', lookleft: 'lookLeft', lookright: 'lookRight', block: 'block', aim: 'aim' };
// One-shot actions: attack, jump and interact fire once per press; crouch is a toggle edge. A press waits up to BUFFER_MS for the next read().
// Keys: Space jump/vault/climb, J attack, K heavy cut, X dodge, V shove, C crouch, F interact, R swap weapon, 1/2/3 staff/sword/bow. Held: B block, Z draw bow.
const ACTION_KEYS = { Space: 'jump', KeyJ: 'attack', KeyC: 'crouch', KeyF: 'interact', KeyX: 'dodge', KeyV: 'push', KeyK: 'heavy', KeyR: 'swap', Digit1: 'w1', Digit2: 'w2', Digit3: 'w3' };
const ACTION_BUTTONS = { attack: ['attack'], jump: ['jump'], crouch: ['crouch'], interact: ['interact'], do: ['jump', 'interact'], dodge: ['dodge'], push: ['push'], heavy: ['heavy'], swap: ['swap'] }; // 'Do' is the context button: the sim picks up, vaults or climbs, whichever is in front
export const ACTION_NAMES = ['attack', 'jump', 'crouch', 'interact', 'dodge', 'push', 'heavy', 'swap', 'w1', 'w2', 'w3'];
export const BUFFER_MS = 150;
export function createActionBuffer(now = () => performance.now()) {
  const at = Object.fromEntries(ACTION_NAMES.map((n) => [n, -Infinity]));
  return {
    press(name) { if (name in at) at[name] = now(); },
    clear() { for (const k in at) at[k] = -Infinity; },
    take() { // edge: each press is delivered once, and only if it is fresh
      const t = now(); const out = {};
      for (const k in at) { out[k] = t - at[k] <= BUFFER_MS; at[k] = -Infinity; }
      return out;
    },
  };
}
const NO_ACTION = Object.freeze(Object.fromEntries(ACTION_NAMES.map((n) => [n, false])));
const NO_HOLD = Object.freeze({ block: false, aim: false });
const DRAG_FULL = 50; // px of horizontal drag for full steering
const clamp = (v) => Math.max(-1, Math.min(1, v));

export function createInput({ stage, buttons, onPause, now }) {
  const actions = createActionBuffer(now);
  const act = (names) => { if (state.enabled) names.forEach((n) => actions.press(n)); };
  const down = { left: new Set(), right: new Set(), up: new Set(), down: new Set(), run: new Set(), lookLeft: new Set(), lookRight: new Set(), block: new Set(), aim: new Set() };
  const latch = { block: false, aim: false }; // a press shorter than one tick still counts once
  let drag = null; // the finger or mouse steering the walker (chariot mode) or the left-thumb stick
  let look = null; // the finger or mouse turning the camera
  let lookAcc = { dx: 0, dy: 0 };
  let dragSteer = 0;
  let dragVec = { x: 0, y: 0 };
  const state = { enabled: false, autoDrive: false, cameraLook: false }; // cameraLook: true while a third-person camera is in use

  const press = (flag, source) => { down[flag].add(source); if (flag in latch) latch[flag] = true; };
  const release = (flag, source) => down[flag].delete(source);

  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) { onPause(); return; }
    const aname = ACTION_KEYS[e.code];
    if (aname) {
      const native = e.code === 'Space' && /^(BUTTON|A|SELECT|INPUT|TEXTAREA)$/.test(e.target?.tagName || '') && e.target?.id !== 'pause-btn'; // a focused control keeps its own Space; the pause button holds focus during play, so Space there is Jump (Pause stays on Esc, P and Enter)
      if (state.enabled && !e.repeat && !e.defaultPrevented && !native) act([aname]);
      if (state.enabled && !native) e.preventDefault();
      return;
    }
    const flag = KEYS[e.code];
    if (!flag || !state.enabled) return;
    e.preventDefault();
    press(flag, e.code);
  });
  window.addEventListener('keyup', (e) => { const f = KEYS[e.code]; if (f) release(f, e.code); });
  window.addEventListener('blur', reset);

  buttons.forEach((btn) => {
    const names = ACTION_BUTTONS[btn.dataset.control];
    if (names) { // action buttons fire on the press edge (touch, mouse, or Space/Enter on the focused button)
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); act(names); btn.classList.add('active'); });
      ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, () => btn.classList.remove('active')));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      btn.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); act(names); btn.classList.add('active'); } });
      btn.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') btn.classList.remove('active'); });
      return;
    }
    const flag = BUTTON_FLAG[btn.dataset.control];
    const src = `btn-${btn.dataset.control}`;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { btn.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already-released pointer */ } press(flag, src); btn.classList.add('active'); });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach((ev) => btn.addEventListener(ev, () => { release(flag, src); btn.classList.remove('active'); }));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(flag, src); btn.classList.add('active'); } });
    btn.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') { release(flag, src); btn.classList.remove('active'); } });
  });

  // Walking missions: a mouse or pen drag turns the camera. On a touch screen the left half is the move stick and the right half turns the camera.
  // Chariot missions keep the old single drag-to-steer.
  stage.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    const rect = stage.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    const asLook = state.cameraLook && (e.pointerType !== 'touch' || !leftHalf);
    if (asLook) {
      if (look !== null) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else {
      if (drag !== null) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    stage.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (look && e.pointerId === look.id) {
      lookAcc.dx += e.clientX - look.x; lookAcc.dy += e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    dragSteer = clamp((e.clientX - drag.x) / DRAG_FULL);
    dragVec = { x: clamp((e.clientX - drag.x) / DRAG_FULL), y: clamp((e.clientY - drag.y) / DRAG_FULL) }; // floating stick: where you touch is the centre
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => stage.addEventListener(ev, (e) => {
    if (look && e.pointerId === look.id) look = null;
    if (drag && e.pointerId === drag.id) { drag = null; dragSteer = 0; dragVec = { x: 0, y: 0 }; }
  }));

  function reset() {
    Object.values(down).forEach((s) => s.clear());
    drag = null; look = null; lookAcc = { dx: 0, dy: 0 }; dragSteer = 0; dragVec = { x: 0, y: 0 };
    buttons.forEach((b) => b.classList.remove('active'));
    actions.clear(); latch.block = false; latch.aim = false;
  }

  return {
    state,
    reset,
    read() {
      if (!state.enabled) { actions.clear(); return { steer: 0, throttle: 0, mx: 0, my: 0, run: false, look: { dx: 0, dy: 0, key: 0 }, action: { ...NO_ACTION }, hold: { ...NO_HOLD } }; }
      const has = (f) => down[f].size > 0;
      const steer = clamp((has('right') ? 1 : 0) - (has('left') ? 1 : 0) + dragSteer);
      const forward = has('up') || state.autoDrive;
      const throttle = has('down') ? -1 : forward ? 1 : 0;
      // On foot: keys and buttons give 8 directions, a drag gives an analog stick. Diagonals are normalised by the sim.
      const kx = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
      const ky = (has('down') ? 1 : 0) - (has('up') ? 1 : 0);
      const stick = Math.hypot(dragVec.x, dragVec.y) > 0.15 ? dragVec : { x: 0, y: 0 };
      const mx = kx || stick.x; const my = ky || stick.y;
      const lk = state.cameraLook ? { dx: lookAcc.dx, dy: lookAcc.dy, key: (has('lookRight') ? 1 : 0) - (has('lookLeft') ? 1 : 0) } : { dx: 0, dy: 0, key: 0 };
      lookAcc = { dx: 0, dy: 0 };
      const hold = { block: has('block') || latch.block, aim: has('aim') || latch.aim }; latch.block = false; latch.aim = false;
      return { steer, throttle, mx, my, run: has('run') || state.autoDrive, look: lk, action: actions.take(), hold };
    },
  };
}
