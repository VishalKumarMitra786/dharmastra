// Sound: every cue is synthesized with WebAudio (oscillators and filtered noise). There are no audio files, so nothing to license or download.
// Every cue has a caption in square brackets for the HUD live region (CLAUDE.md: captions for audio), and a spoken line for the ones a player must not miss.
// Nothing depends on sound: the visual telegraph, the caption and the announcement carry the same information.
//
//   createAudio({ctxFactory?, volume?}) -> {enabled, setEnabled(on), play(cue), playEvent(sim event), captionFor(event), announceFor(event), cueFor(event)}
// The AudioContext is made on the first play (browsers need a tap first) and any audio failure is swallowed: sound is never allowed to break a game.

const NAMES = { raider: 'raider', spearman: 'spearman', swordsman: 'swordsman', shield: 'shield bearer', archer: 'archer', captain: 'captain', sparrer: 'sparring partner' };
const kindName = (k) => NAMES[k] || 'soldier';

// cue name -> caption
export const CAPTIONS = {
  swing: '[Swish]', hit: '[Thud: a hit lands]', 'hit-heavy': '[Heavy thud: a strong hit]', clang: '[Clang: blocked by a shield]', 'shield-break': '[Crack: guard broken]',
  block: '[Clang: you block]', parry: '[Ring: perfect parry]', dodge: '[Whoosh: you roll]', hurt: '[Grunt: you are hit]', warn: '[Tick tick: a blow is coming]',
  'enemy-swing': '[Swish: an enemy strikes]', arrow: '[Twang: an arrow is loosed]', 'arrow-hit': '[Thock: an arrow lands]', finisher: '[Crash: finishing blow]',
  horn: '[Horn: a call for help]', gong: '[Gong]', down: '[Fall: a soldier yields]', rest: '[Chime: a moment to breathe]', ping: '[Ping: an opening]',
  checkpoint: '[Chime: checkpoint]', win: '[Rising notes: mission complete]', fail: '[Falling notes: mission failed]', bump: '[Knock: a wall]',
};

// sim event -> cue name (or null for silence)
export function cueFor(e) {
  switch (e?.type) {
    case 'swing': case 'shove': return 'swing';
    case 'hit-enemy': return e.heavy || e.dmg > 1 ? 'hit-heavy' : 'hit';
    case 'shove-hit': case 'target-hit': return 'hit';
    case 'shield-block': return 'clang';
    case 'shield-break': case 'guard-break': return 'shield-break';
    case 'blocked': return 'block';
    case 'parry': return 'parry';
    case 'opened': return 'ping';
    case 'dodge': return 'dodge';
    case 'hurt': return 'hurt';
    case 'windup': return 'warn';
    case 'enemy-swing': return 'enemy-swing';
    case 'shot': case 'enemy-arrow': return 'arrow';
    case 'arrow-hit': return 'arrow-hit';
    case 'finisher': return 'finisher';
    case 'call': case 'wave-start': return 'horn';
    case 'phase': case 'captain-down': return 'gong';
    case 'enemy-down': case 'enemy-fell': return 'down';
    case 'rest': case 'wave-clear': return 'rest';
    case 'checkpoint': return 'checkpoint';
    case 'wall': return 'bump';
    case 'win': return 'win';
    case 'fail': return 'fail';
    default: return null;
  }
}

export function captionFor(e) {
  if (e?.type === 'windup') return `[Tick tick: ${kindName(e.kind)} winds up${e.unblockable ? ', cannot be blocked' : ''}]`;
  if (e?.type === 'phase') return `[Gong: the captain changes stance, phase ${e.n}]`;
  if (e?.type === 'wave-start') return `[Horn: wave ${e.n} of ${e.total}]`;
  if (e?.type === 'wave-clear') return `[Chime: wave ${e.n} cleared]`;
  if (e?.type === 'hit-enemy' && e.via) return CAPTIONS[cueFor(e)].replace('a hit lands', `${e.via === 'fists' ? 'fist' : e.via} hit`).replace('a strong hit', `strong ${e.via === 'fists' ? 'fist' : e.via} hit`);
  const c = cueFor(e);
  return c ? CAPTIONS[c] : null;
}

