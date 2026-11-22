"""Interaction, social and crowd clips: pick up, drop, throw, give, take, push crate, carry, talk gestures, namaste, nod, listening and crowd idles."""
import math
from body import *
from gait import gait

ST = dict(root_y=-0.015, LF_x=0.11, RF_x=-0.11, LF_yaw=6, RF_yaw=-6, LG=0.3, RG=0.3)
HOME_L = dict(LH_x=0.20, LH_y=-0.30, LH_z=0.10)


def pickup():
    """Squat, reach the right hand to an item on the floor, take it (marker w = the grab), and rise with it held at the chest. 1.5 s."""
    K = Clip('pickup', 1.5, w=0.62, a=0.7); K.default(**ST); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.18, RH_y=-0.30, RH_z=0.08, LH_x=0.18, LH_y=-0.30, LH_z=0.08, root_y=-0.015, hip_p=0, sp_p=0, hd_p=0, RG=0.3)
    K.at(0.35, LH_x=0.26, LH_y=-0.12, LH_z=0.24, root_y=-0.34, hip_p=22, sp_p=22, hd_p=-16, LF_z=0.10, RF_z=-0.06)
    K.at(0.62, 'stop', RH_x=-0.10, RH_y=-0.40, RH_z=0.30, LH_x=0.26, LH_y=-0.12, LH_z=0.24, root_y=-0.55, hip_p=34, sp_p=30, ch_p=8, hd_p=-26, RG=0.3, LF_z=0.12, RF_z=-0.08)
    K.at(0.74, 'stop', RG=0.95, root_y=-0.55)
    K.at(1.12, RH_x=-0.14, RH_y=-0.18, RH_z=0.30, root_y=-0.26, hip_p=14, sp_p=12, hd_p=-8, LH_x=0.12, LH_y=-0.22, LH_z=0.26)
    K.at(1.5, 'stop', RH_x=-0.12, RH_y=-0.22, RH_z=0.30, LH_x=0.12, LH_y=-0.22, LH_z=0.26, root_y=-0.015, hip_p=0, sp_p=0, ch_p=0, hd_p=0, LF_z=0.0, RF_z=0.0)
    return K.render()


def drop():
    K = Clip('drop', 0.7, w=0.25, a=0.35); K.default(**ST); K.default(RH_w=1, LH_w=0)
    K.at(0.0, 'stop', RH_x=-0.12, RH_y=-0.22, RH_z=0.30, RG=0.95); K.at(0.25, 'stop', RH_x=-0.20, RH_y=-0.40, RH_z=0.16, RG=0.95, root_y=-0.05, sp_p=6, hd_p=-8)
    K.at(0.35, 'stop', RG=0.1); K.at(0.7, 'stop', RH_x=-0.18, RH_y=-0.30, RH_z=0.08, RG=0.25, root_y=-0.015, sp_p=0, hd_p=0)
    return K.render()


def throw_under():
    """Underhand lob (pots, lamps, stones): weight back, arm swings low behind, then up and out; the release marker a. 1.1 s."""
    K = Clip('throw_under', 1.1, w=0.45, a=0.6); K.default(**ST); K.default(**{'LF_z': 0.22, 'RF_z': -0.2, 'RF_yaw': -30, 'hip_y': -14}); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.14, RH_y=-0.22, RH_z=0.30, LH_x=0.16, LH_y=-0.22, LH_z=0.30, RG=0.9, root_y=-0.04, hip_y=-14)
    K.at(0.45, 'stop', RH_x=-0.20, RH_y=-0.40, RH_z=-0.12, LH_x=0.24, LH_y=-0.14, LH_z=0.22, RG=0.9, root_y=-0.12, root_z=-0.07, hip_y=-30, sp_y=-8, sp_p=10, hd_y=20)
    K.at(0.55, RH_x=-0.12, RH_y=-0.30, RH_z=0.34, root_y=-0.10, root_z=0.06, hip_y=0, sp_y=6, sp_p=14, LF_z=0.34, RG=0.9)
    K.at(0.6, 'stop', RH_x=-0.10, RH_y=0.05, RH_z=0.42, RG=0.2, root_z=0.10, hip_y=4, sp_y=8, sp_p=8)
    K.at(0.72, 'stop', RH_x=-0.10, RH_y=0.14, RH_z=0.38, RG=0.1)
    K.at(1.1, 'stop', RH_x=-0.14, RH_y=-0.22, RH_z=0.30, LH_x=0.16, LH_y=-0.22, LH_z=0.30, RG=0.25, root_y=-0.04, root_z=0, hip_y=-14, sp_y=0, sp_p=0, hd_y=0, LF_z=0.22)
    return K.render()


