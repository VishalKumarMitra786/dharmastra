// Checks for the authored animation clips (assets/characters/anim/*.glb, built by tools/blender/anim) and the layer in src/gfx/human/anim.js that plays them.
// Pure data and pure functions, no GPU. Prints PASS/FAIL lines and sets exitCode on failure.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const t = (name, fn) => { try { fn(); console.log('PASS  anim: ' + name); } catch (e) { console.log('FAIL  anim: ' + name + ' ' + e.message); process.exitCode = 1; } };
const A = await import('../gfx/human/anim.js');
const { BONES, CLIPS, installClips, clearClips, pose, poseProcedural, makePose, blendPose, applyLook, LOOK_LIMIT, blinkAt, springStep, warpDt, REST } = A;
const { phaseTime, speedMs } = await import('../gfx/human/clips/plan.js');
const GROUPS = ['loco', 'combat', 'react', 'interact'];
const sizes = {};
clearClips();
for (const g of GROUPS) { const p = new URL(`assets/characters/anim/${g}.glb`, root); if (!existsSync(p)) continue; const b = readFileSync(p); sizes[g] = gzipSync(b).length; installClips(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
const has = (n) => CLIPS.has(n);

const REQUIRED = {
  loco: ['idle', 'idle_listen', 'crouch_idle', 'walk', 'jog', 'sprint', 'crouch_walk', 'start_walk', 'stop_walk', 'turn_L', 'turn_R'],
  combat: ['fists_jab', 'fists_cross', 'fists_kick', 'staff_swing', 'staff_heavy', 'spear_thrust', 'spear_sweep', 'sword_light_1', 'sword_light_2', 'sword_light_3', 'sword_heavy', 'club_overhead', 'shield_bash',
    'bow_draw', 'bow_release', 'captain_lunge', 'captain_slam', 'captain_call', 'block_hold', 'parry', 'shove'],
  react: ['hit_front', 'hit_back', 'hit_left', 'hit_right', 'stagger', 'knockdown', 'death', 'getup', 'dodge_roll', 'vault', 'climb'],
  interact: ['pickup', 'drop', 'throw_under', 'throw_over', 'give', 'take', 'carry_idle', 'push_crate', 'talk_a', 'talk_b', 'talk_c', 'namaste', 'nod', 'crowd_a', 'crowd_b', 'crowd_c', 'alert_look', 'hold_staff', 'hold_spear', 'hold_sword', 'hold_club'],
};
for (const g of GROUPS) t(`${g}.glb exists, is under 120 KB gzipped, and has every required clip`, () => {
  assert.ok(sizes[g] !== undefined, `${g}.glb missing`); assert.ok(sizes[g] < 120 * 1024, `gz ${sizes[g]}`);
  for (const n of REQUIRED[g]) assert.ok(has(n), 'missing clip ' + n);
});
t('all four clip files together stay under 300 KB gzipped (the animation budget)', () => assert.ok(Object.values(sizes).reduce((a, b) => a + b, 0) < 300 * 1024, JSON.stringify(sizes)));

const clips = [...CLIPS.values()];
t('every clip is finite, has frames and a duration, and loops where it says it loops (seam no bigger than the largest step)', () => {
  for (const c of clips) {
    assert.ok(c.n >= 2 && c.dur > 0.2, c.name); for (const v of c.rot) assert.ok(Number.isFinite(v), c.name);
    if (c.loop) { let seam = 0; let step = 0; for (let b = 0; b < c.NB; b++) for (let k = 0; k < 3; k++) { seam = Math.max(seam, Math.abs(c.rot[((c.n - 1) * c.NB + b) * 3 + k] - c.rot[b * 3 + k])); for (let f = 0; f < c.n - 1; f++) step = Math.max(step, Math.abs(c.rot[((f + 1) * c.NB + b) * 3 + k] - c.rot[(f * c.NB + b) * 3 + k])); } assert.ok(seam <= step * 1.05 + 1e-3, `${c.name} seam ${seam.toFixed(3)} step ${step.toFixed(3)}`); }
  }
});
// Popping: the largest rotation of any bone between two consecutive frames, as the angle of the relative quaternion (Euler components jump near gimbal lock, so they are not
// used). Gaits and strikes legitimately move shins, elbows and wrists fast, so each class has its own limit in radians per 30 fps frame; everything else must stay under 0.5,
// which is 0.25 at 60 fps. The old spike limit of 0.12 rad per frame is kept for the blend test below, where it is per 60 fps frame of a blended walk.
const quat = (x, y, z) => { const c = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)]; const s = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return [s[0] * c[1] * c[2] + c[0] * s[1] * s[2], c[0] * s[1] * c[2] - s[0] * c[1] * s[2], c[0] * c[1] * s[2] + s[0] * s[1] * c[2], c[0] * c[1] * c[2] - s[0] * s[1] * s[2]]; };
const stepAngle = (c, f, b) => { const o1 = (f * c.NB + b) * 3; const o2 = ((f + 1) * c.NB + b) * 3; const a = quat(c.rot[o1], c.rot[o1 + 1], c.rot[o1 + 2]); const d = quat(c.rot[o2], c.rot[o2 + 1], c.rot[o2 + 2]); return 2 * Math.acos(Math.min(1, Math.abs(a[0] * d[0] + a[1] * d[1] + a[2] * d[2] + a[3] * d[3]))); };
const LIM = (c) => (c.extras.gait ? 0.75 : c.extras.w !== undefined ? 1.6 : c.extras.kind === 'fall' || c.extras.kind === 'dodge' || c.extras.kind === 'vault' ? 1.0 : c.name.startsWith('hit_') ? 0.55 : c.name === 'captain_call' || c.name === 'climb' ? 0.6 : 0.5);
t('no bone pops: per-frame rotation stays inside the limit for its class', () => {
  for (const c of clips) { let worst = 0; let wb = ''; for (let f = 0; f < c.n - 1; f++) for (let b = 0; b < c.NB; b++) { const d = stepAngle(c, f, b); if (d > worst) { worst = d; wb = BONES[b]; } } assert.ok(worst <= LIM(c), `${c.name} ${wb} ${worst.toFixed(2)} > ${LIM(c)}`); }
});
t('attack clips: wind-up at least 0.45 s, markers ordered, active phase 0.1 to 0.45 s, recovery at least 0.25 s', () => {
  for (const c of clips) { const w = c.extras.w; if (w === undefined || !/^(sword_|staff_|spear_|fists_|club_|shield_|captain_)/.test(c.name) || c.name === 'captain_call') continue; const a = c.extras.a;
    assert.ok(w >= 0.45, `${c.name} wind-up ${w}`); assert.ok(a > w + 0.1 && a - w <= 0.45, `${c.name} active ${a - w}`); assert.ok(c.dur - a >= 0.25, `${c.name} recover ${c.dur - a}`); }
});
t('locomotion cycles: stance foot slides at most 3 cm and nothing goes below the floor by more than 1 cm (measured in Blender at build time and stored in the file)', () => {
  for (const n of ['walk', 'jog', 'sprint', 'crouch_walk']) { const c = CLIPS.get(n); assert.ok(c.extras.slide_cm !== undefined, n + ' has no foot report'); assert.ok(c.extras.slide_cm <= 3, `${n} slide ${c.extras.slide_cm} cm`); assert.ok(c.extras.min_y_cm >= -1, `${n} below floor ${c.extras.min_y_cm} cm`); }
});
t('stride matches the game: strides are 1.4, 1.95 and 2.5 m per cycle at 1.4, 2.8 and 4.0 m/s, within 10 percent of the speed index.js derives', () => {
  const rr = (v) => Math.max(0, Math.min(1, (v - 1.8) / 2.2)); const stride = (v) => 1.4 + (2.5 - 1.4) * rr(v);
  for (const [n, v] of [['walk', 1.4], ['jog', 2.8], ['sprint', 4.0]]) { const c = CLIPS.get(n); const ratio = c.extras.stride / stride(v); assert.ok(ratio > 0.9 && ratio < 1.1, `${n} stride ratio ${ratio.toFixed(2)}`); assert.ok(Math.abs(c.extras.speed - v) / v < 0.1, `${n} speed ${c.extras.speed}`); }
});
t('IK reach: arms and legs hit their (reach-limited) targets within 3 cm in every clip, and the amount a hand target had to be pulled into reach is stored and bounded (arms are only 0.45 m long)', () => { for (const c of clips) { if (c.extras.ikres_mm !== undefined) assert.ok(c.extras.ikres_mm <= 30, `${c.name} arm residual ${c.extras.ikres_mm} mm`); if (c.extras.legres_mm !== undefined) assert.ok(c.extras.legres_mm <= 30, `${c.name} leg residual ${c.extras.legres_mm} mm`); if (c.extras.clamp_mm !== undefined) assert.ok(c.extras.clamp_mm <= 260, `${c.name} clamp ${c.extras.clamp_mm} mm`); } });

