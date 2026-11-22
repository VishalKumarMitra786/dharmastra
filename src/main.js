// Entry point: loads mission data and layout, wires modules together, shows the start screen.
import { loadMission } from './mission.js';
import { parseLayout } from './world.js';
import { createRenderer2D } from './renderer2d.js';
import { assertRenderer } from './renderer.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createScreens, shortLine } from './screens.js';
import { createAudio } from './audio.js';
import { loadSettings, saveSettings } from './settings.js';
import { createGame } from './game.js';
import { chooseGraphics } from './camera.js';
import { pickMissionId, missingFor } from './missions.js';
import { loadProgress } from './progress.js';
import { loadTraveller, saveTraveller, appearance, fill, defaultTraveller, avatarSvg } from './characters.js';
import { createPicker } from './picker.js';
import { createChakra } from './chakra/view.js';
import { createClick } from './chakra/click.js';
import { dialSvg, dialLabel } from './chakra/dial.js';
import { YUGAS, yugaProgress, currentYuga, spineMap } from './chakra/model.js';
import { createEventStore } from './chakra/data.js';
import { createStaticReachProvider } from './chakra/reach.js';
import { initModality } from './modality.js';

initModality(); // focus rings only for the keyboard
const MISSION_ID = pickMissionId(location.search);
const PARAMS = new URLSearchParams(location.search);
const CHAKRA_FIRST = !PARAMS.has('mission'); // the chakra is the first screen; a ?mission= link goes straight to that mission
const SYNTH = Math.min(20000, Math.max(0, Number(PARAMS.get('synth')) || 0)); // dev switch: adds N in-memory test events to Kali Yuga
const DEV = new URLSearchParams(location.search).get('dev') === '1'; // test switch: every ability is lent and nothing is saved
const $ = (id) => document.getElementById(id);
const screens = createScreens();
screens.bindActions({ reload: () => location.reload() });

