"""Combat clips. Every attack carries markers in extras: w = end of the wind-up (the swing starts), a = end of the active phase, dur = whole clip.
The game's sim drives a clip by phase (windup 0..1, active 0..1, recover 0..1) mapped onto [0,w], [w,a], [a,dur] (see src/gfx/human/clips/plan.js).
Hand targets are in the chest frame (x left, y up from the shoulder line, z forward); blade/shaft direction is in the world as yaw (0 = forward, + = to the
character's left) and pitch (90 = up, 0 = level forward, negative = down). Arms are short (0.45 m shoulder to wrist), so targets stay within about 0.42 m."""
from body import *

SW = dict(LF_x=0.17, LF_z=0.30, LF_yaw=-8, RF_x=-0.17, RF_z=-0.20, RF_yaw=-50, root_y=-0.07, hip_y=-24, hip_p=4, sp_y=-4, ch_y=-4, sp_p=3, nk_p=-3, hd_y=26, LG=0.5, RG=0.95, root_z=0.0)
FI = dict(LF_x=0.16, LF_z=0.28, LF_yaw=-6, RF_x=-0.18, RF_z=-0.22, RF_yaw=-45, root_y=-0.08, hip_y=-22, hip_p=6, sp_y=-4, ch_y=-4, sp_p=6, nk_p=-6, hd_y=24, LG=0.95, RG=0.95)


def weapon_clip(name, dur, w, a, base, propR=None, propL=None, **meta):
    K = Clip(name, dur, stretch=1.45, w=w, a=a, propR=propR, propL=propL, **meta); K.default(**base)
    K.default(RH_w=1, RW_w=1, LH_w=1)
    return K


def guard_keys(K, t, **extra):  # the shared sword and shield guard
    K.at(t, RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, RW_roll=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30, **extra)


def sword_light_1():
    K = weapon_clip('sword_light_1', 1.3, 0.5, 0.72, SW, propR='sword', propL='shield'); K.default(LE_b=0)
    guard_keys(K, 0.0)
    K.at(0.0, 'stop', root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hip_p=4, LF_z=0.30, RF_z=-0.20, RF_pitch=0)
    # anticipation: the body sinks and the hand drops a little, then the coil and the raise (0.45 s and more of readable wind-up)
    K.at(0.10, root_y=-0.10, root_z=-0.03, hip_p=6, RH_y=-0.17, RH_z=0.30, RW_pitch=64)
    K.at(0.50, 'stop', RH_x=-0.20, RH_y=0.30, RH_z=-0.04, RW_yaw=-12, RW_pitch=122, RW_roll=25, root_y=-0.09, root_z=-0.08, hip_y=-46, sp_y=-14, ch_y=-12, sp_p=-6, hip_p=3, hd_y=44, RF_pitch=0)
    K.at(0.50, LH_x=0.20, LH_y=-0.10, LH_z=0.26)
    K.at(0.61, RH_x=0.02, RH_y=-0.14, RH_z=0.40, RW_yaw=32, RW_pitch=8, RW_roll=0, root_y=-0.13, root_z=0.14, hip_y=6, sp_y=10, ch_y=8, sp_p=14, hip_p=8, hd_y=18, LF_z=0.46, RF_z=-0.12, RF_pitch=18)
    K.at(0.72, 'stop', RH_x=0.16, RH_y=-0.27, RH_z=0.36, RW_yaw=58, RW_pitch=-36, root_y=-0.13, root_z=0.16, hip_y=14, sp_y=20, ch_y=14, sp_p=16, hd_y=10)
    K.at(0.80, 'stop', RH_x=0.16, RH_y=-0.27, RH_z=0.36, RW_yaw=58, RW_pitch=-36)
    K.at(1.30, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, RW_roll=0, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hip_p=4, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30)
    return K.render()


