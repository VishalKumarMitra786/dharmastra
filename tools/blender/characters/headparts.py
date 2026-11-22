"""Builds the parts of the head pack as plain numpy arrays (positions, uvs, faces, weights): eyeballs with a cornea bulge, lash cards, brow cards,
teeth and tongue. build_head.py turns them into Blender objects. Metres, y up, +z forward, +x left."""
import numpy as np
import facelib as F

EYE_R = 0.0122

def eyeball(side, nu=28, nv=18):
    """UV sphere with its pole at the front (+z), a cornea bulge, planar front UVs (iris in the middle of the 0..1 square)."""
    sx = 1 if side == 'L' else -1; C = F.EYE * np.array([sx, 1, 1])
    P = []; UV = []; NR = []
    for j in range(nv + 1):
        th = np.pi * j / nv
        for i in range(nu):
            ph = 2 * np.pi * i / nu
            d = np.array([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)])   # unit direction, z forward
            r = EYE_R * (1 + 0.115 * max(0.0, 1 - (th / 0.52) ** 2) ** 1.5)                   # cornea dome
            P.append(C + d * r); NR.append(d)
            tt = min(th, np.pi / 2); UV.append((0.5 + 0.5 * np.sin(tt) * np.cos(ph), 0.5 + 0.5 * np.sin(tt) * np.sin(ph)))
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * nu + i; b = j * nu + (i + 1) % nu; c = (j + 1) * nu + (i + 1) % nu; e = (j + 1) * nu + i
            if j == 0: faces.append((a, e, c))
            elif j == nv - 1: faces.append((a, e, b))
            else: faces.append((a, e, c, b))
    return dict(P=np.array(P), UV=np.array(UV), F=faces, N=np.array(NR), center=C)

def helper_strip(M, VT, G, group, kind, side):
    """A MakeHuman eyelash helper (CC0 base mesh) re-used as the lash card: keeps its positions, gets our own UVs. kind 'upper'|'lower'."""
    fs = G[group]; ids = sorted({i for f in fs for i, _ in f}); remap = {v: k for k, v in enumerate(ids)}
    P = M[ids].copy(); sx = 1 if side == 'L' else -1; C = F.EYE * np.array([sx, 1, 1])
    dist = np.linalg.norm(P - C, axis=1) - EYE_R * 1.1
    lo, hi = np.percentile(dist, 8), np.percentile(dist, 92)
    v = np.clip((dist - lo) / (hi - lo), 0, 1)
    xs = P[:, 0] * sx; u = (xs - xs.min()) / (xs.max() - xs.min())                    # 0 inner corner .. 1 outer corner
    return dict(P=P, UV=np.stack([u, v], 1), F=[tuple(remap[i] for i, _ in f) for f in fs], kind=kind, side=side)

def brow_card(surface_z, side, layer, nu=14, nv=3):
    """A ribbon that follows the brow curve over the skin. surface_z(x, y) -> (z, nx, ny, nz) from a ray cast on the head mesh."""
    sx = 1 if side == 'L' else -1
    # (x, y) control points inner -> outer, half-width of the ribbon at each
    pts = np.array([[0.008, 1.5655, 0.0046], [0.016, 1.5735, 0.0052], [0.026, 1.5805, 0.0056], [0.037, 1.5835, 0.0054], [0.048, 1.5815, 0.0048], [0.058, 1.5755, 0.0038], [0.066, 1.5665, 0.0024]])
    t = np.linspace(0, 1, nu); xs = np.interp(t, np.linspace(0, 1, len(pts)), pts[:, 0]); ys = np.interp(t, np.linspace(0, 1, len(pts)), pts[:, 1]); hw = np.interp(t, np.linspace(0, 1, len(pts)), pts[:, 2])
    hw = hw * (1.0 + 0.25 * layer)
    P = []; UV = []; faces = []
    for k in range(nu):
        dx = xs[min(k + 1, nu - 1)] - xs[max(k - 1, 0)]; dy = ys[min(k + 1, nu - 1)] - ys[max(k - 1, 0)]; l = np.hypot(dx, dy); tx, ty = dx / l, dy / l; nx_, ny_ = -ty, tx
        for r in range(nv):
            f = r / (nv - 1) * 2 - 1
            x = xs[k] + nx_ * hw[k] * f + 0.0; y = ys[k] + ny_ * hw[k] * f
            z, sx_n, sy_n, sz_n = surface_z(x, y)
            lift = 0.00035 + 0.0006 * layer
            P.append([x * sx + sx_n * lift * sx * 0, y + sy_n * lift, z + sz_n * lift]); UV.append((t[k], 0.5 + 0.5 * f))
            P[-1][0] = x * sx + (sx_n * sx) * lift
    for k in range(nu - 1):
        for r in range(nv - 1):
            a = k * nv + r; b = (k + 1) * nv + r; c = (k + 1) * nv + r + 1; d = k * nv + r + 1
            faces.append((a, b, c, d) if sx > 0 else (a, d, c, b))
    return dict(P=np.array(P), UV=np.array(UV), F=faces)

def stripped(M, G, group, remap_flip=False):
    fs = G[group]; ids = sorted({i for f in fs for i, _ in f}); remap = {v: k for k, v in enumerate(ids)}
    return dict(P=M[ids].copy(), F=[tuple(remap[i] for i, _ in f) for f in fs], ids=ids)


def merge(parts):
    """Concatenate part dicts (P, F, optional UV and RGBA) into one."""
    out = dict(P=[], F=[], UV=[], C=[]); off = 0
    for p in parts:
        n = len(p['P']); out['P'].append(p['P']); out['F'] += [tuple(i + off for i in f) for f in p['F']]
        out['UV'].append(p.get('UV', np.zeros((n, 2)))); out['C'].append(p.get('C', np.ones((n, 4)))); off += n
    return dict(P=np.concatenate(out['P']), F=out['F'], UV=np.concatenate(out['UV']), C=np.concatenate(out['C']))

CARD_BANDS = {'brow': 0, 'lash_upper': 1, 'lash_lower': 2}
def card_uv(UV, band):
    """Remap a card's 0..1 uv into its band of the 3-row cards atlas (Blender convention, v up: band 0 is the top third)."""
    UV = UV.copy(); UV[:, 1] = (1 - (band + 1) / 3.0) + UV[:, 1] / 3.0; return UV