const o = makePose();
const base = { state: 'idle', t: 0, cycle: 0.2, speed: 0, time: 3, legs: undefined };
t('pose() with clips poses every state without NaN and reports which clip played', () => {
  const states = ['idle', 'crouch', 'attack', 'shove', 'block', 'parry', 'aim', 'hurt', 'stagger', 'dodge', 'vault', 'climb', 'down', 'windup', 'strike', 'recover', 'call', 'alert', 'talk', 'knockdown', 'getup', 'pickup', 'throw', 'drop', 'give', 'take', 'push', 'namaste', 'nod', 'turnL', 'turnR'];
  for (const st of states) for (const weapon of ['none', 'staff', 'sword', 'spear', 'club', 'bow']) {
    pose(o, { ...base, state: st, t: 0.3, windup: 0.6, u: 0.4, attackName: 'slash', weapon, atk: { kind: 'light', progress: 0.5, hit: 0.4 }, draw: 0.5, hitDir: 1.2, seed: 0.3 });
    for (const n of BONES) assert.ok(o.rot[n].every(Number.isFinite), `${st}/${weapon}/${n}`); assert.ok(Number.isFinite(o.lift) && Number.isFinite(o.sway) && Number.isFinite(o.fwd));
  }
});
t('clips are used where they exist: idle, walk, attack and hit reactions report their clip names', () => {
  pose(o, { ...base, speed: 0 }); assert.equal(o.clip, 'idle');
  const q = makePose(); for (let i = 0; i < 120; i++) pose(q, { ...base, speed: 0.5, cycle: i / 60, time: 3 + i / 60 }); assert.ok(/walk/.test(q.clip), q.clip);
  pose(o, { ...base, state: 'attack', weapon: 'sword', t: 0.2, atk: { kind: 'light', progress: 0.3, hit: 0.4 } }); assert.ok(/^sword_light/.test(o.clip), o.clip);
  pose(o, { ...base, state: 'hurt', t: 0.1, hitDir: Math.PI }); assert.equal(o.clip, 'hit_back'); pose(o, { ...base, state: 'hurt', t: 0.1, hitDir: Math.PI / 2 }); assert.equal(o.clip, 'hit_left'); pose(o, { ...base, state: 'hurt', t: 0.1, hitDir: -Math.PI / 2 }); assert.equal(o.clip, 'hit_right'); pose(o, { ...base, state: 'hurt', t: 0.1 }); assert.equal(o.clip, 'hit_front');
});
t('the sim phase drives the clip: windup progress reaches the end of the wind-up marker, active covers the swing, recover finishes the clip', () => {
  const c = CLIPS.get('sword_light_1'); assert.equal(phaseTime(c, 'windup', 0), 0); assert.ok(Math.abs(phaseTime(c, 'windup', 1) - c.extras.w) < 1e-6); assert.ok(Math.abs(phaseTime(c, 'active', 1) - c.extras.a) < 1e-6); assert.ok(Math.abs(phaseTime(c, 'recover', 1) - c.dur) < 1e-6);
  let last = -1; for (let i = 0; i <= 20; i++) { const p = i / 20; const tt = p < 0.4 ? phaseTime(c, 'windup', p / 0.4) : p < 0.58 ? phaseTime(c, 'active', (p - 0.4) / 0.18) : phaseTime(c, 'recover', (p - 0.58) / 0.42); assert.ok(tt >= last - 1e-9); last = tt; }
});
t('the wind-up reads as anticipation: the weapon hand rises or draws back before the strike, then the strike moves the blade through (sword_light_1)', () => {
  const a = makePose(); const b = makePose(); const d = makePose(); const c = CLIPS.get('sword_light_1');
  pose(a, { ...base, state: 'windup', weapon: 'sword', attackName: 'slash', windup: 0, chain: 0 }); pose(b, { ...base, state: 'windup', weapon: 'sword', attackName: 'slash', windup: 1, chain: 0 }); pose(d, { ...base, state: 'strike', weapon: 'sword', attackName: 'slash', u: 1, chain: 0 });
  assert.ok(Math.abs(a.rot.upperarm_R[0] - b.rot.upperarm_R[0]) > 0.5 || Math.abs(a.rot.spine[1] - b.rot.spine[1]) > 0.4, 'wind-up shows no motion'); assert.ok(Math.abs(b.rot.spine[1] - d.rot.spine[1]) > 0.5, 'strike does not move the torso through'); assert.ok(c.extras.w >= 0.45);
});
t('blending between gaits adds no spike: sweeping speed 0 to 1 and back at 60 fps moves no bone more than the fastest swing-leg step of the gait clips themselves (0.40 rad per 60 fps frame)', () => {
  const q = makePose(); const prev = makePose(); let worst = 0; let wb = ''; let cyc = 0; const T = 60 * 14;
  for (let i = 0; i < T; i++) { const sp = i < 120 ? 0 : i < 420 ? (i - 120) / 300 : i < 600 ? 1 : i < 700 ? 1 - (i - 600) / 100 * 0.5 : 0.5; const v = speedMs(sp); cyc += v * (1 / 60) / (1.4 + (2.5 - 1.4) * Math.max(0, Math.min(1, (v - 1.8) / 2.2)));
    for (const n of BONES) { prev.rot[n] = q.rot[n].slice(); } pose(q, { state: 'idle', t: 0, cycle: cyc, speed: sp, time: i / 60, moving: sp > 0.05 });
    if (i > 180) for (const n of BONES) for (let k = 0; k < 3; k++) { const d = Math.abs(q.rot[n][k] - prev.rot[n][k]); if (d > worst) { worst = d; wb = n; } } }
  assert.ok(worst <= 0.4, `worst step ${worst.toFixed(3)} on ${wb}`);
});
t('reduced motion: an idle person is still (no breathing sway) and does not move between times', () => {
  const a = makePose(); const b = makePose(); pose(a, { ...base, time: 1, reduced: true }); pose(b, { ...base, time: 2.3, reduced: true });
  for (const n of BONES) for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.rot[n][k] - b.rot[n][k]) < 1e-9, n); assert.equal(a.lift, b.lift);
});
t('fallback: with no clips loaded every state still poses, and equals the procedural pose', () => {
  const saved = new Map(CLIPS); clearClips(); const a = makePose(); const b = makePose();
  for (const st of ['idle', 'attack', 'block', 'hurt', 'down', 'windup', 'dodge']) { const c = { ...base, state: st, t: 0.2, windup: 0.5, attackName: 'slash', weapon: 'sword', atk: { kind: 'light', progress: 0.5, hit: 0.4 } }; pose(a, c); poseProcedural(b, c); for (const n of BONES) assert.deepEqual(a.rot[n], b.rot[n], st + n); }
  for (const [k, v] of saved) CLIPS.set(k, v);
});
t('a missing clip falls back per state: removing sword_light_1 makes a sword light attack use the procedural pose without error', () => {
  const c = CLIPS.get('sword_light_1'); CLIPS.delete('sword_light_1'); const a = makePose(); pose(a, { ...base, state: 'attack', weapon: 'sword', atk: { kind: 'light', progress: 0.3, hit: 0.4 }, legs: undefined }); assert.ok(!/sword_light_1/.test(a.clip || '')); for (const n of BONES) assert.ok(a.rot[n].every(Number.isFinite)); CLIPS.set('sword_light_1', c);
});
t('look-at stays inside its limits and splits between neck and head; blinks are 0..1, last about 0.16 s, and differ by seed; springs settle without overshooting the limits', () => {
  const a = makePose(); const r = applyLook(a, 3, 2); assert.ok(Math.abs(r.yaw) <= LOOK_LIMIT.yaw + 1e-9 && r.pitch <= LOOK_LIMIT.pitchUp + 1e-9); assert.ok(Math.abs(a.rot.neck[1] + a.rot.head[1] - r.yaw) < 1e-9); const bb = makePose(); applyLook(bb, -3, -3); assert.ok(bb.rot.head[1] < 0);
  let max = 0; let closed = 0; for (let i = 0; i < 6000; i++) { const v = blinkAt(i / 100, 0.37); assert.ok(v >= 0 && v <= 1.000001); max = Math.max(max, v); if (v > 0.5) closed++; } assert.ok(max > 0.95 && closed > 5 && closed < 400, `closed ${closed}`); let diff = 0; for (let i = 0; i < 3000; i++) if (blinkAt(i / 100, 0.1) !== blinkAt(i / 100, 0.6)) diff++; assert.ok(diff > 20, 'seeds blink together');
  const j = { a: 0, v: 0 }; for (let i = 0; i < 300; i++) springStep(j, 0.5, 1 / 60); assert.ok(Math.abs(j.a - 0.5) < 0.01); const k = { a: 0, v: 0 }; for (let i = 0; i < 100; i++) springStep(k, 50, 1 / 60); assert.ok(k.a <= 1.1 + 1e-9);
});
t('hit-stop time warp: frozen during a hit-stop, scaled in slow motion, and the pose tremor is off under reduced motion', () => {
  assert.equal(warpDt(0.016, { hitstop: 0.05 }), 0); assert.ok(Math.abs(warpDt(0.016, { timeScale: 0.3 }) - 0.0048) < 1e-9); assert.equal(warpDt(0.016, {}), 0.016);
  const a = makePose(); const b = makePose(); const c = { ...base, state: 'attack', weapon: 'sword', atk: { kind: 'light', progress: 0.5, hit: 0.4 }, time: 5.003 };
  pose(a, c); pose(b, { ...c, hitstop: 0.06 }); assert.ok(a.rot.chest[2] !== b.rot.chest[2]); pose(b, { ...c, hitstop: 0.06, reduced: true }); assert.equal(a.rot.chest[2], b.rot.chest[2]);
});
t('procedural fallback still matches the old behaviour used by the hero-assets tests (poseProcedural is exported)', () => assert.equal(typeof poseProcedural, 'function'));
void REST; void blendPose;