def sword_light_2():
    K = weapon_clip('sword_light_2', 1.15, 0.46, 0.66, SW, propR='sword', propL='shield')
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07, hip_y=-24, sp_y=-4, ch_y=-4)
    K.at(0.10, root_y=-0.10, root_z=-0.02, RH_y=-0.20, RW_pitch=50)
    K.at(0.46, 'stop', RH_x=0.12, RH_y=-0.28, RH_z=0.30, RW_yaw=58, RW_pitch=-25, RW_roll=-20, root_y=-0.10, root_z=-0.05, hip_y=6, sp_y=14, ch_y=12, sp_p=6, hd_y=12, LH_x=0.18, LH_y=-0.12, LH_z=0.30)
    K.at(0.56, RH_x=-0.12, RH_y=0.04, RH_z=0.38, RW_yaw=-6, RW_pitch=38, RW_roll=10, root_y=-0.12, root_z=0.12, hip_y=-34, sp_y=-12, ch_y=-12, sp_p=10, hd_y=40, LF_z=0.42, RF_pitch=14)
    K.at(0.66, 'stop', RH_x=-0.20, RH_y=0.20, RH_z=0.22, RW_yaw=-30, RW_pitch=70, root_y=-0.12, root_z=0.13, hip_y=-44, sp_y=-18, ch_y=-14, sp_p=8, hd_y=48)
    K.at(0.74, 'stop', RH_x=-0.20, RH_y=0.20, RH_z=0.22, RW_yaw=-30, RW_pitch=70)
    K.at(1.15, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, RW_roll=0, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hd_y=26, LF_z=0.30, RF_pitch=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30)
    return K.render()


def sword_light_3():
    K = weapon_clip('sword_light_3', 1.25, 0.5, 0.7, SW, propR='sword', propL='shield')
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07, hip_y=-24)
    K.at(0.12, root_y=-0.10, root_z=-0.04, hip_y=-30, RH_y=-0.16, RH_z=0.26)
    K.at(0.50, 'stop', RH_x=-0.14, RH_y=-0.14, RH_z=0.12, RW_yaw=12, RW_pitch=14, root_y=-0.11, root_z=-0.10, hip_y=-48, sp_y=-14, ch_y=-12, sp_p=2, hd_y=46, LH_x=0.16, LH_y=-0.12, LH_z=0.24)
    K.at(0.62, RH_x=-0.10, RH_y=-0.06, RH_z=0.43, RW_yaw=4, RW_pitch=-2, root_y=-0.16, root_z=0.26, hip_y=-8, sp_y=0, ch_y=0, sp_p=10, hip_p=8, hd_y=26, LF_z=0.66, RF_z=-0.14, RF_pitch=20)
    K.at(0.70, 'stop', RH_x=-0.10, RH_y=-0.07, RH_z=0.44, RW_yaw=4, RW_pitch=-4, root_y=-0.16, root_z=0.28)
    K.at(0.82, 'stop', RH_x=-0.10, RH_y=-0.07, RH_z=0.44, RW_yaw=4, RW_pitch=-4)
    K.at(1.25, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30)
    return K.render()


def sword_heavy():
    K = weapon_clip('sword_heavy', 1.8, 0.85, 1.07, SW, propR='sword', propL='shield')
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07, hip_y=-24)
    K.at(0.2, root_y=-0.14, root_z=-0.05, hip_p=8, RH_y=-0.2, RH_z=0.28)
    K.at(0.85, 'stop', RH_x=-0.14, RH_y=0.40, RH_z=0.02, RW_yaw=0, RW_pitch=112, RW_roll=0, root_y=-0.05, root_z=-0.10, hip_y=-40, sp_y=-8, ch_y=-8, sp_p=-14, hip_p=0, hd_y=36, LH_x=0.22, LH_y=0.0, LH_z=0.20, LF_z=0.28, RF_z=-0.22, RF_pitch=22)
    K.at(0.98, RH_x=-0.06, RH_y=-0.22, RH_z=0.42, RW_yaw=4, RW_pitch=-34, root_y=-0.20, root_z=0.30, hip_y=-2, sp_y=4, ch_y=4, sp_p=26, hip_p=14, hd_y=20, LF_z=0.62, RF_z=-0.10, RF_pitch=14)
    K.at(1.07, 'stop', RH_x=-0.04, RH_y=-0.30, RH_z=0.40, RW_yaw=4, RW_pitch=-52, root_y=-0.22, root_z=0.32, sp_p=30)
    K.at(1.25, 'stop', RH_x=-0.04, RH_y=-0.30, RH_z=0.40, RW_yaw=4, RW_pitch=-52)
    K.at(1.8, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hip_p=4, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30)
    return K.render()


