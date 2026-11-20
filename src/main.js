// Entry point: loads mission data and layout, wires modules together, shows the start screen.
import { loadMission } from './mission.js';
import { parseLayout } from './world.js';
import { createRenderer2D } from './renderer2d.js';
import { assertRenderer } from './renderer.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createScreens } from './screens.js';
import { createAudio } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';
import { createGame } from './game.js';

const MISSION_ID = 'dvapara-escape';
const $ = (id) => document.getElementById(id);
const screens = createScreens();
screens.bindActions({ reload: () => location.reload() });

async function boot() {
  if (location.protocol === 'file:') throw new Error('This page was opened from a file.');
  const [mission, { layout }] = await Promise.all([
    loadMission(`missions/${MISSION_ID}.json`),
    import(`../missions/${MISSION_ID}.js`),
  ]);
  const world = parseLayout(layout);
  if (world.checkpoints.length !== mission.objectives.length) {
    throw new Error(`The map has ${world.checkpoints.length} checkpoints but the mission has ${mission.objectives.length} objectives.`);
  }

  const settings = loadSettings();
  const canvas = $('stage');
  const renderer = assertRenderer(createRenderer2D(canvas));
  renderer.setWorld(world);
  const hud = createHud();
  const audio = createAudio();
  let game = null;
  const input = createInput({ stage: canvas, buttons: [...document.querySelectorAll('[data-control]')], onPause: () => game?.pause() });

  const applyVisualSettings = () => {
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    $('game').dataset.side = settings.side;
  };
  game = createGame({ mission, world, renderer, input, hud, screens, audio, settings, onSettings: applyVisualSettings });

  const resize = () => {
    renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    game.showFrame();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

  $('era').textContent = mission.era;
  $('start-title').textContent = mission.title;
  $('game').setAttribute('aria-label', mission.title);
  $('logline').textContent = mission.logline;
  document.title = `Dharmastra - ${mission.title}`;
  $('set-timer').options[1].textContent = `Standard (${clock(world.timeLimit)})`;
  $('set-timer').options[2].textContent = `Extended (${clock(world.timeLimit * 2)})`;

  let backTo = 'screen-start';
  screens.bindSettings(settings, (change) => {
    Object.assign(settings, change);
    saveSettings(settings);
    game.applySettings();
  });
  screens.bindActions({
    start: () => game.start(),
    resume: () => game.resume(),
    restart: () => game.restart(),
    retry: () => game.restart(),
    pause: () => game.pause(),
    menu: () => game.menu(),
    settings: () => { backTo = screens.current; screens.show('screen-settings'); },
    'settings-back': () => screens.show(backTo),
  });

  game.applySettings();
  resize();
  $('start-btn').disabled = false;
  screens.show('screen-start', 'start-btn');
}

function clock(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

screens.show('screen-start');
boot().catch((err) => {
  console.error(err);
  screens.showError(`${err.message}`);
});
