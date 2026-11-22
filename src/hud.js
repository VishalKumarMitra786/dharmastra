// HUD in the DOM: a slim top bar (objective chip, health and stamina bars), short captions, one-icon tips and screen-reader announcements.
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const RELATIVE = ['straight ahead', 'ahead and to the right', 'to the right', 'behind you and to the right', 'behind you', 'behind you and to the left', 'to the left', 'ahead and to the left'];
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

const ANNOUNCE_GAP = 1.2; // seconds between announcements of the same kind, so a flurry of hits does not flood a screen reader
const CUE_MS = 2200;
const ABILITY_NAMES = { walk: 'walk', run: 'run', crouch: 'crouch', vault: 'vault', staff: 'staff', dodge: 'dodge roll', push: 'shove', climb: 'climb', sword: 'sword', bow: 'bow' };
const WEAPON_NAMES = { none: 'Bare hands', staff: 'Staff', sword: 'Sword', bow: 'Bow' };
const ATTACK_LABEL = { none: 'Punch (J)', staff: 'Attack with staff (J)', sword: 'Light cut with sword (J)', bow: 'Strike with fists (J)' };
const VIA_CUE = { fists: '[Fist strike]', staff: '[Staff strike]', sword: '[Sword cut]', arrow: '[Arrow hits]', prop: '[Prop strike]' };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const nm = (id) => ABILITY_NAMES[id] || String(id);