// A plain sentence for the screen-reader live region, only for events a player must not miss. Windups are announced only when they cannot be blocked.
export function announceFor(e) {
  switch (e?.type) {
    case 'hurt': return `You are hit${e.amount ? `, ${e.amount} damage` : ''}${e.weapon ? ` by a ${e.weapon}` : ''}. Health ${e.health}.`;
    case 'windup': return e.unblockable ? `${kindName(e.kind)} winds up a blow that cannot be blocked. Roll.` : null;
    case 'parry': return e.ranged ? 'You turn an arrow aside.' : 'Perfect parry. The enemy is open: attack to finish.';
    case 'opened': return 'The enemy is open.';
    case 'finisher': return 'Finishing blow.';
    case 'shield-block': return 'The shield stops your blow. Go round to its side or shove it.';
    case 'shield-break': return 'You break the guard. Strike now.';
    case 'call': return 'An enemy calls for help.';
    case 'retreat': return 'An enemy falls back, hurt.';
    case 'phase': return `The captain changes stance. Phase ${e.n} of 3.`;
    case 'captain-down': return 'The captain yields.';
    case 'wave-start': return `Wave ${e.n} of ${e.total}.`;
    case 'wave-clear': return `Wave ${e.n} cleared.${e.heal ? ' You catch your breath.' : ''}`;
    case 'enemy-arrow': return 'An archer looses an arrow.';
    default: return null;
  }
}

// ---------------------------------------------------------------- synthesis
// Each voice: (ctx, out, t) builds nodes starting at time t and connects to `out`. Noise comes from one shared buffer made once with a fixed generator.
const tone = (ctx, out, t, { type = 'sine', f0, f1 = f0, dur, gain = 0.3, attack = 0.004 }) => {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
};
const noise = (ctx, out, t, buf, { filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur, gain = 0.25 }) => {
  const s = ctx.createBufferSource(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
  s.buffer = buf; f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.02);
};

export const VOICES = {
  swing: (c, o, t, b) => noise(c, o, t, b, { f0: 700, f1: 2600, q: 1.2, dur: 0.13, gain: 0.22 }),
  'enemy-swing': (c, o, t, b) => noise(c, o, t, b, { f0: 500, f1: 1800, q: 1, dur: 0.16, gain: 0.26 }),
  hit: (c, o, t, b) => { tone(c, o, t, { f0: 160, f1: 60, dur: 0.11, gain: 0.45 }); noise(c, o, t, b, { filter: 'highpass', f0: 1500, dur: 0.05, gain: 0.2 }); },
  'hit-heavy': (c, o, t, b) => { tone(c, o, t, { f0: 100, f1: 38, dur: 0.22, gain: 0.6 }); noise(c, o, t, b, { filter: 'lowpass', f0: 900, dur: 0.14, gain: 0.3 }); },
  clang: (c, o, t) => { tone(c, o, t, { type: 'square', f0: 620, dur: 0.16, gain: 0.12 }); tone(c, o, t, { type: 'triangle', f0: 1040, dur: 0.22, gain: 0.18 }); },
  'shield-break': (c, o, t, b) => { tone(c, o, t, { type: 'square', f0: 420, f1: 180, dur: 0.22, gain: 0.16 }); noise(c, o, t, b, { filter: 'highpass', f0: 2000, dur: 0.12, gain: 0.25 }); },
  block: (c, o, t) => { tone(c, o, t, { type: 'triangle', f0: 760, dur: 0.12, gain: 0.25 }); tone(c, o, t, { type: 'square', f0: 380, dur: 0.1, gain: 0.1 }); },
  parry: (c, o, t, b) => { tone(c, o, t, { f0: 1320, dur: 0.45, gain: 0.3 }); tone(c, o, t, { f0: 1980, dur: 0.35, gain: 0.16 }); noise(c, o, t, b, { filter: 'highpass', f0: 3000, dur: 0.05, gain: 0.2 }); },
  dodge: (c, o, t, b) => noise(c, o, t, b, { filter: 'lowpass', f0: 1400, f1: 260, q: 0.7, dur: 0.2, gain: 0.25 }),
  hurt: (c, o, t, b) => { tone(c, o, t, { type: 'sawtooth', f0: 190, f1: 80, dur: 0.22, gain: 0.3 }); noise(c, o, t, b, { filter: 'lowpass', f0: 800, dur: 0.1, gain: 0.25 }); },
  warn: (c, o, t) => { tone(c, o, t, { type: 'triangle', f0: 880, dur: 0.06, gain: 0.14 }); tone(c, o, t + 0.1, { type: 'triangle', f0: 880, dur: 0.06, gain: 0.14 }); },
  arrow: (c, o, t, b) => { tone(c, o, t, { type: 'triangle', f0: 540, f1: 190, dur: 0.15, gain: 0.25 }); noise(c, o, t, b, { f0: 2400, dur: 0.06, gain: 0.12 }); },
  'arrow-hit': (c, o, t) => tone(c, o, t, { f0: 210, f1: 90, dur: 0.07, gain: 0.4 }),
  finisher: (c, o, t, b) => { tone(c, o, t, { f0: 90, f1: 34, dur: 0.3, gain: 0.65 }); tone(c, o, t + 0.04, { f0: 660, f1: 1320, dur: 0.3, gain: 0.18 }); noise(c, o, t, b, { filter: 'lowpass', f0: 1200, dur: 0.18, gain: 0.3 }); },
  horn: (c, o, t) => { tone(c, o, t, { type: 'sawtooth', f0: 196, f1: 220, dur: 0.55, gain: 0.16, attack: 0.08 }); tone(c, o, t, { type: 'sawtooth', f0: 294, f1: 330, dur: 0.55, gain: 0.08, attack: 0.08 }); },
  gong: (c, o, t) => { for (const [f, g] of [[110, 0.4], [165, 0.25], [233, 0.15]]) tone(c, o, t, { f0: f, dur: 1.3, gain: g, attack: 0.01 }); },
  down: (c, o, t) => tone(c, o, t, { type: 'triangle', f0: 320, f1: 110, dur: 0.32, gain: 0.25 }),
  rest: (c, o, t) => { tone(c, o, t, { f0: 660, dur: 0.35, gain: 0.18 }); tone(c, o, t + 0.12, { f0: 880, dur: 0.4, gain: 0.16 }); },
  ping: (c, o, t) => tone(c, o, t, { f0: 1560, dur: 0.18, gain: 0.14 }),
  checkpoint: (c, o, t) => { tone(c, o, t, { f0: 523, dur: 0.18, gain: 0.2 }); tone(c, o, t + 0.14, { f0: 784, dur: 0.3, gain: 0.2 }); },
  win: (c, o, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, o, t + i * 0.13, { f0: f, dur: 0.35, gain: 0.2 })); },
  fail: (c, o, t) => { [392, 330, 262, 196].forEach((f, i) => tone(c, o, t + i * 0.16, { type: 'triangle', f0: f, dur: 0.4, gain: 0.2 })); },
  bump: (c, o, t) => tone(c, o, t, { f0: 120, f1: 60, dur: 0.09, gain: 0.3 }),
};