def throw_over():
    """Overhand throw (stone, spear): arm cocked behind the ear, the body opens, the arm whips through. 1.1 s."""
    K = Clip('throw_over', 1.1, w=0.5, a=0.64); K.default(**ST); K.default(**{'LF_z': 0.30, 'RF_z': -0.22, 'RF_yaw': -45, 'hip_y': -24}); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.14, RH_y=-0.22, RH_z=0.30, LH_x=0.16, LH_y=-0.22, LH_z=0.30, RG=0.9, root_y=-0.05, hip_y=-24)
    K.at(0.5, 'stop', RH_x=-0.20, RH_y=0.22, RH_z=-0.14, LH_x=0.20, LH_y=0.04, LH_z=0.34, RG=0.9, root_y=-0.10, root_z=-0.09, hip_y=-46, sp_y=-14, sp_p=-12, hd_y=40, RF_pitch=14)
    K.at(0.58, RH_x=-0.12, RH_y=0.30, RH_z=0.28, root_y=-0.12, root_z=0.10, hip_y=-4, sp_y=10, sp_p=10, LF_z=0.46, RG=0.9)
    K.at(0.64, 'stop', RH_x=-0.08, RH_y=0.08, RH_z=0.42, RG=0.1, hip_y=10, sp_y=18, sp_p=16)
    K.at(0.8, 'stop', RH_x=-0.04, RH_y=-0.16, RH_z=0.38, RG=0.1, hip_y=14)
    K.at(1.1, 'stop', RH_x=-0.14, RH_y=-0.22, RH_z=0.30, LH_x=0.16, LH_y=-0.22, LH_z=0.30, RG=0.25, root_y=-0.05, root_z=0, hip_y=-24, sp_y=0, sp_p=0, hd_y=26, LF_z=0.30)
    return K.render()


def give():
    K = Clip('give', 1.3, w=0.55, a=0.7); K.default(**ST); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.12, RH_y=-0.24, RH_z=0.26, LH_x=0.12, LH_y=-0.24, LH_z=0.26, RG=0.6, LG=0.6)
    K.at(0.55, 'stop', RH_x=-0.10, RH_y=-0.10, RH_z=0.44, LH_x=0.10, LH_y=-0.10, LH_z=0.44, RG=0.6, LG=0.6, sp_p=8, hd_p=-4, hd_y=0)
    K.at(0.7, 'stop', RG=0.05, LG=0.05)
    K.at(0.95, 'stop', RH_x=-0.10, RH_y=-0.10, RH_z=0.44, LH_x=0.10, LH_y=-0.10, LH_z=0.44, RG=0.05, LG=0.05, sp_p=8)
    K.at(1.3, 'stop', RH_x=-0.14, RH_y=-0.30, RH_z=0.12, LH_x=0.14, LH_y=-0.30, LH_z=0.12, RG=0.25, LG=0.25, sp_p=0, hd_p=0)
    return K.render()


def take():
    K = Clip('take', 1.2, w=0.4, a=0.5); K.default(**ST); K.default(RH_w=1, LH_w=0)
    K.at(0.0, 'stop', RH_x=-0.14, RH_y=-0.30, RH_z=0.10, RG=0.1)
    K.at(0.4, 'stop', RH_x=-0.10, RH_y=-0.10, RH_z=0.44, RG=0.05, sp_p=8, hd_p=-4)
    K.at(0.5, 'stop', RG=0.95); K.at(0.85, 'stop', RH_x=-0.10, RH_y=-0.10, RH_z=0.44, RG=0.95)
    K.at(1.2, 'stop', RH_x=-0.12, RH_y=-0.22, RH_z=0.30, RG=0.9, sp_p=0, hd_p=0)
    return K.render()


def carry_idle():
    """Carrying a crate or sack in front with both hands: leaning back a little to balance, breathing. 3 s loop."""
    K = Clip('carry_idle', 3.0, loop=True); K.default(**ST); K.default(RH_w=1, LH_w=1, RG=0.9, LG=0.9, sp_p=-6, hip_p=-2, root_y=-0.03, RH_x=-0.16, RH_y=-0.14, RH_z=0.34, LH_x=0.16, LH_y=-0.14, LH_z=0.34)
    K.at(0.0, ch_p=0); K.at(1.3, ch_p=-1.2, RH_y=-0.13, LH_y=-0.13); K.at(3.0, ch_p=0, RH_y=-0.14, LH_y=-0.14)
    return K.render()


