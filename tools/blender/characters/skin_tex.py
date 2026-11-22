"""Bakes the skin textures of the head pack per texel from 3D: albedo, tangent-space normal (pores, skin folds, wrinkles), occlusion/roughness/stubble.
Every feature is a function of the 3D position on the head, so UV seams never show. Pure numpy (+scipy for padding). Not shipped."""
import numpy as np
import facelib as F

# ------------------------------------------------------------------------------------------------ noise
_LAT = {}
def vnoise(P, f, seed=0):
    """Smooth value noise in [0,1] at f cycles per metre (a 128 cube lattice sampled with cubic splines; tiles every 128 cells)."""
    from scipy import ndimage
    if seed not in _LAT: _LAT[seed] = np.random.default_rng(1000 + seed).random((128, 128, 128)).astype(np.float32)
    Q = (P * f + 1000.0).T % 128.0
    return ndimage.map_coordinates(_LAT[seed], Q, order=3 if f < 400 else 1, mode='grid-wrap', prefilter=True).astype(np.float32)

def fbm(P, f, octaves=4, seed=0, gain=0.5):
    a = 1.0; tot = 0; s = 0
    for o in range(octaves): s = s + a * (vnoise(P, f * 2 ** o, seed + o * 7) - 0.5); tot += a; a *= gain
    return s / tot * 2     # about -1..1

class Scatter:
    """Random points scattered over the head surface at a density in points per square metre; nearest distances by k-d tree."""
    def __init__(self, tri_pos, density, seed):
        from scipy.spatial import cKDTree
        rng = np.random.default_rng(seed); a, b, c = tri_pos[:, 0], tri_pos[:, 1], tri_pos[:, 2]
        area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1); cnt = rng.poisson(area * density); tid = np.repeat(np.arange(len(a)), cnt)
        r1 = np.sqrt(rng.random(len(tid))); r2 = rng.random(len(tid)); w0 = 1 - r1; w1 = r1 * (1 - r2); w2 = r1 * r2
        self.pts = (w0[:, None] * a[tid] + w1[:, None] * b[tid] + w2[:, None] * c[tid]).astype(np.float32); self.rid = rng.random(len(tid)).astype(np.float32)
        self.tree = cKDTree(self.pts); self.spacing = 1 / np.sqrt(density)
    def query(self, X):
        d, i = self.tree.query(X, k=2, workers=-1); return (d[:, 0] / self.spacing).astype(np.float32), (d[:, 1] / self.spacing).astype(np.float32), self.rid[i[:, 0]]

sstep = F.sstep; bump = F.bump; sym_bump = F.sym_bump

# ------------------------------------------------------------------------------------------------ rasteriser
def rasterize(S, uv, tri, pos, nrm):
    """Per-texel position, normal, mask and tangent frame. uv (loops,2) in 0..1 (v up); tri (T,3) vertex ids into pos; tri_loops (T,3) loop ids = uv rows."""
    P = np.zeros((S, S, 3), np.float32); N = np.zeros((S, S, 3), np.float32); Tg = np.zeros((S, S, 3), np.float32); Bt = np.zeros((S, S, 3), np.float32); mask = np.zeros((S, S), bool)
    uvt, vid = uv
    for t in range(len(vid)):
        a, b, c = vid[t]; ua, ub, uc = uvt[t]
        xs = np.array([ua[0], ub[0], uc[0]]) * S; ys = (1 - np.array([ua[1], ub[1], uc[1]])) * S
        x0, x1 = int(max(0, np.floor(xs.min() - 1))), int(min(S - 1, np.ceil(xs.max() + 1))); y0, y1 = int(max(0, np.floor(ys.min() - 1))), int(min(S - 1, np.ceil(ys.max() + 1)))
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-9: continue
        l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d; l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d; l2 = 1 - l0 - l1
        m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not m.any(): continue
        pa, pb, pc = pos[a], pos[b], pos[c]
        # tangent frame from the uv gradient (u right, v up)
        du1 = np.array([ua[0], ua[1]]); e1 = np.array([ub[0] - ua[0], ub[1] - ua[1]]); e2 = np.array([uc[0] - ua[0], uc[1] - ua[1]]); det = e1[0] * e2[1] - e1[1] * e2[0]
        if abs(det) < 1e-12: continue
        q1 = pb - pa; q2 = pc - pa; T = (q1 * e2[1] - q2 * e1[1]) / det; B = (q2 * e1[0] - q1 * e2[0]) / det
        yy, xx = np.nonzero(m); ww0, ww1, ww2 = l0[m], l1[m], l2[m]; py, px = yy + y0, xx + x0
        P[py, px] = ww0[:, None] * pa + ww1[:, None] * pb + ww2[:, None] * pc
        N[py, px] = ww0[:, None] * nrm[a] + ww1[:, None] * nrm[b] + ww2[:, None] * nrm[c]
        Tg[py, px] = T; Bt[py, px] = B; mask[py, px] = True
    return P, N, Tg, Bt, mask