def club_overhead():
    K = weapon_clip('club_overhead', 1.5, 0.55, 0.74, SW, propR='club'); K.default(LG=0.4, LH_w=0, LU_x=-12, LE=20)
    K.at(0.0, 'stop', RH_x=-0.12, RH_y=-0.16, RH_z=0.28, RW_yaw=10, RW_pitch=55, root_y=-0.06, hip_y=-18)
    K.at(0.12, root_y=-0.10, root_z=-0.03, RH_y=-0.20)
    K.at(0.55, 'stop', RH_x=-0.16, RH_y=0.34, RH_z=-0.06, RW_yaw=0, RW_pitch=118, root_y=-0.05, root_z=-0.08, hip_y=-34, sp_y=-8, sp_p=-16, ch_p=-4, hip_p=0, hd_y=30, RF_pitch=20)
    K.at(0.65, RH_x=-0.08, RH_y=-0.12, RH_z=0.40, RW_yaw=4, RW_pitch=-10, root_y=-0.17, root_z=0.22, hip_y=-6, sp_y=2, sp_p=22, hip_p=10, hd_y=20, LF_z=0.55, RF_pitch=12)
    K.at(0.74, 'stop', RH_x=-0.06, RH_y=-0.24, RH_z=0.38, RW_yaw=4, RW_pitch=-40, root_y=-0.19, root_z=0.25, sp_p=26)
    K.at(0.9, 'stop', RH_x=-0.06, RH_y=-0.24, RH_z=0.38, RW_yaw=4, RW_pitch=-40)
    K.at(1.5, 'stop', RH_x=-0.12, RH_y=-0.16, RH_z=0.28, RW_yaw=10, RW_pitch=55, root_y=-0.06, root_z=0.0, hip_y=-18, sp_y=-4, sp_p=3, LF_z=0.30, hd_y=26, RF_pitch=0)
    return K.render()


def staff_swing():
    K = weapon_clip('staff_swing', 1.25, 0.5, 0.68, SW, propR='staff'); K.default(grip2=0.20, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=18, RW_pitch=48, root_y=-0.07, hip_y=-20)
    K.at(0.12, root_y=-0.10, root_z=-0.03)
    K.at(0.5, 'stop', RH_x=-0.20, RH_y=-0.10, RH_z=0.04, RW_yaw=-70, RW_pitch=12, root_y=-0.10, root_z=-0.07, hip_y=-52, sp_y=-14, ch_y=-12, hd_y=48, RF_pitch=16)
    K.at(0.6, RH_x=-0.04, RH_y=-0.10, RH_z=0.36, RW_yaw=20, RW_pitch=8, root_y=-0.13, root_z=0.12, hip_y=2, sp_y=10, ch_y=10, sp_p=10, hd_y=24, LF_z=0.46)
    K.at(0.68, 'stop', RH_x=0.06, RH_y=-0.12, RH_z=0.30, RW_yaw=78, RW_pitch=6, hip_y=16, sp_y=20, ch_y=14, hd_y=8)
    K.at(0.8, 'stop', RH_x=0.06, RH_y=-0.12, RH_z=0.30, RW_yaw=78, RW_pitch=6)
    K.at(1.25, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=18, RW_pitch=48, root_y=-0.07, root_z=0.0, hip_y=-20, sp_y=-4, ch_y=-4, sp_p=3, hd_y=26, LF_z=0.30, RF_pitch=0)
    return K.render()


def staff_heavy():
    K = weapon_clip('staff_heavy', 1.55, 0.7, 0.9, SW, propR='staff'); K.default(grip2=0.20, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=18, RW_pitch=48, root_y=-0.07, hip_y=-20)
    K.at(0.16, root_y=-0.12, root_z=-0.04, hip_p=8)
    K.at(0.70, 'stop', RH_x=-0.10, RH_y=0.30, RH_z=0.04, RW_yaw=0, RW_pitch=108, root_y=-0.03, root_z=-0.08, hip_y=-30, sp_y=-6, sp_p=-16, hip_p=0, hd_y=24, RF_pitch=20)
    K.at(0.82, RH_x=-0.06, RH_y=-0.14, RH_z=0.38, RW_yaw=6, RW_pitch=-6, root_y=-0.20, root_z=0.26, hip_y=-2, sp_y=2, sp_p=24, hip_p=12, hd_y=18, LF_z=0.58, RF_pitch=10)
    K.at(0.90, 'stop', RH_x=-0.05, RH_y=-0.22, RH_z=0.36, RW_yaw=6, RW_pitch=-34, root_y=-0.22, root_z=0.28, sp_p=28)
    K.at(1.05, 'stop', RH_x=-0.05, RH_y=-0.22, RH_z=0.36, RW_yaw=6, RW_pitch=-34)
    K.at(1.55, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=18, RW_pitch=48, root_y=-0.07, root_z=0.0, hip_y=-20, sp_y=-4, sp_p=3, hip_p=4, hd_y=26, LF_z=0.30, RF_pitch=0)
    return K.render()


