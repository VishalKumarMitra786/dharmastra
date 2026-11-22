// A tiny synthesized "clunk" for the chakra locking into place. No audio files. The AudioContext is made on first use (after a tap, as browsers require)
// and only when sound is on. Every click is also shown as caption text by the chakra screen, so nothing depends on hearing it.
export function createClick({ enabled = () => true, ctxFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() } = {}) {
  let ac = null; let swellUntil = 0;
  return {
    play() {
      if (!enabled()) return false;
      try {
        ac = ac || ctxFactory(); if (ac.state === 'suspended') ac.resume?.();
        const t = ac.currentTime; const o = ac.createOscillator(); const g = ac.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.12);
        return true;
      } catch { return false; }
    },
    // A deep mechanical swell under a ring turn: a low tone sliding up and a band of filtered rumble, rising and falling over about 0.9 s. One at a time,
    // so quick taps do not stack. Returns true when it started.
    swell(dur = 0.9) {
      if (!enabled()) return false;
      try {
        ac = ac || ctxFactory(); if (ac.state === 'suspended') ac.resume?.();
        const t = ac.currentTime; if (t < swellUntil) return false; swellUntil = t + dur;
        const o = ac.createOscillator(); const g = ac.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(46, t); o.frequency.exponentialRampToValueAtTime(92, t + dur * 0.7); o.frequency.exponentialRampToValueAtTime(70, t + dur);
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(520, t + dur * 0.6); lp.frequency.exponentialRampToValueAtTime(160, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
        return true;
      } catch { return false; }
    },
  };
}
