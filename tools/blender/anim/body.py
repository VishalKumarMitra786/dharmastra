"""Whole-body clip builder. A clip is a set of keyed scalar CHANNELS (see CH below) that this module turns into a Pose each frame:
  pelvis, spine, chest, neck, head (degrees), feet as ground targets with leg IK (so planted feet stay planted), arms either as angles or as hand targets
  with arm IK and a weapon direction (so a sword arc is animated as the blade and hand path, not as guessed shoulder angles).
Time is in seconds. Angles are degrees, lengths metres. Positions are in the character's ground frame: origin between the feet, +x character-left, +y up, +z forward."""
import math
from rig import *

DEF = {
    'root_x': 0.0, 'root_y': 0.0, 'root_z': 0.0,
    'hip_p': 0.0, 'hip_y': 0.0, 'hip_r': 0.0, 'sp_p': 0.0, 'sp_y': 0.0, 'sp_r': 0.0, 'ch_p': 0.0, 'ch_y': 0.0, 'ch_r': 0.0, 'nk_p': 0.0, 'nk_y': 0.0, 'nk_r': 0.0, 'hd_p': 0.0, 'hd_y': 0.0, 'hd_r': 0.0,
    'LF_x': 0.10, 'LF_y': 0.0, 'LF_z': 0.0, 'LF_yaw': 4.0, 'LF_pitch': 0.0, 'RF_x': -0.10, 'RF_y': 0.0, 'RF_z': 0.0, 'RF_yaw': -4.0, 'RF_pitch': 0.0,
    'LG': 0.25, 'RG': 0.25, 'grip2': 0.0, 'LSh': 0.0, 'RSh': 0.0,
}
for s in 'LR':
    sg = 1 if s == 'L' else -1
    DEF.update({f'{s}U_x': REST[f'upperarm_{s}'][0] / D2R, f'{s}U_y': REST[f'upperarm_{s}'][1] / D2R, f'{s}U_z': REST[f'upperarm_{s}'][2] / D2R, f'{s}E': REST[f'forearm_{s}'][0] / D2R,
                f'{s}Hd_x': 0.0, f'{s}Hd_y': 0.0, f'{s}Hd_z': 0.0, f'{s}H_w': 0.0, f'{s}H_x': sg * 0.20, f'{s}H_y': -0.30, f'{s}H_z': 0.20, f'{s}W_yaw': 0.0, f'{s}W_pitch': 90.0, f'{s}W_roll': 0.0, f'{s}W_w': 0.0,
                f'{s}E_b': sg * 12.0})


def hands(p, rg, lg):
    for s, g in (('R', rg), ('L', lg)):
        sg = 1 if s == 'R' else -1
        p.rot[f'fingers_{s}'][0] = 0.25 + g * 1.25; p.rot[f'fingers2_{s}'][0] = 0.3 + g * 1.35; p.rot[f'thumb_{s}'][0] = g * 0.55
        p.rot[f'thumb_{s}'][2] = REST[f'thumb_{s}'][2] * (1 - g) - sg * g * 0.45


def wdir(yaw, pitch):
    y, p = yaw * D2R, pitch * D2R
    return Vector((math.sin(y) * math.cos(p), math.sin(p), math.cos(y) * math.cos(p)))


