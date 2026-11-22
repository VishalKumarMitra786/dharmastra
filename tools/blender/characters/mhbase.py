"""Shared loader for the CC0 MakeHuman base mesh (see assets/CREDITS.md). Run with /tmp/bl/bin/python.
Coordinates: metres, y up, soles at y=0, +z forward (the same transform as tools/build-hero.mjs, so a head built here lines up with hero.glb)."""
import os, json
import numpy as np
CACHE = os.environ.get('HERO_CACHE', '/tmp/hero-cache')
OBJ = os.path.join(CACHE, 'makehuman__data__3dobjs__base.obj')
SKEL = os.path.join(CACHE, 'makehuman__data__rigs__default.mhskel')
WTS = os.path.join(CACHE, 'makehuman__data__rigs__default_weights.mhw')

def load():
    V = []; VT = []; groups = {}; g = None
    for l in open(OBJ):
        if l.startswith('v '): p = l.split(); V.append([float(p[1]), float(p[2]), float(p[3])])
        elif l.startswith('vt '): p = l.split(); VT.append([float(p[1]), float(p[2])])
        elif l.startswith('g '): g = l[2:].strip(); groups.setdefault(g, [])
        elif l.startswith('f '):
            groups[g].append([tuple(int(x) - 1 if x else -1 for x in t.split('/')[:2]) for t in l[2:].split()])
    V = np.array(V); VT = np.array(VT)
    ybody = V[sorted({i for f in groups['body'] for i, _ in f})][:, 1].min()
    M = (V - np.array([0, ybody, 0])) / 10.0
    return M, VT, groups

def skeleton():
    sk = json.load(open(SKEL)); M, _, _ = load(); out = {}
    ybody = None
    for n, b in sk['bones'].items():
        idx = sk['joints'][b['head']]; out[n] = M[idx].mean(axis=0)
    return out, sk

def weights():
    return json.load(open(WTS))['weights']

KEEP = ['root', 'spine05', 'spine03', 'spine01', 'neck01', 'head']
for _s in 'LR':
    KEEP += [f'clavicle.{_s}', f'upperarm01.{_s}', f'lowerarm01.{_s}', f'wrist.{_s}', f'finger1-1.{_s}', f'finger3-1.{_s}', f'finger3-2.{_s}', f'upperleg01.{_s}', f'lowerleg01.{_s}', f'foot.{_s}', f'toe1-1.{_s}']
NAMES = {'root': 'hips_root', 'spine05': 'hips', 'spine03': 'spine', 'spine01': 'chest', 'neck01': 'neck', 'head': 'head'}
def game_name(mh):
    if mh in NAMES: return NAMES[mh]
    import re
    n = mh
    for a, b in [('clavicle', 'shoulder'), ('upperarm01', 'upperarm'), ('lowerarm01', 'forearm'), ('wrist', 'hand'), ('finger1-1', 'thumb'), ('finger3-1', 'fingers'), ('finger3-2', 'fingers2'), ('upperleg01', 'thigh'), ('lowerleg01', 'shin'), ('toe1-1', 'toe')]:
        if n.startswith(a): n = b + n[len(a):]; break
    return re.sub(r'\.([LR])$', r'_\1', n)

def collapse_fn(sk):
    par = lambda n: sk['bones'][n]['parent']
    def collapse(name):
        side = name[-1]
        import re
        if re.match(r'^toe', name): return 'toe1-1.' + side
        if re.match(r'^finger1-', name): return 'finger1-1.' + side
        if re.match(r'^finger[2-5]-1', name): return 'finger3-1.' + side
        if re.match(r'^finger[2-5]-[23]', name): return 'finger3-2.' + side
        n = name
        while n and n not in KEEP: n = par(n)
        return n or 'root'
    return collapse

def game_weights():
    """vertex -> list of (game bone name, weight) up to 4, identical to build-hero.mjs bindWeights."""
    sk = json.load(open(SKEL)); w = weights(); col = collapse_fn(sk); acc = {}
    for bone, lst in w.items():
        t = col(bone)
        for v, x in lst: acc.setdefault(v, {}); acc[v][t] = acc[v].get(t, 0) + x
    out = {}
    for v, m in acc.items():
        top = sorted(m.items(), key=lambda kv: -kv[1])[:4]; s = sum(x for _, x in top); out[v] = [(game_name(b), x / s) for b, x in top]
    return out

def game_bones():
    """[(game name, parent game name or None, world position)] in the build-hero order."""
    sk = json.load(open(SKEL)); M, _, _ = load(); res = []
    def keep_parent(n):
        p = sk['bones'][n]['parent']
        while p and p not in KEEP: p = sk['bones'][p]['parent']
        return p
    for n in KEEP:
        h = M[sk['joints'][sk['bones'][n]['head']]].mean(axis=0); p = keep_parent(n)
        res.append((game_name(n), game_name(p) if p else None, h))
    return res

def head_mesh():
    """Head and neck faces of the base mesh (the game's head group rule). Returns (P (n,3) metres, faces [tuple], used vertex ids, weights per used vertex)."""
    M, VT, G = load(); W = game_weights(); dom = {v: max(w, key=lambda x: x[1])[0] for v, w in W.items()}
    hf = [f for f in G['body'] if sum(dom[i] in ('head', 'neck') for i, _ in f) >= 3]
    used = sorted({i for f in hf for i, _ in f}); rm = {v: k for k, v in enumerate(used)}
    return M[used], [tuple(rm[i] for i, _ in f) for f in hf], used, [W[i] for i in used]