def spear_thrust():
    K = weapon_clip('spear_thrust', 1.3, 0.55, 0.72, SW, propR='spear'); K.default(grip2=0.20, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.10, RH_y=-0.20, RH_z=0.22, RW_yaw=8, RW_pitch=24, root_y=-0.08, hip_y=-22)
    K.at(0.14, root_y=-0.12, root_z=-0.04)
    K.at(0.55, 'stop', RH_x=-0.12, RH_y=-0.22, RH_z=0.04, RW_yaw=10, RW_pitch=16, root_y=-0.14, root_z=-0.14, hip_y=-46, sp_y=-12, ch_y=-10, hip_p=6, hd_y=44, RF_pitch=16)
    K.at(0.65, RH_x=-0.10, RH_y=-0.14, RH_z=0.40, RW_yaw=4, RW_pitch=2, root_y=-0.18, root_z=0.30, hip_y=-8, sp_y=0, ch_y=2, sp_p=12, hip_p=10, hd_y=24, LF_z=0.78, RF_z=-0.08, RF_pitch=24)
    K.at(0.72, 'stop', RH_x=-0.10, RH_y=-0.14, RH_z=0.42, RW_yaw=4, RW_pitch=1, root_z=0.33)
    K.at(0.85, 'stop', RH_x=-0.10, RH_y=-0.14, RH_z=0.42, RW_yaw=4, RW_pitch=1)
    K.at(1.3, 'stop', RH_x=-0.10, RH_y=-0.20, RH_z=0.22, RW_yaw=8, RW_pitch=24, root_y=-0.08, root_z=0.0, hip_y=-22, sp_y=-4, ch_y=-4, hip_p=4, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0)
    return K.render()


def spear_sweep():
    K = weapon_clip('spear_sweep', 1.6, 0.7, 0.92, SW, propR='spear'); K.default(grip2=0.20, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.10, RH_y=-0.20, RH_z=0.22, RW_yaw=8, RW_pitch=24, root_y=-0.08, hip_y=-22)
    K.at(0.2, root_y=-0.13, root_z=-0.04)
    K.at(0.7, 'stop', RH_x=-0.20, RH_y=-0.18, RH_z=0.04, RW_yaw=-80, RW_pitch=-4, root_y=-0.14, root_z=-0.08, hip_y=-58, sp_y=-14, ch_y=-12, hd_y=54, RF_pitch=16)
    K.at(0.82, RH_x=-0.04, RH_y=-0.18, RH_z=0.34, RW_yaw=10, RW_pitch=-4, root_y=-0.16, root_z=0.10, hip_y=0, sp_y=10, ch_y=10, hd_y=26, LF_z=0.46)
    K.at(0.92, 'stop', RH_x=0.06, RH_y=-0.18, RH_z=0.26, RW_yaw=88, RW_pitch=-6, hip_y=22, sp_y=22, ch_y=16, hd_y=6)
    K.at(1.05, 'stop', RH_x=0.06, RH_y=-0.18, RH_z=0.26, RW_yaw=88, RW_pitch=-6)
    K.at(1.6, 'stop', RH_x=-0.10, RH_y=-0.20, RH_z=0.22, RW_yaw=8, RW_pitch=24, root_y=-0.08, root_z=0.0, hip_y=-22, sp_y=-4, ch_y=-4, hd_y=26, LF_z=0.30, RF_pitch=0)
    return K.render()