def build(c, grips=None):
    """Channel dict -> Pose. grips: optional {'R': (prop axis in hand frame)} unused: the prop axis is hand-local -X (see GRIPS in index.js: rot z = 90 degrees)."""
    P = Pose()
    P.root = [c['root_x'], c['root_y'], c['root_z']]
    P.rot['hips_root'] = [c['hip_p'] * D2R, c['hip_y'] * D2R, c['hip_r'] * D2R]
    for b, k in (('spine', 'sp'), ('chest', 'ch'), ('neck', 'nk'), ('head', 'hd')):
        P.rot[b] = [c[k + '_p'] * D2R, c[k + '_y'] * D2R, c[k + '_r'] * D2R]
    for s in 'LR':
        P.rot[f'shoulder_{s}'] = [0, 0, REST[f'shoulder_{s}'][2] + (c[f'{s}Sh'] * D2R) * (1 if s == 'L' else -1)]
        P.rot[f'upperarm_{s}'] = [c[f'{s}U_x'] * D2R, c[f'{s}U_y'] * D2R, c[f'{s}U_z'] * D2R]
        P.rot[f'forearm_{s}'] = [c[f'{s}E'] * D2R, 0, 0]
        P.rot[f'hand_{s}'] = [c[f'{s}Hd_x'] * D2R, c[f'{s}Hd_y'] * D2R, c[f'{s}Hd_z'] * D2R]
    hands(P, c['RG'], c['LG'])
    # arms by IK (the torso is posed first, so the shoulder target moves with the spine)
    for s in ('R', 'L'):
        w = c[f'{s}H_w']
        if w <= 0: continue
        Wc = fk(P); Oc = Wc['chest'] @ Vector((0, 0.091, 0.022)); Rc = Wc['chest'].to_3x3()   # hand targets are in the chest frame: they ride with the torso
        tgt = Oc + Rc @ Vector((c[f'{s}H_x'], c[f'{s}H_y'], c[f'{s}H_z']))
        if s == 'L' and c['grip2'] > 0:   # two hands on one shaft: the left hand sits on the weapon, grip2 metres along it from the right hand
            tgt = Wc['hand_R'].translation + wdir(c['RW_yaw'], c['RW_pitch']) * c['grip2']
        J = Wc[f'shoulder_{s}'] @ OFF[f'upperarm_{s}']; dv = tgt - J; RMAX = 0.425           # the arm is 0.447 m long: never ask for more than 95 percent of it
        RMIN = (OFF[f'forearm_{s}'] + rx(-1.7) @ OFF[f'hand_{s}']).length + 0.004            # and no closer than the folded elbow allows
        if dv.length > RMAX: P.clamp = max(P.clamp, dv.length - RMAX); tgt = J + dv.normalized() * RMAX
        elif dv.length < RMIN: P.clamp = max(P.clamp, RMIN - dv.length); tgt = J + dv.normalized() * RMIN
        before = [list(P.rot[f'upperarm_{s}']), list(P.rot[f'forearm_{s}'])]
        P.res = max(P.res, ik_arm(P, s, tgt, yaw=c[f'{s}E_b'] * D2R))
        for i, b in enumerate((f'upperarm_{s}', f'forearm_{s}')):
            P.rot[b] = [before[i][k] + (P.rot[b][k] - before[i][k]) * min(1.0, w) for k in range(3)]
        if s == 'L' and c['grip2'] > 0: c = dict(c, LW_w=1, LW_yaw=c['RW_yaw'], LW_pitch=c['RW_pitch'], LW_roll=c['RW_roll'])
        if c[f'{s}W_w'] > 0:  # orient the hand so the held thing points along (yaw, pitch) with its flat facing by roll
            W = fk(P); Rf = W[f'forearm_{s}'].to_3x3()
            d = wdir(c[f'{s}W_yaw'], c[f'{s}W_pitch'])
            ya = c[f'{s}W_yaw'] * D2R; n0 = Vector((math.cos(ya), 0.0, -math.sin(ya)))   # flat of the blade faces sideways: continuous even with the blade straight up
            n = Matrix.Rotation(c[f'{s}W_roll'] * D2R, 3, d) @ n0
            xh = -d if s == 'R' else d            # prop long axis is hand-local -X for the right hand; mirrored for the left
            zh = n; yh = zh.cross(xh).normalized(); zh = xh.cross(yh).normalized()
            Rd = Matrix((xh, yh, zh)).transposed()
            P.rot[f'hand_{s}'] = euler_of(Rf.transposed() @ Rd)
    # feet
    lift = P.root[1]
    for it in range(3):
        W = fk(P); lim = None
        for s in 'LR':
            y = c[f'{s}F_y'] + FOOT_H
            Hj = W['hips_root'] @ OFF[f'thigh_{s}']
            dy = math.sqrt(max((leg_reach() * 0.992) ** 2 - (c[f'{s}F_x'] - Hj.x) ** 2 - (c[f'{s}F_z'] - Hj.z) ** 2, 1e-4))
            l = P.root[1] + (y + dy - Hj.y); lim = l if lim is None else min(lim, l)
        P.root[1] = min(lift, lim)
    for s in 'LR':
        yaw, pit = c[f'{s}F_yaw'] * D2R, c[f'{s}F_pitch'] * D2R
        Rf = Matrix.Rotation(yaw, 3, 'Y') @ rx(pit)
        P.resl = max(P.resl, ik_leg(P, s, Vector((c[f'{s}F_x'], c[f'{s}F_y'] + FOOT_H, c[f'{s}F_z'])), Rf, yaw=(1 if s == 'L' else -1) * 0.06))
        P.rot[f'toe_{s}'] = [max(0.0, pit) * 0.9, 0, 0]
    return P


