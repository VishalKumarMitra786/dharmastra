"""Face deformers shared by every mesh of the head pack (skin, eyes, lashes, brows, teeth, hair cards).
Identity and expression shape keys are FUNCTIONS of rest position, so any mesh (the skin at any LOD, the eyeballs, the brow cards) gets
exactly the same displacement and they stay glued together. Coordinates: metres, y up, +z forward, +x is the character's left (MakeHuman).
Run inside /tmp/bl/bin/python (numpy only)."""
import numpy as np

EYE = np.array([0.0310, 1.5452, 0.1245])      # eyeball centre (left; mirror x for right)
NOSE = np.array([0.0, 1.5077, 0.168])
MOUTH = np.array([0.0, 1.466, 0.157])
CHIN = np.array([0.0, 1.420, 0.145])
JAW_PIVOT = np.array([0.0, 1.505, 0.064])
SLIT_Y = 1.4658                               # height of the lip line where the jaw splits the face

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def bump(P, c, r):
    d = (P - np.asarray(c)) / np.asarray(r); return np.exp(-(d ** 2).sum(1))

def sym_bump(P, c, r):
    """bump at (+|cx|, ...) and (-|cx|, ...): returns weight and the side sign of the nearer one (+1 left, -1 right)."""
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return bump(Q, c, r)

def _z(n): return np.zeros((n, 3))

def blink_field(P, v, which='both'):
    """Eyelids rotate about the eyeball centre: the upper lid comes down, the lower lid rises a little."""
    D = _z(len(P))
    for sx in (+1, -1):
        if which == 'L' and sx < 0: continue
        if which == 'R' and sx > 0: continue
        C = EYE * np.array([sx, 1, 1]); R = P - C
        ex = np.abs(R[:, 0]) / 0.021; dy = R[:, 1]
        fr = sstep(-0.004, 0.012, R[:, 2])                 # only the skin in front of the eye moves, not the cheek behind
        inx = 1 - sstep(0.55, 1.45, ex)                    # along the lid: full in the middle, zero at the corners
        up = sstep(-0.004, 0.0035, dy) * (1 - sstep(0.0075, 0.021, dy))     # upper lid: margin to brow
        lo = (1 - sstep(-0.0035, 0.002, dy)) * (1 - sstep(0.0035, 0.012, -dy))
        a_up = v * 0.55 * up * inx * fr                    # radians
        a_lo = -v * 0.20 * lo * inx * fr
        a = a_up + a_lo
        # rotation about the x axis through the eye centre; a > 0 lowers a point that is above the centre
        ny = R[:, 1] * np.cos(a) - R[:, 2] * np.sin(a)
        nz = R[:, 2] * np.cos(a) + R[:, 1] * np.sin(a)
        D[:, 1] += ny - R[:, 1]; D[:, 2] += nz - R[:, 2]
    return D

def jaw_field(P, a, lip_part=1.0):
    """Rotate everything below the lip line about the jaw hinge. a in radians (opening)."""
    w = (1 - sstep(SLIT_Y - 0.0035, SLIT_Y + 0.0015, P[:, 1])) * sstep(-0.005, 0.05, P[:, 2]) * sstep(1.386, 1.425, P[:, 1])
    # near the corners of the mouth the skin follows less
    ang = a * w; R = P - JAW_PIVOT
    ny = R[:, 1] * np.cos(ang) - R[:, 2] * np.sin(ang); nz = R[:, 2] * np.cos(ang) + R[:, 1] * np.sin(ang)
    D = _z(len(P)); D[:, 1] = ny - R[:, 1]; D[:, 2] = nz - R[:, 2]; return D

