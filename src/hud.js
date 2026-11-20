// HUD in the DOM: objective, health, checkpoints, timer, captions and screen-reader announcements.
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

export function createHud(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    objective: $('objective'), hint: $('hint'), healthText: $('health-text'), healthFill: $('health-fill'),
    cpText: $('cp-text'), timerItem: $('stat-timer'), timerText: $('timer-text'), caption: $('caption'), announcer: $('announcer'),
  };
  let captionTimer = 0;

  return {
    setObjective(text) { el.objective.textContent = text; },
    setHealth(h, max) {
      el.healthText.textContent = `${h}/${max}`;
      el.healthFill.style.width = `${(h / max) * 100}%`;
    },
    setCheckpoints(n, total) { el.cpText.textContent = `${n}/${total}`; },
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
