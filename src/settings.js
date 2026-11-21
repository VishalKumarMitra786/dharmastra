// Player settings, saved in localStorage when it is available (private mode may block it).
const KEY = 'dharmastra.settings.v1';

export function defaultSettings(win = window) {
  const mq = (q) => Boolean(win.matchMedia?.(q).matches);
  return {
    timer: 'standard', // 'off' | 'standard' | 'extended'
    autoDrive: mq('(pointer: coarse)'),
    reduceMotion: mq('(prefers-reduced-motion: reduce)'),
    side: 'right', // which side the touch controls sit on
    graphics: '3d', // '3d' | '2d' (3d falls back to 2d automatically when WebGL is unavailable)
  };
}

export function loadSettings(storage = safeStorage(), win = window) {
  const base = defaultSettings(win);
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || '{}');
    return {
      timer: ['off', 'standard', 'extended'].includes(saved.timer) ? saved.timer : base.timer,
      autoDrive: typeof saved.autoDrive === 'boolean' ? saved.autoDrive : base.autoDrive,
      reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : base.reduceMotion,
      side: saved.side === 'left' ? 'left' : 'right',
      graphics: saved.graphics === '2d' ? '2d' : '3d',
    };
  } catch { return base; }
}

export function saveSettings(settings, storage = safeStorage()) {
  try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked: settings last for this visit only */ }
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