def pad(img, mask, px=6):
    from scipy import ndimage
    d, idx = ndimage.distance_transform_edt(~mask, return_indices=True)
    out = img[idx[0], idx[1]]; keep = d <= px
    out[~keep & ~mask] = img[idx[0], idx[1]][~keep & ~mask]   # beyond the pad radius we still copy the nearest texel: no black leaks into mips
    return out

# ------------------------------------------------------------------------------------------------ the skin model
REF_SKIN = np.array([0xc4, 0x8e, 0x63]) / 255.0          # reference sRGB tone; per-look colour is look.skin / this

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def region_masks(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x); M = {}
    M['lips'] = bump(P * [1, 1, 1], (0, 1.4655, 0.152), (0.0285, 0.0118, 0.022)) ** 0.6
    M['lipline'] = bump(P, (0, 1.4660, 0.152), (0.026, 0.0016, 0.03))
    M['mouth_in'] = (1 - sstep(0.022, 0.027, ax)) * sstep(1.449, 1.456, y) * (1 - sstep(1.484, 1.490, y)) * (1 - sstep(0.1462, 0.1478, z))
    M['cheek'] = sym_bump(P, (0.056, 1.492, 0.105), (0.036, 0.032, 0.05))
    M['nose_tip'] = bump(P, F.NOSE + [0, 0, -0.004], (0.016, 0.014, 0.02)); M['alae'] = sym_bump(P, (0.017, 1.497, 0.152), (0.011, 0.013, 0.02))
    M['undereye'] = sym_bump(P, (0.031, 1.532, 0.125), (0.022, 0.0085, 0.03)); M['uppereye'] = sym_bump(P, (0.032, 1.5585, 0.13), (0.026, 0.0085, 0.03))
    M['eye_in'] = sym_bump(P, (0.031, 1.5452, 0.131), (0.0165, 0.0125, 0.012))
    M['ear'] = sstep(0.068, 0.078, ax) * (1 - sstep(0.05, 0.085, z)) * sstep(1.46, 1.49, y) * (1 - sstep(1.58, 1.61, y))
    M['forehead'] = sstep(1.592, 1.612, y) * (1 - sstep(1.655, 1.665, y)) * (1 - sstep(0.06, 0.09, ax)) * sstep(0.06, 0.12, z)
    M['tzone'] = np.maximum(bump(P, (0, 1.52, 0.165), (0.015, 0.045, 0.04)), M['forehead'] * 0.8)
    M['chin'] = bump(P, F.CHIN, (0.03, 0.02, 0.04)); M['brow'] = sym_bump(P, (0.037, 1.5775, 0.14), (0.034, 0.0095, 0.035))
    M['neck'] = 1 - sstep(1.40, 1.44, y)
    # beard zone: upper lip, chin, jaw line, sideburns (stubble / full beard live here); scalp zone: where hair roots are
    jaw = sstep(1.46, 1.44, y) * sstep(-0.02, 0.05, z) * (1 - sstep(0.082, 0.095, ax)) * sstep(1.395, 1.415, y)
    cheekbeard = sym_bump(P, (0.06, 1.455, 0.09), (0.03, 0.03, 0.06)) * 0.8
    uplip = bump(P, (0, 1.4865, 0.155), (0.035, 0.012, 0.03)); side = sym_bump(P, (0.075, 1.50, 0.04), (0.012, 0.045, 0.05)) * 0.7
    M['beard'] = np.clip(np.maximum.reduce([jaw * 0.95, cheekbeard, uplip, side]) * (1 - M['lips'] ** 2 * 0.95) * (1 - M['mouth_in']), 0, 1)
    hl = 1.612 - 0.068 * sstep(0.03, 0.076, ax)                           # hairline height: higher in the middle, lower at the temples
    top = sstep(hl - 0.005, hl + 0.005, y); back = sstep(0.045, 0.0, z) * sstep(1.43, 1.47, y)
    M['scalp'] = np.clip(np.maximum(top, back) * (1 - M['ear']), 0, 1)
    return M

