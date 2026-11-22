"""Locomotion and idle clips. Gaits come from gait.py (IK, world-planted feet); the rest are keyed channels from body.py."""
from gait import *
from body import Clip

FPS = 30


def idle():
    """Standing, breathing: 4 s loop, inhale 1.7 s exhale 2.3 s, a slow weight shift and a settle, feet planted (the pelvis moves, the legs follow by IK)."""
    K = Clip('idle', 4.0, loop=True, kind='idle')
    K.default(root_y=-0.015, LF_yaw=6, RF_yaw=-6, LF_x=0.11, RF_x=-0.11)
    K.at(0.0, ch_p=0.0, sp_p=0.0, LSh=0.0, RSh=0.0, root_x=0.0, hd_y=0.0, hd_p=0.0, nk_p=0.0, root_y=-0.015, hip_r=0.0, LU_x=1.1, RU_x=1.1, sp_r=0.0)
    K.at(1.7, ch_p=-1.5, sp_p=-0.6, LSh=1.3, RSh=1.3, root_y=-0.010, LU_x=0.6, RU_x=0.6)
    K.at(4.0, ch_p=0.0, sp_p=0.0, LSh=0.0, RSh=0.0, root_y=-0.015, LU_x=1.1, RU_x=1.1)
    K.at(0.0, root_x=0.0, hip_r=0.0, sp_r=0.0); K.at(1.2, root_x=0.012, hip_r=-0.5, sp_r=0.4); K.at(2.8, root_x=-0.010, hip_r=0.5, sp_r=-0.4); K.at(4.0, root_x=0.0, hip_r=0.0, sp_r=0.0)
    K.at(0.0, hd_y=0.0, hd_p=0.0); K.at(1.5, hd_y=2.0, hd_p=0.6); K.at(3.0, hd_y=-1.5, hd_p=-0.4); K.at(4.0, hd_y=0.0, hd_p=0.0)
    return K.render()


def idle_listen():
    """Listening idle: weight on one leg, head tilted a little, a slow nod, hands loosely together."""
    K = Clip('idle_listen', 5.0, loop=True, kind='idle')
    K.default(root_y=-0.02, LF_x=0.12, RF_x=-0.15, RF_z=-0.06, RF_yaw=-14, LF_yaw=3, hip_r=2.0, root_x=0.025, sp_r=-1.5, sp_p=3, ch_p=2, nk_p=2, LG=0.4, RG=0.4)
    for s, sg in (('L', 1), ('R', -1)):
        K.default(**{f'{s}H_w': 1.0, f'{s}H_x': sg * 0.06, f'{s}H_y': -0.34, f'{s}H_z': 0.20, f'{s}E_b': sg * 20})
    K.at(0.0, ch_p=2.0, hd_p=0.0, hd_y=-4.0, hd_r=3.0); K.at(1.4, hd_p=4.0); K.at(1.7, hd_p=-1.0); K.at(2.2, hd_p=3.0, hd_y=-3.0); K.at(5.0, ch_p=2.0, hd_p=0.0, hd_y=-4.0, hd_r=3.0)
    K.at(0.0, ch_p=2.0); K.at(2.4, ch_p=0.5); K.at(5.0, ch_p=2.0)
    return K.render()


def crouch_idle():
    K = Clip('crouch_idle', 3.5, loop=True, kind='idle')
    K.default(root_y=-0.27, hip_p=16, sp_p=18, ch_p=4, nk_p=-14, LF_x=0.15, RF_x=-0.15, LF_z=0.10, RF_z=-0.10, LF_yaw=10, RF_yaw=-10, LG=0.3, RG=0.3)
    K.at(0.0, ch_p=4, root_y=-0.27); K.at(1.5, ch_p=2.5, root_y=-0.265); K.at(3.5, ch_p=4, root_y=-0.27)
    for s, sg in (('L', 1), ('R', -1)): K.default(**{f'{s}U_x': -45, f'{s}U_z': REST[f'upperarm_{s}'][2] / D2R, f'{s}E': -15})
    K.at(0.0, hd_y=0, hd_p=0); K.at(1.0, hd_y=8); K.at(2.4, hd_y=-7, hd_p=2); K.at(3.5, hd_y=0, hd_p=0)
    return K.render()


def walk(): return gait('walk', 1.4, 1.0, 0.62, hc=0.10, bob=0.03, armA=0.5, elbow=0.35, elbow_dyn=0.3)


