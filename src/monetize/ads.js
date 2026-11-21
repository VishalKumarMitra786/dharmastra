// Provider-neutral ad gate. Decides WHEN an ad may show; the slot UI (ad-slot.js) decides how it looks.
// Rules (CEO): one ad at app open, then at most one every N completed levels (default 3). Never on a retry, never during a mission. Pro removes ads.
// An ad can never block play: errors, timeouts and thrown exceptions all let the player through at once.
export const DEFAULTS = Object.freeze({ every: 3, durationMs: 10000, loadTimeoutMs: 3000 });

// Provider interface:  { name, hasAudio?:bool, render(container, { onDone, onError, setTranscript }) -> void | Promise | cleanupFn }
// A provider must start muted and must not autoplay sound (the slot also mutes any <audio>/<video> it finds). Call onDone when the ad has ended by itself, onError on failure.
export const houseProvider = {
  name: 'house', hasAudio: false,
  render(container) {
    const d = container.ownerDocument;
    const card = d.createElement('div'); card.className = 'ad-house';
    const tag = d.createElement('p'); tag.className = 'ad-house-tag'; tag.textContent = 'Ad';
    const h = d.createElement('p'); h.className = 'ad-house-title'; h.textContent = 'Your advertisement could be here';
    const t = d.createElement('p'); t.className = 'ad-house-text'; t.textContent = 'This is a placeholder card from the game itself. No real ad network is connected yet.';
    card.append(tag, h, t); container.append(card);
  },
};

// Pure helper so the countdown wording and the skip rule can be tested without a browser.
export function countdownState(elapsedMs, durationMs = DEFAULTS.durationMs) {
  const left = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
  return { secondsLeft: left, canContinue: left === 0,
    label: left === 0 ? 'Continue to game' : `Continue in ${left} second${left === 1 ? '' : 's'}`,
    text: left === 0 ? 'Ad finished' : `Ad ends in ${left} second${left === 1 ? '' : 's'}` };
}

const asCount = (n) => (Number.isInteger(n) && n >= 1 && n <= 50 ? n : DEFAULTS.every);

// opts: { every, isPro:()=>bool, show:(opts)=>Promise, maxMs (hard failsafe), setTimeout, clearTimeout }
export function createAdGate(opts = {}) {
  let every = asCount(opts.every); const isPro = opts.isPro || (() => false);
  const show = opts.show || (async () => 'unavailable');
  const st = opts.setTimeout || setTimeout, ct = opts.clearTimeout || clearTimeout;
  const maxMs = opts.maxMs ?? DEFAULTS.durationMs + 8000;
  let sinceAd = 0, openDone = false, active = null;
  const stats = { shown: 0, skipped: 0, failed: 0 };

  async function run(reason) {
    if (active) return active;
    active = (async () => {
      let timer; const ac = new AbortController();
      try {
        const outcome = await Promise.race([
          Promise.resolve().then(() => show({ reason, signal: ac.signal })),
          new Promise((r) => { timer = st(() => { ac.abort(); r('timeout'); }, maxMs); }),
        ]);
        if (outcome === 'timeout' || outcome === 'error' || outcome === 'unavailable') { stats.failed++; return outcome; }
        stats.shown++; return 'shown';
      } catch { stats.failed++; return 'error'; }
      finally { ct(timer); sinceAd = 0; active = null; } // a failed ad still resets the count: no retry storm
    })();
    return active;
  }
  // ctx: { inMission:boolean, retry:boolean }. Always resolves; the value says what happened ('shown','none','timeout','error','unavailable').
  const blocked = (ctx) => !!(ctx && (ctx.inMission || ctx.retry)) || isPro();
  return {
    get every() { return every; }, setEvery(n) { every = asCount(n); return every; },
    stats, get sinceAd() { return sinceAd; },
    // Call once when the app has opened (start screen visible, no mission running).
    async onAppOpen(ctx = {}) {
      if (openDone) return 'none'; if (blocked(ctx)) { stats.skipped++; return 'none'; }
      openDone = true; return run('open');
    },
    // Call when a level has been completed successfully (not on failure, not on retry).
    levelCompleted() { sinceAd++; return sinceAd; },
    // Call before a level starts (from the chakra/start screen). Await it, then start the level.
    async beforeLevelStart(ctx = {}) {
      if (blocked(ctx) || sinceAd < every) { if (blocked(ctx)) stats.skipped++; return 'none'; }
      return run('level');
    },
  };
}
