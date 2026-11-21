// 2D canvas renderer implementing the interface in renderer.js. Shapes and numbers carry meaning, not colour alone.
const C = {
  ground: '#d9c496', wall: '#3e2418', hatch: '#c98a52', outline: '#140b07', light: '#fff4de',
  chariot: '#ffc457', guard: '#8e1b1b', cpNext: '#0b5f6b', cpDone: '#1d6b2e', cpLater: '#5a4630',
};
const VIEW_UNITS = 560; // world units visible along the shorter screen side

export function createRenderer2D(canvas) {
  const ctx = canvas.getContext('2d');
  let world = null;
  let size = { w: 300, h: 150 };
  let hatch = null;

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

  // A person seen from above: shoulders, head, scarf and a pointer for the way they face.
  function drawPerson(c) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    const r = c.radius;
    ctx.fillStyle = C.chariot; ctx.strokeStyle = C.outline; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r * 1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8432e'; ctx.fillRect(-r * 1.3, -r * 0.25, r * 0.9, r * 0.5); // scarf
    ctx.fillStyle = '#c68a5a'; ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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

  return {
    resize(w, h, dpr = 1) {
      size = { w, h };
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
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
      frame.checkpoints.forEach((p, i) => drawCheckpoint(p, i, frame.time, frame.reducedMotion));
      frame.guards.forEach(drawGuard);
      if (frame.mode === 'foot') drawPerson(frame.chariot); else drawChariot(frame.chariot);
      ctx.restore();
      drawArrow(frame, scale);
      if (frame.effects.flash > 0 && !frame.reducedMotion) {
        ctx.strokeStyle = C.guard; ctx.lineWidth = 14 * frame.effects.flash; ctx.strokeRect(0, 0, size.w, size.h);
      }
    },
  };
}
