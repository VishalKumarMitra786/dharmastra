// The chakra screen: a canvas wheel (zoom, pan, clusters) plus real DOM controls and a virtualised event list.
// Everything a pointer can do on the wheel can also be done with the buttons, the list and the keyboard.
import { YUGAS, statusOf, currentYuga, spineMap, filterEvents, isFiltering, regionsOf, accessibleName, kindYear, levelWord, windowRange, yearValue, isDone } from './model.js';
import { buildPositions, cameraWhole, cameraYuga, viewOf, levelOf, maxZoom, clampCamera, drawScene, ZOOM_STEP, sectorMid, R_TRACK } from './scene.js';
import { reachText } from './reach.js';

const ROW_H = 68;
const ICON = {
  open: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#ffb42e"/><path d="M8 6l6 4-6 4z" fill="#1a0f05"/></svg>',
  done: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="#28e0d0" stroke-width="2"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#28e0d0"/><path d="M6.5 10l2.5 2.5 4.5-5" fill="none" stroke="#fff3dc" stroke-width="2"/></svg>',
  locked: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#fff3dc" stroke-width="1.6" stroke-dasharray="3 2.5"/><rect x="6.5" y="9" width="7" height="5.5" fill="#fff3dc"/><path d="M7.8 9V7.4a2.2 2.2 0 014.4 0V9" fill="none" stroke="#fff3dc" stroke-width="1.6"/></svg>',
  planned: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="#d9cdf0" stroke-width="1.8" stroke-dasharray="1.5 3"/></svg>',
  info: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 1.5L18.5 10 10 18.5 1.5 10z" fill="none" stroke="#d9cdf0" stroke-width="1.8"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createChakra({ doc = document, store, getProgress, reach, reducedMotion, onPlay }) {
  const $ = (id) => doc.getElementById(id);
  const root = $('screen-chakra'), stage = $('ch-stage'), canvas = $('ch-canvas'), ctx2d = canvas.getContext('2d');
  const scroll = $('ch-scroll'), rowsEl = $('ch-rows'), spacer = $('ch-spacer'), card = $('ch-card');
  let index = null, spine = new Map(), yi = 0, cur = 0, events = [], pos = null, mask = null, filtIdx = [], selIdx = -1;
  let filter = { text: '', kind: '', region: '', from: null, to: null };
  let W = 300, H = 300, dpr = 1, cam = cameraWhole(300, 300), target = { ...cam }, k0 = 1, k1 = 1, kMax = 10;
  let introT = 0, t0 = 0, last = 0, running = false, dirty = true, loadToken = 0, openOpen = false, counts = null, trigger = null;
  const hits = []; const statusCache = new Map(); const draw = { hits };
  let progress = { completed: {} };
  const c = () => ({ completed: progress.completed, spineById: spine });
  const status = (e) => { let s = statusCache.get(e.id); if (!s) { s = statusOf(e, c()); statusCache.set(e.id, s); } return s; };
  const motion = () => !reducedMotion();
  const level = () => levelOf(target.k, k1);
  const live = $('ch-live');
  let liveFlip = false;
  const say = (text) => { liveFlip = !liveFlip; live.textContent = text + (liveFlip ? '' : ' '); };

  // ---------- sizing and camera ----------
  function resize() {
    const r = stage.getBoundingClientRect(); const w = Math.max(100, Math.round(r.width)), h = Math.max(100, Math.round(r.height));
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
    const lv = level(); W = w; H = h; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    k0 = cameraWhole(W, H).k; k1 = cameraYuga(yi, W, H).k; kMax = maxZoom(k1, events.length);
    if (lv === 0) { target = cameraWhole(W, H); } else if (lv === 1) { target = cameraYuga(yi, W, H); } else target.k = Math.min(kMax, Math.max(k1 * 3, target.k));
    cam = { ...target }; dirty = true;
  }
  function setTarget(next, instant) {
    target = clampCamera({ ...next }, k1, kMax, k0);
    if (instant || !motion()) cam = { ...target };
    dirty = true; root.dataset.zoom = String(level()); start();
  }
  const goWhole = (instant) => setTarget(cameraWhole(W, H), instant);
  const goYuga = (instant) => setTarget(cameraYuga(yi, W, H), instant);
  function zoomAt(factor, sx = W / 2, sy = H / 2) {
    const v = viewOf(target, W, H); const [wx, wy] = v.unproject(sx, sy); const k = Math.min(kMax, Math.max(k0, target.k * factor));
    setTarget({ cx: wx - (sx - W / 2) / k, cy: wy - (sy - H / 2) / k, k });
  }
  const eventXY = (i) => [pos.xs[i], pos.ys[i]];
  function focusEvent(i) { const [x, y] = eventXY(i); setTarget({ cx: x, cy: y, k: Math.max(k1 * 4, Math.min(kMax, target.k)) }); }

  // ---------- frame loop ----------
  function start() { if (!running && openOpen) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    if (!openOpen || doc.hidden) { running = false; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    let moving = false;
    if (introT < 1) { introT = Math.min(1, introT + dt / 2.4); moving = true; dirty = true; }
    if (Math.abs(Math.log(cam.k / target.k)) > 0.002 || Math.abs(cam.cx - target.cx) > 0.0005 || Math.abs(cam.cy - target.cy) > 0.0005) {
      const f = 1 - Math.exp(-dt * 7);
      cam.k = Math.exp(Math.log(cam.k) + (Math.log(target.k) - Math.log(cam.k)) * f); cam.cx += (target.cx - cam.cx) * f; cam.cy += (target.cy - cam.cy) * f; moving = true; dirty = true;
    } else if (cam.k !== target.k) { cam = { ...target }; dirty = true; }
    const idle = motion(); // the turning decoration and the pulse run only when motion is allowed
    if (dirty || (idle && now - lastDraw > 33)) { render(now); lastDraw = now; dirty = false; }
    if (moving || idle) requestAnimationFrame(frame); else running = false;
  }
  let lastDraw = 0;
  function render(now) {
    const e = 1 - Math.pow(1 - introT, 3); const m = motion();
    const sceneCam = { ...cam, k: cam.k * (m ? 0.8 + 0.2 * e : 1) };
    const done = (id) => spine.get(id) && isDone(spine.get(id), c());
    draw.W = W; draw.H = H; draw.dpr = dpr; draw.cam = sceneCam; draw.rot = m ? (1 - e) * -1.1 : 0; draw.alpha = m ? Math.min(1, 0.25 + introT * 2) : 1;
    draw.t = (now - t0) / 1000; draw.motion = m; draw.sel = yi; draw.cur = cur; draw.pos = pos; draw.events = events; draw.mask = mask; draw.selIdx = selIdx;
    draw.level = levelOf(cam.k, k1); draw.status = status;
    draw.yugas = YUGAS.map((y, i) => { const meta = index?.yugas.find((q) => q.id === y.id); return { count: meta ? meta.count : 0, levels: meta ? meta.levels : 0, done: [...spine.values()].filter((s) => s.yuga === y.id && s.level != null && done(s.id)).length }; });
    drawScene(ctx2d, draw);
  }

  // ---------- list (virtualised: only visible rows exist in the DOM) ----------
  const posOf = (idx) => { let lo = 0, hi = filtIdx.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (filtIdx[m] === idx) return m; if (filtIdx[m] < idx) lo = m + 1; else hi = m - 1; } return -1; };
  function renderRows(focusIdx) {
    const n = filtIdx.length; spacer.style.height = `${n * ROW_H}px`;
    const [a, b] = windowRange(scroll.scrollTop, scroll.clientHeight || 300, ROW_H, n, 3);
    const out = [];
    for (let p = a; p < b; p++) {
      const i = filtIdx[p], e = events[i], st = status(e); const sel = i === selIdx;
      out.push(`<li style="top:${p * ROW_H}px" aria-posinset="${p + 1}" aria-setsize="${n}"><button type="button" class="ch-row st-${st.code}${sel ? ' sel' : ''}" data-i="${i}" tabindex="${sel ? 0 : -1}" aria-label="${esc(accessibleName(e, st))}"${sel ? ' aria-current="true"' : ''}>`
        + `<span class="ch-ico">${ICON[st.code]}</span><span class="ch-txt"><span class="ch-t">${esc(levelWord(e))}: ${esc(e.label)}</span><span class="ch-s">${esc(kindYear(e))}</span><span class="ch-st">${esc(st.text)}</span></span></button></li>`);
    }
    rowsEl.innerHTML = out.join('');
    if (focusIdx != null) rowsEl.querySelector(`[data-i="${focusIdx}"]`)?.focus();
  }
  function ensureVisible(idx) {
    const p = posOf(idx); if (p < 0) return; const top = p * ROW_H, h = scroll.clientHeight || 300;
    if (top < scroll.scrollTop) scroll.scrollTop = top; else if (top + ROW_H > scroll.scrollTop + h) scroll.scrollTop = top + ROW_H - h;
  }
  function select(idx, { center = false, focusRow = false, announce = false } = {}) {
    if (idx < 0 || idx >= events.length) return;
    selIdx = idx; ensureVisible(idx); renderRows(focusRow ? idx : null); dirty = true;
    if (center || level() >= 2) focusEvent(idx);
    else if (level() === 1) { const v = viewOf(target, W, H); const sx = v.px(...eventXY(idx)), sy = v.py(...eventXY(idx)); if (sx < 30 || sy < 30 || sx > W - 30 || sy > H - 30) setTarget({ ...target, cx: pos.xs[idx], cy: pos.ys[idx] }); }
    if (announce) { const e = events[idx]; say(`${filtIdx.length ? posOf(idx) + 1 : 0} of ${filtIdx.length}. ${accessibleName(e, status(e))}`); }
    start();
  }
  function moveSel(delta, opts) {
    if (!filtIdx.length) return; const p = posOf(selIdx);
    const np = Math.max(0, Math.min(filtIdx.length - 1, (p < 0 ? 0 : p) + delta)); select(filtIdx[np], opts);
  }

  // ---------- yuga and filter ----------
  function renderTabs() {
    const tabs = $('ch-yugas'); tabs.innerHTML = YUGAS.map((y, i) => {
      const meta = index?.yugas.find((q) => q.id === y.id); const dn = [...spine.values()].filter((s) => s.yuga === y.id && isDone(s, c())).length;
      return `<button type="button" class="ch-tab${i === yi ? ' on' : ''}" data-y="${i}" aria-pressed="${i === yi}"><span class="n">${esc(y.short)}</span><span class="m">${meta ? meta.count : '?'} events</span>${i === cur ? '<span class="here">You are here</span>' : ''}</button>`;
    }).join('');
    const y = YUGAS[yi], meta = index?.yugas.find((q) => q.id === y.id);
    const dn = [...spine.values()].filter((s) => s.yuga === y.id && isDone(s, c())).length;
    $('ch-list-title').textContent = `${y.name}${yi === cur ? ' (you are here)' : ''}`;
    $('ch-progress').textContent = `${dn} of ${meta ? meta.levels : 0} levels done`;
  }
  function applyFilter() {
    filtIdx = filterEvents(events, filter);
    mask = isFiltering(filter) ? (() => { const m = new Uint8Array(events.length); for (const i of filtIdx) m[i] = 1; return m; })() : null;
    $('ch-count').textContent = isFiltering(filter) ? `${filtIdx.length} of ${events.length} events match` : `${events.length} events`;
    if (filtIdx.length && posOf(selIdx) < 0) selIdx = filtIdx[0];
    scroll.scrollTop = 0; ensureVisible(selIdx); renderRows(); dirty = true; start();
  }
  async function selectYuga(i, { zoom = false, keepFilter = false } = {}) {
    yi = Math.max(0, Math.min(YUGAS.length - 1, i)); const token = ++loadToken;
    k1 = cameraYuga(yi, W, H).k; renderTabs();
    $('ch-error').hidden = true; $('ch-loading').hidden = false; rowsEl.innerHTML = ''; $('ch-count').textContent = 'Loading events...'; events = []; pos = null; mask = null; filtIdx = []; selIdx = -1; dirty = true;
    if (zoom) goYuga();
    try {
      const list = await store.loadShard(YUGAS[yi].id);
      if (token !== loadToken) return;
      events = list; pos = buildPositions(events.length, yi); kMax = maxZoom(k1, events.length);
      if (!keepFilter) { filter = { text: '', kind: '', region: '', from: null, to: null }; syncFilterForm(); }
      buildRegions();
      const firstOpen = events.findIndex((e) => status(e).code === 'open');
      selIdx = firstOpen >= 0 ? firstOpen : 0; $('ch-loading').hidden = true;
      applyFilter(); renderTabs();
      if (zoom) say(`Zoomed to ${YUGAS[yi].name}, ${events.length} events.`);
    } catch (err) {
      if (token !== loadToken) return;
      $('ch-loading').hidden = true; $('ch-error').hidden = false; $('ch-count').textContent = '';
      $('ch-error-text').textContent = `Could not load the ${YUGAS[yi].name} events. Check your connection and try again.`;
    }
  }
  function buildRegions() {
    const sel = $('ch-region'); const rs = regionsOf(events);
    sel.innerHTML = '<option value="">Any region</option>' + rs.map((r) => `<option>${esc(r)}</option>`).join('') + (events.some((e) => !e.region) ? '<option value="(none)">Region not recorded</option>' : '');
    sel.value = filter.region;
  }
  function syncFilterForm() { $('ch-q').value = filter.text; $('ch-kind').value = filter.kind; $('ch-from').value = ''; $('ch-to').value = ''; }
  function readFilter() {
    const yr = (inp, era) => { const v = Number($(inp).value); if (!$(inp).value || !Number.isFinite(v) || v < 0) return null; return $(era).value === 'BCE' ? -v : v; };
    filter = { text: $('ch-q').value, kind: $('ch-kind').value, region: $('ch-region').value, from: yr('ch-from', 'ch-from-era'), to: yr('ch-to', 'ch-to-era') };
    if (filter.from != null && filter.to != null && filter.from > filter.to) [filter.from, filter.to] = [filter.to, filter.from];
    applyFilter();
  }

  // ---------- card ----------
  async function openCard(idx, from) {
    const e = events[idx]; if (!e) return; const st = status(e); trigger = from || doc.activeElement; selIdx = idx;
    $('ch-card-kicker').textContent = `${levelWord(e)} · ${YUGAS.find((y) => y.id === e.yuga)?.name || ''}`;
    $('ch-card-title').textContent = e.label; $('ch-card-meta').textContent = kindYear(e) + (e.region ? ` · ${e.region}` : '');
    $('ch-card-status').innerHTML = `<span class="ch-ico">${ICON[st.code]}</span><span>${esc(st.text)}</span>`;
    $('ch-card-intro').textContent = e.intro;
    $('ch-card-skill').textContent = e.skill ? `Skill: ${e.skill}` : ''; $('ch-card-skill').hidden = !e.skill;
    $('ch-card-note').hidden = !e.needsReview; $('ch-card-note').textContent = 'Draft: waiting for a scholarly review before public launch.';
    $('ch-card-source').textContent = `Source note: ${e.source}`;
    const play = $('ch-play'); play.hidden = e.level == null; play.dataset.id = e.id;
    play.textContent = st.code === 'done' ? 'Play again' : 'Play'; play.setAttribute('aria-disabled', String(!st.playable));
    play.classList.toggle('is-locked', !st.playable);
    $('ch-card-reach').textContent = 'Checking how far others have come...';
    card.hidden = false; $('ch-main').inert = true; $('ch-head').inert = true; card.dataset.idx = String(idx);
    $('ch-card-title').focus(); renderRows(); dirty = true;
    const myIdx = idx; counts = await reach.getReachCounts();
    if (!card.hidden && card.dataset.idx === String(myIdx)) $('ch-card-reach').textContent = reachText(counts, e.id);
  }
  function closeCard() {
    if (card.hidden) return false; card.hidden = true; $('ch-main').inert = false; $('ch-head').inert = false;
    (trigger && trigger.isConnected ? trigger : rowsEl.querySelector('.sel') || stage).focus(); return true;
  }
  $('ch-play').addEventListener('click', () => {
    const e = events[Number(card.dataset.idx)]; if (!e) return; const st = status(e);
    if (!st.playable) { say(`${st.text}.`); return; }
    onPlay(e);
  });
  $('ch-card-close').addEventListener('click', closeCard);

  // ---------- input ----------
  rowsEl.addEventListener('click', (ev) => { const b = ev.target.closest('.ch-row'); if (b) { const i = Number(b.dataset.i); select(i, { center: level() >= 1 }); openCard(i, b); } });
  scroll.addEventListener('scroll', () => renderRows());
  scroll.addEventListener('keydown', (ev) => {
    const k = ev.key; const d = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 }[k];
    if (d) { ev.preventDefault(); moveSel(d, { focusRow: true, announce: false }); } else if (k === 'Home') { ev.preventDefault(); moveSel(-1e9, { focusRow: true }); } else if (k === 'End') { ev.preventDefault(); moveSel(1e9, { focusRow: true }); }
  });
  $('ch-yugas').addEventListener('click', (ev) => { const b = ev.target.closest('.ch-tab'); if (b) selectYuga(Number(b.dataset.y), { zoom: true }); });
  $('ch-in').addEventListener('click', () => { if (level() === 0) { selectYuga(yi, { zoom: true, keepFilter: true }); } else { zoomAt(ZOOM_STEP); say(level() >= 2 ? 'Zoomed in to events.' : `Zoomed to ${YUGAS[yi].name}.`); } });
  $('ch-out').addEventListener('click', () => stepOut());
  $('ch-whole').addEventListener('click', () => { goWhole(); say('Showing the whole wheel of yugas.'); });
  function stepOut() {
    const lv = level();
    if (lv >= 2 && target.k / ZOOM_STEP > k1 * 3) zoomAt(1 / ZOOM_STEP); else if (lv >= 2) { goYuga(); say(`Zoomed out to ${YUGAS[yi].name}, ${events.length} events.`); return; } else if (lv === 1) { goWhole(); say('Showing the whole wheel of yugas.'); return; }
    say('Zoomed out.');
  }
  for (const id of ['ch-q', 'ch-kind', 'ch-region', 'ch-from', 'ch-to', 'ch-from-era', 'ch-to-era']) {
    let tm = 0; $(id).addEventListener(id === 'ch-q' || id.includes('from') || id.includes('to') ? 'input' : 'change', () => { clearTimeout(tm); tm = setTimeout(readFilter, 160); });
  }
  $('ch-filter-form').addEventListener('submit', (ev) => { ev.preventDefault(); readFilter(); });
  $('ch-clear').addEventListener('click', () => { filter = { text: '', kind: '', region: '', from: null, to: null }; syncFilterForm(); $('ch-region').value = ''; applyFilter(); say('Filters cleared.'); });
  $('ch-retry').addEventListener('click', () => { if (!index) open(); else selectYuga(yi, { zoom: level() >= 1 }); });

  stage.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (k === '+' || k === '=') { ev.preventDefault(); $('ch-in').click(); }
    else if (k === '-' || k === '_') { ev.preventDefault(); stepOut(); }
    else if (k === 'ArrowRight' || k === 'ArrowDown') { ev.preventDefault(); if (level() === 0) selectYugaRel(1); else moveSel(1, { announce: true }); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { ev.preventDefault(); if (level() === 0) selectYugaRel(-1); else moveSel(-1, { announce: true }); }
    else if (k === 'Home' && level() >= 1) { ev.preventDefault(); moveSel(-1e9, { announce: true }); }
    else if (k === 'End' && level() >= 1) { ev.preventDefault(); moveSel(1e9, { announce: true }); }
    else if (k === 'PageDown') { ev.preventDefault(); selectYugaRel(1, true); }
    else if (k === 'PageUp') { ev.preventDefault(); selectYugaRel(-1, true); }
    else if (k === 'Enter' || k === ' ') { ev.preventDefault(); if (level() === 0) $('ch-in').click(); else if (selIdx >= 0) openCard(selIdx, stage); }
  });
  function selectYugaRel(d, keepZoom) { const n = Math.max(0, Math.min(YUGAS.length - 1, yi + d)); if (n !== yi) { selectYuga(n, { zoom: level() >= 1 }); if (level() === 0) say(`${YUGAS[n].name} selected.`); } }
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !openOpen) return; ev.preventDefault();
    if (closeCard()) return; if (level() > 0) stepOut();
  });

  // pointer: drag to pan, pinch or wheel to zoom, tap to choose
  const ptrs = new Map(); let tapStart = null, pinch = 0;
  canvas.addEventListener('pointerdown', (ev) => { canvas.setPointerCapture?.(ev.pointerId); ptrs.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY }); tapStart = ptrs.size === 1 ? { x: ev.offsetX, y: ev.offsetY, moved: 0 } : null; pinch = 0; });
  canvas.addEventListener('pointermove', (ev) => {
    const p = ptrs.get(ev.pointerId); if (!p) return; const nx = ev.offsetX, ny = ev.offsetY;
    if (ptrs.size === 2) {
      ptrs.set(ev.pointerId, { x: nx, y: ny }); const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; if (tapStart) tapStart.moved = 99; return;
    }
    const dx = nx - p.x, dy = ny - p.y; ptrs.set(ev.pointerId, { x: nx, y: ny });
    if (tapStart) tapStart.moved += Math.abs(dx) + Math.abs(dy);
    if (tapStart && tapStart.moved > 8 && level() >= 1) { const k = target.k; setTarget({ ...target, cx: target.cx - dx / k, cy: target.cy - dy / k }, true); }
  });
  const endPtr = (ev) => {
    const was = ptrs.has(ev.pointerId); ptrs.delete(ev.pointerId);
    if (was && ev.type === 'pointerup' && tapStart && tapStart.moved <= 8) tap(tapStart.x, tapStart.y);
    if (!ptrs.size) tapStart = null; pinch = 0;
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); if (level() === 0 && ev.deltaY < 0) { $('ch-in').click(); return; } zoomAt(Math.pow(1.0018, -ev.deltaY), ev.offsetX, ev.offsetY); }, { passive: false });
  function tap(x, y) {
    stage.focus({ preventScroll: true });
    if (level() === 0) {
      const v = viewOf(cam, W, H); const [wx, wy] = v.unproject(x, y); const r = Math.hypot(wx, wy);
      if (r < 0.46 || r > 1.02) return;
      const ang = (Math.atan2(wx, -wy) + Math.PI * 2) % (Math.PI * 2); selectYuga(Math.floor(ang / ((Math.PI * 2) / 5)), { zoom: true }); return;
    }
    let best = null, bd = 1e9; for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= h.r && d < bd) { best = h; bd = d; } }
    if (!best) return;
    if (best.cluster) { const v = viewOf(target, W, H); zoomAt(Math.max(ZOOM_STEP * 1.6, 1), best.x, best.y); say(`Zoomed in on ${best.cluster.n} events.`); return; }
    select(best.idx, { center: true }); openCard(best.idx, stage);
  }

  // ---------- open / close ----------
  async function open() {
    progress = getProgress(); statusCache.clear(); openOpen = true; root.hidden = false; introT = reducedMotion() ? 1 : 0; t0 = performance.now(); resize();
    try { index = await store.loadIndex(); spine = spineMap(index.spine); }
    catch { $('ch-error').hidden = false; $('ch-error-text').textContent = 'Could not load the chakra data. Check your connection and try again.'; return; }
    cur = Math.max(0, YUGAS.findIndex((y) => y.id === currentYuga(index.spine, c())));
    $('ch-here').textContent = `You are on the road in the ${YUGAS[cur].name}.`;
    goWhole(true); start();
    await selectYuga(cur);
    stage.focus({ preventScroll: true });
  }
  function refresh() { progress = getProgress(); statusCache.clear(); if (index) { cur = Math.max(0, YUGAS.findIndex((y) => y.id === currentYuga(index.spine, c()))); $('ch-here').textContent = `You are on the road in the ${YUGAS[cur].name}.`; renderTabs(); renderRows(); dirty = true; } }
  function close() { openOpen = false; root.hidden = true; if (!card.hidden) { card.hidden = true; $('ch-main').inert = false; $('ch-head').inert = false; } }
  new ResizeObserver(() => { if (openOpen) resize(); }).observe(stage);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) start(); });
  const hideTemp = () => { openOpen = false; root.hidden = true; };
  const showAgain = () => { openOpen = true; root.hidden = false; resize(); dirty = true; start(); (card.hidden ? stage : $('ch-card-title')).focus(); };
  return { open, close, hideTemp, showAgain, refresh, get isOpen() { return openOpen; }, say, _state: () => ({ level: level(), yi, selIdx, rows: rowsEl.children.length, events: events.length }) };
}