def push_crate():
    """Pushing a crate: the gait generator drives the legs (short heavy steps, deep lean) and both hands stay on the crate face. 1.4 s loop."""
    g = gait('push_crate', 0.8, 1.4, 0.7, hc=0.05, bob=0.02, flex=0.05, armA=0.0, elbow=0.2, elbow_dyn=0.0, lean=0.30, roll=0.03, yawA=0.04, sway=0.015, crouch=0.15)
    for P in g['frames']:
        W = fk(P)
        for s, sg in (('L', 1), ('R', -1)):
            ik_arm(P, s, Vector((sg * 0.16, 1.00, 0.55)), yaw=sg * 0.2)
            P.rot[f'fingers_{s}'][0] = 0.4; P.rot[f'fingers2_{s}'][0] = 0.4
    g['extras'].update({'kind': 'push'}); return g


def talk(name, seed):
    K = Clip(name, 5.0, loop=True, kind='talk'); K.default(**ST); K.default(RH_w=1, LH_w=1, LG=0.3, RG=0.3, hip_r=1.0, sp_p=2)
    import random; r = random.Random(seed)
    K.default(LH_x=0.18, LH_y=-0.30, LH_z=0.14, RH_x=-0.18, RH_y=-0.30, RH_z=0.14)
    t = 0.0
    while t < 4.4:   # gestures: an open palm, a small chop, a point; the other hand mostly rests
        a = r.choice(['open', 'chop', 'point']); sg = r.choice([-1, 1]); s = 'R' if sg < 0 else 'L'
        if a == 'open': tgt = (sg * 0.20, -0.14, 0.36); g = 0.05
        elif a == 'chop': tgt = (sg * 0.12, -0.08, 0.38); g = 0.6
        else: tgt = (sg * 0.10, -0.02, 0.43); g = 0.7
        K.at(t, **{f'{s}H_x': sg * 0.18, f'{s}H_y': -0.30, f'{s}H_z': 0.14, f'{s}G': 0.25}); K.at(t + 0.3, **{f'{s}H_x': tgt[0], f'{s}H_y': tgt[1], f'{s}H_z': tgt[2], f'{s}G': g})
        K.at(t + 0.55, **{f'{s}H_x': tgt[0] + sg * 0.02, f'{s}H_y': tgt[1] - 0.05, f'{s}H_z': tgt[2] - 0.03}); K.at(t + 0.95, **{f'{s}H_x': sg * 0.18, f'{s}H_y': -0.30, f'{s}H_z': 0.14, f'{s}G': 0.25})
        t += 1.0 + r.random() * 0.5
    K.at(0.0, hd_p=0, hd_y=0, sp_r=0); K.at(1.0, hd_p=4, hd_y=5); K.at(1.4, hd_p=-2); K.at(2.4, hd_p=3, hd_y=-4, sp_r=-1.5); K.at(3.4, hd_p=5, hd_y=3); K.at(3.8, hd_p=-1); K.at(5.0, hd_p=0, hd_y=0, sp_r=0)
    return K.render()


def namaste():
    K = Clip('namaste', 3.0, kind='greet'); K.default(**ST); K.default(RH_w=1, LH_w=1, LG=0.0, RG=0.0)
    K.at(0.0, 'stop', RH_x=-0.18, RH_y=-0.30, RH_z=0.10, LH_x=0.18, LH_y=-0.30, LH_z=0.10, sp_p=0, hd_p=0, ch_p=0)
    K.at(0.7, 'stop', RH_x=-0.03, RH_y=-0.16, RH_z=0.30, LH_x=0.03, LH_y=-0.16, LH_z=0.30, sp_p=2, hd_p=2, ch_p=1)
    K.at(1.3, 'stop', sp_p=12, ch_p=5, hd_p=14, RH_x=-0.03, RH_y=-0.17, RH_z=0.31, LH_x=0.03, LH_y=-0.17, LH_z=0.31, hip_p=4)
    K.at(1.9, 'stop', sp_p=12, ch_p=5, hd_p=14, hip_p=4)
    K.at(2.4, 'stop', sp_p=2, hd_p=2, ch_p=1, hip_p=0, RH_x=-0.03, RH_y=-0.16, RH_z=0.30, LH_x=0.03, LH_y=-0.16, LH_z=0.30)
    K.at(3.0, 'stop', RH_x=-0.18, RH_y=-0.30, RH_z=0.10, LH_x=0.18, LH_y=-0.30, LH_z=0.10, sp_p=0, hd_p=0, ch_p=0)
    return K.render()