# ------------------------------------------------------------------------------------------------------------ identity parameters
def _id(name, P, v):
    n = len(P); D = _z(n); x = P[:, 0]; y = P[:, 1]; z = P[:, 2]; s = np.sign(x); ax = np.abs(x)
    neck_fix = sstep(1.392, 1.43, y)                       # the neck ring where the body starts never moves
    if name == 'skull_w': D[:, 0] = x * v * sstep(1.46, 1.54, y) * sstep(-0.05, 0.0, z + 0.04 * 0)
    elif name == 'skull_l': D[:, 2] = (z - 0.04) * v * sstep(1.47, 1.56, y)
    elif name == 'skull_h': D[:, 1] = (y - 1.52) * v * sstep(1.52, 1.60, y)
    elif name == 'jaw_w': D[:, 0] = x * v * sstep(1.505, 1.44, y) * sstep(-0.03, 0.05, z) * neck_fix
    elif name == 'jaw_sq': D[:, 0] = s * v * sym_bump(P, (0.068, 1.435, 0.03), (0.03, 0.035, 0.045)) * neck_fix; D[:, 1] = -v * 0.5 * sym_bump(P, (0.068, 1.435, 0.03), (0.03, 0.03, 0.04)) * 0.01 / 0.01 * 0.004 * neck_fix
    elif name == 'chin_f': D[:, 2] = v * bump(P, CHIN, (0.034, 0.03, 0.045)) * neck_fix
    elif name == 'chin_h': D[:, 1] = -v * bump(P, CHIN, (0.034, 0.028, 0.045)) * neck_fix
    elif name == 'chin_w': D[:, 0] = x * v * bump(P, CHIN, (0.04, 0.03, 0.05)) * neck_fix
    elif name == 'cheek_b': w = sym_bump(P, (0.058, 1.505, 0.10), (0.03, 0.026, 0.05)); D[:, 2] = v * w; D[:, 0] = s * v * 0.5 * w
    elif name == 'cheek_h': w = sym_bump(P, (0.06, 1.465, 0.09), (0.032, 0.032, 0.055)); D[:, 0] = -s * v * w; D[:, 2] = -0.3 * v * w
    elif name == 'nose_l': D[:, 2] = v * bump(P, NOSE + [0, 0.003, 0], (0.013, 0.018, 0.03))
    elif name == 'nose_w': D[:, 0] = s * v * sym_bump(P, (0.017, 1.497, 0.152), (0.013, 0.016, 0.022))
    elif name == 'nose_b': D[:, 2] = v * bump(P, (0, 1.535, 0.158), (0.013, 0.024, 0.035))
    elif name == 'nose_t': D[:, 1] = v * bump(P, NOSE, (0.014, 0.014, 0.025))
    elif name == 'eye_sp': D[:, 0] = s * v * sym_bump(P, (0.03, 1.545, 0.12), (0.045, 0.045, 0.07))
    elif name == 'eye_tilt': D[:, 1] = v * np.clip((ax - 0.031) / 0.016, -1, 1) * 0.006 * sym_bump(P, (0.032, 1.545, 0.12), (0.04, 0.03, 0.06))
    elif name == 'eye_dep': D[:, 2] = -v * sym_bump(P, (0.032, 1.55, 0.13), (0.04, 0.03, 0.06))
    elif name == 'brow_f': D[:, 2] = v * sym_bump(P, (0.03, 1.575, 0.135), (0.05, 0.015, 0.05)) + v * 0.5 * bump(P, (0, 1.58, 0.14), (0.02, 0.015, 0.05))
    elif name == 'brow_h': D[:, 1] = v * sym_bump(P, (0.03, 1.578, 0.135), (0.05, 0.02, 0.05))
    elif name == 'forehead_f': D[:, 2] = v * bump(P, (0, 1.605, 0.125), (0.06, 0.04, 0.06))
    elif name == 'lip_u': w = bump(P, (0, 1.474, 0.155), (0.022, 0.0075, 0.03)); D[:, 2] = v * 0.6 * w; D[:, 1] = v * 0.4 * w
    elif name == 'lip_l': w = bump(P, (0, 1.455, 0.15), (0.024, 0.008, 0.03)); D[:, 2] = v * 0.6 * w; D[:, 1] = -v * 0.4 * w
    elif name == 'mouth_w': D[:, 0] = x * v * bump(P, MOUTH + [0, 0, -0.01], (0.05, 0.022, 0.06))
    elif name == 'ear_s': c = np.array([0.083, 1.53, 0.02]); Q = P.copy(); Q[:, 0] = ax; w = bump(Q, c, (0.022, 0.045, 0.04)); R = Q - c; D = R * (v * w)[:, None]; D[:, 0] *= s
    elif name == 'ear_p': c = np.array([0.083, 1.53, 0.02]); Q = P.copy(); Q[:, 0] = ax; D[:, 0] = s * v * bump(Q, c, (0.02, 0.045, 0.04))
    elif name == 'neck_t': w = 1 - sstep(1.40, 1.47, y); D[:, 0] = x * v * w; D[:, 2] = (z - 0.012) * v * w * (1 - sstep(1.384, 1.394, y) * 0 )
    elif name == 'temple': D[:, 0] = -s * v * sym_bump(P, (0.075, 1.56, 0.07), (0.02, 0.035, 0.05))
    elif name == 'age_jowl': w = sym_bump(P, (0.055, 1.43, 0.11), (0.03, 0.025, 0.04)); D[:, 1] = -v * 0.6 * w; D[:, 0] = s * v * 0.3 * w
    else: raise KeyError(name)
    if name not in ('neck_t', 'jaw_w', 'jaw_sq', 'chin_f', 'chin_h', 'chin_w'): D *= neck_fix[:, None]
    return D