// The objective chip holds at most six words. A mission may give its own short text (o.short); otherwise the first clause is used.
export function chipText(text, max = 6) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(' ');
  const cut = String(text).search(/\s(?:and|before|without|until|while)\s/); // "Reach the Lamp Bazaar and take..." -> "Reach the Lamp Bazaar"
  if (cut > 0) { const head = String(text).slice(0, cut).trim().split(/\s+/); if (head.length >= 3 && head.length <= max) return head.join(' '); }
  return `${words.slice(0, max).join(' ').replace(/[,;:.]+$/, '')}\u2026`;
}
// Dialogue is shown as captions of at most `max` characters: a long line is split at sentence ends, then at word ends, and shown one part after the other.
export function splitCaption(text, max = 80) {
  const out = []; let rest = String(text || '').trim();
  while (rest.length > max) {
    let cut = -1; for (const m of rest.slice(0, max + 1).matchAll(/[.!?]\s/g)) cut = m.index + 1;
    if (cut < max * 0.35) { cut = rest.lastIndexOf(' ', max); if (cut < 1) cut = max; }
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
// One-icon tips shown the first time a move is needed. icon names the symbol in index.html; touch and key words are 2 or 3 words.
export const TIPS = {
  move: { icon: 'tap', touch: 'Drag the stick', buttons: 'Tap the arrows', key: 'WASD to move' },
  look: { icon: 'lookr', touch: 'Drag here to look', buttons: 'Use the look buttons', key: 'Drag mouse to look' },
  do: { icon: 'do', touch: 'Do: vault or climb', buttons: 'Do: vault or climb', key: 'Space: vault or climb' },
  crouch: { icon: 'crouch', touch: 'Crouch to duck', buttons: 'Crouch to duck', key: 'C to crouch' },
  dodge: { icon: 'dodge', touch: 'Dodge a blow', buttons: 'Dodge a blow', key: 'X to dodge' },
  block: { icon: 'block', touch: 'Hold to block', buttons: 'Hold to block', key: 'Hold B to block' },
  attack: { icon: 'attack', touch: 'Tap to strike', buttons: 'Tap to strike', key: 'J to strike' },
  push: { icon: 'shove', touch: 'Shove them back', buttons: 'Shove them back', key: 'V to shove' },
  swap: { icon: 'swap', touch: 'Swap weapon', buttons: 'Swap weapon', key: 'R to swap' },
  aim: { icon: 'bow', touch: 'Hold, then let go', buttons: 'Hold, then let go', key: 'Hold Z, let go' },
};
export const tipText = (id, mode) => { const t = TIPS[id]; return t ? t[mode] || t.key : ''; };
// Which tip does the player need right now? Looks at what is within reach (a low wall, a ledge, a beam, a raider winding up) and what the player can do.
export function needFor(sim) {
  if (!sim || !sim.chariot || !sim.world) return null;
  const { x, y } = sim.chariot; const has = (a) => (sim.abilities || []).includes(a);
  const near = (o, r) => Math.hypot(Math.max(o.x - x, 0, x - (o.x + o.w)), Math.max(o.y - y, 0, y - (o.y + o.d))) < r;
  for (const o of sim.world.obstacles || []) {
    if (o.kind === 'lowwall' && has('vault') && near(o, 70)) return 'do';
    if (o.kind === 'ledge' && has('climb') && near(o, 70)) return 'do';
    if (o.kind === 'beam' && has('crouch') && near(o, 80)) return 'crouch';
  }
  for (const e of sim.enemies || []) {
    if ((e.state === 'windup' || e.state === 'chase') && Math.hypot(e.x - x, e.y - y) < 150) return has('sword') && has('dodge') ? 'block' : has('dodge') ? 'dodge' : null;
  }
  return null;
}

// Objective -> one line of text. Accepts {text, state|done|failed, optional, progress:{n,total}} (also count/need or have/target).
export function objectiveLine(o) {
  const p = o.progress || {};
  const n = p.n ?? p.have ?? o.count ?? o.have; const total = p.total ?? p.need ?? p.target ?? o.need ?? o.target;
  const state = o.state || (o.failed ? 'failed' : o.done ? 'done' : 'active');
  const status = state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : n != null && total != null ? `${n} of ${total}` : 'To do';
  return `${o.optional ? 'Optional: ' : ''}${o.text} - ${status}`;
}

export function createHud(doc = document, { now = () => Date.now() / 1000, mode = () => 'key', storage = null } = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    objective: $('objective'), objText: $('obj-text'), objFull: $('obj-full'), objCount: $('obj-count'), hint: $('hint'),
    health: $('stat-health'), healthFill: $('health-fill'), timerItem: $('stat-timer'), timerText: $('timer-text'), caption: $('caption'), announcer: $('announcer'),
    staminaItem: $('stat-stamina'), staminaFill: $('stamina-fill'), arrows: $('arrows-text'), arrowsItem: $('stat-arrows'),
    objList: $('objectives'), cue: $('cue'), fx: $('fx'), chapter: $('chapter'), chapterEra: $('chapter-era'), chapterTitle: $('chapter-title'),
    held: $('stat-held'), heldName: $('held-name'), heldFill: $('held-fill'), prompt: $('prop-prompt'), promptText: $('prop-prompt-text'),
    tip: $('tip'), tipText: $('tip-text'), tipIcon: doc.querySelector?.('#tip use'),
  };
  let captionTimer = 0;
  let chapterTimer = 0;
  let cueTimer = 0;
  let objectives = [];
  let kit = null; // last {abilities, weapon, crouch}
  let propKey = ''; let holding = false; // props: last drawn state of the held chip, prompt and contextual buttons
  let tipTimer = 0; let tipQueue = []; let capQueue = []; let capGen = 0;
  const seen = new Set(); const KEY = 'dharmastra.tips.v1';
  try { for (const t of JSON.parse((storage || globalThis.localStorage)?.getItem(KEY) || '[]')) seen.add(t); } catch { /* no storage: tips repeat each visit */ }
  const remember = () => { try { (storage || globalThis.localStorage)?.setItem(KEY, JSON.stringify([...seen])); } catch { /* ignore */ } };
  const lastAt = {};
  const gate = (key, gap = ANNOUNCE_GAP) => { const t = now(); if (lastAt[key] != null && t - lastAt[key] < gap) return false; lastAt[key] = t; return true; };
  const say = (text) => { el.announcer.textContent = ''; setTimeout(() => { el.announcer.textContent = text; }, 30); };
  // A caption for a sound or event that has no speaker (the dialogue caption stays separate). Text in brackets reads as a sound cue.
  const cue = (text) => {
    if (!el.cue || !text) return;
    clearTimeout(cueTimer); el.cue.hidden = false; el.cue.textContent = text;
    cueTimer = setTimeout(() => { el.cue.hidden = true; el.cue.textContent = ''; }, CUE_MS);
  };
  // A tip is one icon and two or three words, shown once ever per move, in the words of the input in use (stick, buttons or keys).
  const showTip = () => {
    if (!el.tip || !tipQueue.length || !el.tip.hidden) return;
    const id = tipQueue.shift(); el.tip.hidden = false; el.tipText.textContent = tipText(id, mode());
    if (el.tipIcon) el.tipIcon.setAttribute('href', `#i-${TIPS[id].icon}`);
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { el.tip.hidden = true; showTip(); }, 3200);
  };
  const tip = (id) => { if (!TIPS[id] || seen.has(id)) return false; seen.add(id); remember(); tipQueue.push(id); showTip(); return true; };
  const objText = (id) => objectives.find((o) => o.id === id)?.text;

  return {
    // Every objective with its progress, as text. List order is kept. Hidden when empty (old missions use setObjective only).
    setObjectives(list) {
      objectives = Array.isArray(list) ? list : [];
      if (el.objCount) { // a small n/total badge on the chip for the first open objective that counts something (for example sacks)
        const c = objectives.find((o) => (o.state || 'active') === 'active' && o.progress && o.progress.total != null);
        el.objCount.hidden = !c; if (c) el.objCount.textContent = `${c.progress.n ?? 0}/${c.progress.total}`;
      }
      if (!el.objList) return;
      el.objList.hidden = objectives.length === 0;
      // A long list (a teaching mission) shows what is still to do plus a count of what is done, so the list never covers the playfield on a phone.
      const stateOf = (o) => o.state || (o.failed ? 'failed' : o.done ? 'done' : 'active');
      const shown = objectives.length > 4 ? objectives.filter((o) => stateOf(o) !== 'done') : objectives;
      const doneN = objectives.length - shown.length;
      const summary = doneN > 0 ? (() => { const li = doc.createElement('li'); li.dataset.state = 'done'; const mark = doc.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = '\u2713'; li.append(mark, `${doneN} done`); return li; })() : null;
      el.objList.replaceChildren(...(summary ? [summary] : []), ...shown.map((o) => {
        const li = doc.createElement('li'); const state = o.state || (o.failed ? 'failed' : o.done ? 'done' : 'active');
        li.dataset.state = state;
        const mark = doc.createElement('span'); mark.className = 'mark'; mark.setAttribute('aria-hidden', 'true');
        mark.textContent = state === 'done' ? '\u2713' : state === 'failed' ? '\u2717' : '\u25CB'; // shape differs per state, and the text says it too
        li.append(mark, objectiveLine(o));
        return li;
      }));
    },
    // Shows the buttons the player has earned. A button that is not unlocked is not drawn. Also keeps the Crouch toggle in step with the sim.
    setAbilities({ abilities = [], weapon = 'none', crouch = false } = {}) {
      const before = kit; const changed = before && before.crouch !== crouch;
      kit = { abilities, weapon, crouch };
      const crouchBtn = doc.querySelector?.('[data-control="crouch"]');
      if (crouchBtn) { crouchBtn.setAttribute('aria-pressed', String(crouch)); crouchBtn.classList.toggle('on', crouch); }
      const show = (control, on) => { for (const b of doc.querySelectorAll?.(`[data-control="${control}"]`) || []) b.hidden = !on; };
      // Fists are always there: attack (light), heavy, block, dodge and shove show from the start; only the bow adds Draw.
      show('attack', true); show('heavy', true); show('block', true); show('aim', weapon === 'bow'); show('dodge', true); show('push', true); show('crouch', abilities.includes('crouch')); show('runtoggle', abilities.includes('run'));
      show('swap', !holding && ['staff', 'sword', 'bow'].filter((w) => abilities.includes(w)).length >= 2); // while a prop is held its Drop button takes the Swap slot
      show('do', true);
      const game = doc.getElementById?.('game'); if (game?.dataset) game.dataset.armed = '1';
      const al = ATTACK_LABEL[weapon];
      for (const b of doc.querySelectorAll?.('[data-control="attack"]') || []) if (al) b.setAttribute('aria-label', al);
      if (el.staminaItem) el.staminaItem.hidden = !['dodge', 'push', 'sword'].some((a) => abilities.includes(a));
      if (el.arrowsItem) el.arrowsItem.hidden = !abilities.includes('bow');
      // the first time a move is earned, show its tip once
      const had = (a) => before && before.abilities.includes(a);
      for (const [ab, id] of [['crouch', 'crouch'], ['dodge', 'dodge'], ['push', 'push'], ['sword', 'block'], ['bow', 'aim'], ['staff', 'attack']]) if (abilities.includes(ab) && before && !had(ab)) tip(id);
      if (changed) { cue(crouch ? 'You crouch' : 'You stand'); if (gate('crouch', 0.5)) say(crouch ? 'Crouching' : 'Standing'); }
    },
    // Stamina (0..1), arrows and the bow draw as bars and a count. Called when the rounded numbers change, not every frame. The meters have names, not labels.
    setVitals({ stamina = 1, arrows = 0, draw = 0, drawing = false } = {}) {
      const pct = Math.round(stamina * 100);
      if (el.staminaItem) { el.staminaItem.setAttribute('aria-valuenow', String(pct)); el.staminaItem.setAttribute('aria-valuetext', `${pct} percent${pct < 25 ? ', tired' : ''}`); }
      if (el.staminaFill) el.staminaFill.style.width = `${pct}%`;
      if (el.arrows) el.arrows.textContent = String(arrows);
      if (el.arrowsItem) el.arrowsItem.setAttribute('aria-label', `Arrows ${arrows}${drawing ? `, draw ${Math.round(draw * 100)} percent${draw >= 0.999 ? ', full' : ''}` : ''}`);
    },
    // Feed it the sim's events. Announces and captions the ones a player must not miss; same kind at most once per ANNOUNCE_GAP seconds.
    handleEvents(events) {
      for (const e of events || []) {
        if (!e || typeof e !== 'object') continue;
        let line = null; let c = null; let gap = ANNOUNCE_GAP;
        switch (e.type) {
          case 'vault': line = 'You vault over the wall.'; c = '[You vault]'; break;
          case 'pickup': line = `You pick up ${e.kind || e.id || 'an item'}.`; c = `[Picked up ${e.kind || e.id || 'item'}]`; break;
          case 'hit-enemy': line = 'You hit the raider.'; c = VIA_CUE[e.via] || VIA_CUE[kit?.weapon] || VIA_CUE.fists; break;
          case 'enemy-down': line = 'A raider is driven off.'; c = '[Raider driven off]'; gap = 0; break;
          case 'enemy-fell': line = 'A raider tumbles into the ditch and is out of the fight.'; c = '[Raider falls into the ditch]'; gap = 0; break;
          case 'shove-hit': line = 'You shove the raider back.'; c = '[Shove]'; break;
          case 'stagger': line = 'The raider staggers. Now is your chance.'; c = '[Raider staggers]'; gap = 0.8; break;
          case 'dodge': line = 'You roll.'; c = '[You roll]'; gap = 0.4; break;
          case 'tired': line = `Too tired to ${e.what === 'dodge' ? 'roll' : e.what === 'shove' ? 'shove' : 'swing'}. Wait for your breath.`; c = '[Out of breath]'; gap = 1.5; break;
          case 'climb': line = 'You climb the ledge.'; c = '[You climb]'; break;
          case 'blocked': if (e.parry) continue; line = 'You block the blow.'; c = '[Clang: blocked]'; gap = 0.5; break;
          case 'parry': line = 'Parry. The raider is stunned.'; c = '[Clang: parry]'; gap = 0; break;
          case 'guard-break': line = 'Your guard breaks: too tired to hold it.'; c = '[Guard broken]'; gap = 1; break;
          case 'tap': line = 'The practice stick taps you. No harm done.'; c = '[Stick taps]'; gap = 1; break;
          case 'whiff': line = 'The blow misses you.'; c = '[Whoosh: missed]'; gap = 1; break;
          case 'shot': line = `You loose an arrow. ${e.arrows} left.`; c = '[Arrow loosed]'; gap = 0.3; break;
          case 'drawn': line = 'Bow fully drawn.'; c = '[Bow creaks: fully drawn]'; gap = 0.5; break;
          case 'no-arrows': line = 'No arrows left. Look for arrows on the ground.'; c = '[No arrows]'; gap = 1.5; break;
          case 'target-hit': line = 'You hit the post.'; c = '[Thock: post hit]'; gap = 0.3; break;
          case 'weapon': line = `Now holding: ${WEAPON_NAMES[e.weapon] || e.weapon}.`; c = `[${WEAPON_NAMES[e.weapon] || e.weapon}]`; gap = 0.3; break;
          case 'refused': line = 'Not yet. Finish the earlier lesson first.'; c = '[Not yet]'; gap = 1.5; break;
          case 'seen': line = 'A raider has spotted you.'; c = '[Alert shout]'; break;
          case 'hurt': line = `You are hurt${e.amount ? `, ${e.amount} damage` : ''}.`; c = '[You are hit]'; gap = 2; break;
          case 'objective': { const t = objText(e.id); line = `${t ? `Objective ${t}` : 'Objective'}: ${e.state}.`; gap = 0; break; }
          case 'ability': line = `New ability: ${nm(e.id)}.`; c = `[New ability: ${nm(e.id)}]`; gap = 0; break;
          default: break;
        }
        if (!line || !gate(e.type + (e.id ?? ''), gap)) continue;
        say(line); if (c) cue(c);
      }
    },
    // Props (docs/review/prop-hooks.md). Reads frame.hud and frame.player.held; touches the page only when something changed.
    // Pick-up prompt (3 words at most) beside the thumb cluster and in the live region; the Do button is named after it. Throw and Drop appear only while a prop is held
    // (Throw only if it can be thrown); Drop takes the Swap slot. Block is shown unavailable, not hidden, while a two-handed prop is held. The held chip has text for its state, not colour only.
    setProps(frame) {
      const h = frame?.hud; if (!h) return;
      const held = frame.player?.held || null; const prompt = h.prompt || '';
      const pct = held ? Math.round(clampN(held.durability ?? h.heldDurability ?? 1, 0, 1) * 100) : 0; const crack = held ? (held.crack ?? h.heldCrack ?? 0) : 0;
      const key = `${held ? held.id : ''}|${held ? held.name : ''}|${pct}|${crack}|${held?.canThrow ? 1 : 0}|${held?.twoHands ? 1 : 0}|${prompt}`;
      if (key === propKey) return; const prevPrompt = propKey.split('|')[6] || ''; propKey = key;
      const was = holding; holding = !!held;
      const CRACK = ['', 'Cracked', 'Nearly broken', 'Broken'];
      if (el.held) {
        el.held.hidden = !held;
        if (held) {
          el.heldName.textContent = CRACK[crack] ? `${held.name}: ${CRACK[crack]}` : held.name;
          el.heldFill.style.width = `${pct}%`; el.held.dataset.crack = String(crack);
          el.held.setAttribute('aria-label', `Holding ${held.name}, durability ${pct} percent${CRACK[crack] ? `, ${CRACK[crack].toLowerCase()}` : ''}`);
        }
      }
      if (el.prompt) { el.prompt.hidden = !prompt; if (el.promptText) el.promptText.textContent = prompt; }
      if (prompt && prompt !== prevPrompt && gate('prompt', 0.6)) say(prompt);
      const q = (c) => doc.querySelectorAll?.(`[data-control="${c}"]`) || [];
      for (const b of q('do')) b.setAttribute('aria-label', prompt ? `${prompt} (Space or F)` : 'Do: pick up, vault or climb (Space or F)');
      for (const b of q('throw')) b.hidden = !(held && held.canThrow);
      for (const b of q('drop')) b.hidden = !held;
      for (const b of q('block')) {
        const two = !!(held && held.twoHands); b.setAttribute('aria-disabled', String(two)); b.classList.toggle('unavail', two);
        b.setAttribute('aria-label', two ? `Block unavailable: both hands on ${held.name} (B)` : 'Block: hold (B)');
      }
      for (const b of q('attack')) { if (held) b.setAttribute('aria-label', `Swing ${held.name} (J)`); else if (was && kit) b.setAttribute('aria-label', ATTACK_LABEL[kit.weapon] || 'Punch (J)'); }
      if (was !== holding && kit) { const sw = ['staff', 'sword', 'bow'].filter((w) => kit.abilities.includes(w)).length >= 2; for (const b of q('swap')) b.hidden = holding || !sw; }
    },
    cue,
    setObjective(text, short) {
      const t = short || chipText(text);
      if (el.objText) el.objText.textContent = t; if (el.objFull) el.objFull.textContent = text;
      if (el.objective) el.objective.title = text;
    },
    setHealth(h, max) {
      if (el.health) { el.health.setAttribute('aria-valuemax', String(max)); el.health.setAttribute('aria-valuenow', String(h)); el.health.setAttribute('aria-valuetext', `${h} of ${max}`); }
      el.healthFill.style.width = `${(h / max) * 100}%`;
    },
    setCheckpoints(n, total) { if (el.objective?.dataset) el.objective.dataset.cp = `${n}/${total}`; }, // read by tools; the chip itself stays one short line
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
    // With a camera yaw the hint is relative to where the camera looks (ahead, to the left, behind), otherwise it is a compass direction.
    setHint(dx, dy, label, yaw) {
      const dir = yaw == null
        ? COMPASS[Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8]
        : RELATIVE[((Math.round((Math.atan2(dy, dx) - yaw) / (Math.PI / 4)) % 8) + 8) % 8];
      el.hint.textContent = label ? (yaw == null ? `${label} is to the ${dir}.` : `${label} is ${dir}.`) : '';
    },
    // Dialogue appears as short captions (80 characters at most): a long line is shown in parts. The whole line is read out once by the live region.
    showCaption(line) {
      clearTimeout(captionTimer); const gen = ++capGen;
      capQueue = splitCaption(line.text, 80);
      const next = () => {
        if (gen !== capGen) return; const part = capQueue.shift();
        if (part == null) { el.caption.hidden = true; el.caption.replaceChildren(); return; }
        el.caption.hidden = false; el.caption.replaceChildren();
        const who = doc.createElement('strong'); who.textContent = `${line.speaker}: `; el.caption.append(who, part);
        captionTimer = setTimeout(next, 1600 + part.length * 45);
      };
      next(); say(`${line.speaker}: ${line.text}`);
    },
    clearCaption() { clearTimeout(captionTimer); capGen++; capQueue = []; el.caption.hidden = true; el.caption.replaceChildren(); },
    tip, tipFor(sim) { const id = needFor(sim); if (id) tip(id); },
    announce(text) { say(text); },
  };
}