def fists_jab():
    K = Clip('fists_jab', 0.95, stretch=1.5, w=0.45, a=0.6); K.default(**FI); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_y=-0.08, hip_y=-22)
    K.at(0.14, LH_z=0.26, LH_y=-0.14, root_z=-0.03, hip_y=-30, sp_y=-8)
    K.at(0.45, 'stop', LH_x=0.18, LH_y=-0.12, LH_z=0.16, RH_x=-0.14, RH_y=0.0, RH_z=0.28, root_z=-0.05, hip_y=-34, sp_y=-10, ch_y=-8, hd_y=34, RF_pitch=8)
    K.at(0.54, LH_x=0.10, LH_y=0.0, LH_z=0.45, root_z=0.10, hip_y=-8, sp_y=8, ch_y=8, sp_p=8, hd_y=22, LF_z=0.38, RF_pitch=16)
    K.at(0.62, 'stop', LH_x=0.09, LH_y=0.0, LH_z=0.46, root_z=0.12, hip_y=-4, sp_y=10, ch_y=10)
    K.at(0.72, 'stop', LH_x=0.09, LH_y=0.0, LH_z=0.46)
    K.at(0.95, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_z=0.0, hip_y=-22, sp_y=-4, ch_y=-4, sp_p=6, hd_y=24, LF_z=0.28, RF_pitch=0)
    K.meta['propR'] = None
    return K.render()


def fists_cross():
    K = Clip('fists_cross', 1.05, stretch=1.5, w=0.5, a=0.66); K.default(**FI); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_y=-0.08, hip_y=-22)
    K.at(0.16, root_y=-0.11, root_z=-0.04)
    K.at(0.5, 'stop', RH_x=-0.18, RH_y=-0.06, RH_z=0.10, LH_x=0.18, LH_y=-0.06, LH_z=0.28, root_y=-0.11, root_z=-0.08, hip_y=-50, sp_y=-14, ch_y=-12, sp_p=3, hd_y=44, RF_pitch=10)
    K.at(0.6, RH_x=-0.10, RH_y=0.02, RH_z=0.44, LH_x=0.20, LH_y=-0.04, LH_z=0.22, root_y=-0.13, root_z=0.14, hip_y=6, sp_y=14, ch_y=12, sp_p=10, hd_y=18, LF_z=0.34, RF_pitch=30)
    K.at(0.66, 'stop', RH_x=-0.09, RH_y=0.02, RH_z=0.46, hip_y=12, sp_y=18, ch_y=14, root_z=0.16)
    K.at(0.78, 'stop', RH_x=-0.09, RH_y=0.02, RH_z=0.46)
    K.at(1.05, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_z=0.0, hip_y=-22, sp_y=-4, ch_y=-4, sp_p=6, root_y=-0.08, hd_y=24, RF_pitch=0, LF_z=0.28)
    return K.render()


def fists_kick():
    K = Clip('fists_kick', 1.3, stretch=1.5, w=0.55, a=0.78); K.default(**FI); K.default(RH_w=1, LH_w=1)
    K.at(0.0, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_y=-0.08, hip_y=-22, RF_x=-0.18, RF_y=0.0, RF_z=-0.22, RF_yaw=-45)
    K.at(0.18, root_y=-0.10, root_z=-0.03, LF_yaw=20)
    # chamber: knee up with the foot tucked, support foot pivots, arms open for balance
    K.at(0.55, 'stop', RF_x=-0.20, RF_y=0.42, RF_z=0.18, RF_yaw=-30, RF_pitch=60, LF_yaw=40, root_y=-0.07, root_z=-0.05, hip_y=-30, sp_p=-10, hip_p=-4, LH_x=0.30, LH_y=-0.16, LH_z=0.14, RH_x=-0.30, RH_y=-0.18, RH_z=0.14, hd_y=24)
    K.at(0.66, RF_x=-0.10, RF_y=0.70, RF_z=0.62, RF_yaw=-6, RF_pitch=-8, root_y=-0.06, root_z=-0.02, hip_y=-8, sp_p=-18, hip_p=-8, ch_p=-4, hd_y=18)
    K.at(0.78, 'stop', RF_x=-0.10, RF_y=0.72, RF_z=0.66, RF_yaw=-6, RF_pitch=-10, sp_p=-20, hip_p=-9)
    K.at(0.92, 'stop', RF_x=-0.20, RF_y=0.42, RF_z=0.30, RF_yaw=-30, RF_pitch=40, sp_p=-6, hip_p=-2)
    K.at(1.3, 'stop', RF_x=-0.18, RF_y=0.0, RF_z=-0.22, RF_yaw=-45, RF_pitch=0, LF_yaw=-6, LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.16, RH_y=-0.02, RH_z=0.26, root_y=-0.08, root_z=0.0, hip_y=-22, sp_p=6, hip_p=6, ch_p=0, hd_y=24)
    return K.render()


