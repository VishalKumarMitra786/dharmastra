// The chakra screen: three concentric rings (yugas, eras, events) drawn on a canvas, opened like a vault by tapping, with real DOM controls,
// a keyboard path and a plain list of the same hierarchy. No zoom and no pan: a ring turns (drag around it, Prev/Next, arrow keys) and opens.
import { YUGAS, statusOf, currentYuga, spineMap, filterEvents, isFiltering, regionsOf, accessibleName, kindYear, windowRange, isDone, groupEras, yugaProgress, compactYear } from './model.js';
import { ringLayout, layoutFrom, alignRot, norm, TAU, THIN, THICK, thetaOf, ringCap, clampPos, nearestSlot, drawScene, hitTest, dialGeom } from './scene.js';
import * as S from './spring.js';
import { usingKeyboard } from '../modality.js';
import { reachText } from './reach.js';

const ROW_H = 68;
const SWEEP_SECS = 1.1; // the glow's trip round the opened ring
const PERF_MAX = 600;
const NAMES = ['Yugas', 'Eras', 'Events'];
const ICON = {
  open: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#ffb42e"/><path d="M8 6l6 4-6 4z" fill="#1a0f05"/></svg>',
  done: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#28e0d0" stroke-width="2"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#28e0d0"/><path d="M6.5 10l2.5 2.5 4.5-5" fill="none" stroke="#fff3dc" stroke-width="2"/></svg>',
  locked: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#fff3dc" stroke-width="1.6" stroke-dasharray="3 2.5"/><rect x="6.5" y="9" width="7" height="5.5" fill="#fff3dc"/><path d="M7.8 9V7.4a2.2 2.2 0 014.4 0V9" fill="none" stroke="#fff3dc" stroke-width="1.6"/></svg>',
  planned: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#d9cdf0" stroke-width="1.8" stroke-dasharray="1.5 3"/></svg>',
  info: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 1.5L18.5 10 10 18.5 1.5 10z" fill="none" stroke="#d9cdf0" stroke-width="1.8"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createChakra({ doc = document, store, getProgress, reach, reducedMotion, onPlay, click = null, soundOn = () => true }) {
  const $ = (id) => doc.getElementById(id);
  const root = $('screen-chakra'), stage = $('ch-stage'), canvas = $('ch-canvas'), ctx2d = canvas.getContext('2d');
  const scroll = $('ch-scroll'), rowsEl = $('ch-rows'), spacer = $('ch-spacer'), card = $('ch-card'), panel = $('ch-panel'), items = $('ch-items');
  let index = null, spine = new Map(), progress = { completed: {} };
  let L = 0, yi = -1, ei = -1; // open ring, chosen yuga, chosen era
  let events = [], eras = [], ringIdx = [], loadToken = 0, curYuga = 0;
  let hi = [0, 0]; // highlighted segment on the yuga ring and on the era ring
  let focus = 0, pos = 0, posGoal = 0, posV = 0, cap = 14, top = 0;
  let filter = { text: '', kind: '', region: '', from: null, to: null };
  let W = 300, H = 300, dpr = 1, running = false, dirty = true, last = 0, lastDraw = 0, openOpen = false, counts = null, trigger = null, dragging = false;
  // Everything that moves is a spring (see spring.js): ring turn, ring thickness, fades, glow, parallax and the event bloom. A new target never resets
  // a position or a velocity, so a tap in the middle of a turn bends the motion towards the new goal instead of jumping.
  const sp = {
    th: [0, 1, 2].map((i) => S.spring(i === 0 ? THICK : THIN)), rot: [0, 1, 2, 3].map(() => S.spring(0)), alpha: [S.spring(1), S.spring(0), S.spring(0)], glow: [S.spring(1), S.spring(0), S.spring(0)],
    par: [0, 1, 2].map(() => S.spring(0)), dim: [S.spring(1), S.spring(0.8), S.spring(0.8)], bloom: S.spring(0),
  };
  const view = { layout: ringLayout(0), rot: [0, 0, 0, 0], alpha: [1, 0, 0], glow: [1, 0, 0], dim: [1, 0.8, 0.8], par: [0, 0, 0], bloom: 0, sweep: null };
  let animating = false, sweepT = -1, sweepRing = 0, clunkPending = false, sweepAcc = 0, dragOmega = 0;
  const parts = S.createParticles(28);
  const perf = { on: false, dt: [], draw: [] };
  const kbdOn = () => usingKeyboard(doc) && doc.activeElement === stage;
  const statusCache = new Map();
  const c = () => ({ completed: progress.completed, spineById: spine });
  const status = (e) => { let s = statusCache.get(e.id); if (!s) { s = statusOf(e, c()); statusCache.set(e.id, s); } return s; };
  const motion = () => !reducedMotion();
  const live = $('ch-live');
  let liveFlip = false;
  const say = (text) => { liveFlip = !liveFlip; live.textContent = text + (liveFlip ? '' : ' '); };
  let cueTimer = 0;
  const cue = (text) => { const el = $('ch-cue'); if (!el) return; el.hidden = false; el.textContent = text; clearTimeout(cueTimer); cueTimer = setTimeout(() => { el.hidden = true; }, 1500); };
  const nEras = () => eras.length;

  // ---------- data for the drawing ----------
  const yugaFracs = () => (index ? yugaProgress(index.spine, c()) : YUGAS.map(() => ({ levels: 0, done: 0 })));
  function eraFracs() { return eras.map((g) => { let lv = 0, dn = 0; for (let i = g.from; i < g.to; i++) { const e = events[i]; if (e.level != null) { lv++; if (status(e).code === 'done') dn++; } } return lv ? dn / lv : 0; }); }
  function scene() {
    const yp = yugaFracs();
    const focusEv = L === 2 ? events[ringIdx[focus]] : null;
    const readout = L === 1 ? [YUGAS[yi].name, `${events.length} events`] : L === 2 && focusEv ? [focusEv.label, `${focusEv.kind} · ${compactYear(focusEv.year)}`] : null;
    return {
      W, H, dpr, top, bottom: 0, motion: motion(), layout: view.layout, rot: view.rot, alpha: view.alpha, glow: view.glow, dim: view.dim, par: view.par, bloom: view.bloom, sweep: view.sweep, parts: motion() ? parts : null, kbd: kbdOn(), L, pos, cap, focus, readout,
      rings: [
        { n: YUGAS.length, labels: YUGAS.map((y) => y.short), sel: hi[0], chosen: yi, cur: curYuga, progress: yp.map((y) => (y.levels ? y.done / y.levels : 0)) },
        { n: L >= 1 ? nEras() : 0, labels: eras.map((g) => g.label), sel: hi[1], chosen: ei, cur: -1, progress: L >= 1 ? eraFracs() : null },
      ],
      list: { events, idx: ringIdx, status },
    };
  }
  let draw = {};
  function render() { const t0 = perf.on ? performance.now() : 0; draw = scene(); drawScene(ctx2d, draw); if (perf.on && perf.draw.length < PERF_MAX) perf.draw.push(performance.now() - t0); }

  // ---------- sizing ----------
  function resize() {
    const r = stage.getBoundingClientRect(); const w = Math.max(100, Math.round(r.width)), h = Math.max(100, Math.round(r.height));
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const bar = $('ch-bar'); const bb = bar?.getBoundingClientRect?.(); let t = bb ? Math.round(bb.bottom - r.top) : 0; if (!(t >= 0 && t < h * 0.35)) t = 0; // the top bar floats over the stage: the dial is centred below it
    if (w === W && h === H && t === top && canvas.width === Math.round(w * dpr)) return;
    top = t;
    W = w; H = h; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); updateCap(); dirty = true; start();
  }
  function updateCap() { const { R } = dialGeom(W, H, top, 0); cap = ringCap(R, ringLayout(2)[2]); if (L === 2) { pos = clampPos(ringIdx.length, cap, pos); posGoal = pos; posV = 0; } }

  // ---------- the vault turn ----------
  const springs = () => [...sp.th.map((x) => [x, S.TUNE.thick, 0.0004, 0.01]), ...sp.rot.map((x, j) => [x, S.TUNE.rot[j], 0.0006, 0.01]), ...sp.alpha.map((x) => [x, S.TUNE.alpha, 0.002, 0.02]),
    ...sp.glow.map((x) => [x, S.TUNE.glow, 0.002, 0.02]), ...sp.par.map((x) => [x, S.TUNE.depth, 0.0005, 0.01]), ...sp.dim.map((x) => [x, S.TUNE.dim, 0.002, 0.02]), [sp.bloom, S.TUNE.bloom, 0.001, 0.01]];
  const ALL = springs(); const ROT = new Set(sp.rot);
  function syncView() {
    view.layout = layoutFrom(sp.th.map((x) => clamp(x.x, 0.04, 0.4)));
    for (let j = 0; j < 4; j++) view.rot[j] = sp.rot[j].x;
    for (let j = 0; j < 3; j++) { view.alpha[j] = clamp(sp.alpha[j].x, 0, 1); view.glow[j] = clamp(sp.glow[j].x, 0, 1); view.dim[j] = clamp(sp.dim[j].x, 0, 1); view.par[j] = sp.par[j].x; }
    view.bloom = clamp(sp.bloom.x, 0, 1);
  }
  function snapAll() { for (const [x] of ALL) S.snap(x); sweepT = -1; view.sweep = null; S.clearParticles(parts); animating = false; for (let j = 0; j < 4; j++) { const x = sp.rot[j]; const w = norm(x.x); x.x = x.t = w; } syncView(); root.dataset.anim = '0'; }
  const lockSound = () => { if (click && soundOn()) { click.play(); cue('[Clunk]'); } };
  // Moves the open ring from the current level to newL. Outer rings turn to line the chosen segment up at the top; the inner rings spin the other way and lock.
  // Every value is retargeted, never reset, so calling this in the middle of a turn (a tap, Back) bends the motion from where it is, with the speed it has.
  function turnTo(newL, instant) {
    const oldL = L; L = newL; const dir = newL > oldL ? 1 : -1; const sel = [yi, ei]; const ns = [YUGAS.length, nEras()];
    sp.th.forEach((x, i) => S.retarget(x, i === newL ? THICK : THIN));
    sp.alpha.forEach((x, i) => S.retarget(x, i <= newL ? 1 : 0)); sp.glow.forEach((x, i) => S.retarget(x, i === newL ? 1 : 0)); sp.dim.forEach((x, i) => S.retarget(x, i === newL ? 1 : 0.8));
    S.retarget(sp.bloom, newL === 2 ? 1 : 0);
    for (let j = 0; j < 4; j++) {
      const x = sp.rot[j]; const w = norm(x.x) - x.x; x.x += w; x.t += w; // same picture, smaller numbers
      if (j < newL && sel[j] >= 0) x.t = x.x + norm(alignRot(sel[j], ns[j]) - x.x); // the shortest way to the lock
      else if (j === newL && j > 0) x.t = (j % 2 ? -1 : 1) * dir * TAU; // the ring that opens spins one full turn and stops at zero
      else if (j === newL) x.t = x.x; // the yuga ring opening again keeps its place
      else x.t = x.x + (j % 2 ? 1 : -1) * dir * TAU * 1.25; // decorative rings spin the other way
    }
    root.dataset.level = String(newL); dirty = true; renderList(); syncChrome();
    if (instant || !motion()) { snapAll(); lockSound(); return; }
    sp.par.forEach((x, j) => { x.v += dir * (0.34 - 0.08 * j); }); // layered parallax: each ring is nudged a different amount and settles back
    sweepT = 0; sweepRing = newL; sweepAcc = 0; clunkPending = true; animating = true;
    if (soundOn() && click?.swell?.()) cue('[Deep swell]');
    start();
  }
  // Keyboard highlight: the ring glides to line the segment up at the top.
  function aim(j, goal) { const x = sp.rot[j]; x.t = x.x + norm(goal - x.x); if (!motion()) { S.snap(x); syncView(); } dirty = true; start(); }
  function tick(dt) {
    let moving = false;
    for (const [x, tn, ex, ev] of ALL) { if (x.x === x.t && x.v === 0) continue; S.step(x, dt, tn.w, tn.z); if (S.settled(x, ex, ev)) { S.snap(x); if (ROT.has(x)) { const w = norm(x.x); x.x = x.t = Math.abs(w) < 1e-9 ? 0 : w; } } else moving = true; } // a ring that stops is stored as an angle in (-pi, pi]: a full turn ends at exactly zero
    if (posGoal !== pos || posV !== 0) { const o = { x: pos, v: posV, t: posGoal }; S.step(o, dt, S.TUNE.pos.w, S.TUNE.pos.z); if (S.settled(o, 0.002, 0.02)) { pos = posGoal; posV = 0; } else { pos = o.x; posV = o.v; moving = true; } }
    if (sweepT >= 0) {
      sweepT += dt / SWEEP_SECS; moving = true;
      if (sweepT >= 1) { sweepT = -1; view.sweep = null; }
      else {
        const head = S.smooth(sweepT); view.sweep = { ring: sweepRing, head, k: Math.sin(Math.PI * sweepT) };
        const lay = view.layout[sweepRing]; const rm = ((lay.outer + lay.inner) / 2) * (draw.R || 150); const a = head * TAU - Math.PI / 2; sweepAcc += dt * 80;
        while (sweepAcc >= 1) { sweepAcc -= 1; S.emit(parts, (draw.cx || W / 2) + Math.cos(a) * rm, (draw.cy || H / 2) + Math.sin(a) * rm, Math.cos(a), Math.sin(a)); }
      }
    }
    if (S.stepParticles(parts, dt) > 0) moving = true;
    if (clunkPending) { const r = sp.rot[L], t = sp.th[L]; if (Math.abs(r.x - r.t) < 0.05 && Math.abs(t.x - t.t) < 0.012) { clunkPending = false; lockSound(); } } // the lock: once, when the open ring is nearly home
    syncView(); animating = moving; root.dataset.anim = moving ? '1' : '0';
    return moving;
  }

  // ---------- frame loop ----------
  function start() { if (!running && openOpen && !doc.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    if (!openOpen || doc.hidden) { running = false; return; } // nothing is scheduled while the tab is hidden
    const raw = now - last; const dt = Math.min(0.05, Math.max(0, raw / 1000)); last = now;
    if (perf.on && perf.dt.length < PERF_MAX && raw > 0) perf.dt.push(raw);
    if (!motion() && (animating || sp.th.some((x) => x.x !== x.t))) { snapAll(); dirty = true; }
    let busy = false;
    if (motion()) {
      busy = tick(dt); if (busy) dirty = true;
      if (!busy && !dragging) { // idle: slow turning, in opposite directions. Rings that are open for reading stay still.
        const drift = (j, v) => { const x = sp.rot[j]; x.x += v * dt; x.t += v * dt; };
        if (L === 0 && !kbdOn()) { drift(0, 0.02); drift(1, -0.035); drift(2, 0.05); } else if (L === 1) drift(2, 0.05);
        drift(3, -0.03); syncView(); dirty = true;
      }
    } else if (Math.abs(posGoal - pos) > 0.002) { pos = posGoal; posV = 0; dirty = true; }
    if (dirty && (busy || dragging || now - lastDraw > 30)) { render(); lastDraw = now; dirty = false; }
    if (busy || (motion() && !doc.hidden) || dirty) requestAnimationFrame(frame); else running = false;
  }
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) start(); });
  stage.addEventListener('focus', () => { dirty = true; start(); }); stage.addEventListener('blur', () => { dirty = true; start(); });

  // ---------- list (virtualised rows for events; plain buttons for yugas and eras) ----------
  const posOf = (idx) => idx; // ringIdx is the list: a row's position is its index
  function renderRows(focusPos) {
    const n = ringIdx.length; spacer.style.height = `${n * ROW_H}px`;
    const [a, b] = windowRange(scroll.scrollTop, scroll.clientHeight || 300, ROW_H, n, 3); const out = [];
    for (let p = a; p < b; p++) {
      const e = events[ringIdx[p]], st = status(e); const sel = p === focus;
      out.push(`<li style="top:${p * ROW_H}px" aria-posinset="${p + 1}" aria-setsize="${n}"><button type="button" class="ch-row st-${st.code}${sel ? ' sel' : ''}" data-p="${p}" tabindex="${sel ? 0 : -1}" aria-label="${esc(accessibleName(e, st))}"${sel ? ' aria-current="true"' : ''}>`
        + `<span class="ch-ico">${ICON[st.code]}</span><span class="ch-txt"><span class="ch-t">${esc(e.label)}</span><span class="ch-s">${esc(kindYear(e))}</span></span></button></li>`);
    }
    rowsEl.innerHTML = out.join('');
    if (focusPos != null) rowsEl.querySelector(`[data-p="${focusPos}"]`)?.focus();
  }
  function renderList() {
    const evLevel = L === 2;
    $('ch-events').hidden = !evLevel; $('ch-filter').hidden = !evLevel; items.hidden = evLevel;
    $('ch-list-title').textContent = L === 0 ? 'Yugas' : L === 1 ? YUGAS[yi].name : `${YUGAS[yi].short} › ${eras[ei]?.label || ''}`;
    if (L === 0) {
      const yp = yugaFracs();
      items.innerHTML = YUGAS.map((y, i) => `<li><button type="button" class="ch-item${i === curYuga ? ' here' : ''}" data-item="${i}" aria-label="${esc(`${y.name}, ${index ? index.yugas[i].count : '?'} events, ${yp[i].done} of ${yp[i].levels} levels done${i === curYuga ? '. You are here' : ''}`)}"><span class="ch-t">${esc(y.short)}</span><span class="ch-s">${index ? index.yugas[i].count : '?'}${i === curYuga ? ' · here' : ''}</span></button></li>`).join('');
    } else if (L === 1) {
      items.innerHTML = eras.map((g, i) => `<li><button type="button" class="ch-item" data-item="${i}" aria-label="${esc(`${g.label}, ${g.count} events`)}"><span class="ch-t">${esc(g.label)}</span><span class="ch-s">${g.count}</span></button></li>`).join('');
    } else { items.innerHTML = ''; updateCount(); ensureVisible(focus); renderRows(); }
  }
  function updateCount() { const era = eras[ei]; const base = era ? era.count : 0; $('ch-count').textContent = isFiltering(filter) ? `${ringIdx.length} of ${base} match` : `${ringIdx.length} events`; }
  function ensureVisible(p) { const top = p * ROW_H, h = scroll.clientHeight || 300; if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + ROW_H > scroll.scrollTop + h) scroll.scrollTop = top + ROW_H - h; }
  function syncChrome() {
    $('ch-back').hidden = L === 0;
    const parts = [];
    if (yi >= 0 && L >= 1) parts.push(YUGAS[yi].short); if (ei >= 0 && L >= 2) parts.push(eras[ei].label);
    $('ch-path').textContent = parts.length ? parts.join(' › ') : `${YUGAS[curYuga].short}${index ? ' · here' : ''}`;
    const many = L === 2 && ringIdx.length > cap;
    $('ch-prev').setAttribute('aria-label', L === 2 ? 'Previous events' : 'Previous'); $('ch-next').setAttribute('aria-label', L === 2 ? 'Next events' : 'Next');
    stage.setAttribute('aria-label', `Chakra, ring ${L + 1} of 3, ${NAMES[L]}`); void many;
  }

  // ---------- opening and closing rings ----------
  function computeRing() {
    const g = eras[ei]; const base = filterEvents(events, filter);
    ringIdx = g ? base.filter((i) => i >= g.from && i < g.to) : [];
  }
  async function openYuga(i) {
    const token = ++loadToken; $('ch-error').hidden = true; $('ch-loading').hidden = false;
    try {
      const list = await store.loadShard(YUGAS[i].id); if (token !== loadToken) return;
      $('ch-loading').hidden = true; yi = i; ei = -1; hi[0] = i; events = list; eras = groupEras(list); hi[1] = 0; ringIdx = [];
      filter = { text: '', kind: '', region: '', from: null, to: null }; syncFilterForm(); buildRegions();
      turnTo(1); say(`${YUGAS[i].name} opened. ${eras.length} ${eras.length === 1 ? 'era' : 'eras'}.`);
    } catch {
      if (token !== loadToken) return;
      $('ch-loading').hidden = true; $('ch-error').hidden = false; $('ch-error-text').textContent = `Could not load ${YUGAS[i].name}. Check your connection.`; $('ch-retry').dataset.y = String(i);
    }
  }
  function openEra(i) {
    if (i < 0 || i >= eras.length) return; ei = i; hi[1] = i; computeRing();
    const firstOpen = ringIdx.findIndex((k) => status(events[k]).code === 'open'); focus = firstOpen >= 0 ? firstOpen : 0;
    updateCap(); pos = posGoal = clampPos(ringIdx.length, cap, focus); posV = 0;
    turnTo(2); say(`${eras[i].label} opened. ${ringIdx.length} events.`);
  }
  function closeRing() {
    if (L === 0) return false;
    if (card && !card.hidden) closeCard();
    if (L === 2) { ei = -1; turnTo(1); say(`Back to ${YUGAS[yi].name} eras.`); }
    else { yi = -1; turnTo(0); say('Back to the yugas.'); }
    return true;
  }
  function openSegment(ring, i) {
    if (ring === 0) { if (L === 0 || i !== yi || L > 1) { if (L > 0 && i === yi && L === 1) return; openYuga(i); } }
    else if (ring === 1 && L >= 1) openEra(i);
  }

  // moving the highlight with keys, Prev/Next, or the list
  function highlight(ring, i) {
    const n = ring === 0 ? YUGAS.length : nEras(); i = ((i % n) + n) % n; hi[ring] = i;
    aim(ring, alignRot(i, n));
    say(ring === 0 ? `${YUGAS[i].name}, ${i + 1} of ${n}${i === curYuga ? ', you are here' : ''}. Enter opens.` : `${eras[i].label}, ${i + 1} of ${n}, ${eras[i].count} events. Enter opens.`);
  }
  function setFocus(p, { announce = true } = {}) {
    const n = ringIdx.length; if (!n) return; focus = clamp(p, 0, n - 1); if (n > cap) posGoal = focus; else posGoal = (n - 1) / 2;
    if (!motion()) { pos = posGoal; posV = 0; }
    dirty = true; start(); renderRows(); ensureVisible(focus); renderRows();
    if (announce) { const e = events[ringIdx[focus]]; say(`${focus + 1} of ${n}. ${accessibleName(e, status(e))}`); }
  }
  function step(d, page) {
    if (L === 0) highlight(0, hi[0] + d);
    else if (L === 1) highlight(1, hi[1] + d);
    else setFocus(focus + d * (page ? Math.max(1, Math.floor(cap / 2)) : 1));
  }

  // ---------- filter (event ring only) ----------
  function buildRegions() {
    const sel = $('ch-region'); const rs = regionsOf(events);
    sel.innerHTML = '<option value="">Any region</option>' + rs.map((r) => `<option>${esc(r)}</option>`).join('') + (events.some((e) => !e.region) ? '<option value="(none)">Not recorded</option>' : '');
    sel.value = filter.region;
  }
  function syncFilterForm() { $('ch-q').value = filter.text; $('ch-kind').value = filter.kind; $('ch-from').value = ''; $('ch-to').value = ''; }
  function readFilter() {
    const yr = (inp, era) => { const v = Number($(inp).value); if (!$(inp).value || !Number.isFinite(v) || v < 0) return null; return $(era).value === 'BCE' ? -v : v; };
    filter = { text: $('ch-q').value, kind: $('ch-kind').value, region: $('ch-region').value, from: yr('ch-from', 'ch-from-era'), to: yr('ch-to', 'ch-to-era') };
    if (filter.from != null && filter.to != null && filter.from > filter.to) [filter.from, filter.to] = [filter.to, filter.from];
    if (L !== 2) return; computeRing(); focus = 0; scroll.scrollTop = 0; updateCap(); pos = posGoal = clampPos(ringIdx.length, cap, 0); posV = 0; updateCount(); renderRows(); dirty = true; start();
  }
  for (const id of ['ch-q', 'ch-kind', 'ch-region', 'ch-from', 'ch-to', 'ch-from-era', 'ch-to-era']) {
    let tm = 0; $(id).addEventListener(id === 'ch-q' || id.includes('from') || id.includes('to') ? 'input' : 'change', () => { clearTimeout(tm); tm = setTimeout(readFilter, 160); });
  }
  $('ch-filter-form').addEventListener('submit', (ev) => { ev.preventDefault(); readFilter(); });
  $('ch-clear').addEventListener('click', () => { filter = { text: '', kind: '', region: '', from: null, to: null }; syncFilterForm(); $('ch-region').value = ''; readFilter(); say('Filters cleared.'); });
  $('ch-retry').addEventListener('click', () => { if (!index) open(); else openYuga(Number($('ch-retry').dataset.y || 0)); });

  // ---------- card ----------
  async function openCard(p, from) {
    const e = events[ringIdx[p]]; if (!e) return; const st = status(e); trigger = from || doc.activeElement; focus = p;
    $('ch-card-title').textContent = e.label; $('ch-card-meta').textContent = `${e.kind} · ${e.year}`;
    $('ch-card-status').innerHTML = `<span class="ch-ico">${ICON[st.code]}</span><span>${esc(st.text)}</span>`;
    $('ch-card-intro').textContent = e.intro;
    $('ch-card-source').textContent = `${e.source}${e.needsReview ? ' Draft: waiting for a scholarly review.' : ''}`;
    const play = $('ch-play'); play.hidden = e.level == null; play.dataset.id = e.id;
    play.textContent = st.code === 'done' ? 'Play again' : 'Play'; play.setAttribute('aria-disabled', String(!st.playable)); play.classList.toggle('is-locked', !st.playable);
    $('ch-card-reach').textContent = e.level == null ? '' : 'Checking...';
    card.hidden = false; $('ch-main').inert = true; $('ch-bar').inert = true; card.dataset.idx = String(p);
    $('ch-card-title').focus(); setFocus(p, { announce: false });
    const my = p; counts = await reach.getReachCounts();
    if (!card.hidden && card.dataset.idx === String(my) && e.level != null) $('ch-card-reach').textContent = reachText(counts, e.id);
  }
  function closeCard() {
    if (card.hidden) return false; card.hidden = true; $('ch-main').inert = false; $('ch-bar').inert = false; const src = $('ch-card-source').closest?.('details'); if (src) src.open = false;
    (trigger && trigger.isConnected ? trigger : stage).focus(); return true;
  }
  $('ch-play').addEventListener('click', () => {
    const e = events[ringIdx[Number(card.dataset.idx)]]; if (!e) return; const st = status(e);
    if (!st.playable) { say(`${st.text}.`); return; }
    onPlay(e);
  });
  $('ch-card-close').addEventListener('click', closeCard);

  // ---------- input ----------
  $('ch-back').addEventListener('click', () => closeRing());
  $('ch-prev').addEventListener('click', () => step(-1, true));
  $('ch-next').addEventListener('click', () => step(1, true));
  $('ch-list-btn').addEventListener('click', () => { const on = panel.hidden; panel.hidden = !on; $('ch-list-btn').setAttribute('aria-expanded', String(on)); root.dataset.list = on ? '1' : '0'; renderList(); resizeSoon(); });
  $('ch-panel-close').addEventListener('click', () => { panel.hidden = true; $('ch-list-btn').setAttribute('aria-expanded', 'false'); root.dataset.list = '0'; resizeSoon(); $('ch-list-btn').focus(); });
  items.addEventListener('click', (ev) => { const b = ev.target.closest('.ch-item'); if (!b) return; const i = Number(b.dataset.item); if (L === 0) openYuga(i); else openEra(i); });
  rowsEl.addEventListener('click', (ev) => { const b = ev.target.closest('.ch-row'); if (b) openCard(Number(b.dataset.p), b); });
  scroll.addEventListener('scroll', () => renderRows());
  scroll.addEventListener('keydown', (ev) => {
    const d = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 }[ev.key];
    if (d) { ev.preventDefault(); setFocus(focus + d, { announce: false }); rowsEl.querySelector(`[data-p="${focus}"]`)?.focus(); }
    else if (ev.key === 'Home') { ev.preventDefault(); setFocus(0, { announce: false }); rowsEl.querySelector(`[data-p="${focus}"]`)?.focus(); }
    else if (ev.key === 'End') { ev.preventDefault(); setFocus(1e9, { announce: false }); rowsEl.querySelector(`[data-p="${focus}"]`)?.focus(); }
  });
  stage.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { ev.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { ev.preventDefault(); step(-1); }
    else if (k === 'PageDown') { ev.preventDefault(); step(1, true); } else if (k === 'PageUp') { ev.preventDefault(); step(-1, true); }
    else if (k === 'Home') { ev.preventDefault(); if (L === 2) setFocus(0); else highlight(L, 0); }
    else if (k === 'End') { ev.preventDefault(); if (L === 2) setFocus(1e9); else highlight(L, L === 0 ? YUGAS.length - 1 : nEras() - 1); }
    else if (k === 'Enter' || k === ' ') { ev.preventDefault(); if (L === 0) openYuga(hi[0]); else if (L === 1) openEra(hi[1]); else openCard(focus, stage); }
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !openOpen) return; ev.preventDefault();
    if (closeCard()) return; closeRing();
  });

  // Pointer: drag around the wheel to turn the open ring (events page), tap a segment or node to open it. No pan, no zoom.
  let ptr = null;
  const local = (ev) => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (ev) => {
    if (ptr) return; canvas.setPointerCapture?.(ev.pointerId); const [x, y] = local(ev); stage.focus({ preventScroll: true });
    ptr = { id: ev.pointerId, x, y, th: thetaOf(x - draw.cx, y - draw.cy), moved: 0, t: ev.timeStamp || 0 }; dragOmega = 0; dirty = true; start();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!ptr || ev.pointerId !== ptr.id) return; const [x, y] = local(ev);
    ptr.moved += Math.hypot(x - ptr.x, y - ptr.y); ptr.x = x; ptr.y = y;
    if (ptr.moved < 8) return; dragging = true;
    const th = thetaOf(x - draw.cx, y - draw.cy); const d = norm(th - ptr.th); ptr.th = th;
    if (Math.hypot(x - draw.cx, y - draw.cy) < 24) return;
    const dts = Math.max(0.004, ((ev.timeStamp || 0) - ptr.t) / 1000); ptr.t = ev.timeStamp || 0; dragOmega = dragOmega * 0.6 + (d / dts) * 0.4; // angular speed of the finger, kept for the glide on release
    if (L < 2) { const x2 = sp.rot[L]; x2.x += d; x2.t = x2.x; x2.v = 0; syncView(); }
    else if (ringIdx.length > cap) { pos = clampPos(ringIdx.length, cap, pos - (d * cap) / TAU); posGoal = pos; posV = 0; }
    dirty = true;
  });
  const endPtr = (ev) => {
    if (!ptr || ev.pointerId !== ptr.id) return; const p = ptr; ptr = null;
    if (dragging) { // let go: the ring glides on with the speed of the finger and settles (inertia), the event ring settles on the nearest slot
      dragging = false; const w = clamp(dragOmega, -7, 7);
      if (L === 2 && ringIdx.length > cap) { posV = motion() ? (-w * cap) / TAU : 0; posGoal = nearestSlot(pos + posV * 0.25, ringIdx.length); focus = posGoal; renderRows(); }
      else if (L < 2 && motion()) { const x2 = sp.rot[L]; x2.v = w; x2.t = x2.x + w * 0.25; }
      dirty = true; start(); return;
    }
    if (ev.type === 'pointerup') tap(p.x, p.y);
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  function tap(x, y) {
    const h = hitTest(draw, x, y);
    if (h.kind === 'hub') closeRing();
    else if (h.kind === 'segment') { hi[h.ring] = h.index; if (h.ring < L || h.ring === L) { if (h.ring === 0) openYuga(h.index); else openEra(h.index); } }
    else if (h.kind === 'node') { setFocus(h.index, { announce: false }); openCard(h.index, stage); }
  }

  // ---------- open / close ----------
  let resizeT = 0; const resizeSoon = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 30); };
  async function open() {
    progress = getProgress(); statusCache.clear(); openOpen = true; root.hidden = false; root.dataset.level = String(L); resize();
    try { index = await store.loadIndex(); spine = spineMap(index.spine); }
    catch { $('ch-error').hidden = false; $('ch-error-text').textContent = 'Could not load the chakra data. Check your connection.'; $('ch-retry').dataset.y = '0'; return; }
    $('ch-error').hidden = true;
    curYuga = Math.max(0, YUGAS.findIndex((y) => y.id === currentYuga(index.spine, c())));
    if (L === 0 && !animating) hi[0] = curYuga;
    syncChrome(); renderList(); dirty = true; start(); stage.focus({ preventScroll: true });
  }
  function refresh() { progress = getProgress(); statusCache.clear(); if (index) { curYuga = Math.max(0, YUGAS.findIndex((y) => y.id === currentYuga(index.spine, c()))); syncChrome(); renderList(); dirty = true; } }
  function close() { openOpen = false; root.hidden = true; if (!card.hidden) { card.hidden = true; $('ch-main').inert = false; $('ch-bar').inert = false; } }
  new ResizeObserver(() => { if (openOpen) resize(); }).observe(stage);
  const hideTemp = () => { openOpen = false; root.hidden = true; };
  const showAgain = () => { openOpen = true; root.hidden = false; resize(); dirty = true; start(); (card.hidden ? stage : $('ch-card-title')).focus(); };
  return {
    open, close, hideTemp, showAgain, refresh, get isOpen() { return openOpen; }, say,
    // test and tool hooks: where the rings are
    _state: () => ({ level: L, yuga: yi, era: ei, eras: eras.length, events: events.length, ring: ringIdx.length, focus, pos, cap, anim: animating, rows: rowsEl.children.length, idle: view.rot.slice(), th: sp.th.map((x) => x.x), bloom: view.bloom, kbdRing: kbdOn(), top, particles: parts.life.filter((v) => v > 0).length }),
    _perf: { start() { perf.on = true; perf.dt = []; perf.draw = []; }, stop() { perf.on = false; return { dt: perf.dt.slice(), draw: perf.draw.slice() }; } },
    _go: { openYuga, openEra, closeRing, step, setFocus },
  };
}