def jog(): return gait('jog', 1.95, 0.7, 0.45, hc=0.2, bob=0.05, yawA=0.14, armA=0.6, elbow=1.3, elbow_dyn=0.3, lean=0.12, roll=0.05, pH=0.1, pT=0.8, uf=0.1, uh=0.3)


def sprint(): return gait('sprint', 2.5, 0.6, 0.34, hc=0.3, bob=0.06, yawA=0.17, armA=0.9, elbow=1.4, elbow_dyn=0.3, lean=0.22, roll=0.05, pH=0.05, pT=0.9, uf=0.08, uh=0.25)


def crouch_walk(): return gait('crouch_walk', 1.0, 1.15, 0.66, hc=0.07, bob=0.02, flex=0.02, armA=0.25, elbow=0.6, elbow_dyn=0.1, lean=0.10, roll=0.025, yawA=0.07, crouch=0.95, sway=0.02, width=0.12)


def start_walk():
    """First two steps from standing, 0.85 s: lean, the left foot pushes and steps, then the right, arms start swinging. Speed ramps 0 to 1.4 m/s; feet are planted in the world."""
    dur = 0.9
    def v(t): return 1.4 * smooth(t / 0.8) if t < 0.8 else 1.4
    def travel(t):
        n = 200; return sum(v(i * t / n) * t / n for i in range(n))
    K = Clip('start_walk', dur, kind='start', speed=1.4)
    K.travel = travel
    K.default(root_y=-0.015, LF_yaw=6, RF_yaw=-6, LF_x=0.11, RF_x=-0.11)
    # pelvis: lean in first, then follow
    K.at(0.0, hip_p=0, sp_p=0, root_z=0.0, hd_p=0); K.at(0.30, hip_p=5, sp_p=3, root_z=0.03); K.at(0.9, hip_p=3.5, sp_p=2.5, root_z=0.0)
    K.at(0.0, root_x=0.0, hip_r=0); K.at(0.3, root_x=-0.012, hip_r=-1.0); K.at(0.6, root_x=0.022, hip_r=2.5); K.at(0.9, root_x=-0.02, hip_r=-2.0)
    K.at(0.0, root_y=-0.015); K.at(0.3, root_y=-0.04); K.at(0.6, root_y=-0.025); K.at(0.9, root_y=-0.04)
    # world foot targets (the travel is subtracted at render time): L swings 0.1-0.5, R swings 0.45-0.9
    K.at(0.0, 'stop', LF_z=0.0, LF_y=0.0, LF_pitch=0); K.at(0.12, 'stop', LF_z=0.0, LF_pitch=0); K.at(0.32, LF_z=0.28, LF_y=0.07, LF_pitch=14); K.at(0.50, 'stop', LF_z=0.62, LF_y=0.0, LF_pitch=-12); K.at(0.62, 'stop', LF_z=0.62, LF_pitch=0)
    K.at(0.9, LF_z=0.95, LF_pitch=40, LF_y=0.02)
    K.at(0.0, 'stop', RF_z=0.0); K.at(0.46, 'stop', RF_z=0.0, RF_pitch=0); K.at(0.62, RF_z=0.36, RF_y=0.09, RF_pitch=24); K.at(0.88, 'stop', RF_z=1.22, RF_y=0.0, RF_pitch=-14)
    # arms start to swing opposite the legs
    K.at(0.0, LU_x=1.1, RU_x=1.1); K.at(0.5, LU_x=14, RU_x=-12); K.at(0.9, LU_x=22, RU_x=-26)
    K.at(0.0, LE=REST['forearm_L'][0] / D2R, RE=REST['forearm_R'][0] / D2R); K.at(0.9, LE=30, RE=20)
    return K.render(travel=travel)


