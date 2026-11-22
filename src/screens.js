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
    const f = { timer: $('set-timer'), autoDrive: $('set-auto'), reduceMotion: $('set-motion'), side: $('set-side'), graphics: $('set-graphics'), buttonControls: $('set-buttons'), sound: $('set-sound'), autoCentre: $('set-centre') };
    f.timer.value = settings.timer; f.autoDrive.checked = settings.autoDrive;
    f.reduceMotion.checked = settings.reduceMotion; f.side.value = settings.side; f.graphics.value = settings.graphics; f.buttonControls.checked = settings.buttonControls; f.sound.checked = settings.sound; f.autoCentre.checked = settings.autoCentre !== false;
    f.timer.addEventListener('change', () => onChange({ timer: f.timer.value }));
    f.autoDrive.addEventListener('change', () => onChange({ autoDrive: f.autoDrive.checked }));
    f.reduceMotion.addEventListener('change', () => onChange({ reduceMotion: f.reduceMotion.checked }));
    f.side.addEventListener('change', () => onChange({ side: f.side.value }));
    f.graphics.addEventListener('change', () => onChange({ graphics: f.graphics.value }));
    f.buttonControls.addEventListener('change', () => onChange({ buttonControls: f.buttonControls.checked }));
    f.sound.addEventListener('change', () => onChange({ sound: f.sound.checked }));
    f.autoCentre.addEventListener('change', () => onChange({ autoCentre: f.autoCentre.checked }));
  }

  // extra (optional): {result: the style rank result, cliff: [lines]}. A level with no rank shows neither block.
  function showWin(stats, events, line, extra = {}) {
    $('win-line').textContent = line ? `${line.speaker}: ${line.text}` : '';
    $('win-stats').textContent = `${stats.time} \u00b7 health ${stats.health}`;
    const r = extra.result; const rankEl = $('win-rank'); const rs = $('win-rankstats'); const cl = $('win-cliff');
    if (rankEl) {
      rankEl.hidden = !r; rankEl.textContent = r ? r.rank : ''; if (r) { rankEl.dataset.rank = r.rank; rankEl.setAttribute('aria-label', `Rank ${r.rank}`); }
      rs.hidden = !r; rs.textContent = r ? `Style ${r.style} \u00b7 Best combo ${r.maxCombo} \u00b7 Parries ${r.parries} \u00b7 Blows taken ${r.hurts}` : '';
      const lines = extra.cliff || []; cl.hidden = !lines.length;
      cl.replaceChildren(...lines.map((l) => { const sp = doc.createElement('span'); sp.textContent = l.speaker === 'Far bank' || l.speaker === 'Scene' ? `[${l.text}]` : `${l.speaker}: ${l.text}`; return sp; }));
    }
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
