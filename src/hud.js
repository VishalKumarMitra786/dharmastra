// HUD in the DOM: objective, health, checkpoints, timer, captions and screen-reader announcements.
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

export function createHud(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    objective: $('objective'), hint: $('hint'), healthText: $('health-text'), healthFill: $('health-fill'),
    cpText: $('cp-text'), timerItem: $('stat-timer'), timerText: $('timer-text'), caption: $('caption'), announcer: $('announcer'),
    pips: $('cp-pips'), fx: $('fx'), chapter: $('chapter'), chapterEra: $('chapter-era'), chapterTitle: $('chapter-title'),
  };
  let captionTimer = 0;
  let chapterTimer = 0;

  return {
    setObjective(text) { el.objective.textContent = text; },
    setHealth(h, max) {
      el.healthText.textContent = `${h}/${max}`;
      el.healthFill.style.width = `${(h / max) * 100}%`;
    },
    setCheckpoints(n, total) {
      el.cpText.textContent = `${n}/${total}`;
      if (el.pips.children.length !== total) el.pips.replaceChildren(...Array.from({ length: total }, () => doc.createElement('i')));
      Array.from(el.pips.children).forEach((p, i) => p.classList.toggle('on', i < n));
    },
    // Red edge flash on a hit. Pure decoration: the hit is also announced and shown in the health text.
    hitFlash() { el.fx.classList.remove('hit'); void el.fx.offsetWidth; el.fx.classList.add('hit'); },
    // Short title card at mission start. Hidden from screen readers because the start screen already said it.
    chapter(era, title) {
      clearTimeout(chapterTimer);
      el.chapterEra.textContent = era; el.chapterTitle.textContent = title;
      el.chapter.hidden = false;
      el.chapter.classList.remove('show'); void el.chapter.offsetWidth; el.chapter.classList.add('show');
      chapterTimer = setTimeout(() => { el.chapter.hidden = true; }, 3200);
    },
    setTimer(seconds) {
      el.timerItem.hidden = seconds == null;
      if (seconds != null) el.timerText.textContent = fmtTime(seconds);
    },
    // Text alternative to the on-canvas arrow. Not a live region, so it does not chatter.
    setHint(dx, dy, label) {
      const dir = COMPASS[Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8];
      el.hint.textContent = label ? `${label} is to the ${dir}.` : '';
    },
    showCaption(line) {
      clearTimeout(captionTimer);
      el.caption.hidden = false;
      el.caption.replaceChildren();
      const who = doc.createElement('strong');
      who.textContent = `${line.speaker}: `;
      el.caption.append(who, line.text);
      captionTimer = setTimeout(() => { el.caption.hidden = true; el.caption.replaceChildren(); }, 3500 + line.text.length * 60);
    },
    clearCaption() { clearTimeout(captionTimer); el.caption.hidden = true; el.caption.replaceChildren(); },
    announce(text) { el.announcer.textContent = ''; setTimeout(() => { el.announcer.textContent = text; }, 30); },
  };
}
