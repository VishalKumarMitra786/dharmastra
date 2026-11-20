// Overlay screens (start, pause, settings, win, fail, error) with focus handling and the settings form.
const ALL = ['screen-start', 'screen-pause', 'screen-settings', 'screen-win', 'screen-fail', 'screen-error'];

export function createScreens(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const game = $('game');
  let current = null;

  function show(id, focusId) {
    ALL.forEach((s) => { $(s).hidden = s !== id; });
    current = id;
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
    const f = { timer: $('set-timer'), autoDrive: $('set-auto'), reduceMotion: $('set-motion'), side: $('set-side') };
    f.timer.value = settings.timer; f.autoDrive.checked = settings.autoDrive;
    f.reduceMotion.checked = settings.reduceMotion; f.side.value = settings.side;
    f.timer.addEventListener('change', () => onChange({ timer: f.timer.value }));
    f.autoDrive.addEventListener('change', () => onChange({ autoDrive: f.autoDrive.checked }));
    f.reduceMotion.addEventListener('change', () => onChange({ reduceMotion: f.reduceMotion.checked }));
    f.side.addEventListener('change', () => onChange({ side: f.side.value }));
  }

  function showWin(stats, events, line) {
    $('win-line').textContent = line ? `${line.speaker}: ${line.text}` : '';
    $('win-stats').textContent = `Time ${stats.time}. Health left ${stats.health}.`;
    const list = $('win-events');
    list.replaceChildren(...events.map((ev) => {
      const li = doc.createElement('li');
      li.textContent = `${ev.name} (${ev.year}) - ${ev.label}`;
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

  return { show, hide, bindActions, bindSettings, showWin, showFail, showError, get current() { return current; } };
}
