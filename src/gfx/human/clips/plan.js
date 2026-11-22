// Chooses which authored clips play for a pose request, and at what time. Pure: the only memory is the small object `o.mem` that anim.js keeps on the pose.
// A plan is a list of layers [{name, t, w}] blended in order (the first layer is the base, w is the lerp weight toward each later layer), or null to fall back
// to the procedural pose. Names are the clip names that tools/blender/anim writes. Combat clips carry markers in extras: w = end of the wind-up, a = end of the active phase.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const speedMs = (sp) => (sp < 0.5 ? sp * 2.8 : 1.4 + (sp - 0.5) * 5.2); // inverse of the speed mapping in index.js (sp 0.5 = 1.4 m/s, 1 = 4 m/s)
const frac = (x) => x - Math.floor(x);

// Where in a clip is a sim phase? windup u in 0..1 maps onto [0, w], active onto [w, a], recover onto [a, dur] (the clip's own markers).
export function phaseTime(clip, phase, u) {
  const dur = clip.dur; const w = clip.extras.w ?? dur * 0.4; const a = clip.extras.a ?? dur * 0.6; u = clamp01(u);
  return phase === 'windup' ? u * w : phase === 'active' ? w + u * (a - w) : a + u * (dur - a);
}

const FIST = ['fists_jab', 'fists_cross', 'fists_kick'];
const SWORD = ['sword_light_1', 'sword_light_2', 'sword_light_3'];
const ARMS = /^(shoulder|upperarm|forearm|hand|thumb|fingers|fingers2)_/;
export { ARMS };

