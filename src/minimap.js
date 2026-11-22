// Minimap: the whole city on a small canvas, drawn from the same snapshot as the main view. Decoration only: the next checkpoint
// direction is also given as text in the HUD, so nothing depends on seeing this.
export function createMinimap(canvas, world) {
  if (!canvas) return { draw() {} };
  const ctx = canvas.getContext('2d');
  const W = canvas.width; const H = canvas.height; const pad = 8;
  const k = Math.min((W - pad * 2) / world.width, (H - pad * 2) / world.height);
  const ox = (W - world.width * k) / 2; const oy = (H - world.height * k) / 2;
  const X = (x) => ox + x * k; const Y = (y) => oy + y * k;
  return {
    draw(frame) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255, 220, 160, 0.22)'; ctx.fillRect(X(0), Y(0), world.width * k, world.height * k);
      ctx.fillStyle = 'rgba(20, 12, 40, 0.85)';
      for (const w of world.walls) ctx.fillRect(X(w.x), Y(w.y), w.w * k, w.h * k);
      frame.checkpoints.forEach((p, i) => {
        const r = (p.state === 'next' ? 9 : 6);
        ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = p.state === 'done' ? '#57e07a' : p.state === 'next' ? '#28e0d0' : 'rgba(217,196,143,0.8)';
        ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4); ctx.restore();
        if (p.state === 'next') { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), X(p.x), Y(p.y) - 11); }
      });
      // Enemies: a round dot that is calm, a square dot when it is hunting (shape as well as colour), a hollow ring once it is down.
      for (const g of frame.enemies || []) {
        const x = X(g.x), y = Y(g.y); const hunting = g.state === 'chase' || g.state === 'windup' || g.state === 'alert' || g.aware;
        ctx.fillStyle = '#ff5a48'; ctx.strokeStyle = '#ff5a48'; ctx.lineWidth = 1.5;
        if (g.state === 'down') { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke(); }
        else if (hunting) ctx.fillRect(x - 4, y - 4, 8, 8);
        else { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
      }
      const c = frame.chariot;
      ctx.save(); ctx.translate(X(c.x), Y(c.y)); ctx.rotate(c.angle);
      ctx.fillStyle = '#ffb42e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
  };
}
