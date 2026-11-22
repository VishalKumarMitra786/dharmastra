// Game: ties sim, mission runner, renderer, input, HUD and screens together and owns the run state.
import { createSim, step, setTimerMode, setReduceMotion } from './sim.js';
import { createRunner } from './mission.js';
import { makeFrame } from './renderer.js';
import { createLoop } from './loop.js';
import { createMinimap } from './minimap.js';
import { loadProgress, saveProgress, recordCompletion } from './progress.js';
import { bestWeapon } from './abilities.js';
import { createOrbit, updateOrbit, relativeMove, FORWARD_UP } from './camera.js';

const hashSeed = (id) => [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const FAIL_TEXT = { wrecked: 'Your chariot is wrecked.', defeated: 'You are overcome. Next time: roll clear, block as the blow lands, and strike in the opening after it.', time: 'Time ran out.', seen: 'You were seen.' };
// Events the HUD already captions itself (hud.handleEvents). Every other audible event gets its caption line from audio.captionFor, so no sound is caption-less.
const HUD_CAPTIONED = new Set(['vault', 'pickup', 'hit-enemy', 'enemy-down', 'enemy-fell', 'shove-hit', 'stagger', 'dodge', 'tired', 'climb', 'blocked', 'parry', 'guard-break', 'tap', 'whiff', 'shot', 'drawn', 'no-arrows', 'target-hit', 'weapon', 'refused', 'seen', 'hurt', 'ability']);
const CAPTION_GAP = { swing: 1, shove: 1, windup: 0.4, 'enemy-swing': 99, 'enemy-arrow': 0.6, 'arrow-hit': 0.6 }; // seconds between captions of one kind (99 = never: the wind-up caption already said it)
const SHAKE = { hurt: 0.6, finisher: 0.5, phase: 0.8, parry: 0.3, 'shield-break': 0.3, 'captain-down': 0.8 }; // screenshake per event; none at all under reduced motion

export function createGame({ mission, world, renderer: initialRenderer, input, hud, screens, audio, settings, onSettings, dev = false }) {
  let renderer = initialRenderer;
  let sim = null;
  let runner = null;
  let paused = true;
  let effects = { shake: 0, flash: 0 };
  let hintClock = 0;
  let lastSay = {};
  let attempt = 0;
  let progress = loadProgress();
  let lastKit = '';
  let lastVitals = '';
  let lastObj = '';
  const orbit = createOrbit();
  const usesOrbit = () => !!(renderer && renderer.orbit && world.mode === 'foot'); // third-person only with the 3D renderer on foot
  const camera = () => (usesOrbit() ? { yaw: orbit.yaw, pitch: orbit.pitch } : { yaw: FORWARD_UP, pitch: orbit.pitch });
  function syncCamera() {
    input.state.cameraLook = usesOrbit();
    const g = typeof document !== 'undefined' ? document.getElementById('game') : null;
    if (g) g.dataset.cam = usesOrbit() ? 'orbit' : 'map';
  }

  const minimap = createMinimap(typeof document !== 'undefined' ? document.getElementById('minimap') : null, world);
  const loop = createLoop({ update, render });
  if (dev && typeof globalThis !== 'undefined') globalThis.__dharmastra = { get sim() { return sim; } }; // ?dev=1 only: lets tools/cdp.mjs read and move the sim during a real-browser playtest

  function newRun() {
    attempt += 1;
    progress = loadProgress();
    const kit = dev ? ['crouch', 'vault', 'staff'] : progress.abilities; // ?dev=1 lends every ability for testing
    const lent = Array.isArray(mission.lends) ? mission.lends : [];
    const abilities = [...kit, ...lent];
    const weapon = abilities.includes(progress.weapon) ? progress.weapon : bestWeapon(abilities); // the weapon you last held, else the best you own
    sim = createSim(world, { timerMode: settings.timer, abilities, weapon, seed: hashSeed(mission.id) + attempt, reduceMotion: settings.reduceMotion });
    lastKit = ''; lastObj = ''; lastVitals = '';
    effects = { shake: 0, flash: 0 };
    lastSay = {};
    hud.clearCaption();
    runner = createRunner(mission, {
      onObjective: (o) => { if (o) { hud.setObjective(o.text); hud.announce(`Objective: ${o.text}`); } },
      onSay: (line) => { lastSay[line.trigger] = line; if (line.trigger !== 'win' && line.trigger !== 'fail') hud.showCaption(line); },
    });
    orbit.yaw = sim.chariot.angle ?? FORWARD_UP; orbit.pitch = createOrbit().pitch;
    syncCamera();
    runner.start();
    refreshHud();
    input.reset();
    input.state.enabled = true;
    paused = false;
    screens.hide();
    hud.setHint(1, 0, '');
    document.getElementById('pause-btn').focus();
    hud.chapter?.(mission.era, mission.title);
    setTimeout(() => { if (!paused) { hud.tip?.('move'); if (usesOrbit()) hud.tip?.('look'); } }, 3400); // first-run tips, after the title card
    loop.start();
  }

  function refreshHud() {
    hud.setHealth(sim.health, sim.t.maxHealth);
    hud.setCheckpoints(sim.checkpoint, world.checkpoints.length);
    hud.setTimer(sim.timeLeft);
    syncRules();
  }

  // Objective list and kit are redrawn only when they change, so the page is not rebuilt every frame.
  function syncRules() {
    if (!sim?.rules2 || !sim.objectives) return;
    // Checkpoint objectives are already shown as the current objective and the pips, so the list holds the extra ones (collect, evade).
    const list = sim.objectives.items.filter((o) => o.type !== 'reach' && (o.unlock || 0) <= sim.checkpoint).map((o) => ({ id: o.id, text: o.text, state: o.state, optional: o.optional, progress: ['collect', 'do', 'defeat', 'waves'].includes(o.type) ? { n: o.progress, total: o.goal } : null }));
    const okey = JSON.stringify(list);
    if (okey !== lastObj) { lastObj = okey; hud.setObjectives(list); }
    const key = `${sim.abilities.join()}|${sim.player.weapon}|${sim.player.crouching}`;
    if (key !== lastKit) { lastKit = key; hud.setAbilities({ abilities: sim.abilities, weapon: sim.player.weapon, crouch: sim.player.crouching }); }
    const P = sim.player; const drawing = P.state === 'aim';
    const vk = `${Math.round(P.stamina / 5)}|${P.arrows}|${drawing ? Math.round(P.draw * 10) : -1}`; // redrawn only when the rounded numbers change
    if (vk !== lastVitals) { lastVitals = vk; hud.setVitals({ stamina: P.stamina / 100, arrows: P.arrows, draw: P.draw / 0.9, drawing }); }
  }

  function update(dt) {
    if (paused || sim.status !== 'playing') return;
    const inp = input.read();
    let controls = inp;
    if (sim.foot) {
      if (usesOrbit()) updateOrbit(orbit, dt, inp.look, inp, settings.reduceMotion);
      const m = relativeMove(inp.mx, inp.my, camera().yaw); // the stick is relative to the camera, like a GTA-style game
      controls = { ...inp, mx: m.mx, my: m.my };
    }
    const events = step(sim, dt, controls);
    effects.shake = Math.max(0, effects.shake - dt * 3);
    effects.flash = Math.max(0, effects.flash - dt * 2.5);
    for (const e of events) onEvent(e);
    if (sim.rules2) hud.handleEvents(events);
    if (events.length) refreshHud();
    syncRules();
    hintClock -= dt;
    if (hintClock <= 0) { hintClock = 0.25; updateHint(); hud.setTimer(sim.timeLeft); }
  }

  function updateHint() {
    const next = world.checkpoints[sim.checkpoint];
    hud.tipFor?.(sim); // a one-icon tip the first time a vault, duck or dodge is needed
    if (next) hud.setHint(next.x - sim.chariot.x, next.y - sim.chariot.y, `Checkpoint ${sim.checkpoint + 1}`, usesOrbit() ? orbit.yaw : undefined);
  }

  const capAt = {}; const sayAt = {};
  function onEvent(e) {
    runner.handle(e, sim.elapsed);
    if (!settings.reduceMotion && SHAKE[e.type]) { effects.shake = Math.max(effects.shake, SHAKE[e.type]); if (e.type === 'hurt') { effects.flash = 1; hud.hitFlash?.(); } }
    audio.playEvent(e);
    if (sim.rules2) {
      const c = audio.captionFor?.(e); const gap = CAPTION_GAP[e.type] ?? 0.5;
      if (c && !HUD_CAPTIONED.has(e.type) && (capAt[e.type] == null || sim.elapsed - capAt[e.type] >= gap)) { capAt[e.type] = sim.elapsed; hud.cue?.(c); }
      const line = audio.announceFor?.(e);
      if (line && e.type !== 'hurt' && (sayAt[e.type] == null || sim.elapsed - sayAt[e.type] >= 0.8)) { sayAt[e.type] = sim.elapsed; hud.announce(line); } // 'hurt' is already announced by the HUD, with its damage
    }
    if (e.type === 'wall') hud.announce('You bump a wall. No harm done.');
    else if (e.type === 'checkpoint') hud.announce(`Checkpoint ${e.n} of ${world.checkpoints.length} reached.`);
    else if (e.type === 'win') endRun(true);
    else if (e.type === 'fail') endRun(false, e.reason);
  }

  function endRun(won, reason) {
    input.state.enabled = false;
    input.reset();
    hud.clearCaption();
    if (won) {
      const grants = mission.rewards?.grants || [];
      if (!dev) { progress = recordCompletion(loadProgress(), mission.id, sim.elapsed, grants, bestWeapon(grants)); saveProgress(progress); }
      for (const a of grants) hud.announce(`New ability learned: ${a}.`);
      audio.play('win');
      screens.showWin({ time: fmt(sim.elapsed), health: sim.health }, mission.events, lastSay.win);
    } else {
      audio.play('fail');
      screens.showFail(FAIL_TEXT[reason] || 'The mission failed.', lastSay.fail);
    }
  }

  function render() {
    if (!sim) return;
    const frame = makeFrame(sim, effects, settings.reduceMotion, camera(), { blood: settings.blood !== false });
    renderer.render(frame);
    minimap.draw(frame);
  }

  function pause() {
    if (!sim || sim.status !== 'playing') return;
    if (paused) { if (screens.current === 'screen-pause') resume(); return; }
    paused = true; input.state.enabled = false; input.reset();
    screens.show('screen-pause');
  }

  function resume() {
    paused = false; input.state.enabled = true;
    screens.hide();
    document.getElementById('pause-btn').focus();
  }

  return {
    pause, resume, restart: newRun, start: newRun,
    applySettings() {
      input.state.autoDrive = settings.autoDrive;
      if (sim && sim.timerMode !== settings.timer) { setTimerMode(sim, settings.timer); refreshHud(); }
      if (sim) setReduceMotion(sim, settings.reduceMotion); // hit-stop and slow motion stop at once under reduced motion
      onSettings?.();
    },
    menu() {
      paused = true; input.state.enabled = false; sim = null; loop.stop();
      screens.show('screen-start');
    },
    showFrame() { render(); },
    setRenderer(r) { renderer = r; syncCamera(); render(); },
    get status() { return sim?.status; },
  };
}
