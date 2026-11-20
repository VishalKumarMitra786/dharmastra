// Mission data loading, validation, and the runner that turns sim events into objectives and dialogue.
const LABELS = ['History', 'Tradition', 'Invented'];
const TRIGGERS = ['start', 'checkpoint-1', 'checkpoint-2', 'checkpoint-3', 'hit', 'fail', 'win'];
const HIT_GAP = 5; // seconds between "hit" lines so captions do not spam

export function validateMission(m) {
  const errors = [];
  const str = (v) => typeof v === 'string' && v.length > 0;
  if (!m || typeof m !== 'object') return ['Mission is not an object'];
  ['id', 'era', 'title', 'logline'].forEach((k) => { if (!str(m[k])) errors.push(`"${k}" must be a non-empty string`); });
  if (!Array.isArray(m.objectives) || m.objectives.length === 0) errors.push('"objectives" must be a non-empty array');
  (m.objectives || []).forEach((o, i) => { if (!str(o?.id) || !str(o?.text)) errors.push(`objectives[${i}] needs id and text`); });
  if (!Array.isArray(m.dialogue)) errors.push('"dialogue" must be an array');
  (m.dialogue || []).forEach((d, i) => {
    if (!str(d?.id) || !str(d?.speaker) || !str(d?.text)) errors.push(`dialogue[${i}] needs id, speaker and text`);
    if (!TRIGGERS.includes(d?.trigger)) errors.push(`dialogue[${i}] has unknown trigger "${d?.trigger}"`);
  });
  if (!Array.isArray(m.events)) errors.push('"events" must be an array');
  (m.events || []).forEach((e, i) => {
    if (!str(e?.name) || !str(e?.year)) errors.push(`events[${i}] needs name and year`);
    if (!LABELS.includes(e?.label)) errors.push(`events[${i}] label must be one of ${LABELS.join(', ')}`);
  });
  return errors;
}

export async function loadMission(url, fetchFn = fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  const data = await res.json();
  const errors = validateMission(data);
  if (errors.length) throw new Error(`Invalid mission file: ${errors.join('; ')}`);
  return data;
}

// handlers: onObjective(objective|null, index), onSay(line). Reset with start() for every attempt.
export function createRunner(data, handlers = {}) {
  const used = {};
  let lastHit = -Infinity;
  let index = 0;

  function say(trigger) {
    const lines = data.dialogue.filter((d) => d.trigger === trigger);
    if (!lines.length) return null;
    const n = used[trigger] || 0;
    used[trigger] = n + 1;
    const line = lines[n % lines.length];
    handlers.onSay?.(line);
    return line;
  }

  function setObjective(i) {
    index = i;
    handlers.onObjective?.(data.objectives[i] || null, i);
  }

  return {
    get total() { return data.objectives.length; },
    get objectiveIndex() { return index; },
    start() { lastHit = -Infinity; setObjective(0); say('start'); },
    // `now` is sim seconds, so pausing does not break the hit gap.
    handle(event, now = 0) {
      if (event.type === 'checkpoint') {
        setObjective(event.n);
        say(`checkpoint-${event.n}`);
      } else if (event.type === 'wall' || event.type === 'guard') {
        if (now - lastHit >= HIT_GAP) { lastHit = now; say('hit'); }
      } else if (event.type === 'win') say('win');
      else if (event.type === 'fail') say('fail');
    },
  };
}