def shield_bash():
    K = weapon_clip('shield_bash', 1.35, 0.55, 0.75, SW, propR='sword', propL='shield')
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07, hip_y=-24)
    K.at(0.14, root_y=-0.11, root_z=-0.04, LH_z=0.24)
    K.at(0.55, 'stop', LH_x=0.18, LH_y=-0.10, LH_z=0.08, RH_x=-0.14, RH_y=-0.14, RH_z=0.30, root_y=-0.12, root_z=-0.09, hip_y=-44, sp_y=-12, ch_y=-10, hd_y=40, RF_pitch=14)
    K.at(0.64, LH_x=0.12, LH_y=-0.02, LH_z=0.44, root_y=-0.14, root_z=0.20, hip_y=-6, sp_y=6, ch_y=8, sp_p=12, hip_p=10, hd_y=22, LF_z=0.60, RF_pitch=22)
    K.at(0.75, 'stop', LH_x=0.11, LH_y=-0.02, LH_z=0.45, root_z=0.23, hip_y=0, sp_y=10, ch_y=10)
    K.at(0.9, 'stop', LH_x=0.11, LH_y=-0.02, LH_z=0.45)
    K.at(1.35, 'stop', LH_x=0.19, LH_y=-0.13, LH_z=0.30, RH_x=-0.12, RH_y=-0.12, RH_z=0.33, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hd_y=26, LF_z=0.30, RF_pitch=0)
    return K.render()


def captain_lunge():
    K = weapon_clip('captain_lunge', 2.0, 0.8, 1.08, SW, propR='sword', propL='shield'); K.default(LF_z=0.34)
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07, hip_y=-24)
    K.at(0.2, root_y=-0.2, root_z=-0.06, hip_p=10, sp_p=8, RH_y=-0.2, RH_z=0.26)
    K.at(0.8, 'stop', RH_x=-0.16, RH_y=-0.12, RH_z=0.06, RW_yaw=6, RW_pitch=10, root_y=-0.26, root_z=-0.16, hip_y=-52, sp_y=-14, ch_y=-12, sp_p=10, hip_p=12, hd_y=48, LH_x=0.20, LH_y=-0.1, LH_z=0.20, LF_z=0.30, RF_z=-0.26, RF_pitch=22)
    K.at(0.94, RH_x=-0.10, RH_y=-0.06, RH_z=0.44, RW_yaw=2, RW_pitch=-4, root_y=-0.30, root_z=0.40, hip_y=-4, sp_y=2, ch_y=2, sp_p=18, hip_p=14, hd_y=22, LF_z=1.0, RF_z=-0.18, RF_pitch=30)
    K.at(1.08, 'stop', RH_x=-0.10, RH_y=-0.06, RH_z=0.45, RW_yaw=2, RW_pitch=-5, root_y=-0.32, root_z=0.44)
    K.at(1.3, 'stop', RH_x=-0.10, RH_y=-0.06, RH_z=0.45)
    K.at(2.0, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, root_y=-0.07, root_z=0.0, hip_y=-24, sp_y=-4, ch_y=-4, sp_p=3, hip_p=4, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0, LH_x=0.19, LH_y=-0.13, LH_z=0.30)
    return K.render()


