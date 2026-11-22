// Phase 1 UI tests: action buffer, input read(), blood setting, HUD objectives and throttled announcements. Run through run.mjs.
import assert from 'node:assert/strict';
import { createActionBuffer, createInput, BUFFER_MS } from '../input.js';
import { loadSettings } from '../settings.js';
import { createHud, objectiveLine } from '../hud.js';

export function registerUi1(test) {
  const four = ({ attack, jump, crouch, interact }) => ({ attack, jump, crouch, interact });
  const clock = () => { let t = 1000; const f = () => t; f.add = (ms) => { t += ms; }; return f; };

  test('ui1 action buffer: edge, delivered once, expires after 150 ms', () => {
    const now = clock(); const b = createActionBuffer(now);
    b.press('attack'); assert.equal(b.take().attack, true); assert.equal(b.take().attack, false, 'consumed');
    b.press('jump'); now.add(BUFFER_MS - 1); assert.equal(b.take().jump, true, 'still fresh');
    b.press('interact'); now.add(BUFFER_MS + 1); assert.equal(b.take().interact, false, 'expired');
    b.press('bogus'); assert.deepEqual(Object.keys(b.take()).slice(0, 4), ['attack', 'jump', 'crouch', 'interact']); // phase 2 appended dodge, push, heavy, swap, w1..w3
  });

  test('ui1 input.read: Space/J/C/F give actions, ignored when disabled, existing fields kept', () => {
    const wl = {}; const prev = globalThis.window;
    globalThis.window = { addEventListener: (t, f) => { (wl[t] ||= []).push(f); } };
    try {
      const now = clock(); const sink = { addEventListener() {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, width: 100 }) };
      const input = createInput({ stage: sink, buttons: [], onPause() {}, now });
      const key = (code, extra = {}) => wl.keydown.forEach((f) => f({ code, repeat: false, defaultPrevented: false, target: { tagName: 'BODY' }, preventDefault() {}, ...extra }));
      key('KeyJ'); assert.equal(input.read().action.attack, false, 'disabled');
      input.state.enabled = true;
      key('KeyJ'); key('Space'); key('KeyC'); key('KeyF');
      let r = input.read();
      assert.deepEqual(four(r.action), { attack: true, jump: true, crouch: true, interact: true });
      for (const f of ['steer', 'throttle', 'mx', 'my', 'run', 'look']) assert.ok(f in r, f);
      assert.deepEqual(four(input.read().action), { attack: false, jump: false, crouch: false, interact: false }, 'edge, not held');
      key('KeyJ', { repeat: true }); assert.equal(input.read().action.attack, false, 'key repeat is not a new press');
      key('Space', { target: { tagName: 'BUTTON' } }); assert.equal(input.read().action.jump, false, 'a focused button keeps its own Space');
      key('KeyJ'); now.add(200); assert.equal(input.read().action.attack, false, 'stale press dropped');
    } finally { globalThis.window = prev; }
  });

  test('ui1 input: touch Do button sends jump and interact, Attack sends attack', () => {
    const prev = globalThis.window; globalThis.window = { addEventListener() {} };
    try {
      const mk = (control) => { const h = {}; return { dataset: { control }, classList: { add() {}, remove() {} }, addEventListener: (t, f) => { (h[t] ||= []).push(f); }, h }; };
      const attack = mk('attack'); const doBtn = mk('do'); const crouch = mk('crouch');
      const sink = { addEventListener() {}, setPointerCapture() {} };
      const input = createInput({ stage: sink, buttons: [attack, doBtn, crouch], onPause() {}, now: clock() });
      input.state.enabled = true;
      const tap = (b) => b.h.pointerdown.forEach((f) => f({ preventDefault() {}, pointerId: 1 }));
      tap(doBtn); assert.deepEqual(four(input.read().action), { attack: false, jump: true, crouch: false, interact: true });
      tap(attack); tap(crouch); const a = input.read().action; assert.ok(a.attack && a.crouch && !a.jump);
    } finally { globalThis.window = prev; }
  });

  test('ui1 settings: blood is a validated boolean, default true', () => {
    const win = { matchMedia: () => ({ matches: false }) }; const store = (v) => ({ getItem: () => v });
    assert.equal(loadSettings(store(null), win).blood, true);
    assert.equal(loadSettings(store('{"blood":false}'), win).blood, false);
    assert.equal(loadSettings(store('{"blood":"no"}'), win).blood, true);
    assert.equal(loadSettings(store('{"blood":0}'), win).blood, true);
    assert.equal(loadSettings(store('not json'), win).blood, true);
  });

  test('ui1 settings: #set-blood checkbox updates the live object and saves', () => {
    const box = { checked: true, dataset: {}, addEventListener(t, f) { this.f = f; } }; let saved = null;
    const win = { matchMedia: () => ({ matches: false }), document: { getElementById: (id) => (id === 'set-blood' ? box : null) } };
    const s = loadSettings({ getItem: () => '{"blood":false}', setItem: (k, v) => { saved = v; } }, win);
    assert.equal(box.checked, false);
    box.checked = true; box.f(); assert.equal(s.blood, true); assert.equal(JSON.parse(saved).blood, true);
  });

  test('ui1 hud: objective lines state progress as text', () => {
    assert.equal(objectiveLine({ text: 'Find the staff', state: 'active', progress: { n: 1, total: 2 } }), 'Find the staff - 1 of 2');
    assert.equal(objectiveLine({ text: 'Reach the gate', state: 'done' }), 'Reach the gate - Done');
    assert.equal(objectiveLine({ text: 'Stay unseen', optional: true, state: 'failed' }), 'Optional: Stay unseen - Failed');
    assert.equal(objectiveLine({ text: 'Walk' }), 'Walk - To do');
  });

  test('ui1 hud: events are announced, captioned and throttled', async () => {
    const mkEl = () => ({ hidden: false, textContent: '', children: [], dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, setAttribute() {}, replaceChildren(...c) { this.children = c; }, append() {} });
    const els = {}; const doc = { getElementById: (id) => (els[id] ||= mkEl()), createElement: mkEl, querySelector: () => null, querySelectorAll: () => [] };
    const now = clock(); const hud = createHud(doc, { now: () => now() / 1000 });
    hud.setObjectives([{ id: 'a', text: 'Find the staff', state: 'active', progress: { n: 0, total: 1 } }]);
    assert.equal(els.objectives.children.length, 1); assert.equal(els.objectives.hidden, false);
    hud.handleEvents([{ type: 'hit-enemy', id: 1 }]); await new Promise((r) => setTimeout(r, 60));
    assert.equal(els.announcer.textContent, 'You hit the raider.'); assert.match(els.cue.textContent, /Fist strike/);
    hud.handleEvents([{ type: 'hit-enemy', id: 1 }]); await new Promise((r) => setTimeout(r, 60));
    now.add(100); // within the gap: second announcement is swallowed
    els.announcer.textContent = 'x'; hud.handleEvents([{ type: 'hit-enemy', id: 1 }]); await new Promise((r) => setTimeout(r, 60));
    assert.equal(els.announcer.textContent, 'x', 'throttled');
    now.add(2000); hud.handleEvents([{ type: 'objective', id: 'a', state: 'done' }, 'wall']); await new Promise((r) => setTimeout(r, 60));
    assert.equal(els.announcer.textContent, 'Objective Find the staff: done.');
    hud.setAbilities({ abilities: ['walk', 'run', 'crouch'], weapon: 'staff', crouch: true });
    assert.equal(els['kit-text'], undefined, 'no gear sentence in the HUD');
    hud.cue(''); // no throw on empty cue
  });
}
