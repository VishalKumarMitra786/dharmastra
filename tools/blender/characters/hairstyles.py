"""Hair and beard styles as card meshes. build(name) -> dict(P, N, UV, F, T, chain) where chain is None or the chain bone names and T the 0..1 position along each strand."""
import numpy as np
import hairlib as H, skin_tex as ST
_norm = H._norm
FRONT = 0.07

def _roots(S, rng, n, mask, lo=0.5, extra=None):
    ok = np.nonzero(mask > lo)[0] if extra is None else np.nonzero((mask > lo) & extra)[0]
    return ok[rng.choice(len(ok), size=min(n, len(ok)), replace=False)]

def _gravity_flow(strength_g):
    def flow(P, N, t):
        g = np.array([0, -1.0, 0]); return np.broadcast_to(g, P.shape) * strength_g
    return flow

def style(S, name, seed=5):
    rng = np.random.default_rng(seed); pts = S.pts; R = S.R; scalp = R['scalp']
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    if name in ('crop', 'short', 'long', 'bun', 'topknot', 'braid'):
        top = y > 1.60 if name == 'topknot' else np.ones(len(pts), bool)
        cfg = {'crop': dict(n=700, L=(0.012, 0.022), w=(0.020, 0.010), lift=0.005), 'short': dict(n=760, L=(0.03, 0.058), w=(0.024, 0.012), lift=0.011),
               'long': dict(n=640, L=(0.30, 0.42), w=(0.036, 0.016), lift=0.011), 'bun': dict(n=560, L=(0.05, 0.10), w=(0.026, 0.013), lift=0.009),
               'topknot': dict(n=480, L=(0.04, 0.08), w=(0.026, 0.013), lift=0.008), 'braid': dict(n=560, L=(0.06, 0.1), w=(0.028, 0.013), lift=0.009)}[name]
        ids = _roots(S, rng, cfg['n'], scalp, 0.5, top); roots = pts[ids]; Ls = rng.uniform(*cfg['L'], len(ids))
        if name == 'short': Ls = Ls * (1 + 0.25 * np.clip((y[ids] - 1.60) / 0.05, 0, 1) * (z[ids] > 0.07))          # a longer front lock
        bunC = np.array([0, 1.60, -0.075]); knotC = np.array([0, 1.69, 0.03])
        def flow(P, N, t):
            r = P - CROWN_; r[:, 1] *= 0.3; crown = _norm(r)
            g = np.broadcast_to(np.array([0, -1.0, 0]), P.shape)
            if name == 'crop': return crown * 0.8 + g * 0.35
            if name == 'short':
                front = np.clip((P[:, 2] - 0.0) / 0.12, 0, 1)[:, None]; sw = np.stack([np.sign(P[:, 0]) * 0.55 + 0.25, 0.5 + 0 * P[:, 0], 0.45 + 0 * P[:, 0]], 1)
                return crown * 0.7 + g * 0.4 + front * sw * 0.9
            if name == 'long':
                o = np.ones(len(P)); part = np.stack([np.sign(P[:, 0]) * 0.9, -0.2 * o, -0.3 * o], 1) * np.clip((P[:, 2] - 0.02) / 0.1, 0, 1)[:, None]
                wg = np.clip((1.66 - P[:, 1]) / 0.07, 0, 1)[:, None]; return crown * (1 - wg) * 0.9 + g * (0.4 + wg * 1.2) + part * 1.2
            if name == 'bun': return _norm(bunC - P) * 1.0 + g * 0.05
            if name == 'topknot': return _norm(knotC - P) * 1.0 + g * 0.02
            if name == 'braid':
                return crown * 0.3 + g * 1.0 + np.stack([-np.sign(P[:, 0]) * 0.3, 0 * P[:, 0], -0.6 + 0 * P[:, 0]], 1) * np.clip((P[:, 2] - 0.02) / 0.1, 0, 1)[:, None]
        lift = lambda s: cfg['lift'] * min(1.0, s / 0.025) + 0.0008
        Pl, Nl = H.grow(S, roots, flow, Ls, step=0.004 if name != 'long' else 0.012, lift=lift, free_y=1.40 if name in ('long', 'braid') else None)
        cells = rng.integers(0, 8, len(ids)); w0 = rng.uniform(min(cfg['w']), max(cfg['w']), len(ids))
        out = H.ribbons(Pl, Nl, w0, w0 * 0.45, cells, rng, nseg=3 if name == 'crop' else 4 if name in ('short', 'topknot') else 8 if name == 'long' else 5)
        out['chain'] = ['hair1', 'hair2', 'hair3'] if name in ('long', 'braid') else None
        return out
    if name in ('moustache', 'beard_full', 'goatee', 'beard_short'):
        lips = R['lips']; beard = R['beard']; front = z > 0.06
        if name == 'moustache': m = (np.abs(x) < 0.034) & (y > 1.478) & (y < 1.498) & (lips < 0.3) & (z > 0.13); n = 200; Lr = (0.014, 0.026); w = (0.012, 0.007)
        elif name == 'goatee': m = (np.abs(x) < 0.024) & (y < 1.452) & (y > 1.405) & (z > 0.10); n = 140; Lr = (0.02, 0.04); w = (0.014, 0.008)
        elif name == 'beard_short': m = (beard > 0.35) & (lips < 0.3) & (R['mouth_in'] < 0.1) & (y < 1.50); n = 340; Lr = (0.008, 0.014); w = (0.012, 0.007)
        else: m = (beard > 0.35) & (lips < 0.3) & (R['mouth_in'] < 0.1) & (y < 1.50); n = 460; Lr = (0.035, 0.07); w = (0.02, 0.011)
        ids = np.nonzero(m)[0]; ids = ids[rng.choice(len(ids), size=min(n, len(ids)), replace=False)]; Ls = rng.uniform(*Lr, len(ids))
        def flow(P, N, t):
            g = np.broadcast_to(np.array([0, -1.0, 0]), P.shape)
            if name == 'moustache': return np.stack([np.sign(P[:, 0]) * 0.7, -0.6 + 0 * P[:, 0], 0.0 * P[:, 0]], 1)
            return g * 1.0 + np.stack([np.sign(P[:, 0]) * -0.1, 0 * P[:, 0], 0.25 + 0 * P[:, 0]], 1)
        Pl, Nl = H.grow(S, pts[ids], flow, Ls, step=0.004, lift=lambda s: 0.0015 + 0.003 * min(1, s / 0.03))
        cells = rng.integers(0, 8, len(ids)); w0 = rng.uniform(min(w), max(w), len(ids))
        out = H.ribbons(Pl, Nl, w0, w0 * 0.5, cells, rng, nseg=3); out['chain'] = None; return out
    raise KeyError(name)

CROWN_ = H.CROWN
