"""Gait generator: walk, jog, sprint and crouch-walk cycles with real foot planting.

The feet are planted in WORLD space: a heel strike fixes the heel, the foot rolls flat, then the heel lifts and the foot pivots about the ball until toe-off.
The ankle path comes out of that geometry (it is not drawn), the swing foot is a cubic Hermite that continues the toe-off velocity and arrives with the
strike velocity, plus a clearance bump, and the pelvis height is the highest the legs can reach (so no foot ever slides or floats). Two-bone IK then
turns each ankle target into thigh, shin and foot rotations. Loops start at left heel strike, so every gait shares the same phase and can be cross-blended.
"""
import math
from rig import *

TAU = 2 * math.pi


def _stance_ankle(u, z0, pH, pT, uf, uh):
    """Ankle (z, y, pitch) during stance, u in 0..1. Heel fixed at z0 until the foot is flat (uf), flat until uh, then pivot on the ball."""
    if u < uf:
        p = -pH * (1 - smooth(u / uf)) ** 1.5 if uf > 0 else 0
        v = rx(p) @ HEEL
        return z0 - v.z + HEEL.z * 0 + 0.0, -v.y, p, 'heel'
    if u < uh:
        return z0 - HEEL.z, FOOT_H, 0.0, 'flat'
    p = pT * smooth((u - uh) / (1 - uh)) ** 1.4
    ball_z = z0 - HEEL.z + BALL.z * 0 + (BALL.z - HEEL.z) + HEEL.z  # ball world z when flat = heel z + 0.20
    ball_z = z0 + (BALL.z - HEEL.z)
    v = rx(p) @ BALL
    return ball_z - v.z, -v.y, p, 'ball'


