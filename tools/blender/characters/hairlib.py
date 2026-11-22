"""Hair and beard cards grown on the head surface: strands march over the skull following a flow field, then become ribbons with a strand alpha texture.
Pure numpy. Metres, y up, +z forward. build(style) -> dict(P, N, UV, F, W) where W are chain parameters (0 at the head, 1 at the tip)."""
import numpy as np
from scipy.spatial import cKDTree
import skin_tex as ST, mhbase

CROWN = np.array([0.0, 1.655, 0.015])
class Scalp:
    def __init__(self, seed=3, density=90000):
        P, Fc, used, W = mhbase.head_mesh(); self.P = P; self.F = Fc
        tri = []
        for f in Fc: tri += [(f[0], f[1], f[2]), (f[0], f[2], f[3])]
        tri = np.array(tri); a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
        nrm = np.cross(b - a, c - a); area = np.linalg.norm(nrm, axis=1) * 0.5; rng = np.random.default_rng(seed)
        cnt = rng.poisson(area * density); tid = np.repeat(np.arange(len(tri)), cnt); r1 = np.sqrt(rng.random(len(tid))); r2 = rng.random(len(tid))
        w0 = 1 - r1; w1 = r1 * (1 - r2); w2 = r1 * r2
        self.pts = w0[:, None] * a[tid] + w1[:, None] * b[tid] + w2[:, None] * c[tid]
        n = nrm[tid] / (np.linalg.norm(nrm[tid], axis=1, keepdims=True) + 1e-12); self.nrm = n
        # outward: the head is roughly convex around its centre, so flip normals that point inward
        ctr = np.array([0, 1.52, 0.04]); flip = ((self.pts - ctr) * self.nrm).sum(1) < 0; self.nrm[flip] *= -1
        self.tree = cKDTree(self.pts); self.R = ST.region_masks(self.pts)
    def project(self, Q):
        d, i = self.tree.query(Q); return self.pts[i], self.nrm[i]

def _norm(v): return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)

def grow(S, roots, flow, length, step=0.004, lift=None, free_y=None):
    """March strands from roots over the surface. flow(P, nrm, s01) -> desired direction (n,3). length: per-strand length (n,). Returns (n, steps+1, 3) polylines
    and per-step surface normals. lift(s_m) -> offset above the skin in metres."""
    n = len(roots); nstep = int(np.ceil(length.max() / step)); P = np.zeros((n, nstep + 1, 3)); N = np.zeros((n, nstep + 1, 3))
    q, nr = S.project(roots); P[:, 0] = q + nr * 0.0006; N[:, 0] = nr; cur = P[:, 0].copy(); free = np.zeros(n, bool)
    for s in range(1, nstep + 1):
        t = np.minimum(1.0, (s * step) / length)
        d = flow(cur, N[:, s - 1], t)
        d = d - N[:, s - 1] * (d * N[:, s - 1]).sum(1, keepdims=True); d = _norm(d)
        nxt = cur + d * step
        q, nr = S.project(nxt); dist = np.linalg.norm(nxt - q, axis=1)
        # still on the skull: stay on its surface; once the surface falls away (a strand leaves the neck) go free and hang
        off = (lift(s * step) if lift else 0.001) * np.ones(n)
        on = (dist < 0.02) & ~free
        newP = np.where(on[:, None], q + nr * off[:, None], nxt)
        if free_y is not None:
            lowy = newP[:, 1] < free_y; free = free | lowy
            fall = cur + np.stack([np.zeros(n), -np.full(n, step), np.zeros(n)], 1) + d * 0.0
            fall[:, 2] = np.minimum(fall[:, 2], -0.088)                      # hang behind the shoulders, never through the back
            newP = np.where(free[:, None], fall, newP); nr = np.where(free[:, None], np.array([0, 0, -1.0]), nr)
        # strands past their own length stop (the polyline keeps its last point)
        alive = (s * step) <= length + step
        newP = np.where(alive[:, None], newP, cur); P[:, s] = newP; N[:, s] = nr; cur = newP
    return P, N

def ribbons(Pl, Nl, width, widthTip, cells, rng, uvw=1 / 8, nseg=None, lenv=None, ncells=8):
    """Polylines -> ribbon quads. width/widthTip per strand (n,). cells: strand texture variant per strand. Returns dict(P,N,UV,F, T) with T = along-strand 0..1 per vertex."""
    n, k, _ = Pl.shape; nseg = nseg or k - 1
    sel = np.round(np.linspace(0, k - 1, nseg + 1)).astype(int); Pl = Pl[:, sel]; Nl = Nl[:, sel]
    tang = np.gradient(Pl, axis=1); tang = _norm(tang)
    side = _norm(np.cross(tang, Nl)); t = np.linspace(0, 1, nseg + 1)[None, :]
    w = (width[:, None] * (1 - t) + widthTip[:, None] * t) * 0.5
    L = Pl - side * w[..., None]; R = Pl + side * w[..., None]
    P = np.stack([L, R], 2).reshape(-1, 3)                               # (n*(nseg+1)*2, 3)
    Nn = np.stack([Nl, Nl], 2).reshape(-1, 3)
    u0 = (cells / ncells)[:, None, None] * np.ones((1, nseg + 1, 1)); UV = np.zeros((n, nseg + 1, 2, 2))
    UV[..., 0, 0] = u0[..., 0]; UV[..., 1, 0] = u0[..., 0] + uvw; UV[..., 0, 1] = 1 - t; UV[..., 1, 1] = 1 - t          # v: 1 at the root (image top) .. 0 at the tip
    UV = UV.reshape(-1, 2); T = np.broadcast_to(t[..., None], (n, nseg + 1, 2)).reshape(-1)
    F = []; 
    for i in range(n):
        base = i * (nseg + 1) * 2
        for s in range(nseg): a = base + s * 2; F.append((a, a + 1, a + 3, a + 2))
    return dict(P=P, N=Nn, UV=UV, F=F, T=T)
