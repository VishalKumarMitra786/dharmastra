// Game: ties sim, mission runner, renderer, input, HUD and screens together and owns the run state.
import { createSim, step, setTimerMode } from './sim.js';
import { createRunner } from './mission.js';
import { makeFrame } from './renderer.js';
import { createLoop } from './loop.js';
import { createMinimap } from './minimap.js';
import { createOrbit, updateOrbit, relativeMove, FORWARD_UP } from './camera.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const FAIL_TEXT = { wrecked: 'Your chariot is wrecked.', time: 'Time ran out.' };

export function createGame({ mission, world, renderer: initialRenderer, input, hud, screens, audio, settings, onSettings }) {
  let renderer = initialRenderer;
  let sim = null;
  let runner = null;
  let paused = true;
  let effects = { shake: 0, flash: 0 };
  let hintClock = 0;
  let lastSay = {};
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

  function newRun() {
    sim = createSim(world, { timerMode: settings.timer });
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
    loop.start();
  }

  function refreshHud() {
    hud.setHealth(sim.health, sim.t.maxHealth);
    hud.setCheckpoints(sim.checkpoint, world.checkpoints.length);
    hud.setTimer(sim.timeLeft);
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
    if (events.length) refreshHud();
    hintClock -= dt;
    if (hintClock <= 0) { hintClock = 0.25; updateHint(); hud.setTimer(sim.timeLeft); }
  }

  function updateHint() {
    const next = world.checkpoints[sim.checkpoint];
    if (next) hud.setHint(next.x - sim.chariot.x, next.y - sim.chariot.y, `Checkpoint ${sim.checkpoint + 1}`, usesOrbit() ? orbit.yaw : undefined);
  }

  function onEvent(e) {
    runner.handle(e, sim.elapsed);
    if (e.type === 'wall' || e.type === 'guard') {
      effects.shake = 1; effects.flash = 1;
      hud.hitFlash?.();
      audio.play('hit');
      hud.announce(`${e.type === 'guard' ? 'Hit by a guard' : 'Hit a wall'}. Health ${e.health}.`);
    } else if (e.type === 'checkpoint') {
      audio.play('checkpoint');
      hud.announce(`Checkpoint ${e.n} of ${world.checkpoints.length} reached.`);
    } else if (e.type === 'win') endRun(true);
    else if (e.type === 'fail') endRun(false, e.reason);
  }

  function endRun(won, reason) {
    input.state.enabled = false;
    input.reset();
    hud.clearCaption();
    if (won) {
      audio.play('win');
      screens.showWin({ time: fmt(sim.elapsed), health: sim.health }, mission.events, lastSay.win);
    } else {
      audio.play('fail');
      screens.showFail(FAIL_TEXT[reason] || 'The mission failed.', lastSay.fail);
    }
  }

  function render() {
    if (!sim) return;
    const frame = makeFrame(sim, effects, settings.reduceMotion, camera());
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