# 8 male, 6 female-leaning identities. Values are in metres-ish (position scale) or fractions for the scale params.
IDENTITIES = {
    'id_veer':    {'jaw_sq': 0.004, 'chin_f': 0.003, 'cheek_b': 0.003, 'brow_f': 0.003, 'nose_l': 0.003, 'skull_w': -0.01},
    'id_warrior': {'skull_w': 0.045, 'jaw_w': 0.08, 'jaw_sq': 0.008, 'chin_h': 0.004, 'brow_f': 0.007, 'nose_w': 0.004, 'neck_t': 0.1, 'ear_p': 0.003, 'cheek_b': 0.002},
    'id_elder':   {'cheek_h': 0.007, 'temple': 0.004, 'brow_f': 0.004, 'nose_l': 0.006, 'nose_t': -0.004, 'age_jowl': 0.006, 'ear_s': 0.12, 'chin_f': -0.002, 'neck_t': -0.06, 'eye_dep': 0.002},
    'id_gaunt':   {'cheek_h': 0.01, 'temple': 0.006, 'skull_w': -0.04, 'jaw_w': -0.07, 'chin_h': 0.008, 'brow_f': 0.006, 'nose_l': 0.007, 'nose_b': 0.004, 'eye_dep': 0.004, 'neck_t': -0.12},
    'id_round':   {'skull_w': 0.03, 'cheek_b': 0.006, 'jaw_w': 0.04, 'chin_f': -0.003, 'nose_w': 0.003, 'nose_l': -0.003, 'lip_l': 0.002, 'neck_t': 0.08},
    'id_sharp':   {'skull_w': -0.03, 'chin_h': 0.006, 'chin_w': -0.12, 'nose_l': 0.008, 'nose_b': 0.004, 'brow_h': 0.004, 'eye_tilt': 1.0, 'cheek_b': 0.004, 'jaw_w': -0.05},
    'id_youth':   {'skull_h': 0.04, 'brow_f': -0.003, 'nose_l': -0.004, 'chin_h': -0.003, 'eye_sp': 0.002, 'jaw_w': -0.04, 'ear_p': 0.003, 'cheek_b': 0.002, 'lip_u': 0.002},
    'id_heavy':   {'jaw_w': 0.1, 'chin_w': 0.12, 'chin_f': 0.002, 'brow_f': 0.006, 'nose_w': 0.006, 'nose_l': 0.002, 'neck_t': 0.18, 'cheek_b': 0.001, 'forehead_f': 0.004, 'lip_l': 0.002},
    'id_hawk':    {'nose_l': 0.01, 'nose_b': 0.008, 'nose_t': -0.006, 'brow_f': 0.006, 'eye_dep': 0.004, 'cheek_h': 0.004, 'chin_f': 0.004, 'skull_l': 0.04, 'jaw_sq': 0.003},
    'id_f_soft':  {'skull_w': -0.03, 'jaw_w': -0.1, 'chin_h': -0.003, 'chin_w': -0.1, 'brow_f': -0.004, 'nose_l': -0.003, 'nose_w': -0.002, 'lip_u': 0.003, 'lip_l': 0.003, 'eye_sp': 0.002, 'cheek_b': 0.003, 'neck_t': -0.15, 'ear_s': -0.1},
    'id_f_strong':{'skull_w': -0.015, 'jaw_w': -0.04, 'chin_f': 0.002, 'cheek_b': 0.005, 'brow_f': 0.001, 'lip_u': 0.003, 'lip_l': 0.002, 'eye_tilt': 0.6, 'nose_l': 0.002, 'neck_t': -0.12},
    'id_f_round': {'skull_w': 0.015, 'cheek_b': 0.007, 'jaw_w': -0.02, 'chin_f': -0.003, 'lip_l': 0.004, 'lip_u': 0.002, 'nose_w': 0.002, 'nose_l': -0.004, 'eye_sp': 0.003, 'neck_t': -0.08, 'ear_s': -0.1},
    'id_f_elder': {'cheek_h': 0.006, 'temple': 0.003, 'nose_l': 0.004, 'nose_t': -0.003, 'age_jowl': 0.005, 'brow_h': -0.002, 'neck_t': -0.12, 'ear_s': 0.08, 'jaw_w': -0.05},
    'id_f_sharp': {'skull_w': -0.045, 'jaw_w': -0.09, 'chin_h': 0.004, 'chin_w': -0.15, 'cheek_b': 0.006, 'nose_l': 0.004, 'nose_b': 0.003, 'eye_tilt': 1.0, 'brow_h': 0.003, 'neck_t': -0.15},
}