class Clip:
    """keys: Clip(dur).at(t, mode, **channels). Channels not named at a time are not keyed there; each channel follows only its own keys."""
    def __init__(self, name, dur, loop=False, fps=30, stretch=1.0, **meta):
        self.name, self.loop, self.fps, self.meta = name, loop, fps, meta; self.tr = {}; self.base = dict(DEF)
        self.sw, self.sa, self.sk = meta.get('w'), meta.get('a'), stretch
        self.dur = self.map(dur)
        if self.sa is not None: self.meta['a'] = round(self.map(self.sa), 4)

    def map(self, t):
        """Time as authored -> time as played: the active phase (w..a) is stretched by `stretch` so a strike is fast but not a one-frame snap; later keys shift with it."""
        if self.sk == 1.0 or self.sw is None: return t
        if t <= self.sw: return t
        if t <= self.sa: return self.sw + (t - self.sw) * self.sk
        return self.sw + (self.sa - self.sw) * self.sk + (t - self.sa)

    def default(self, **kw): self.base.update(kw); return self

    def at(self, t, mode='flow', **ch):
        for k, v in ch.items():
            assert k in DEF, f'unknown channel {k}'
            tm = self.map(t); lst = self.tr.setdefault(k, []); lst[:] = [a for a in lst if abs(a[0] - tm) > 1e-9]; lst.append((tm, v, mode))
        return self

    def sample(self, t):
        c = dict(self.base)
        for k, ks in self.tr.items():
            ks = sorted(ks, key=lambda a: a[0])
            if self.loop:  # periodic: keys at 0 and dur are the same key, and the tangents wrap around so the loop seam has no stall
                ks = [a for a in ks if a[0] < self.dur - 1e-9]
                if ks[0][0] > 1e-9: ks = [(0.0, self.base[k], 'flow')] + ks
                ks = [(a[0] - self.dur, a[1], a[2]) for a in ks] + ks + [(a[0] + self.dur, a[1], a[2]) for a in ks]
            elif ks[0][0] > 0: ks = [(0.0, self.base[k], 'flow')] + ks
            c[k] = track(ks, t)
        return c

    def render(self, travel=None):
        n = int(round(self.dur * self.fps)) + (0 if self.loop else 1)
        frames = []
        for i in range(n):
            t = i / self.fps if not self.loop else i * self.dur / n
            c = self.sample(t)
            if travel:  # feet were keyed in world space: subtract how far the entity has moved
                d = travel(t); c['LF_z'] -= d; c['RF_z'] -= d
            frames.append(build(c))
        ex = dict(self.meta); ex['loop'] = self.loop; ex['dur'] = round(self.dur, 4); ex['ikres_mm'] = round(max(f.res for f in frames) * 1000, 1); ex['clamp_mm'] = round(max(f.clamp for f in frames) * 1000, 1); ex['legres_mm'] = round(max(f.resl for f in frames) * 1000, 1)
        return {'name': self.name, 'fps': self.fps, 'frames': frames, 'extras': ex, 'travel': travel}


# ---------------------------------------------------------------- FK clips with floor contact (falls, rolls, vaults)
def rest_deg(b, dx=0.0, dy=0.0, dz=0.0):
    r = REST.get(b, (0, 0, 0)); return (r[0] / D2R + dx, r[1] / D2R + dy, r[2] / D2R + dz)


def ground(P, y0=0.06, w=1.0):
    """Shift the pelvis so the lowest joint of the body sits y0 above the floor (w = how much). Used for anything that lies on or rolls over the floor."""
    W = fk(P); low = min(W[b].translation.y for b in BONES if b not in ('toe_L', 'toe_R'))
    low = min(low, min((W[f'foot_{s}'] @ HEEL).y for s in 'LR'), min((W[f'hand_{s}'].translation.y - 0.03) for s in 'LR'))
    P.root[1] += (y0 - low) * w
    return P


class FKClip:
    """Keyed bone angles in degrees (rig.Keyed) with optional floor grounding weight 'gw' (0 airborne .. 1 on the floor)."""
    def __init__(self, name, dur, loop=False, fps=30, **meta):
        self.name, self.dur, self.loop, self.fps, self.meta = name, dur, loop, fps, meta; self.K = Keyed(dur); self.gw = []; self.gy = []

    def key(self, t, mode='flow', gw=None, gy=None, root=None, **bones):
        self.K.key(t, mode, root=root, **bones)
        if gw is not None: self.gw.append((t, gw, mode))
        if gy is not None: self.gy.append((t, gy, mode))
        return self

    def render(self, travel=None):
        n = int(round(self.dur * self.fps)) + (0 if self.loop else 1); frames = []
        for i in range(n):
            t = i / self.fps if not self.loop else i * self.dur / n
            P = self.K.pose_at(t)
            if self.gw:
                ks = sorted(self.gw, key=lambda a: a[0]); w = track(ks, t) if len(ks) > 1 else ks[0][1]
                y0 = track(sorted(self.gy, key=lambda a: a[0]), t) if len(self.gy) > 1 else (self.gy[0][1] if self.gy else 0.06)
                ground(P, y0=y0, w=max(0.0, min(1.0, w)))
            frames.append(P)
        ex = dict(self.meta); ex['loop'] = self.loop; ex['dur'] = round(self.dur, 4)
        return {'name': self.name, 'fps': self.fps, 'frames': frames, 'extras': ex, 'travel': travel}
