// Player settings, saved in localStorage when it is available (private mode may block it).
const KEY = 'dharmastra.settings.v1';

export function defaultSettings(win = window) {
  const mq = (q) => Boolean(win.matchMedia?.(q).matches);
  return {
    timer: 'standard', // 'off' | 'standard' | 'extended'
    autoDrive: mq('(pointer: coarse)'),
    reduceMotion: mq('(prefers-reduced-motion: reduce)'),
    side: 'right', // which side the touch controls sit on
    blood: true, // brief small blood spatter on hits; off gives neutral sparks with the same timing
    graphics: '3d', // '3d' | '2d' (3d falls back to 2d automatically when WebGL is unavailable)
    buttonControls: false, // true: single-press arrow and look buttons instead of the stick and touch drags (WCAG 2.5.7)
    sound: true, // the chakra's lock click and swell (the game has no sound files yet)
    autoCentre: true, // the third-person camera drifts back behind the hero after a while of running with no look input
  };
}

export function loadSettings(storage = safeStorage(), win = window) {
  const base = defaultSettings(win);
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || '{}');
    return wireBloodToggle({
      timer: ['off', 'standard', 'extended'].includes(saved.timer) ? saved.timer : base.timer,
      autoDrive: typeof saved.autoDrive === 'boolean' ? saved.autoDrive : base.autoDrive,
      reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : base.reduceMotion,
      side: saved.side === 'left' ? 'left' : 'right',
      graphics: saved.graphics === '2d' ? '2d' : '3d',
      blood: typeof saved.blood === 'boolean' ? saved.blood : base.blood,
      buttonControls: typeof saved.buttonControls === 'boolean' ? saved.buttonControls : base.buttonControls,
      sound: typeof saved.sound === 'boolean' ? saved.sound : base.sound,
      autoCentre: typeof saved.autoCentre === 'boolean' ? saved.autoCentre : base.autoCentre,
    }, win, storage);
  } catch { return wireBloodToggle(base, win, storage); }
}

export function saveSettings(settings, storage = safeStorage()) {
  try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked: settings last for this visit only */ }
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

// The Settings screen's `blood` checkbox (#set-blood) updates the live settings object and saves it, so no other file has to know about it.
function wireBloodToggle(settings, win, storage) {
  const box = win?.document?.getElementById?.('set-blood');
  if (box && !box.dataset?.wired) {
    box.checked = settings.blood;
    box.addEventListener('change', () => { settings.blood = box.checked; saveSettings(settings, storage); });
    if (box.dataset) box.dataset.wired = '1';
  }
  return settings;
}
