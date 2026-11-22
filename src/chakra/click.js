// A tiny synthesized "clunk" for the chakra locking into place. No audio files. The AudioContext is made on first use (after a tap, as browsers require)
// and only when sound is on. Every click is also shown as caption text by the chakra screen, so nothing depends on hearing it.
export function createClick({ enabled = () => true, ctxFactory = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)() } = {}) {
  let ac = null;
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
  };
}