export function planClips(o, c, has, CL) {
  const mem = o.mem || (o.mem = { chain: 0, prev: '', last: 0, mode: 'idle', mt: 0, endT: -9 });
  const st = c.state || 'idle'; const time = c.time || 0; const dt = mem.t0 === undefined ? 0 : Math.max(0, Math.min(0.1, time - mem.t0)); mem.t0 = time;
  const t = c.t || 0; const w = c.weapon || 'none'; const sp = clamp01(c.speed || 0); const v = speedMs(sp);
  const entering = st !== mem.prev; const was = mem.prev; mem.prev = st;
  const L = (name, tt, ww = 1) => ({ name, t: tt, w: ww });
  const ok = (n) => has(n);
  // ---- combat and reactions (each returns null when its clip is missing, so the procedural pose plays) ----
  const one = (name, tt) => (ok(name) ? { layers: [L(name, tt)], full: true } : null);
  if (st === 'attack' || st === 'shove') {
    const A = c.atk || { kind: st === 'shove' ? 'shove' : 'staff', progress: clamp01(t / 0.45), hit: 0.4 };
    if (entering) { mem.chain = time - mem.endT < 1.1 ? (mem.chain + 1) % 3 : 0; }
    mem.endT = time;
    const h = A.hit > 0 ? A.hit : 0.4; const p = clamp01(A.progress); const ae = Math.min(1, h + (1 - h) * 0.3);
    const ph = p < h ? ['windup', p / h] : p < ae ? ['active', (p - h) / Math.max(1e-3, ae - h)] : ['recover', (p - ae) / Math.max(1e-3, 1 - ae)];
    const k = A.kind; const chain = A.chain ?? mem.chain;
    let name;
    if (k === 'shove' || st === 'shove') name = 'shove';
    else if (w === 'none' || w === 'fists') name = k === 'heavy' ? 'fists_kick' : FIST[chain % 2];
    else if (w === 'staff' || w === 'stick') name = k === 'heavy' ? 'staff_heavy' : 'staff_swing';
    else if (w === 'sword' || w === 'blade') name = k === 'heavy' ? 'sword_heavy' : SWORD[chain];
    else if (w === 'spear') name = k === 'heavy' ? 'spear_sweep' : 'spear_thrust';
    else if (w === 'club') name = 'club_overhead';
    else name = k === 'heavy' ? 'staff_heavy' : 'staff_swing';
    if (!ok(name)) return null; const cl = CL.get(name); return { layers: [L(name, phaseTime(cl, ph[0], ph[1]))], full: true, snap: 30 };
  }
  if (st === 'windup' || st === 'strike' || st === 'recover') { // enemy attacks
    const kind = c.attackName || ''; const chain = c.chain || 0; let name;
    if (kind === 'slam') name = 'captain_slam'; else if (kind === 'lunge') name = 'captain_lunge'; else if (kind === 'thrust' || w === 'spear') name = 'spear_thrust'; else if (kind === 'bash') name = 'shield_bash';
    else if (w === 'sword' || w === 'blade' || kind === 'slash' && w !== 'club') name = SWORD[chain % 3]; else if (w === 'club' || w === 'stick') name = 'club_overhead'; else name = FIST[chain % 2];
    if (!ok(name)) return null; const cl = CL.get(name);
    const ph = st === 'windup' ? 'windup' : st === 'strike' ? 'active' : 'recover'; const u = st === 'windup' ? (c.windup ?? clamp01(t / 0.5)) : (c.u ?? clamp01(t / 0.3));
    return { layers: [L(name, phaseTime(cl, ph, u))], full: true, snap: 30 };
  }
  if (st === 'aim') { // the bow: the draw fraction drives the clip (the draw is 0..1 in the sim); at the release the release clip plays
    if (!ok('bow_draw')) return null; const cl = CL.get('bow_draw'); return { layers: [L('bow_draw', clamp01(c.draw || 0) * (cl.extras.a ?? cl.dur))], full: true };
  }
  if (st === 'block') return one('block_hold', t);
  if (st === 'parry') return one('parry', t);
  if (st === 'dodge') { if (!ok('dodge_roll')) return null; const cl = CL.get('dodge_roll'); return { layers: [L('dodge_roll', clamp01(t / (c.dodgeDur || 0.36)) * cl.dur)], full: true, snap: 30 }; }
  if (st === 'hurt' || st === 'stagger') {
    if (st === 'stagger') return one('stagger', t);
    const d = c.hitDir || 0; const a = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // radians the blow came from, relative to facing: 0 = front
    const name = a < Math.PI / 4 || a >= 7 * Math.PI / 4 ? 'hit_front' : a < 3 * Math.PI / 4 ? 'hit_left' : a < 5 * Math.PI / 4 ? 'hit_back' : 'hit_right';
    return one(name, t);
  }
  if (st === 'down' || st === 'death') return one('death', t);
  if (st === 'knockdown') return one('knockdown', t);
  if (st === 'getup') return one('getup', t);
  if (st === 'vault') return one('vault', t);
  if (st === 'climb') return one('climb', t);
  if (st === 'call') return one('captain_call', t);
  if (['pickup', 'throw', 'drop', 'give', 'take', 'namaste', 'nod', 'turnL', 'turnR'].includes(st)) { const nm = { turnL: 'turn_L', turnR: 'turn_R', throw: c.underhand ? 'throw_under' : 'throw_over' }[st] || st; return one(nm, t); }
  if (st === 'push') return one('push_crate', t * 0.9 + (c.cycle || 0) * 0);
  if (st === 'talk') { const pick = ['talk_a', 'talk_b', 'talk_c'][Math.floor((c.seed || 0) * 7) % 3]; return ok(pick) ? { layers: [L(pick, time + (c.seed || 0) * 3)], full: true } : null; }
  // ---- locomotion ----
  if (!['idle', 'crouch', 'alert', 'search'].includes(st)) return null;
  if (!ok('idle') || !ok('walk')) return null;
  const crouch = c.crouch > 0.5 || st === 'crouch'; const ph = (n) => frac(c.cycle || 0) * CL.get(n).dur;
  const baseIdle = crouch ? 'crouch_idle' : (c.listen && ok('idle_listen') ? 'idle_listen' : 'idle');
  const layers = [L(baseIdle, time)];
  if (crouch) { if (ok('crouch_walk')) layers.push(L('crouch_walk', ph('crouch_walk'), smooth(sp / 0.3))); return { layers, loco: true }; }
  const wW = smooth((v - 0.15) / 0.55); if (wW > 0) layers.push(L('walk', ph('walk'), wW));
  if (v > 1.4 && ok('jog')) layers.push(L('jog', ph('jog'), smooth((v - 1.4) / 1.4)));
  if (v > 2.8 && ok('sprint')) layers.push(L('sprint', ph('sprint'), smooth((v - 2.8) / 1.2)));
  // start and stop: a short transition clip on top of the base blend
  if (ok('start_walk') && ok('stop_walk')) {
    if (mem.mode === 'idle' && sp > 0.12 && v < 2.0) { mem.mode = 'start'; mem.mt = 0; }
    else if (mem.mode === 'loco' && sp < 0.05 && mem.pv > 1.0) { mem.mode = 'stop'; mem.mt = 0; }
    else if (mem.mode === 'stop' && sp > 0.12) { mem.mode = 'loco'; } else if (mem.mode === 'loco' && sp < 0.05) mem.mode = 'idle'; else if (mem.mode === 'idle' && sp > 0.4) mem.mode = 'loco';
    mem.pv = v; mem.mt += dt;
    if (mem.mode === 'start') { const cl = CL.get('start_walk'); if (mem.mt > cl.dur || sp < 0.05) mem.mode = sp < 0.05 ? 'idle' : 'loco'; else layers.push(L('start_walk', mem.mt, 1 - smooth((mem.mt - cl.dur * 0.7) / (cl.dur * 0.3)))); }
    if (mem.mode === 'stop') { const cl = CL.get('stop_walk'); if (mem.mt > cl.dur) mem.mode = 'idle'; else layers.push(L('stop_walk', mem.mt, 1 - smooth((mem.mt - cl.dur * 0.75) / (cl.dur * 0.25)))); }
  }
  return { layers, loco: true, carryArms: true };
}
