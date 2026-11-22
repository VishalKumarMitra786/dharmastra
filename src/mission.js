// Mission data loading, validation, and the runner that turns sim events into objectives and dialogue.
import { ABILITY_IDS } from './abilities.js';
const LABELS = ['History', 'Tradition', 'Invented'];
const TRIGGERS = ['start', 'checkpoint-1', 'checkpoint-2', 'checkpoint-3', 'checkpoint-4', 'checkpoint-5', 'checkpoint-6', 'hit', 'fail', 'win', 'pickup', 'enemy-down', 'seen', 'ability', 'parry', 'finisher', 'wave-clear', 'captain-down', 'phase', 'prop-pickup', 'disarm'];
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
  const ABIL = ABILITY_IDS.filter((a) => a !== 'walk' && a !== 'run');
  for (const k of ['requires', 'lends']) if (m[k] != null && (!Array.isArray(m[k]) || m[k].some((a) => !ABIL.includes(a)))) errors.push(`"${k}" must be a list of ${ABIL.join(', ')}`);
  if (m.rewards != null && (typeof m.rewards !== 'object' || (m.rewards.grants != null && (!Array.isArray(m.rewards.grants) || m.rewards.grants.some((a) => !ABIL.includes(a)))))) errors.push('"rewards.grants" must be a list of abilities');
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
  let lastSeen = -Infinity;
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
    start() { lastHit = -Infinity; lastSeen = -Infinity; setObjective(0); say('start'); },
    // `now` is sim seconds, so pausing does not break the hit gap.
    handle(event, now = 0) {
      if (event.type === 'checkpoint') {
        setObjective(event.n);
        say(`checkpoint-${event.n}`);
      } else if (event.type === 'wall' || event.type === 'guard' || event.type === 'hurt') { // 'hurt' is the only way the traveller is ever damaged now (an enemy's telegraphed blow)
        if (now - lastHit >= HIT_GAP) { lastHit = now; say('hit'); }
      } else if (event.type === 'pickup') say('pickup');
      else if (event.type === 'enemy-down' || event.type === 'enemy-fell') say('enemy-down');
      else if (event.type === 'ability') say('ability');
      else if (event.type === 'parry' && !event.ranged) say('parry');
      else if (event.type === 'finisher') say('finisher');
      else if (event.type === 'wave-clear') say('wave-clear');
      else if (event.type === 'captain-down') say('captain-down');
      else if (event.type === 'phase') say('phase');
      else if (event.type === 'prop-pickup') say('prop-pickup');
      else if (event.type === 'disarm') say('disarm');
      else if (event.type === 'seen') { if (now - lastSeen >= HIT_GAP) { lastSeen = now; say('seen'); } }
      else if (event.type === 'win') say('win');
      else if (event.type === 'fail') say('fail');
    },
  };
}