def captain_slam():
    K = weapon_clip('captain_slam', 2.3, 0.9, 1.1, SW, propR='club'); K.default(grip2=0.20, LH_w=1)
    K.at(0.0, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=14, RW_pitch=50, root_y=-0.07, hip_y=-20)
    K.at(0.2, root_y=-0.16, root_z=-0.04, hip_p=10)
    K.at(0.9, 'stop', RH_x=-0.08, RH_y=0.34, RH_z=0.02, RW_yaw=0, RW_pitch=100, root_y=-0.02, root_z=-0.12, hip_y=-16, sp_y=-4, sp_p=-20, hip_p=-2, hd_y=10, LF_z=0.24, RF_z=-0.24, RF_pitch=24)
    K.at(1.0, RH_x=-0.06, RH_y=-0.12, RH_z=0.40, RW_yaw=2, RW_pitch=-12, root_y=-0.28, root_z=0.26, hip_y=0, sp_y=0, sp_p=32, hip_p=18, hd_y=6, LF_z=0.34, RF_z=-0.14, RF_pitch=6)
    K.at(1.1, 'stop', RH_x=-0.05, RH_y=-0.26, RH_z=0.36, RW_yaw=2, RW_pitch=-48, root_y=-0.32, root_z=0.30, sp_p=36)
    K.at(1.5, 'stop', RH_x=-0.05, RH_y=-0.26, RH_z=0.36, RW_yaw=2, RW_pitch=-48)
    K.at(2.3, 'stop', RH_x=-0.08, RH_y=-0.22, RH_z=0.22, RW_yaw=14, RW_pitch=50, root_y=-0.07, root_z=0.0, hip_y=-20, sp_y=-4, sp_p=3, hip_p=4, hd_y=26, LF_z=0.30, RF_z=-0.20, RF_pitch=0)
    return K.render()


def captain_call():
    K = Clip('captain_call', 1.5); K.default(**SW); K.default(RH_w=1, LH_w=0)
    K.at(0.0, 'stop', RH_x=-0.14, RH_y=-0.14, RH_z=0.30, root_y=-0.07, hd_p=0, sp_p=3)
    K.at(0.3, 'stop', RH_x=-0.20, RH_y=0.36, RH_z=0.04, sp_p=-14, ch_p=-8, hd_p=-22, root_y=-0.04, hip_p=-2, RG=1.0, LG=1.0)
    K.at(1.1, 'stop', RH_x=-0.20, RH_y=0.36, RH_z=0.04, sp_p=-14, ch_p=-8, hd_p=-22)
    K.at(1.5, 'stop', RH_x=-0.14, RH_y=-0.14, RH_z=0.30, root_y=-0.07, hd_p=0, sp_p=3, ch_p=0, hip_p=4)
    K.meta['propR'] = None
    return K.render()


def block_hold():
    K = weapon_clip('block_hold', 0.5, 0.2, 0.5, SW, propR='sword', propL='shield'); K.default(root_y=-0.10)
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07)
    K.at(0.12, 'stop', LH_x=0.06, LH_y=0.0, LH_z=0.36, RH_x=-0.10, RH_y=-0.06, RH_z=0.30, RW_yaw=40, RW_pitch=60, root_y=-0.12, root_z=-0.03, sp_p=8, ch_p=4, hip_p=8, hd_y=24, hd_p=4)
    K.at(0.5, 'stop', LH_x=0.06, LH_y=0.0, LH_z=0.36, root_y=-0.12, root_z=-0.03)
    return K.render()


def parry():
    K = weapon_clip('parry', 0.5, 0.12, 0.3, SW, propR='sword', propL='shield')
    guard_keys(K, 0.0); K.at(0.0, 'stop', root_y=-0.07)
    K.at(0.12, RH_x=-0.16, RH_y=-0.02, RH_z=0.34, RW_yaw=-12, RW_pitch=62, root_y=-0.10, hip_y=-30, sp_y=-8, hd_y=32)
    K.at(0.24, RH_x=0.10, RH_y=0.0, RH_z=0.38, RW_yaw=48, RW_pitch=58, hip_y=-10, sp_y=8, ch_y=6, hd_y=22, root_z=0.05)
    K.at(0.3, 'stop', RH_x=0.10, RH_y=0.0, RH_z=0.38, RW_yaw=48, RW_pitch=58)
    K.at(0.5, 'stop', RH_x=-0.12, RH_y=-0.12, RH_z=0.33, RW_yaw=14, RW_pitch=72, root_y=-0.07, root_z=0, hip_y=-24, sp_y=-4, ch_y=-4, hd_y=26)
    return K.render()