def stop_walk():
    """Walking to a stop, 0.7 s: the lead foot plants, the other closes up, the body settles. Speed 1.4 to 0."""
    dur = 0.75
    def v(t): return 1.4 * (1 - smooth(t / 0.65)) if t < 0.65 else 0.0
    def travel(t):
        n = 200; return sum(v(i * t / n) * t / n for i in range(n))
    K = Clip('stop_walk', dur, kind='stop', speed=1.4)
    K.default(root_y=-0.04, LF_yaw=6, RF_yaw=-6, LF_x=0.11, RF_x=-0.11)
    # world: the right foot is planted ahead at the start (z=0 world is the planted R foot), the left foot trails and closes up beside it
    K.at(0.0, LF_z=-0.45 + 0.0, LF_y=0.06, LF_pitch=30); K.at(0.30, LF_z=-0.05, LF_y=0.07, LF_pitch=0); K.at(0.52, 'stop', LF_z=0.12 - 0.0, LF_y=0.0, LF_pitch=-6); K.at(0.75, 'stop', LF_z=0.12, LF_y=0.0, LF_pitch=0)
    K.at(0.0, RF_z=0.38, RF_y=0.0, RF_pitch=-10); K.at(0.30, 'stop', RF_z=0.38 + 0.0); K.at(0.75, 'stop', RF_z=0.38)
    K.at(0.0, hip_p=3.5, sp_p=2.5, root_z=0.0); K.at(0.45, hip_p=0.0, sp_p=-0.5, root_z=0.0, ch_p=1.0); K.at(0.75, hip_p=0, sp_p=0, ch_p=0)
    K.at(0.0, root_y=-0.045); K.at(0.30, root_y=-0.05); K.at(0.75, root_y=-0.015)
    K.at(0.0, LU_x=24, RU_x=-26); K.at(0.45, LU_x=-4, RU_x=5); K.at(0.75, LU_x=1.1, RU_x=1.1)
    K.at(0.0, LE=30, RE=22); K.at(0.75, LE=REST['forearm_L'][0] / D2R, RE=REST['forearm_R'][0] / D2R)
    return K.render(travel=lambda t: travel(t))


def turn(sign):
    """In-place turn of about 90 degrees. The character entity turns with the sim; this clip is the body's LEAD: head, then chest, then pelvis rotate ahead of
    the feet and settle back to zero as the feet step round. sign +1 = turning to the character's left."""
    name = 'turn_L' if sign > 0 else 'turn_R'
    K = Clip(name, 0.75, kind='turn', sign=sign)
    s = sign
    K.default(root_y=-0.02, LF_x=0.12, RF_x=-0.12)
    K.at(0.0, 'stop', hd_y=0); K.at(0.12, hd_y=s * 38); K.at(0.45, hd_y=s * 14); K.at(0.75, 'stop', hd_y=0)
    K.at(0.0, 'stop', nk_y=0); K.at(0.15, nk_y=s * 14); K.at(0.75, 'stop', nk_y=0)
    K.at(0.0, 'stop', ch_y=0); K.at(0.18, ch_y=s * 24); K.at(0.50, ch_y=s * 8); K.at(0.75, 'stop', ch_y=0)
    K.at(0.0, 'stop', sp_y=0); K.at(0.22, sp_y=s * 14); K.at(0.55, sp_y=s * 4); K.at(0.75, 'stop', sp_y=0)
    K.at(0.0, 'stop', hip_y=0); K.at(0.28, hip_y=s * 22); K.at(0.62, hip_y=s * 5); K.at(0.75, 'stop', hip_y=0)
    lead, trail = ('L', 'R') if s > 0 else ('R', 'L')
    # lead foot steps round first (lifts, swings out and plants), then the trailing foot closes
    sg = 1 if lead == 'L' else -1
    K.at(0.0, 'stop', **{f'{lead}F_yaw': 6 * sg, f'{lead}F_y': 0.0}); K.at(0.20, **{f'{lead}F_y': 0.08, f'{lead}F_yaw': 6 * sg + s * 25}); K.at(0.40, 'stop', **{f'{lead}F_y': 0.0, f'{lead}F_yaw': 6 * sg + s * 40})
    K.at(0.75, 'stop', **{f'{lead}F_yaw': 6 * sg + s * 40})
    K.at(0.0, 'stop', **{f'{trail}F_y': 0.0}); K.at(0.42, 'stop', **{f'{trail}F_y': 0.0}); K.at(0.55, **{f'{trail}F_y': 0.07}); K.at(0.72, 'stop', **{f'{trail}F_y': 0.0})
    K.at(0.0, 'stop', root_x=0.0); K.at(0.3, root_x=-s * 0.02); K.at(0.75, 'stop', root_x=0.0)
    return K.render()


def all_clips():
    return [idle(), idle_listen(), crouch_idle(), walk(), jog(), sprint(), crouch_walk(), start_walk(), stop_walk(), turn(1), turn(-1)]