def build(S, P, N, T, B, mask, tri_pos, seed=7, mouth_in=None):
    """Returns albedo (S,S,3 sRGB 0..1), normal (S,S,3), orm (S,S,3: occlusion, roughness, stubble), masks.
    tri_pos (T,3,3): the triangles' corner positions, used to scatter pore centres over the surface."""
    from scipy import ndimage
    idx = np.nonzero(mask); X = P[idx].astype(np.float32); n = len(X)
    x, y, z = X[:, 0], X[:, 1], X[:, 2]; ax = np.abs(x)
    R = region_masks(X)
    if mouth_in is not None: R['mouth_in'] = mouth_in[idx].astype(np.float32)
    sc_pore = Scatter(tri_pos, 1 / (0.00055 ** 2), seed + 11); sc_lat = Scatter(tri_pos, 1 / (0.0038 ** 2), seed + 23)
    f1, f2, cid = sc_pore.query(X); g1, g2, _ = sc_lat.query(X)
    pore = np.exp(-(f1 / 0.22) ** 2) * (cid > 0.35)                  # a depression in 65 % of the cells
    lattice = np.exp(-(((g2 - g1) * 2.2) / 0.55) ** 2)               # ridges where two skin cells meet (the diamond pattern of real skin)
    micro = fbm(X, 2500.0, 2, seed + 31)
    cheeky = 1 - 0.5 * R['lips'] - 0.4 * R['ear'] - 0.3 * R['mouth_in']
    wy = np.sin((y * 135 + 0.8 * fbm(X, 28, 2, seed + 5)) * np.pi)           # horizontal creases about 7 mm apart
    fore = R['forehead'] * (np.clip(wy, 0, 1) ** 2) * (0.35 + 0.65 * vnoise(X, 40, seed + 6))
    cx = ax - 0.052; cyy = y - 1.543; ang = np.arctan2(cyy, cx)
    crow = sym_bump(X, (0.066, 1.54, 0.08), (0.016, 0.018, 0.04)) * (np.clip(np.sin(ang * 14 + 0.6), 0, 1) ** 3)
    bag = R['undereye'] * np.clip(np.sin((y - 1.527) * 480), 0, 1) ** 2 * 0.7
    nasol = sym_bump(X, (0.034, 1.4725, 0.138), (0.0075, 0.02, 0.025))
    liplines = R['lips'] * (1 - R['lipline']) * (np.clip(np.sin(x * 1900 + 2 * fbm(X, 120, 2, seed + 8)), 0, 1) ** 2) * 0.7
    # relief in millimetres
    h_mm = (-0.050 * pore * cheeky + 0.030 * lattice * cheeky + 0.008 * micro - 0.28 * fore - 0.20 * crow - 0.16 * bag - 0.22 * nasol - 0.07 * liplines)
    Himg = np.zeros((S, S), np.float32); Himg[idx] = h_mm
    from scipy import ndimage as ndi
    Hp = pad(Himg[..., None], mask, 8)[..., 0]
    Tl = np.linalg.norm(T, axis=2) / S; Bl = np.linalg.norm(B, axis=2) / S       # metres per texel along u and v
    Tl = np.where(mask, Tl, np.nan); Bl = np.where(mask, Bl, np.nan)
    Tl = np.where(np.isfinite(Tl), Tl, np.nanmedian(Tl)); Bl = np.where(np.isfinite(Bl), Bl, np.nanmedian(Bl))
    Hs = ndi.gaussian_filter(Hp, 0.55)
    du = (np.roll(Hs, -1, 1) - np.roll(Hs, 1, 1)) * 0.5 * 1e-3 / Tl                 # slope along +u (columns)
    dv = -(np.roll(Hs, -1, 0) - np.roll(Hs, 1, 0)) * 0.5 * 1e-3 / Bl                # slope along +v (rows go down, v goes up)
    nx = -du[idx]; ny = -dv[idx]; nz = np.ones(n, np.float32); nl = np.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl
    # ---------- albedo ----------
    base = srgb2lin(REF_SKIN)[None, :].repeat(n, 0)
    blot = fbm(X, 55.0, 3, seed + 41); blot2 = fbm(X, 9.0, 2, seed + 43)
    col = base * (1 + 0.07 * blot[:, None] + 0.04 * blot2[:, None])
    def tint(c, m, amt): return c * (1 - m[:, None] * (1 - np.asarray(amt)[None, :]))
    col = tint(col, np.clip(R['cheek'] * 0.75, 0, 1), [1.0, 0.80, 0.76])
    col = tint(col, np.clip(R['nose_tip'] * 0.65 + R['alae'] * 0.6, 0, 1), [1.0, 0.76, 0.72])
    col = tint(col, np.clip(R['ear'] * 0.7, 0, 1), [1.0, 0.72, 0.68])
    col = tint(col, np.clip(R['undereye'] * 0.6 + R['uppereye'] * 0.25, 0, 1), [0.86, 0.80, 0.86])
    col = tint(col, np.clip(R['eye_in'], 0, 1), [1.0, 0.55, 0.52])
    col = col * (1 + 0.05 * R['forehead'][:, None] * np.array([1, 1, 0.9]))
    col = tint(col, np.clip(R['lips'] * 1.15, 0, 1), [0.74, 0.34, 0.34])
    col = col * (1 - 0.35 * R['lipline'][:, None])
    col = tint(col, R['mouth_in'], [0.62, 0.20, 0.20])
    col = col * (1 - 0.30 * R['brow'][:, None])
    col = col * (1 - 0.05 * (pore * cheeky)[:, None]) * (1 - 0.04 * (fore + crow + nasol)[:, None])
    sc_fr = Scatter(tri_pos, 1 / (0.006 ** 2), seed + 51); d1, _, rid = sc_fr.query(X)
    fk = (rid > 0.975) * np.exp(-(d1 / 0.12) ** 2) * (1 - R['lips']) * (1 - R['ear']); col = col * (1 - 0.22 * fk[:, None] * np.array([0.8, 1.0, 1.1]))
    col = np.clip(col, 0, 1)
    # ---------- roughness / occlusion / stubble ----------
    rough = 0.56 - 0.12 * R['tzone'] - 0.18 * R['lips'] + 0.08 * R['ear'] - 0.10 * R['nose_tip'] + 0.05 * micro + 0.20 * pore * cheeky + 0.04 * lattice * cheeky
    rough = np.where(R['mouth_in'] > 0.5, 0.25, rough)
    ao = 1 - 0.55 * pore * cheeky - 0.35 * (fore + crow + bag + nasol)
    sc_st = Scatter(tri_pos, 1 / (0.00048 ** 2), seed + 61); dd, _, sid = sc_st.query(X)
    stub = (np.exp(-(dd / 0.30) ** 2) * (sid > 0.12)).astype(np.float32)
    stub = np.clip(stub * (0.6 + 0.4 * vnoise(X, 90, seed + 62)), 0, 1) * R['beard']
    A = np.zeros((S, S, 3), np.float32); Nm = np.zeros((S, S, 3), np.float32); O = np.zeros((S, S, 3), np.float32)
    A[idx] = lin2srgb(col); Nm[idx] = np.stack([nx, ny, nz], 1) * 0.5 + 0.5
    O[idx] = np.stack([np.clip(ao, 0, 1), np.clip(rough, 0, 1), stub], 1)
    return A, Nm, O, R
