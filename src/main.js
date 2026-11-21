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
import { chooseGraphics } from './camera.js';
import { pickMissionId, missingFor } from './missions.js';
import { loadProgress } from './progress.js';
import { loadTraveller, saveTraveller, appearance, fill, defaultTraveller, avatarSvg } from './characters.js';
import { createPicker } from './picker.js';

const MISSION_ID = pickMissionId(location.search);
const DEV = new URLSearchParams(location.search).get('dev') === '1'; // test switch: every ability is lent and nothing is saved
const $ = (id) => document.getElementById(id);
const screens = createScreens();
screens.bindActions({ reload: () => location.reload() });

async function boot() {
  if (location.protocol === 'file:') throw new Error('This page was opened from a file.');
  const [mission, { layout }] = await Promise.all([
    loadMission(`missions/${MISSION_ID}.json`),
    import(`../missions/${MISSION_ID}.js`),
  ]);
  const raw = structuredClone(mission); // scripts say {name}; the chosen traveller's name is filled in below
  const world = parseLayout(layout);
  if (world.checkpoints.length !== mission.objectives.length) {
    throw new Error(`The map has ${world.checkpoints.length} checkpoints but the mission has ${mission.objectives.length} objectives.`);
  }

  const saved = loadTraveller();
  let traveller = saved || defaultTraveller();
  const personalise = () => {
    const name = appearance(traveller).name;
    mission.logline = fill(raw.logline, name);
    mission.objectives.forEach((o, i) => { o.text = fill(raw.objectives[i].text, name); });
    mission.dialogue.forEach((d, i) => { d.text = fill(raw.dialogue[i].text, name); });
    $('logline').textContent = mission.logline;
    $('who').textContent = `Playing as ${name}.`;
    $('who-avatar').innerHTML = avatarSvg(appearance(traveller)); // decorative: the name is in the adjacent text, and the svg is aria-hidden (empty alt equivalent)
    renderer2d?.setCharacter?.(appearance(traveller));
  };
  const settings = loadSettings();
  const canvas = $('stage');
  const canvas3d = $('stage3d');
  const renderer2d = assertRenderer(createRenderer2D(canvas));
  renderer2d.setWorld(world);
  personalise();
  let renderer3d = null;
  const ARIA_2D = canvas.getAttribute('aria-label');
  const ARIA_3D = 'City view of you, the guards and the checkpoints. The objective, health, checkpoints and captions are in the text panels, so you do not need the picture to follow the mission.';
  const hud = createHud();
  const audio = createAudio();
  let game = null;
  const input = createInput({ stage: canvas, buttons: [...document.querySelectorAll('[data-control]')], onPause: () => game?.pause() });

  const applyVisualSettings = () => {
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    $('game').dataset.side = settings.side;
  };
  game = createGame({ mission, world, renderer: renderer2d, input, hud, screens, audio, settings, onSettings: applyVisualSettings, dev: DEV });

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    renderer2d.resize(w, h, dpr);
    renderer3d?.resize(w, h, dpr);
    game.showFrame();
  };

  // Graphics: 3D when possible, otherwise 2D with a visible note. The saved preference is never overwritten by a fallback.
  const note = (text) => { for (const id of ['gfx-note', 'gfx-note-start']) { const n = $(id); n.textContent = text; n.hidden = !text; } if (text) hud.announce(text); };
  const show = (mode) => {
    $('game').dataset.graphics = mode;
    canvas.setAttribute('aria-label', mode === '3d' ? ARIA_3D : ARIA_2D);
    game.setRenderer(mode === '3d' ? renderer3d : renderer2d);
  };
  const fallback = (why) => { console.warn(why); show('2d'); note('3D graphics could not start on this device, so the 2D view is on.'); };
  async function applyGraphics() {
    const pick = chooseGraphics({ preference: settings.graphics, webglAvailable: webglAvailable() });
    note(pick.note);
    if (pick.mode === '2d') { show('2d'); return; }
    try {
      if (!renderer3d) {
        const THREE = await import('./vendor/three-lite.js');
        const { createRenderer3D } = await import('./renderer3d.js');
        renderer3d = assertRenderer(createRenderer3D(canvas3d, THREE, { onContextLost: () => fallback('WebGL context lost') }));
        renderer3d.setCharacter(appearance(traveller));
        renderer3d.setWorld(world);
        renderer3d.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
      }
      show('3d');
    } catch (err) { fallback(err); }
  }
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
    if ('graphics' in change) applyGraphics();
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
    'char-open': () => { picker.open(traveller); screens.show('screen-character', 'body-' + appearance(traveller).body); },
    'char-save': () => picker.save(),
  });

  const picker = createPicker(document, {
    onSave: (t) => { traveller = t; saveTraveller(t); personalise(); renderer3d?.setCharacter(appearance(t)); game?.showFrame?.(); screens.show('screen-start', 'start-btn'); },
  });

  game.applySettings();
  resize();
  await applyGraphics();
  // A level opens only after the lessons it needs are finished. The note names what to finish first.
  const missing = DEV ? [] : missingFor(mission, loadProgress().abilities);
  const lock = $('lock-note');
  lock.hidden = missing.length === 0;
  lock.textContent = missing.length ? `Locked: finish ${missing.join(' and ')} first.` : '';
  $('start-btn').disabled = missing.length > 0;
  $('start-btn').setAttribute('aria-disabled', String(missing.length > 0));
  if (saved) screens.show('screen-start', 'start-btn');
  else { picker.open(traveller); screens.show('screen-character', 'body-' + appearance(traveller).body); } // first visit: choose a traveller
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    g?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context straight away
    return Boolean(g);
  } catch { return false; }
}

function clock(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

screens.show('screen-start');
boot().catch((err) => {
  console.error(err);
  screens.showError(`${err.message}`);
});