const MAX_VOICES = 10; const REPEAT_GAP = 0.04; // seconds: the same cue is not restarted inside this gap, so a flurry does not stack into noise

export function createAudio({ ctxFactory, volume = 0.5 } = {}) {
  let enabled = true; let ctx = null; let master = null; let buf = null; let broken = false;
  const lastAt = {}; const live = [];
  const make = ctxFactory || (() => { const C = globalThis.AudioContext || globalThis.webkitAudioContext; return C ? new C() : null; });

  function ensure() {
    if (broken) return false;
    if (!ctx) {
      try {
        ctx = make();
        if (!ctx) { broken = true; return false; }
        master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
        const n = Math.floor(ctx.sampleRate * 0.4); buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0); let a = 12345; // fixed generator: the same hiss every time
        for (let i = 0; i < n; i++) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; d[i] = (a / 4294967296) * 2 - 1; }
      } catch { broken = true; ctx = null; return false; }
    }
    try { if (ctx.state === 'suspended') ctx.resume?.(); } catch { /* a locked context stays silent until the next tap */ }
    return true;
  }

  const api = {
    setEnabled(on) { enabled = Boolean(on); },
    get enabled() { return enabled; },
    cueFor, captionFor, announceFor,
    // Plays one named cue. Unknown names are ignored. Returns true when a sound was started.
    play(cue) {
      if (!enabled || !VOICES[cue] || !ensure()) return false;
      try {
        const t = ctx.currentTime;
        if (lastAt[cue] != null && t - lastAt[cue] < REPEAT_GAP) return false;
        while (live.length && live[0] <= t) live.shift();
        if (live.length >= MAX_VOICES) return false;
        lastAt[cue] = t; live.push(t + 0.5); live.sort((x, y) => x - y);
        VOICES[cue](ctx, master, t, buf);
        return true;
      } catch { return false; }
    },
    playEvent(e) { const c = cueFor(e); return c ? api.play(c) : false; },
  };
  return api;
}