def nod():
    K = Clip('nod', 1.0, kind='greet'); K.default(**ST)
    K.at(0.0, 'stop', hd_p=0, nk_p=0, sp_p=0); K.at(0.22, hd_p=14, nk_p=6, sp_p=1.5); K.at(0.42, hd_p=-1, nk_p=0, sp_p=0); K.at(0.62, hd_p=9, nk_p=4, sp_p=1); K.at(1.0, 'stop', hd_p=0, nk_p=0, sp_p=0)
    return K.render()


def crowd(name, kind):
    K = Clip(name, 6.0, loop=True, kind='crowd'); K.default(**ST)
    if kind == 'folded':
        K.default(RH_w=1, LH_w=1, RG=0.6, LG=0.6, RH_x=-0.02, RH_y=-0.22, RH_z=0.30, LH_x=0.10, LH_y=-0.20, LH_z=0.28, root_x=0.02, hip_r=2, sp_r=-2, RF_z=-0.08, RF_yaw=-16)
    elif kind == 'hips':
        K.default(RH_w=1, LH_w=1, RG=0.5, LG=0.5, RH_x=-0.24, RH_y=-0.42, RH_z=0.04, LH_x=0.24, LH_y=-0.42, LH_z=0.04, root_x=-0.02, hip_r=-2, sp_r=2, LF_z=0.06, LF_yaw=14)
    else:
        K.default(root_x=0.02, hip_r=2, sp_r=-2, RF_z=-0.1, sp_p=3, hd_p=2)
    K.at(0.0, ch_p=0, hd_y=0, hd_p=0); K.at(2.0, ch_p=-1.2, hd_y=8, hd_p=1); K.at(3.6, ch_p=0, hd_y=-5, hd_p=-1); K.at(5.0, ch_p=-1.0, hd_y=3); K.at(6.0, ch_p=0, hd_y=0, hd_p=0)
    return K.render()


def alert_look():
    K = Clip('alert_look', 3.2, loop=True, kind='alert'); K.default(**ST); K.default(root_y=-0.06, sp_p=5, hip_p=5, LF_z=0.2, RF_z=-0.1, RF_yaw=-20, LG=0.6, RG=0.6)
    K.at(0.0, hd_y=0, sp_y=0, ch_y=0); K.at(0.8, hd_y=38, sp_y=8, ch_y=10); K.at(1.4, hd_y=38); K.at(2.2, hd_y=-38, sp_y=-8, ch_y=-10); K.at(2.8, hd_y=-38); K.at(3.2, hd_y=0, sp_y=0, ch_y=0)
    return K.render()


def hold_poses():
    """Grip holds: arms for carrying a weapon at rest (the legs and torso come from the locomotion clips). Looping 3 s breathing."""
    out = []
    for nm, prop, cfg in (('hold_staff', 'staff', dict(RH=(-0.14, -0.20, 0.20), W=(0, 90), g2=0.0)), ('hold_spear', 'spear', dict(RH=(-0.14, -0.20, 0.20), W=(0, 90), g2=0.0)),
                          ('hold_sword', 'sword', dict(RH=(-0.14, -0.26, 0.22), W=(10, 62), g2=0.0)), ('hold_club', 'club', dict(RH=(-0.14, -0.26, 0.22), W=(10, 40), g2=0.0))):
        K = Clip(nm, 3.0, loop=True, kind='hold', propR=prop); K.default(**ST); K.default(RH_w=1, RW_w=1, RW_yaw=cfg['W'][0], RW_pitch=cfg['W'][1], RG=0.95, LG=0.3)
        K.default(RH_x=cfg['RH'][0], RH_y=cfg['RH'][1], RH_z=cfg['RH'][2]); K.at(0.0, ch_p=0); K.at(1.3, ch_p=-1.2); K.at(3.0, ch_p=0)
        out.append(K.render())
    return out


def all_clips():
    return [pickup(), drop(), throw_under(), throw_over(), give(), take(), carry_idle(), push_crate(), talk('talk_a', 3), talk('talk_b', 11), talk('talk_c', 29), namaste(), nod(),
            crowd('crowd_a', 'folded'), crowd('crowd_b', 'hips'), crowd('crowd_c', 'relaxed'), alert_look()] + hold_poses()
