// HUD in the DOM: objective, health, checkpoints, timer, captions and screen-reader announcements.
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const RELATIVE = ['straight ahead', 'ahead and to the right', 'to the right', 'behind you and to the right', 'behind you', 'behind you and to the left', 'to the left', 'ahead and to the left'];
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

const ANNOUNCE_GAP = 1.2; // seconds between announcements of the same kind, so a flurry of hits does not flood a screen reader
const CUE_MS = 2200;
const ABILITY_NAMES = { walk: 'walk', run: 'run', crouch: 'crouch', vault: 'vault', staff: 'staff', dodge: 'dodge roll', push: 'shove', climb: 'climb', sword: 'sword', bow: 'bow' };
const WEAPON_NAMES = { none: 'Bare hands', staff: 'Staff', sword: 'Sword', bow: 'Bow' };
const ATTACK_LABEL = { staff: ['Attack', 'Attack with staff (J)'], sword: ['Cut', 'Light cut with sword (J)'] };
const VIA_CUE = { staff: '[Staff strike]', sword: '[Sword cut]', arrow: '[Arrow hits]' };
const nm = (id) => ABILITY_NAMES[id] || String(id);

// Objective -> one line of text. Accepts {text, state|done|failed, optional, progress:{n,total}} (also count/need or have/target).
export function objectiveLine(o) {
  const p = o.progress || {};
  const n = p.n ?? p.have ?? o.count ?? o.have; const total = p.total ?? p.need ?? p.target ?? o.need ?? o.target;
  const state = o.state || (o.failed ? 'failed' : o.done ? 'done' : 'active');
  const status = state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : n != null && total != null ? `${n} of ${total}` : 'To do';
  return `${o.optional ? 'Optional: ' : ''}${o.text} - ${status}`;
}

