// Ad slot UI: a modal dialog with a labelled 'Ad' area, a text countdown and a Continue button that unlocks when the timer ends.
// Never plays sound by itself. Focus is trapped while open and restored after. Works with keyboard and screen reader.
import { DEFAULTS, countdownState, createAdGate, houseProvider } from './ads.js';
import { isPro } from './pro.js';

let provider = houseProvider;
export function setProvider(p) { if (!p || typeof p.render !== 'function') throw new TypeError('provider needs render(container, cb)'); provider = p; }

function ensureCss(doc) {
  if (doc.getElementById('monetize-css')) return Promise.resolve();
  return new Promise((res) => {
    const l = doc.createElement('link'); l.id = 'monetize-css'; l.rel = 'stylesheet'; l.href = new URL('./monetize.css', import.meta.url).href;
    l.onload = l.onerror = () => res(); doc.head.append(l); setTimeout(res, 1500);
  });
}
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Resolves 'shown' | 'error' | 'unavailable'. Never rejects.
export async function showAdSlot({ reason = 'level', signal, durationMs = DEFAULTS.durationMs, loadTimeoutMs = DEFAULTS.loadTimeoutMs, doc = globalThis.document } = {}) {
  if (!doc || !doc.body) return 'unavailable';
  try { await ensureCss(doc); } catch { /* unstyled is still usable */ }
  return new Promise((resolve) => {
    const win = doc.defaultView;
    const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const returnTo = doc.activeElement; const inerted = [];
    const root = doc.createElement('div'); root.className = 'ad-overlay'; root.dataset.reason = reason;
    root.innerHTML = `<div class="ad-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-title" aria-describedby="ad-status" tabindex="-1">
      <p class="ad-badge" id="ad-title">Advertisement</p>
      <div class="ad-content" aria-label="Advertisement content"></div>
      <details class="ad-transcript" hidden><summary>Captions and transcript</summary><p class="ad-transcript-text"></p></details>
      <p class="ad-countdown" data-reduced="${reduced}"><span class="ad-count-text"></span><span class="ad-bar" aria-hidden="true"><span class="ad-bar-fill"></span></span></p>
      <p class="ad-status sr-only" id="ad-status" role="status" aria-live="polite"></p>
      <button type="button" class="ad-continue" aria-disabled="true"></button>
      <p class="ad-note">Pro removes ads for good and never changes gameplay.</p></div>`;
    const dlg = root.firstElementChild, content = root.querySelector('.ad-content'), btn = root.querySelector('.ad-continue');
    const cdText = root.querySelector('.ad-count-text'), fill = root.querySelector('.ad-bar-fill'), status = root.querySelector('.ad-status');
    const tdet = root.querySelector('.ad-transcript'), ttext = root.querySelector('.ad-transcript-text');
    let finished = false, cleanup = null, interval = null, loadTimer = null, announcedReady = false;
    const start = Date.now();

    const finish = (result) => {
      if (finished) return; finished = true;
      clearInterval(interval); clearTimeout(loadTimer);
      try { if (typeof cleanup === 'function') cleanup(); } catch { /* ignore */ }
      doc.removeEventListener('keydown', onKey, true); signal?.removeEventListener('abort', onAbort);
      for (const [el, was] of inerted) { if (was) el.setAttribute('inert', ''); else el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      root.remove();
      try { (returnTo && returnTo.isConnected && returnTo !== doc.body ? returnTo : doc.querySelector('#start-btn, button, [tabindex]'))?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
      resolve(result);
    };
    const onAbort = () => finish('error');
    const tick = () => {
      const s = countdownState(Date.now() - start, durationMs);
      cdText.textContent = s.text; btn.textContent = s.label;
      const ready = s.canContinue; btn.setAttribute('aria-disabled', String(!ready)); btn.classList.toggle('is-ready', ready);
      fill.style.width = `${Math.min(100, ((Date.now() - start) / durationMs) * 100)}%`;
      if (!announcedReady && ready) { announcedReady = true; status.textContent = 'The ad has finished. You can continue to the game.'; }
      if (ready) clearInterval(interval);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (btn.getAttribute('aria-disabled') === 'false') finish('shown'); return; }
      if (e.key !== 'Tab') return;
      const items = [...dlg.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]'));
      if (!items.length) { e.preventDefault(); dlg.focus(); return; }
      const first = items[0], last = items[items.length - 1], a = doc.activeElement;
      if (!dlg.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (a === first || a === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    };
    btn.addEventListener('click', () => { if (btn.getAttribute('aria-disabled') === 'false') finish('shown'); });

    for (const el of [...doc.body.children]) { if (el === root) continue; inerted.push([el, el.hasAttribute('inert')]); el.setAttribute('inert', ''); }
    doc.body.append(root); doc.addEventListener('keydown', onKey, true); signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) return finish('error');
    status.textContent = `Advertisement. You can continue in ${Math.round(durationMs / 1000)} seconds.`;
    tick(); interval = setInterval(tick, reduced ? 1000 : 250);
    dlg.focus({ preventScroll: true });

    const api = { onDone: () => finish('shown'), onError: () => finish('error'),
      setTranscript: (t) => { ttext.textContent = String(t || ''); tdet.hidden = !t; } };
    if (provider.hasAudio) { tdet.hidden = false; ttext.textContent = ttext.textContent || 'Transcript not provided for this ad.'; }
    loadTimer = setTimeout(() => finish('error'), loadTimeoutMs); // provider that never renders must not hold the player
    try {
      Promise.resolve(provider.render(content, api)).then((c) => {
        clearTimeout(loadTimer); cleanup = c;
        if (finished && typeof c === 'function') { try { c(); } catch { /* ignore */ } }
        content.querySelectorAll('audio, video').forEach((m) => { m.autoplay = false; m.muted = true; try { m.pause(); } catch { /* ignore */ } m.controls = true; });
      }, () => finish('error'));
    } catch { finish('error'); }
  });
}

// The ready-made gate the game imports. Pro is read at call time, so a purchase takes effect immediately.
export const ads = createAdGate({ isPro: () => isPro(), show: showAdSlot });
export { createAdGate, houseProvider, isPro };
