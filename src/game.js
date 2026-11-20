// Game: ties sim, mission runner, renderer, input, HUD and screens together and owns the run state.
import { createSim, step, setTimerMode } from './sim.js';
import { createRunner } from './mission.js';
import { makeFrame } from './renderer.js';
import { createLoop } from './loop.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
const FAIL_TEXT = { wrecked: 'Your chariot is wrecked.', time: 'Time ran out.' };

export function createGame({ mission, world, renderer, input, hud, screens, audio, settings, onSettings }) {
  let sim = null;
  let runner = null;
  let paused = true;
  let effects = { shake: 0, flash: 0 };
  let hintClock = 0;
  let lastSay = {};

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
    runner.start();
    refreshHud();
    input.reset();
    input.state.enabled = true;
    paused = false;
    screens.hide();
    hud.setHint(1, 0, '');
    document.getElementById('pause-btn').focus();
    loop.start();
  }

  function refreshHud() {
    hud.setHealth(sim.health, sim.t.maxHealth);
    hud.setCheckpoints(sim.checkpoint, world.checkpoints.length);
    hud.setTimer(sim.timeLeft);
  }

  function update(dt) {
    if (paused || sim.status !== 'playing') return;
    const events = step(sim, dt, input.read());
    effects.shake = Math.max(0, effects.shake - dt * 3);
    effects.flash = Math.max(0, effects.flash - dt * 2.5);
    for (const e of events) onEvent(e);
    if (events.length) refreshHud();
    hintClock -= dt;
    if (hintClock <= 0) { hintClock = 0.25; updateHint(); hud.setTimer(sim.timeLeft); }
  }

  function updateHint() {
    const next = world.checkpoints[sim.checkpoint];
    if (next) hud.setHint(next.x - sim.chariot.x, next.y - sim.chariot.y, `Checkpoint ${sim.checkpoint + 1}`);
  }

  function onEvent(e) {
    runner.handle(e, sim.elapsed);
    if (e.type === 'wall' || e.type === 'guard') {
      effects.shake = 1; effects.flash = 1;
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
    renderer.render(makeFrame(sim, effects, settings.reduceMotion));
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
    get status() { return sim?.status; },
  };
}