export function createHud(doc = document, { now = () => Date.now() / 1000 } = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    objective: $('objective'), hint: $('hint'), healthText: $('health-text'), healthFill: $('health-fill'),
    cpText: $('cp-text'), timerItem: $('stat-timer'), timerText: $('timer-text'), caption: $('caption'), announcer: $('announcer'),
    stamina: $('stamina-text'), staminaItem: $('stat-stamina'), staminaFill: $('stamina-fill'), arrows: $('arrows-text'), arrowsItem: $('stat-arrows'),
    pips: $('cp-pips'), objList: $('objectives'), kit: $('kit-text'), kitItem: $('stat-kit'), cue: $('cue'), crouchBtn: doc.querySelector?.('[data-control="crouch"]'), fx: $('fx'), chapter: $('chapter'), chapterEra: $('chapter-era'), chapterTitle: $('chapter-title'),
  };
  let captionTimer = 0;
  let chapterTimer = 0;
  let cueTimer = 0;
  let objectives = [];
  let kit = null; // last {abilities, weapon, crouch}
  const lastAt = {};
  const gate = (key, gap = ANNOUNCE_GAP) => { const t = now(); if (lastAt[key] != null && t - lastAt[key] < gap) return false; lastAt[key] = t; return true; };
  const say = (text) => { el.announcer.textContent = ''; setTimeout(() => { el.announcer.textContent = text; }, 30); };
  // A caption for a sound or event that has no speaker (the dialogue caption stays separate). Text in brackets reads as a sound cue.
  const cue = (text) => {
    if (!el.cue || !text) return;
    clearTimeout(cueTimer); el.cue.hidden = false; el.cue.textContent = text;
    cueTimer = setTimeout(() => { el.cue.hidden = true; el.cue.textContent = ''; }, CUE_MS);
  };
  const objText = (id) => objectives.find((o) => o.id === id)?.text;

  return {
    // Every objective with its progress, as text. List order is kept. Hidden when empty (old missions use setObjective only).
    setObjectives(list) {
      objectives = Array.isArray(list) ? list : [];
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
    // Abilities and weapon as text: "Staff. Can crouch, vault." Also keeps the Crouch button's pressed state in step with the sim.
    setAbilities({ abilities = [], weapon = 'none', crouch = false } = {}) {
      const changed = kit && (kit.crouch !== crouch);
      kit = { abilities, weapon, crouch };
      if (el.kitItem) el.kitItem.hidden = false;
      const can = abilities.filter((a) => a !== 'walk' && a !== 'run' && !['staff', 'sword', 'bow'].includes(a)).map(nm);
      if (el.kit) el.kit.textContent = `${WEAPON_NAMES[weapon] || weapon}${crouch ? ', crouching' : ''}${can.length ? `. Can ${can.join(', ')}` : ''}`;
      if (el.crouchBtn) { el.crouchBtn.setAttribute('aria-pressed', String(crouch)); el.crouchBtn.classList.toggle('on', crouch); }
      if (el.crouchBtn) el.crouchBtn.hidden = !abilities.includes('crouch');
      const show = (control, on) => { for (const b of doc.querySelectorAll?.(`[data-control="${control}"]`) || []) b.hidden = !on; };
      show('attack', weapon === 'staff' || weapon === 'sword');
      show('heavy', weapon === 'sword'); show('block', weapon === 'sword'); show('aim', weapon === 'bow');
      show('dodge', abilities.includes('dodge')); show('push', abilities.includes('push'));
      show('swap', ['staff', 'sword', 'bow'].filter((w) => abilities.includes(w)).length >= 2);
      show('do', true);
      const game = doc.getElementById?.('game'); // the action pad is taller with a sword or bow: the captions sit above it (see styles.css)
      if (game?.dataset) game.dataset.pad = ['attack', 'heavy', 'block', 'aim', 'dodge', 'push', 'swap'].filter((c) => (doc.querySelectorAll?.(`[data-control="${c}"]`) || []).length && !(doc.querySelector?.(`[data-control="${c}"]`)?.hidden)).length > 3 ? 'tall' : 'short';
      const al = ATTACK_LABEL[weapon];
      for (const b of doc.querySelectorAll?.('[data-control="attack"]') || []) if (al) { b.setAttribute('aria-label', al[1]); const t = b.querySelector?.('.t'); if (t) t.textContent = al[0]; }
      if (el.staminaItem) el.staminaItem.hidden = !['dodge', 'push', 'sword'].some((a) => abilities.includes(a));
      if (el.arrowsItem) el.arrowsItem.hidden = !abilities.includes('bow');
      if (changed) { cue(crouch ? 'You crouch' : 'You stand'); if (gate('crouch', 0.5)) say(crouch ? 'Crouching' : 'Standing'); }
    },
    // Stamina (0..1), arrows and the bow draw (0..1) as text and a bar. Called when the rounded numbers change, not every frame.
    setVitals({ stamina = 1, arrows = 0, draw = 0, drawing = false } = {}) {
      const pct = Math.round(stamina * 100);
      if (el.stamina) el.stamina.textContent = `${pct}%${pct < 25 ? ' (tired)' : ''}`;
      if (el.staminaFill) el.staminaFill.style.width = `${pct}%`;
      if (el.arrows) el.arrows.textContent = `${arrows}${drawing ? `, draw ${Math.round(draw * 100)}%${draw >= 0.999 ? ' (full)' : ''}` : ''}`;
    },
    // Feed it the sim's events. Announces and captions the ones a player must not miss; same kind at most once per ANNOUNCE_GAP seconds.
    handleEvents(events) {
      for (const e of events || []) {
        if (!e || typeof e !== 'object') continue;
        let line = null; let c = null; let gap = ANNOUNCE_GAP;
        switch (e.type) {
          case 'vault': line = 'You vault over the wall.'; c = '[You vault]'; break;
          case 'pickup': line = `You pick up ${e.kind || e.id || 'an item'}.`; c = `[Picked up ${e.kind || e.id || 'item'}]`; break;
          case 'hit-enemy': line = 'You hit the raider.'; c = VIA_CUE[e.via] || VIA_CUE.staff; break;
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
    cue,
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
    // With a camera yaw the hint is relative to where the camera looks (ahead, to the left, behind), otherwise it is a compass direction.
    setHint(dx, dy, label, yaw) {
      const dir = yaw == null
        ? COMPASS[Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8]
        : RELATIVE[((Math.round((Math.atan2(dy, dx) - yaw) / (Math.PI / 4)) % 8) + 8) % 8];
      el.hint.textContent = label ? (yaw == null ? `${label} is to the ${dir}.` : `${label} is ${dir}.`) : '';
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
    announce(text) { say(text); },
  };
}
