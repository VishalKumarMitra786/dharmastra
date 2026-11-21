// 2D canvas renderer implementing the interface in renderer.js. Shapes and numbers carry meaning, not colour alone.
import { enemyIcon, vaultHop, burstSpec, burstColor, MAX_PARTICLES } from './camera.js';
const C = {
  ground: '#d9c496', wall: '#3e2418', hatch: '#c98a52', outline: '#140b07', light: '#fff4de',
  chariot: '#ffc457', guard: '#8e1b1b', raider: '#2f5a3a', raiderEdge: '#ff9a2a', lowwall: '#8a7a5e', beam: '#5a3a1c', grass: '#3f8438', staff: '#8a5a2a', gold: '#ffc247', icon: '#ffd23a', cpNext: '#0b5f6b', cpDone: '#1d6b2e', cpLater: '#5a4630',
};
const VIEW_UNITS = 560; // world units visible along the shorter screen side

export function createRenderer2D(canvas) {
  const ctx = canvas.getContext('2d');
  let world = null;
  let size = { w: 300, h: 150 };
  let hatch = null;
  let look = null; // chosen traveller's appearance from characters.js, or null for the default colours

  function makeHatch() {
    const p = document.createElement('canvas');
    p.width = p.height = 14;
    const g = p.getContext('2d');
    g.fillStyle = C.wall; g.fillRect(0, 0, 14, 14);
    g.strokeStyle = C.hatch; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 14); g.lineTo(14, 0); g.moveTo(-7, 7); g.lineTo(7, -7); g.moveTo(7, 21); g.lineTo(21, 7); g.stroke();
    return ctx.createPattern(p, 'repeat');
  }

  function drawWalls() {
    ctx.fillStyle = hatch || C.wall;
    ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
    for (const w of world.walls) { ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeRect(w.x, w.y, w.w, w.h); }
  }

  function drawCheckpoint(p, i, time, reduced) {
    const fill = p.state === 'next' ? C.cpNext : p.state === 'done' ? C.cpDone : C.cpLater;
    const pulse = p.state === 'next' && !reduced ? 1 + Math.sin(time * 4) * 0.06 : 1;
    const r = p.radius * 0.8 * pulse;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = p.state === 'next' ? 7 : 4; ctx.strokeStyle = C.light;
    ctx.setLineDash(p.state === 'later' ? [10, 8] : []); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.light; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.state === 'done' ? '✓' : String(i + 1), 0, 2);
    ctx.restore();
  }

  function drawGuard(g) {
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.angle);
    ctx.fillStyle = C.guard; ctx.strokeStyle = C.light; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, g.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(g.radius * 0.9, 0); ctx.lineTo(-g.radius * 0.2, -g.radius * 0.6); ctx.lineTo(-g.radius * 0.2, g.radius * 0.6); ctx.closePath();
    ctx.fillStyle = C.light; ctx.fill(); // pointed marker: guards read as "armed, facing this way"
    ctx.restore();
  }

  function drawChariot(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    const r = c.radius;
    ctx.fillStyle = C.outline; ctx.fillRect(-r * 0.6, -r * 1.15, r * 1.2, r * 0.35); ctx.fillRect(-r * 0.6, r * 0.8, r * 1.2, r * 0.35); // wheels
    ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(-r, r * 0.8); ctx.closePath();
    ctx.fillStyle = C.chariot; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = C.outline; ctx.stroke();
    if (c.invulnerable) { ctx.setLineDash([6, 6]); ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  // A person seen from above: shoulders in the outfit colour, scarf in the accent colour, skin, hair in the chosen style and a pointer for the way they face.
  function drawPerson(c) {
    const L = look;
    const col = { top: L?.outfitColor || C.chariot, scarf: L?.accent || '#e8432e', skin: L?.skin || '#c68a5a', hair: L?.hair || null };
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    const r = c.radius;
    ctx.fillStyle = col.top; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r * 1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col.scarf; ctx.fillRect(-r * 1.3, -r * 0.25, r * 0.9, r * 0.5); // scarf
    if (col.hair && L.hairStyle === 'long') { ctx.fillStyle = col.hair; ctx.beginPath(); ctx.ellipse(-r * 0.45, 0, r * 0.75, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (col.hair && L.hairStyle === 'braid') { ctx.strokeStyle = col.hair; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.2, 0); ctx.lineTo(-r * 1.5, r * 0.15); ctx.stroke(); ctx.lineCap = 'butt'; ctx.strokeStyle = C.outline; ctx.lineWidth = 4; }
    ctx.fillStyle = col.skin; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (col.hair) { // hair seen from above covers the back of the head; the face stays toward the facing direction
      ctx.fillStyle = col.hair; ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.46, Math.PI * 0.5, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      if (L.hairStyle === 'bun') { ctx.beginPath(); ctx.arc(-r * 0.15, 0, r * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.9, -r * 0.35); ctx.lineTo(r * 0.9, r * 0.35); ctx.closePath(); ctx.fill();
    if (c.invulnerable) { ctx.setLineDash([6, 6]); ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  function drawArrow(frame, scale) {
    const next = frame.checkpoints.find((p) => p.state === 'next');
    if (!next) return;
    const a = Math.atan2(next.y - frame.chariot.y, next.x - frame.chariot.x);
    ctx.save(); ctx.translate(size.w / 2, size.h / 2); ctx.rotate(a);
    const d = 62 * Math.max(1, scale);
    ctx.beginPath(); ctx.moveTo(d + 16, 0); ctx.lineTo(d - 8, -11); ctx.lineTo(d - 8, 11); ctx.closePath();
    ctx.fillStyle = C.cpNext; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = C.light; ctx.stroke();
    ctx.restore();
  }


  // ---- Phase 1 extras (kept in step with renderer3d.js): obstacles, pickups, raiders with state icons, staff, swing arc, bursts ----
  const px = new Float32Array(MAX_PARTICLES); const py = new Float32Array(MAX_PARTICLES);
  const pvx = new Float32Array(MAX_PARTICLES); const pvy = new Float32Array(MAX_PARTICLES);
  const plife = new Float32Array(MAX_PARTICLES); const pmax = new Float32Array(MAX_PARTICLES);
  const pcol = new Array(MAX_PARTICLES).fill('#fff0b0');
  let pnext = 0; let lastEvents = null; let lastT = 0;
  const flashes = new Map(); // enemy id -> remaining flash seconds (small, bounded by enemy count)

  function drawObstacle(o) {
    const k = o.kind;
    if (k === 'grass') {
      ctx.fillStyle = 'rgba(58,106,48,0.55)'; ctx.fillRect(o.x, o.y, o.w, o.d);
      ctx.strokeStyle = C.grass; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i < 9; i++) { const bx = o.x + ((i * 37) % 100) / 100 * (o.w - 8) + 4; const by = o.y + ((i * 59) % 100) / 100 * (o.d - 8) + 4; ctx.moveTo(bx - 4, by + 6); ctx.lineTo(bx, by - 8); ctx.lineTo(bx + 4, by + 6); }
      ctx.stroke();
    } else if (k === 'lowwall') {
      ctx.fillStyle = C.lowwall; ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.d - 2);
      ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.d - 2);
      ctx.strokeStyle = C.light; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(o.x + 6, o.y + 6, o.w - 12, o.d - 12); ctx.setLineDash([]);
    } else if (k === 'beam') {
      const ax = o.w >= o.d; ctx.fillStyle = C.beam; ctx.strokeStyle = C.outline; ctx.lineWidth = 3;
      const bx = ax ? o.x : o.x + o.w / 2 - 5; const by = ax ? o.y + o.d / 2 - 5 : o.y; const bw = ax ? o.w : 10; const bh = ax ? 10 : o.d;
      ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = C.outline; // posts at both ends
      ctx.fillRect(ax ? o.x : bx - 3, ax ? by - 3 : o.y, 16, 16); ctx.fillRect(ax ? o.x + o.w - 16 : bx - 3, ax ? by - 3 : o.y + o.d - 16, 16, 16);
    } else if (k === 'ledge') { // a tall stone ledge marked for climbing: a gold rope line and upward chevrons (shape, not colour, says "climb here")
      ctx.fillStyle = '#6f6a62'; ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.d - 2);
      ctx.strokeStyle = C.outline; ctx.lineWidth = 4; ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.d - 2);
      ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(o.x + 8, o.y + o.d / 2); ctx.lineTo(o.x + o.w - 8, o.y + o.d / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.light; ctx.lineWidth = 4; ctx.beginPath();
      for (let cx = o.x + 20; cx < o.x + o.w - 10; cx += 36) { ctx.moveTo(cx - 9, o.y + o.d * 0.3 + 8); ctx.lineTo(cx, o.y + o.d * 0.3 - 4); ctx.lineTo(cx + 9, o.y + o.d * 0.3 + 8); }
      ctx.stroke();
    } else if (k === 'pit') { // a ditch: dark, with a dashed edge and diagonal hatching so it reads as "do not step" without colour
      ctx.fillStyle = '#0e0a14'; ctx.fillRect(o.x, o.y, o.w, o.d);
      ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.d); ctx.clip();
      ctx.strokeStyle = 'rgba(255,244,222,0.35)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let d = -o.d; d < o.w; d += 14) { ctx.moveTo(o.x + d, o.y + o.d); ctx.lineTo(o.x + d + o.d, o.y); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.d - 4); ctx.setLineDash([]);
    }
  }

  // A straw training post seen from above: rings you can count (shape), thicker when just hit.
  function drawTarget(t, calm) {
    ctx.save(); ctx.translate(t.x, t.y);
    const f = calm ? 0 : t.flash || 0;
    ctx.fillStyle = C.light; ctx.strokeStyle = C.outline; ctx.lineWidth = 3 + 3 * f;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a3a2a'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawSwordShape(len) { ctx.strokeStyle = '#d8dde4'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(len, 0); ctx.stroke(); ctx.strokeStyle = C.outline; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = C.gold; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); ctx.lineCap = 'butt'; }
  function drawBowShape(draw) { ctx.strokeStyle = C.staff; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(-6, 0, 18, -1.15, 1.15); ctx.stroke(); const bx = -6 + Math.cos(1.15) * 18; const by = Math.sin(1.15) * 18; ctx.strokeStyle = C.light; ctx.lineWidth = 2; const pull = -6 - 14 * draw; ctx.beginPath(); ctx.moveTo(bx, -by); ctx.lineTo(pull, 0); ctx.lineTo(bx, by); ctx.stroke(); if (draw > 0) { ctx.strokeStyle = '#d8dde4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(24, 0); ctx.stroke(); } ctx.lineCap = 'butt'; }
  function drawStaffShape(len) { ctx.strokeStyle = C.staff; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke(); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(len / 2, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.lineCap = 'butt'; }

  function drawPickup(p, t, calm) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(0, 0, 26 + (calm ? 0 : Math.sin(t * 3) * 2), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    glyph(p.kind);
    ctx.restore();
    const name = LABEL[p.kind]; // a text label under each lesson token: the meaning never depends on the symbol or the colour alone
    if (name) { ctx.save(); ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = C.outline; ctx.fillStyle = C.light; ctx.strokeText(name, p.x, p.y + 44); ctx.fillText(name, p.x, p.y + 44); ctx.restore(); }
  }
  const LABEL = { dodge: 'Dodge', push: 'Shove', climb: 'Climb', sword: 'Sword', bow: 'Bow', arrows: 'Arrows' };
  // Small symbols for the lessons, drawn at the origin, about 40 units wide.
  function glyph(kind) {
    ctx.strokeStyle = C.gold; ctx.fillStyle = C.gold; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'dodge') { ctx.beginPath(); ctx.arc(0, 0, 13, 0.5, Math.PI * 1.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, -14); ctx.lineTo(16, -4); ctx.lineTo(4, -4); ctx.closePath(); ctx.fill(); }
    else if (kind === 'push') { ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(6, -9); ctx.lineTo(16, 0); ctx.lineTo(6, 9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-16, -9); ctx.lineTo(-16, 9); ctx.stroke(); }
    else if (kind === 'climb') { ctx.beginPath(); ctx.moveTo(-8, 14); ctx.lineTo(-8, -14); ctx.moveTo(8, 14); ctx.lineTo(8, -14); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.stroke(); }
    else if (kind === 'sword') { ctx.beginPath(); ctx.moveTo(-14, 14); ctx.lineTo(12, -12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(-2, 14); ctx.stroke(); }
    else if (kind === 'bow') { ctx.beginPath(); ctx.arc(-6, 0, 16, -1.2, 1.2); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6 + Math.cos(-1.2) * 16, Math.sin(-1.2) * 16); ctx.lineTo(-6 + Math.cos(1.2) * 16, Math.sin(1.2) * 16); ctx.stroke(); }
    else if (kind === 'arrows') { ctx.lineWidth = 3; ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(-12 + i * 5, 12); ctx.lineTo(10 + i * 5, -12); } ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, -16); ctx.lineTo(16, -6); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill(); }
    else { ctx.rotate(-0.7); drawStaffShape(38); }
    ctx.lineCap = 'butt';
  }

  function drawIcon(kind, x, y) {
    ctx.save(); ctx.translate(x, y - 34); ctx.lineJoin = 'round';
    ctx.fillStyle = C.icon; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
    if (kind === 'bang') { ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(5, -24); ctx.lineTo(3, -8); ctx.lineTo(-3, -8); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fill(); }
    else if (kind === 'question') { ctx.lineWidth = 9; ctx.strokeStyle = C.outline; ctx.beginPath(); ctx.arc(0, -17, 8, Math.PI * 1.1, Math.PI * 2.4); ctx.lineTo(0, -6); ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = C.icon; ctx.stroke(); ctx.fillStyle = C.icon; ctx.beginPath(); ctx.arc(0, -1, 4, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = C.outline; ctx.stroke(); ctx.fill(); }
    else if (kind === 'shield') { ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(10, -26); ctx.lineTo(10, -14); ctx.lineTo(0, -1); ctx.lineTo(-10, -14); ctx.closePath(); ctx.stroke(); ctx.fillStyle = 'rgba(255,210,58,0.35)'; ctx.fill(); ctx.strokeStyle = C.icon; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }

  // A raider is a square-shouldered body with a club, so it differs from the round guard by shape as well as colour.
  function drawRaider(e, flash) {
    const st = e.state || 'patrol'; const r = 17;
    if (st === 'windup') { // the telegraph: a wedge in front fills up as the blow gets closer, and is full when it lands (shape and fill level, not colour)
      const u = Math.max(0, Math.min(1, e.windup || 0));
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle || 0);
      ctx.fillStyle = `rgba(255,154,42,${0.12 + 0.4 * u})`; ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 50, -0.7, 0.7); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 14 + 36 * u, -0.7, 0.7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (e.kind === 'sparrer') { // the teacher's sparring partner: round, with a dashed ring and a thin practice stick
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle || 0);
      ctx.fillStyle = flash > 0 ? '#ffffff' : '#7a5a8a'; ctx.strokeStyle = C.light; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.rotate(st === 'windup' ? -1.9 : st === 'stagger' ? 1.6 : -0.6); ctx.strokeStyle = C.staff; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(32, 0); ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(r + 10, 0); ctx.lineTo(r, -7); ctx.lineTo(r, 7); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle || 0);
    ctx.fillStyle = flash > 0 ? '#ffffff' : C.raider; ctx.strokeStyle = C.raiderEdge; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.rect(-r, -r, r * 2, r * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.outline; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); ctx.stroke();
    ctx.save(); ctx.rotate(st === 'windup' ? -1.9 : st === 'stagger' ? 1.6 : -0.6); ctx.strokeStyle = C.staff; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(34, 0); ctx.stroke(); ctx.restore(); // club
    ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(r + 10, 0); ctx.lineTo(r, -7); ctx.lineTo(r, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function burst(spec, x, y, color, calm) {
    for (let k = 0; k < spec.n; k++) {
      const i = pnext; pnext = (pnext + 1) % MAX_PARTICLES;
      const a = ((k * 2.399 + x * 0.013 + y * 0.007) % (Math.PI * 2)); const sp = (60 + (k % 3) * 25) * spec.speed;
      px[i] = x; py[i] = y; pvx[i] = Math.cos(a) * sp; pvy[i] = Math.sin(a) * sp; plife[i] = pmax[i] = spec.life; pcol[i] = '#' + color.toString(16).padStart(6, '0');
    }
  }

  function drawParticles(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (plife[i] <= 0) continue;
      plife[i] -= dt; if (plife[i] <= 0) continue;
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
      const u = plife[i] / pmax[i];
      ctx.globalAlpha = u; ctx.fillStyle = pcol[i]; ctx.beginPath(); ctx.arc(px[i], py[i], 2 + 4 * u, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function processEvents(frame, calm) {
    if (frame === lastEvents) return; lastEvents = frame;
    const ev = frame.events; if (!ev || !ev.length) return;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]; if (!e) continue; const spec = burstSpec(e.type, calm); if (!spec) continue;
      burst(spec, e.x || 0, e.y || 0, burstColor(spec, frame.blood), calm);
      if ((e.type === 'hit-enemy' || e.type === 'enemy-down') && frame.enemies) {
        let best = null; let bd = 3600;
        for (let k = 0; k < frame.enemies.length; k++) { const en = frame.enemies[k]; const d = (en.x - e.x) ** 2 + (en.y - e.y) ** 2; if (d < bd) { bd = d; best = en; } }
        if (best) flashes.set(best.id, 0.12);
      }
    }
  }

  return {
    resize(w, h, dpr = 1) {
      size = { w, h };
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    setCharacter(l) { look = l || null; },
    setWorld(w) { world = w; hatch = makeHatch(); },
    render(frame) {
      if (!world) return;
      const scale = Math.max(0.45, Math.min(size.w, size.h) / VIEW_UNITS);
      const shake = frame.reducedMotion ? 0 : frame.effects.shake * 8;
      const sx = (Math.random() - 0.5) * shake; const sy = (Math.random() - 0.5) * shake;
      ctx.save();
      ctx.fillStyle = C.outline; ctx.fillRect(0, 0, size.w, size.h);
      ctx.translate(size.w / 2 + sx, size.h / 2 + sy);
      ctx.scale(scale, scale);
      ctx.translate(-frame.chariot.x, -frame.chariot.y);
      ctx.fillStyle = C.ground; ctx.fillRect(0, 0, world.width, world.height);
      drawWalls();
      const calm = !!frame.reducedMotion;
      const nowS = performance.now() / 1000; const dt = lastT ? Math.min(0.1, nowS - lastT) : 0; lastT = nowS;
      if (frame.obstacles) for (let i = 0; i < frame.obstacles.length; i++) drawObstacle(frame.obstacles[i]);
      frame.checkpoints.forEach((p, i) => drawCheckpoint(p, i, frame.time, calm));
      if (frame.pickups) for (let i = 0; i < frame.pickups.length; i++) if (!frame.pickups[i].taken) drawPickup(frame.pickups[i], frame.time, calm);
      frame.guards.forEach(drawGuard);
      if (frame.targets) for (let i = 0; i < frame.targets.length; i++) drawTarget(frame.targets[i], calm);
      processEvents(frame, calm);
      if (frame.enemies) {
        for (let i = 0; i < frame.enemies.length; i++) {
          const e = frame.enemies[i]; if (e.state === 'down') continue;
          const fl = flashes.get(e.id) || 0; if (fl > 0) flashes.set(e.id, fl - dt);
          drawRaider(e, calm ? 0 : fl);
        }
      }
      const P = frame.player; const A = frame.attack; const pc = frame.chariot;
      if (A && A.active) { // swing arc: a wedge whose size is the weapon's reach, fading as the swing ends. A heavy cut shows an outline first (its wind-up), then fills at the moment of impact.
        const kind = A.kind || 'staff'; const half = kind === 'staff' ? Math.PI / 3 : kind === 'shove' ? 0.9 : 0.95; const reach = A.range || 60;
        const charging = kind === 'heavy' && (A.progress || 0) < (A.hit || 0.575);
        ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(A.angle || 0);
        ctx.globalAlpha = charging ? 0.9 : calm ? 0.55 : 0.75 * (1 - Math.min(1, A.progress || 0) * 0.8);
        ctx.fillStyle = kind === 'shove' ? 'rgba(255,244,222,0.3)' : '#ff9d1a'; ctx.strokeStyle = kind === 'shove' ? C.light : C.outline; ctx.lineWidth = 3;
        if (kind === 'shove' || charging) ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, -half, half); ctx.closePath(); if (!charging) ctx.fill(); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
      if (frame.mode === 'foot') {
        const crouch = !!P && (P.crouch || P.state === 'crouch'); const vaulting = !!P && P.state === 'vault';
        ctx.save();
        if (vaulting) { const h = vaultHop(P.stateT, calm); ctx.fillStyle = 'rgba(20,11,7,0.3)'; ctx.beginPath(); ctx.ellipse(pc.x, pc.y + 4, pc.radius, pc.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.translate(pc.x, pc.y - h * 0.5); ctx.scale(1 + h / 80, 1 + h / 80); ctx.translate(-pc.x, -pc.y); }
        else if (crouch) { ctx.translate(pc.x, pc.y); ctx.scale(0.72, 0.72); ctx.translate(-pc.x, -pc.y); }
        const rolling = !!P && P.state === 'dodge';
        if (rolling) { // a roll: the figure squashes and leaves fading afterimages behind (no afterimages with reduced motion)
          if (!calm) for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.12 * (4 - k); ctx.fillStyle = C.light; ctx.beginPath(); ctx.arc(pc.x - Math.cos(pc.angle || 0) * k * 14, pc.y - Math.sin(pc.angle || 0) * k * 14, pc.radius * 0.8, 0, Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha = 1; ctx.translate(pc.x, pc.y); ctx.rotate(pc.angle || 0); ctx.scale(1.15, 0.7); ctx.rotate(-(pc.angle || 0)); ctx.translate(-pc.x, -pc.y);
        }
        drawPerson(pc);
        const wa = (pc.angle || 0);
        if (P && P.weapon === 'staff') { ctx.translate(pc.x, pc.y); ctx.rotate(wa + (A && A.active ? -1 + 2 * (A.progress || 0) : 0.5)); ctx.translate(pc.radius * 0.6, 0); drawStaffShape(48); }
        else if (P && P.weapon === 'sword') {
          ctx.translate(pc.x, pc.y);
          const swing = A && A.active && A.kind !== 'shove';
          const raise = A && A.kind === 'heavy' && (A.progress || 0) < (A.hit || 0.575) ? -1.6 : -1 + 2 * (A ? A.progress || 0 : 0);
          ctx.rotate(wa + (P.state === 'block' ? Math.PI / 2 : swing ? raise : 0.5)); ctx.translate(pc.radius * 0.6, 0); drawSwordShape(P.state === 'block' ? 30 : 40);
        } else if (P && P.weapon === 'bow') { ctx.translate(pc.x, pc.y); ctx.rotate(P.state === 'aim' ? P.aimAngle || wa : wa + 0.4); ctx.translate(pc.radius * 0.7, 0); drawBowShape(P.state === 'aim' ? P.draw || 0 : 0); }
        ctx.restore();
        if (P && P.state === 'block') { ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(wa); ctx.strokeStyle = C.outline; ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(0, 0, pc.radius + 14, -1.0, 1.0); ctx.stroke(); ctx.strokeStyle = C.light; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, pc.radius + 14, -1.0, 1.0); ctx.stroke(); ctx.restore(); } // a guard arc in front
        if (P && P.state === 'aim') { // aim line (dashed) and a draw ring that closes as the bow comes to full draw
          const aa = P.aimAngle || wa; const d = Math.max(0, Math.min(1, P.draw || 0));
          ctx.save(); ctx.translate(pc.x, pc.y); ctx.strokeStyle = C.light; ctx.lineWidth = 2.5; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(Math.cos(aa) * 28, Math.sin(aa) * 28); ctx.lineTo(Math.cos(aa) * 220, Math.sin(aa) * 220); ctx.stroke(); ctx.setLineDash([]);
          ctx.lineWidth = 5; ctx.strokeStyle = C.outline; ctx.beginPath(); ctx.arc(0, 0, pc.radius + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d); ctx.stroke(); ctx.strokeStyle = d >= 0.999 ? C.gold : C.light; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
        }
        if (crouch) { ctx.save(); ctx.strokeStyle = C.light; ctx.lineWidth = 3; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(pc.x, pc.y, pc.radius * 1.4, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } // dotted ring: a second cue that you are crouched
      } else drawChariot(pc);
      if (frame.enemies) for (let i = 0; i < frame.enemies.length; i++) { const e = frame.enemies[i]; const k = enemyIcon(e.state); if (k) drawIcon(k, e.x, e.y); }
      if (frame.arrows) for (let i = 0; i < frame.arrows.length; i++) { const a = frame.arrows[i]; ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.angle || 0); ctx.strokeStyle = C.outline; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(8, 0); ctx.stroke(); ctx.strokeStyle = C.light; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = C.light; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(6, -4); ctx.lineTo(6, 4); ctx.closePath(); ctx.fill(); ctx.restore(); }
      drawParticles(dt);
      ctx.restore();
      drawArrow(frame, scale);
      if (frame.effects.flash > 0 && !frame.reducedMotion) {
        ctx.strokeStyle = C.guard; ctx.lineWidth = 14 * frame.effects.flash; ctx.strokeRect(0, 0, size.w, size.h);
      }
    },
  };
}
