// World: parses an ASCII layout into walls, checkpoints and guard paths, and resolves circle-vs-wall collisions.
const SOLID = new Set(['#', 'o']);

export function parseLayout(layout) {
  const { tileSize: ts, rows } = layout;
  const cols = rows[0].length;
  if (rows.some((r) => r.length !== cols)) throw new Error('Layout rows must all be the same length');
  const center = (c, r) => ({ x: (c + 0.5) * ts, y: (r + 0.5) * ts });
  const solid = rows.map((row) => [...row].map((ch) => SOLID.has(ch)));
  let start = null;
  const checkpoints = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'S') start = { ...center(c, r), angle: layout.startAngle || 0 };
    if (/[1-9]/.test(ch)) checkpoints[Number(ch) - 1] = { x: (c + 1) * ts, y: (r + 1) * ts, radius: ts * 0.85 }; // digit marks the top-left tile of a 2x2 spot
  }));
  if (!start) throw new Error('Layout has no start tile (S)');
  if (checkpoints.length === 0 || checkpoints.includes(undefined)) throw new Error('Checkpoints must be numbered 1..n without gaps');
  const guards = (layout.guards || []).map((g) => ({
    speed: g.speed,
    path: g.path.map(([x, y]) => ({ x: x * ts, y: y * ts })),
  }));
  const extras = parseExtras(layout, rows, ts);
  return {
    ...extras,
    rules: layout.rules === 2 ? 2 : 1, objectiveDefs: Array.isArray(layout.objectives) ? layout.objectives : null,
    tileSize: ts, cols, rows: rows.length, width: cols * ts, height: rows.length * ts,
    solid, walls: mergeWalls(solid, ts), start, checkpoints, guards, timeLimit: layout.timeLimit,
    mode: layout.mode || 'chariot', theme: layout.theme || 'default', rowsText: rows,
  };
}

// Rules-2 tiles: = low wall, ~ low beam, , tall grass (obstacles), k pickup spot, a enemy spawn.
// They are never merged into `walls`; the sim decides when an obstacle is solid.
const OBSTACLE_KINDS = { '=': 'lowwall', '~': 'beam', ',': 'grass' };
const DEFAULT_ENTITIES = { k: { kind: 'staff' }, a: { kind: 'raider', hp: 3 } };
const safeKind = (v, d) => (typeof v === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(v) ? v : d);

function parseExtras(layout, rows, ts) {
  const obstacles = []; const pickups = []; const spawns = [];
  const ent = layout.entities || {};
  const count = { k: 0, a: 0 };
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const kind = OBSTACLE_KINDS[ch];
      if (kind) { // merge a horizontal run of the same kind into one rectangle
        const c0 = c;
        while (c + 1 < row.length && row[c + 1] === ch) c++;
        obstacles.push({ x: c0 * ts, y: r * ts, w: (c - c0 + 1) * ts, d: ts, kind });
      } else if (ch === 'k' || ch === 'a') {
        const n = ++count[ch];
        const def = { ...DEFAULT_ENTITIES[ch], ...(ent[ch] || {}) };
        const pos = { x: (c + 0.5) * ts, y: (r + 0.5) * ts };
        if (ch === 'k') pickups.push({ ...pos, id: `k${n}`, kind: safeKind(def.kind, 'staff') });
        else {
          const hp = Number.isFinite(def.hp) ? Math.max(1, Math.min(20, Math.floor(def.hp))) : 3;
          const patrol = Array.isArray(def.patrol) ? def.patrol.filter((q) => Array.isArray(q) && q.every(Number.isFinite)).map(([x, y]) => ({ x: x * ts, y: y * ts })) : [];
          spawns.push({ ...pos, id: `a${n}`, kind: safeKind(def.kind, 'raider'), hp, angle: Number.isFinite(def.angle) ? def.angle : 0, patrol });
        }
      }
    }
  });
  return { obstacles, pickups, spawns };
}

// Merge solid tiles into few rectangles: horizontal runs first, then stack identical runs vertically.
// Fewer, larger rectangles avoid false "corner" collisions where tiles meet.
function mergeWalls(solid, ts) {
  const open = new Map();
  const done = [];
  solid.forEach((row, r) => {
    const runs = [];
    for (let c = 0; c < row.length; c++) {
      if (!row[c]) continue;
      const c0 = c;
      while (c + 1 < row.length && row[c + 1]) c++;
      runs.push([c0, c]);
    }
    const next = new Map();
    for (const [c0, c1] of runs) {
      const key = `${c0}-${c1}`;
      const rect = open.get(key);
      if (rect) { rect.r1 = r; next.set(key, rect); open.delete(key); } else next.set(key, { c0, c1, r0: r, r1: r });
    }
    done.push(...open.values());
    open.clear();
    next.forEach((v, k) => open.set(k, v));
  });
  done.push(...open.values());
  return done.map((w) => ({ x: w.c0 * ts, y: w.r0 * ts, w: (w.c1 - w.c0 + 1) * ts, h: (w.r1 - w.r0 + 1) * ts }));
}

// Pushes circle `c` ({x, y, radius}) out of every wall. Returns the unit normals it was pushed along.
export function resolveWalls(world, c) {
  const normals = [];
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const w of world.walls) {
      if (c.x + c.radius < w.x || c.x - c.radius > w.x + w.w || c.y + c.radius < w.y || c.y - c.radius > w.y + w.h) continue;
      const hit = pushOut(c, w);
      if (hit) { normals.push(hit); moved = true; }
    }
    if (!moved) break;
  }
  return normals;
}

function pushOut(c, w) {
  const qx = Math.max(w.x, Math.min(c.x, w.x + w.w));
  const qy = Math.max(w.y, Math.min(c.y, w.y + w.h));
  let dx = c.x - qx;
  let dy = c.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.radius * c.radius) return null;
  let push;
  if (d2 > 0) {
    const d = Math.sqrt(d2);
    dx /= d; dy /= d; push = c.radius - d;
  } else { // centre inside the rectangle: leave by the nearest side
    const exits = [
      [c.x - w.x, -1, 0], [w.x + w.w - c.x, 1, 0], [c.y - w.y, 0, -1], [w.y + w.h - c.y, 0, 1],
    ].sort((a, b) => a[0] - b[0])[0];
    push = exits[0] + c.radius; dx = exits[1]; dy = exits[2];
  }
  c.x += dx * push;
  c.y += dy * push;
  return { nx: dx, ny: dy };
}

// Breadth-first reachability over road tiles; used by tests to prove checkpoints can be reached.
export function reachable(world, from, to) {
  const ts = world.tileSize;
  const key = (c, r) => r * world.cols + c;
  const s = [Math.floor(from.x / ts), Math.floor(from.y / ts)];
  const t = [Math.floor(to.x / ts), Math.floor(to.y / ts)];
  const seen = new Set([key(...s)]);
  const queue = [[...s, 0]];
  while (queue.length) {
    const [c, r, d] = queue.shift();
    if (c === t[0] && r === t[1]) return d;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc; const nr = r + dr;
      if (seen.has(key(nc, nr)) || world.solid[nr]?.[nc] !== false) continue;
      seen.add(key(nc, nr));
      queue.push([nc, nr, d + 1]);
    }
  }
  return -1;
}