def gait(name, S, T, D, *, frames=None, fps=30, hc=0.10, pH=0.30, pT=0.65, bob=0.03, flex=0.03, sway=0.025, roll=0.035, yawA=0.09, armA=0.5, elbow=0.35, elbow_dyn=0.25, lean=0.04,
         width=0.095, spineYaw=0.6, uf=0.14, uh=0.45, toe_out=0.07, crouch=0.0, peak=0.45, head_lock=0.9, extras=None, knee_drive=0.0):
    """Returns clip dict. S metres per full cycle, T seconds per cycle, D stance fraction of the cycle per foot."""
    n = frames or int(round(T * fps)); v = S / T
    heel_ahead = S * D / 2 - 0.06                      # heel strike offset ahead of the pelvis so mid-stance is under the hip
    out = []; contacts = []
    reach = leg_reach() * 0.985
    # per-foot ankle trajectory as a function of cycle phase, in world coordinates where the pelvis is at z = v t
    def foot_world(ph, side_sign, tcyc):
        """ankle world (x, y, z, pitch, in_stance) for a foot whose phase (0 = its heel strike) is ph in [0,1), using stance fraction D."""
        z0 = heel_ahead  # heel world z at strike of the stance that begins at phase 0 (cycle-time 0 for the left foot)
        if ph < D:
            u = ph / D; z, y, p, kind = _stance_ankle(u, z0, pH, pT, uf, uh)
            return z, y, p, True
        # swing: from the toe-off state to the next strike state
        zs, ys, ps, _ = _stance_ankle(1.0, z0, pH, pT, uf, uh)
        ze, ye, pe, _ = _stance_ankle(0.0, z0 + S, pH, pT, uf, uh)
        us = (ph - D) / (1 - D); Ts = (1 - D) * T
        e = 1e-3
        z1, y1, _, _ = _stance_ankle(1.0 - e, z0, pH, pT, uf, uh); m0z = (zs - z1) / (e * D * T) * Ts; m0y = (ys - y1) / (e * D * T) * Ts
        z2, y2, _, _ = _stance_ankle(e, z0 + S, pH, pT, uf, uh); m1z = (z2 - ze) / (e * D * T) * Ts; m1y = (y2 - ye) / (e * D * T) * Ts
        z = hermite(zs, ze, m0z, m1z, us); y = hermite(ys, ye, m0y, m1y, us)
        # clearance bump, skewed so the peak is a little after mid swing; sprint adds a heel recovery
        w = us ** (math.log(0.5) / math.log(peak)); bump = math.sin(math.pi * w) ** 1.3
        y += hc * bump
        pitch = hermite(ps, pe, 0.0, 0.0, smoother(us)) if knee_drive == 0 else (ps + (pe - ps) * smoother(us)) - 0.25 * knee_drive * math.sin(math.pi * us)
        return z, y, pitch, False
    prev_ctr = {'L': 0.0, 'R': 0.0}
    for i in range(n):
        t = i * T / n; phi = i / n
        pz = v * t
        pose = Pose()
        # ---- pelvis ----
        ph_s = TAU * (phi - 0.05) if D > 0.5 else TAU * (phi - D / 2 + 0.25)
        sw = sway * math.sin(TAU * (phi - 0.05)) if D > 0.5 else sway * 0.6 * math.sin(TAU * (phi - D / 2 + 0.0))
        rl = roll * math.sin(TAU * (phi - 0.05))
        yaw = -yawA * math.cos(TAU * (phi - (0.0 if D > 0.5 else D / 2 - 0.1) * 0))
        fm = max(0.0, min(1.0, (0.55 - D) / 0.25))          # 0 walk .. 1 run
        if D > 0.5:
            lift_d = -flex - bob * (1 - math.cos(4 * math.pi * (phi - 0.3))) / 2
        else:
            lift_d = -flex - bob * (1 + math.cos(4 * math.pi * (phi - D / 2))) / 2 + 0 * fm
        lift_d -= crouch * 0.20
        pose.rot['hips_root'] = [lean * (0.5 + fm) + 0.28 * crouch * 0 + crouch * 0.12, yaw, rl]
        pose.root = [sw, lift_d, 0.0 + crouch * 0.05 + lean * 0.05]
        # ---- targets ----
        feet = {}
        for side, off_ph, sg in (('L', 0.0, 1.0), ('R', 0.5, -1.0)):
            ph = (phi - off_ph) % 1.0
            z, y, p, st = foot_world(ph, sg, t)
            # lateral: the stance foot stays put in world, the pelvis sways over it; foot x relative to the body mid line
            x = sg * width + sg * 0.012 * math.sin(math.pi * max(0.0, (ph - D) / (1 - D)))  if ph >= D else sg * width
            x -= 0.0
            zr = z - v * ph * T                                # pelvis sits at v*ph*T in this foot's own stance-local world
            feet[side] = (x, y, zr, p, st, ph)
        # reach-limited pelvis height (soft minimum so there is no kink): the pelvis is as high as the planted legs allow
        pose.root[1] = lift_d
        for _ in range(3):
            W = fk(pose); lim = None
            for side in 'LR':
                x, y, zr, p, st, ph = feet[side]
                if (not st) and y > 0.14: continue
                Hj = W['hips_root'] @ OFF[f'thigh_{side}']
                dy = math.sqrt(max(reach * reach - (x - Hj.x) ** 2 - (zr - Hj.z) ** 2, 1e-4))
                l = pose.root[1] + (y + dy - Hj.y)
                lim = l if lim is None else min(lim, l)
            if lim is not None:
                k = 0.012; pose.root[1] = -k * math.log(math.exp(-lift_d / k) + math.exp(-lim / k))
        # ---- legs ----
        res_total = 0
        for side in 'LR':
            x, y, zr, p, st, ph = feet[side]
            sg = 1 if side == 'L' else -1
            yawf = sg * toe_out
            Rf = rotm(p, yawf, 0)
            res_total += ik_leg(pose, side, Vector((x, y, zr)), Rf, yaw=sg * toe_out * 0.5)
            # toe bends with the roll so it stays on the floor in late stance
            pose.rot[f'toe_{side}'] = [max(0.0, p) * 0.9, 0, 0]
            contacts.append((i, side, st))
        # ---- spine, arms, head ----
        c = math.cos(TAU * phi); s = math.sin(TAU * phi)
        pose.rot['spine'] = [0.02 + lean * 0.8 + crouch * 0.12, -spineYaw * yaw * 1.0, -0.4 * rl]
        pose.rot['chest'] = [0.02 + 0.015 * math.cos(2 * TAU * phi), -spineYaw * yaw * 0.5, -0.3 * rl]
        pose.rot['neck'] = [-0.04 - lean, 0.0, 0.0]
        tot = yaw - spineYaw * yaw * 1.5
        pose.rot['head'] = [-0.02 + 0.02 * math.cos(2 * TAU * phi + 0.5), -tot * head_lock, 0.3 * rl * 0 - 0.5 * (-rl + 0.4 * rl)]
        for side, sg, ph_off in (('L', 1, 0.0), ('R', -1, 0.5)):
            q = TAU * (phi - ph_off - 0.06)
            swing = armA * math.cos(q)                    # positive = arm back while the same-side foot is forward: arms oppose the legs
            ur = REST[f'upperarm_{side}']
            pose.rot[f'upperarm_{side}'] = [ur[0] + swing * 0.9 - 0.1 * fm - 0.3 * crouch, ur[1], ur[2]]
            fl = elbow + elbow_dyn * (1 - math.cos(q)) / 2
            pose.rot[f'forearm_{side}'] = [REST[f"forearm_{side}"][0] - fl, 0, 0]
            for fn, rest in (('fingers', 0.25), ('fingers2', 0.3)):
                pose.rot[f'{fn}_{side}'] = [rest + 0.25 + 0.5 * fm, 0, 0]
        out.append(pose)
    ex = {'gait': True, 'loop': True, 'dur': round(n / fps, 4), 'stride': S, 'speed': round(v, 3), 'cycle': T, 'stance': D, 'contacts': 'left heel strike at 0, right at 0.5'}
    if extras: ex.update(extras)
    return {'name': name, 'fps': fps, 'frames': out, 'extras': ex}
