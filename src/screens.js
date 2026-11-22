// Overlay screens (start, pause, settings, win, fail, error) with focus handling and the settings form.
const ALL = ['screen-character', 'screen-start', 'screen-pause', 'screen-settings', 'screen-win', 'screen-fail', 'screen-error'];

// One short line for the start screen: the mission's own tagline if it has one, else its first sentence, cut at a word if still long.
export function shortLine(text, max = 64) {
  const t = String(text || '').trim(); if (!t) return '';
  const first = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0];
  if (first.length <= max) return first;
  const head = first.slice(0, max); const cut = head.lastIndexOf(' ');
  return `${head.slice(0, cut > 20 ? cut : max).replace(/[,;:\s]+$/, '')}\u2026`;
}

export function createScreens(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const game = $('game');
  let current = null; let onShow = null;

  function show(id, focusId) {
    ALL.forEach((s) => { $(s).hidden = s !== id; });
    current = id; onShow?.(id);
    game.inert = true;
    game.setAttribute('aria-hidden', 'true');
    const target = $(focusId) || $(id).querySelector('[data-autofocus]') || $(id).querySelector('button');
    target?.focus();
  }

  function hide() {
    ALL.forEach((s) => { $(s).hidden = true; });
    current = null;
    game.inert = false;
    game.removeAttribute('aria-hidden');
  }

  function bindActions(actions) {
    doc.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn && actions[btn.dataset.action]) actions[btn.dataset.action]();
    });
  }

  function bindSettings(settings, onChange) {
    const f = { timer: $('set-timer'), autoDrive: $('set-auto'), reduceMotion: $('set-motion'), side: $('set-side'), graphics: $('set-graphics'), buttonControls: $('set-buttons'), sound: $('set-sound') };
    f.timer.value = settings.timer; f.autoDrive.checked = settings.autoDrive;
    f.reduceMotion.checked = settings.reduceMotion; f.side.value = settings.side; f.graphics.value = settings.graphics; f.buttonControls.checked = settings.buttonControls; f.sound.checked = settings.sound;
    f.timer.addEventListener('change', () => onChange({ timer: f.timer.value }));
    f.autoDrive.addEventListener('change', () => onChange({ autoDrive: f.autoDrive.checked }));
    f.reduceMotion.addEventListener('change', () => onChange({ reduceMotion: f.reduceMotion.checked }));
    f.side.addEventListener('change', () => onChange({ side: f.side.value }));
    f.graphics.addEventListener('change', () => onChange({ graphics: f.graphics.value }));
    f.buttonControls.addEventListener('change', () => onChange({ buttonControls: f.buttonControls.checked }));
    f.sound.addEventListener('change', () => onChange({ sound: f.sound.checked }));
  }

  function showWin(stats, events, line) {
    $('win-line').textContent = line ? `${line.speaker}: ${line.text}` : '';
    $('win-stats').textContent = `${stats.time} \u00b7 health ${stats.health}`;
    const list = $('win-events');
    list.replaceChildren(...events.map((ev) => {
      const li = doc.createElement('li');
      li.textContent = `${ev.label}: ${ev.name}, ${ev.year}`;
      return li;
    }));
    $('win-notes').hidden = events.length === 0;
    show('screen-win');
  }

  function showFail(reason, line) {
    $('fail-reason').textContent = reason;
    $('fail-line').textContent = line ? `${line.speaker}: ${line.text}` : '';
    show('screen-fail', 'retry-btn');
  }

  function showError(message) { $('error-text').textContent = message; show('screen-error'); }

  return { setOnShow(fn) { onShow = fn; }, show, hide, bindActions, bindSettings, showWin, showFail, showError, get current() { return current; } };
}
