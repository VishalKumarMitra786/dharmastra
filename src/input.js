// Input: keyboard, on-screen stick and buttons, and drag-to-look merged into one reading {steer, throttle, mx, my, run, look, action, hold}.
// Touch layout: a stick bottom-left moves (relative to the camera), dragging the free half of the screen looks, round buttons act. With "Button controls" on
// (state.buttonMode) the stick and touch drags are replaced by single-press arrow and look buttons, so nothing needs a drag (WCAG 2.5.7).
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
export const STICK_DEAD = 0.14;
// Stick maths: (dx, dy) is the thumb's offset from the stick centre in px, radius is the offset that means "full". Inside the dead zone nothing moves;
// past it the push grows smoothly from 0 to 1 and never exceeds 1 (a circle, so diagonals are not faster). Returns {x, y} with x right and y down.
export function stickVector(dx, dy, radius, dead = STICK_DEAD) {
  const len = Math.hypot(dx, dy);
  if (!(radius > 0) || !(len > 0)) return { x: 0, y: 0 };
  const r = Math.min(1, len / radius);
  if (r < dead) return { x: 0, y: 0 };
  const k = (r - dead) / (1 - dead);
  return { x: (dx / len) * k, y: (dy / len) * k };
}

export function createInput({ stage, buttons, onPause, now, joystick = null, knob = null }) {
  const actions = createActionBuffer(now);
  const act = (names) => { if (state.enabled) names.forEach((n) => actions.press(n)); };
  const down = { left: new Set(), right: new Set(), up: new Set(), down: new Set(), run: new Set(), lookLeft: new Set(), lookRight: new Set(), block: new Set(), aim: new Set() };
  const latch = { block: false, aim: false }; // a press shorter than one tick still counts once
  let drag = null; // the finger or mouse steering the walker (chariot mode) or the left-thumb stick
  let look = null; // the finger or mouse turning the camera
  let lookAcc = { dx: 0, dy: 0 };
  let dragSteer = 0;
  let dragVec = { x: 0, y: 0 };
  let joyVec = { x: 0, y: 0 }; let joy = null; // the on-screen stick
  const state = { enabled: false, autoDrive: false, cameraLook: false, buttonMode: false, side: 'right', runOn: false }; // cameraLook: true while a third-person camera is in use; side: where the action buttons are

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
    if (btn.dataset.control === 'runtoggle') { // a toggle: press to run, press again to walk
      const flip = () => { state.runOn = !state.runOn; btn.setAttribute?.('aria-pressed', String(state.runOn)); btn.classList.toggle?.('on', state.runOn); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (state.enabled) flip(); });
      btn.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); if (state.enabled) flip(); } });
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      return;
    }
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

  // Looking: on a touch screen a drag on the half away from the stick turns the camera; a mouse or pen drag turns it anywhere. With Button controls on, touch drags do nothing
  // (the look buttons are used instead). Chariot missions and the 2D map keep a mouse drag as a floating stick; touch uses the stick.
  stage.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    const touch = e.pointerType === 'touch';
    if (touch && state.buttonMode) return;
    const rect = stage.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    const lookHalf = state.side === 'left' ? leftHalf : !leftHalf; // the half with the action buttons is the look half
    if (state.cameraLook && (!touch || lookHalf)) {
      if (look !== null) return;
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else if (!touch && !state.cameraLook) {
      if (drag !== null) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else return;
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

  // The on-screen stick. Its centre is the middle of the base; a full push is STICK_TRAVEL px from it. The knob follows the thumb.
  const STICK_TRAVEL = 44;
  const setKnob = (x, y) => { if (knob?.style) knob.style.transform = `translate(${(x * STICK_TRAVEL).toFixed(1)}px, ${(y * STICK_TRAVEL).toFixed(1)}px)`; };
  if (joystick) {
    const centre = () => { const r = joystick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const move = (e) => { const c = joy.c; joyVec = stickVector(e.clientX - c.x, e.clientY - c.y, STICK_TRAVEL); const len = Math.hypot(e.clientX - c.x, e.clientY - c.y) || 1; const k = Math.min(1, len / STICK_TRAVEL); setKnob(((e.clientX - c.x) / len) * k, ((e.clientY - c.y) / len) * k); };
    joystick.addEventListener('pointerdown', (e) => { if (!state.enabled || joy) return; e.preventDefault(); joy = { id: e.pointerId, c: centre() }; try { joystick.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ } move(e); });
    joystick.addEventListener('pointermove', (e) => { if (joy && e.pointerId === joy.id) move(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => joystick.addEventListener(ev, (e) => { if (joy && e.pointerId === joy.id) { joy = null; joyVec = { x: 0, y: 0 }; setKnob(0, 0); } }));
    joystick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function reset() {
    Object.values(down).forEach((s) => s.clear());
    drag = null; look = null; lookAcc = { dx: 0, dy: 0 }; dragSteer = 0; dragVec = { x: 0, y: 0 }; joy = null; joyVec = { x: 0, y: 0 }; setKnob(0, 0);
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
      const dv = Math.hypot(dragVec.x, dragVec.y) > 0.15 ? dragVec : { x: 0, y: 0 };
      const stick = Math.hypot(joyVec.x, joyVec.y) >= Math.hypot(dv.x, dv.y) ? joyVec : dv; // the stick or a mouse drag, whichever pushes harder
      const mx = kx || stick.x; const my = ky || stick.y;
      const lk = state.cameraLook ? { dx: lookAcc.dx, dy: lookAcc.dy, key: (has('lookRight') ? 1 : 0) - (has('lookLeft') ? 1 : 0) } : { dx: 0, dy: 0, key: 0 };
      lookAcc = { dx: 0, dy: 0 };
      const hold = { block: has('block') || latch.block, aim: has('aim') || latch.aim }; latch.block = false; latch.aim = false;
      return { steer, throttle, mx, my, run: has('run') || state.runOn || state.autoDrive, look: lk, action: actions.take(), hold };
    },
  };
}