# ------------------------------------------------------------------------------------------------------------ expressions
def _expr(name, P, v):
    n = len(P); D = _z(n); x = P[:, 0]; y = P[:, 1]; z = P[:, 2]; s = np.sign(x); ax = np.abs(x)
    face = sstep(1.40, 1.44, y) * sstep(-0.01, 0.08, z)
    if name == 'blink': return blink_field(P, v)
    if name == 'blink_L': return blink_field(P, v, 'L')
    if name == 'blink_R': return blink_field(P, v, 'R')
    if name == 'smile':
        cor = sym_bump(P, (0.030, 1.465, 0.146), (0.022, 0.017, 0.03)); D[:, 1] += 0.0095 * cor; D[:, 0] += s * 0.0085 * cor; D[:, 2] += -0.004 * cor
        up = bump(P, (0, 1.4745, 0.157), (0.02, 0.007, 0.03)); D[:, 1] += 0.0025 * up
        ch = sym_bump(P, (0.052, 1.500, 0.112), (0.03, 0.03, 0.05)); D[:, 1] += 0.0055 * ch; D[:, 2] += 0.003 * ch
        nl = sym_bump(P, (0.03, 1.485, 0.15), (0.012, 0.014, 0.025)); D[:, 1] += 0.0025 * nl; D[:, 0] += s * 0.0015 * nl
        lo = sym_bump(P, (0.03, 1.537, 0.135), (0.022, 0.008, 0.03)); D[:, 1] += 0.0025 * lo        # the cheek pushes the lower lid up
        return D * face[:, None] * v + blink_field(P, 0.28 * v)
    if name == 'angry':
        brow_in = sym_bump(P, (0.018, 1.578, 0.14), (0.02, 0.014, 0.04)); brow_out = sym_bump(P, (0.048, 1.58, 0.125), (0.025, 0.015, 0.04))
        D[:, 1] += -0.010 * brow_in - 0.004 * brow_out; D[:, 0] += -s * 0.004 * brow_in; D[:, 2] += 0.002 * brow_in
        nos = sym_bump(P, (0.017, 1.495, 0.152), (0.012, 0.012, 0.02)); D[:, 0] += s * 0.0035 * nos; D[:, 1] += 0.002 * nos
        ul = sym_bump(P, (0.016, 1.476, 0.154), (0.018, 0.007, 0.03)); D[:, 1] += 0.0035 * ul
        cor = sym_bump(P, (0.028, 1.463, 0.146), (0.02, 0.015, 0.03)); D[:, 1] += -0.0045 * cor; D[:, 0] += -s * 0.002 * cor
        ch = bump(P, (0, 1.425, 0.146), (0.03, 0.02, 0.04)); D[:, 1] += 0.003 * ch                   # chin pushed up
        nl = sym_bump(P, (0.02, 1.563, 0.145), (0.015, 0.008, 0.03)); D[:, 2] += 0.002 * nl
        return D * face[:, None] * v + blink_field(P, 0.34 * v)
    if name == 'worried':
        bi = sym_bump(P, (0.016, 1.578, 0.14), (0.02, 0.014, 0.04)); bo = sym_bump(P, (0.048, 1.58, 0.125), (0.025, 0.015, 0.04))
        D[:, 1] += 0.011 * bi - 0.003 * bo; D[:, 0] += -s * 0.003 * bi
        up = sym_bump(P, (0.02, 1.552, 0.14), (0.016, 0.008, 0.03)); D[:, 1] += 0.0025 * up
        cor = sym_bump(P, (0.029, 1.463, 0.147), (0.02, 0.015, 0.03)); D[:, 1] += -0.0055 * cor; D[:, 0] += -s * 0.0015 * cor
        ll = bump(P, (0, 1.452, 0.15), (0.022, 0.008, 0.03)); D[:, 1] += 0.0022 * ll
        ch = bump(P, (0, 1.428, 0.146), (0.03, 0.018, 0.04)); D[:, 1] += 0.004 * ch; D[:, 2] += 0.002 * ch
        fo = bump(P, (0, 1.602, 0.14), (0.035, 0.015, 0.04)); D[:, 1] += 0.0025 * fo
        return D * face[:, None] * v
    if name == 'shout':
        D = jaw_field(P, 0.34)
        D2 = _z(n)
        up = bump(P, (0, 1.476, 0.157), (0.028, 0.008, 0.03)); D2[:, 1] += 0.0045 * up
        cor = sym_bump(P, (0.028, 1.463, 0.145), (0.02, 0.014, 0.03)); D2[:, 0] += s * 0.006 * cor; D2[:, 1] += 0.0035 * cor
        bi = sym_bump(P, (0.02, 1.578, 0.14), (0.025, 0.014, 0.04)); D2[:, 1] += -0.007 * bi
        nos = sym_bump(P, (0.017, 1.495, 0.152), (0.012, 0.012, 0.02)); D2[:, 0] += s * 0.003 * nos
        D += D2 * face[:, None]
        return D * v + blink_field(P, 0.22 * v)
    if name == 'jaw': return jaw_field(P, 0.34) * v
    raise KeyError(name)

EXPRESSIONS = ['blink', 'blink_L', 'blink_R', 'smile', 'angry', 'worried', 'shout']

def field(name, P, v=1.0):
    """Displacement (N,3) of key `name` at full weight times v."""
    if name in EXPRESSIONS: return _expr(name, P, v)
    out = _z(len(P))
    for k, a in IDENTITIES[name].items(): out += _id(k, P, a * v)
    return out

def all_keys(): return list(IDENTITIES.keys()) + EXPRESSIONS