def shove():
    K = Clip('shove', 1.0, stretch=1.5, w=0.45, a=0.62); K.default(**FI); K.default(RH_w=1, LH_w=1, LG=0.3, RG=0.3)
    K.at(0.0, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.17, RH_y=-0.10, RH_z=0.30, root_y=-0.07, hip_y=-8, sp_y=0, ch_y=0, hd_y=8)
    K.at(0.14, root_y=-0.10, root_z=-0.03)
    K.at(0.45, 'stop', LH_x=0.17, LH_y=-0.08, LH_z=0.10, RH_x=-0.17, RH_y=-0.08, RH_z=0.10, root_y=-0.11, root_z=-0.08, sp_p=-4, hip_p=0, LF_z=0.28, RF_z=-0.22)
    K.at(0.54, LH_x=0.15, LH_y=0.0, LH_z=0.44, RH_x=-0.15, RH_y=0.0, RH_z=0.44, root_y=-0.14, root_z=0.18, sp_p=16, hip_p=10, LF_z=0.50, RF_pitch=22)
    K.at(0.62, 'stop', LH_x=0.15, LH_y=0.0, LH_z=0.45, RH_x=-0.15, RH_y=0.0, RH_z=0.45, root_z=0.21, sp_p=18)
    K.at(0.75, 'stop', LH_x=0.15, LH_y=0.0, LH_z=0.45, RH_x=-0.15, RH_y=0.0, RH_z=0.45)
    K.at(1.0, 'stop', LH_x=0.19, LH_y=-0.10, LH_z=0.32, RH_x=-0.17, RH_y=-0.10, RH_z=0.30, root_y=-0.07, root_z=0, sp_p=6, hip_p=6, LF_z=0.28, RF_pitch=0)
    return K.render()


def bow_draw():
    """Draw from nocked to full draw (0..a), then holds. The sim's draw fraction 0..1 maps to 0..a."""
    K = Clip('bow_draw', 1.2, w=0.5, a=1.0, propL='bow'); K.default(**SW); K.default(LF_z=0.18, RF_z=-0.26, hip_y=-70, sp_y=-4, ch_y=-4, hd_y=70, root_y=-0.04, LH_w=1, RH_w=1, LW_w=1, RG=0.9, LG=0.8)
    K.at(0.0, 'stop', LH_x=0.16, LH_y=-0.12, LH_z=0.38, LW_yaw=0, LW_pitch=90, RH_x=-0.14, RH_y=-0.10, RH_z=0.22, hip_y=-62)
    K.at(1.0, 'stop', LH_x=0.18, LH_y=0.0, LH_z=0.43, RH_x=-0.25, RH_y=0.02, RH_z=-0.02, hip_y=-72, sp_y=-8, ch_y=-8, hd_y=74, sp_p=0, LW_yaw=0, LW_pitch=90)
    K.at(1.2, 'stop', LH_x=0.18, LH_y=0.0, LH_z=0.43, RH_x=-0.25, RH_y=0.02, RH_z=-0.02)
    K.default(LW_yaw=0, LW_pitch=90)
    return K.render()


def bow_release():
    K = Clip('bow_release', 0.7, w=0.1, a=0.25, propL='bow'); K.default(**SW); K.default(LF_z=0.18, RF_z=-0.26, hip_y=-72, sp_y=-8, ch_y=-8, hd_y=74, root_y=-0.04, LH_w=1, RH_w=1, LW_w=1, RG=0.5, LG=0.8, LW_yaw=0, LW_pitch=90)
    K.at(0.0, 'stop', LH_x=0.18, LH_y=0.0, LH_z=0.43, RH_x=-0.25, RH_y=0.02, RH_z=-0.02, RG=0.9)
    K.at(0.08, RH_x=-0.30, RH_y=0.0, RH_z=-0.10, RG=0.1, ch_y=-12, sp_y=-10)
    K.at(0.25, 'stop', RH_x=-0.32, RH_y=-0.04, RH_z=-0.04, LH_z=0.42, RG=0.1)
    K.at(0.7, 'stop', LH_x=0.16, LH_y=-0.10, LH_z=0.38, RH_x=-0.14, RH_y=-0.10, RH_z=0.22, RG=0.6, hip_y=-62, ch_y=-4)
    return K.render()


def all_clips():
    return [sword_light_1(), sword_light_2(), sword_light_3(), sword_heavy(), club_overhead(), staff_swing(), staff_heavy(), spear_thrust(), spear_sweep(),
            fists_jab(), fists_cross(), fists_kick(), shield_bash(), captain_lunge(), captain_slam(), captain_call(), block_hold(), parry(), shove(), bow_draw(), bow_release()]