// ---- chakra home screen ----
let leaveChakra = () => {}; const chakraLeft = new Promise((r) => { leaveChakra = r; });
let bootDone = () => {}; const ready = new Promise((r) => { bootDone = r; });
let enterMission = () => screens.show('screen-start', 'start-btn'); // replaced in boot: traveller picker on a first visit, else the mission screen
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
const store = createEventStore({ synth: SYNTH });
let settingsRef = null; // set in boot; the chakra reads the sound switch from it
const chakra = createChakra({
  store, getProgress: loadProgress, reach: createStaticReachProvider(), reducedMotion, click: createClick({ enabled: () => settingsRef?.sound !== false }), soundOn: () => settingsRef?.sound !== false,
  async onPlay(ev) {
    if (ev.mission !== MISSION_ID) { const q = new URLSearchParams(location.search); q.set('mission', ev.mission); location.search = q.toString(); return; }
    leaveChakra(); await ready; chakra.close(); enterMission();
  },
});
// The compact chakra dial on every screen that is not the game: current yuga lit, with progress. Repainted only when the progress changes.
let dialData = { cur: -1, fracs: [], levels: [] }; let dialKey = '';
async function paintDials() {
  try {
    const idx = await store.loadIndex(); const p = loadProgress(); const ctx = { completed: p.completed, spineById: spineMap(idx.spine) };
    const prog = yugaProgress(idx.spine, ctx);
    dialData = { cur: YUGAS.findIndex((y) => y.id === currentYuga(idx.spine, ctx)), fracs: prog.map((q) => (q.levels ? q.done / q.levels : 0)), levels: prog.map((q) => q.levels) };
  } catch { /* no data: the dial shows without progress */ }
  const key = JSON.stringify(dialData); if (key === dialKey) return; dialKey = key;
  for (const d of document.querySelectorAll('[data-dial]')) { d.innerHTML = dialSvg(dialData); if (d.getAttribute('role') === 'img') d.setAttribute('aria-label', dialLabel(dialData)); }
}
screens.setOnShow(() => { paintDials(); });
paintDials();
if (DEV) globalThis.__chakra = chakra; // ?dev=1 only: lets tools/smoke.mjs read the ring state
function showChakra() { screens.hide(); $('game').inert = true; $('game').setAttribute('aria-hidden', 'true'); chakra.open(); }

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
    $('logline').textContent = shortLine(mission.tagline || mission.logline);
    $('who-btn').setAttribute('aria-label', `Change traveller. Now ${name}.`);
    $('who-avatar').innerHTML = avatarSvg(appearance(traveller)); // decorative: the name is in the adjacent text, and the svg is aria-hidden (empty alt equivalent)
    renderer2d?.setCharacter?.(appearance(traveller));
  };
  const settings = loadSettings(); settingsRef = settings;
  const canvas = $('stage');
  const canvas3d = $('stage3d');
  const renderer2d = assertRenderer(createRenderer2D(canvas));
  renderer2d.setWorld(world);
  personalise();
  let renderer3d = null;
  const ARIA_2D = canvas.getAttribute('aria-label');
  const ARIA_3D = 'City view of you, the guards and the checkpoints. The objective, health, checkpoints and captions are in the text panels, so you do not need the picture to follow the mission.';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const hud = createHud(document, { mode: () => (settings.buttonControls ? 'buttons' : coarse ? 'touch' : 'key') });
  const audio = createAudio();
  let game = null;
  const input = createInput({ stage: canvas, buttons: [...document.querySelectorAll('[data-control]')], onPause: () => game?.pause(), joystick: $('joy'), knob: $('joy-knob') });

  const applyVisualSettings = () => {
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    $('game').dataset.side = settings.side;
    $('game').dataset.controls = settings.buttonControls ? 'buttons' : 'stick';
    $('game').dataset.autorun = settings.autoDrive ? '1' : '0';
    input.state.buttonMode = settings.buttonControls; input.state.side = settings.side;
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
    menu: () => { game.menu(); showChakra(); },
    settings: () => { if (chakra.isOpen) { chakra.hideTemp(); backTo = 'chakra'; } else backTo = screens.current; screens.show('screen-settings'); },
    'settings-back': () => { if (backTo === 'chakra') { screens.hide(); $('game').inert = true; $('game').setAttribute('aria-hidden', 'true'); chakra.showAgain(); } else screens.show(backTo); },
    'chakra-open': () => showChakra(),
    'chakra-skip': () => { leaveChakra(); ready.then(() => { chakra.close(); enterMission(); }); },
    'char-open': () => { picker.open(traveller); screens.show('screen-character', 'body-' + appearance(traveller).body); },
    'char-save': () => picker.save(),
  });

  const picker = createPicker(document, {
    onSave: (t) => { traveller = t; saveTraveller(t); personalise(); renderer3d?.setCharacter(appearance(t)); game?.showFrame?.(); screens.show('screen-start', 'start-btn'); },
  });

  game.applySettings();
  resize();
  if (CHAKRA_FIRST) await chakraLeft; // keep the first screen light: the 3D view loads once the player leaves the chakra
  await applyGraphics();
  // A level opens only after the lessons it needs are finished. The note names what to finish first.
  const missing = DEV ? [] : missingFor(mission, loadProgress().abilities);
  const lock = $('lock-note');
  lock.hidden = missing.length === 0;
  lock.textContent = missing.length ? `Locked: finish ${missing.join(' and ')} first.` : '';
  $('start-btn').disabled = missing.length > 0;
  $('start-btn').setAttribute('aria-disabled', String(missing.length > 0));
  enterMission = () => {
    if (loadTraveller()) screens.show('screen-start', 'start-btn');
    else { picker.open(traveller); screens.show('screen-character', 'body-' + appearance(traveller).body); } // first visit: choose a traveller
  };
  bootDone();
  if (!CHAKRA_FIRST) enterMission();
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

if (CHAKRA_FIRST) showChakra(); else screens.show('screen-start');
boot().catch((err) => {
  console.error(err);
  chakra.close(); bootDone();
  screens.showError(`${err.message}`);
});
