"""Reactions (four-direction hit reactions with stagger, knockdown, death, get-up) and traversal (dodge roll, vault, climb)."""
from body import *

NEUTRAL = dict(root_y=-0.05, LF_x=0.16, LF_z=0.22, LF_yaw=-6, RF_x=-0.17, RF_z=-0.20, RF_yaw=-30, hip_y=-16, hip_p=4, sp_p=3, hd_y=16, LG=0.6, RG=0.6)


def hit(name, dirn):
    """A blow lands, 0.7 s: impact at 0.06, peak at 0.16, a step to catch balance, then settle. dirn: front, back, left, right (where the blow came from)."""
    K = Clip(name, 0.75, kind='hit', dirn=dirn); K.default(**NEUTRAL)
    K.at(0.0, 'stop', sp_p=3, ch_p=0, hd_p=0, nk_p=0, hip_p=4, root_z=0, root_x=0, sp_r=0, ch_r=0, hd_r=0, hip_r=0, root_y=-0.05, LU_x=1.1, RU_x=1.1)
    if dirn == 'front':
        K.at(0.06, sp_p=-6, ch_p=-4, hd_p=-8, root_z=-0.02); K.at(0.16, 'stop', sp_p=-26, ch_p=-16, hd_p=-30, nk_p=-8, hip_p=-8, root_z=-0.12, root_y=-0.09, LU_x=-40, RU_x=-40, LU_z=-62, RU_z=62, LE=-20, RE=-20)
        K.at(0.26, RF_z=-0.34, RF_y=0.07); K.at(0.36, RF_z=-0.44, RF_y=0.0, root_z=-0.14)
        K.at(0.50, sp_p=-8, ch_p=-4, hd_p=-8, root_z=-0.10, LU_x=-8, RU_x=-8)
    elif dirn == 'back':
        K.at(0.06, sp_p=8, ch_p=4, hd_p=6, root_z=0.02); K.at(0.16, 'stop', sp_p=22, ch_p=10, hd_p=14, nk_p=6, hip_p=12, root_z=0.07, root_y=-0.07, LU_x=22, RU_x=22, LU_z=-52, RU_z=52)
        K.at(0.30, LF_z=0.40, LF_y=0.05); K.at(0.38, LF_z=0.46, LF_y=0.0)
        K.at(0.45, sp_p=10, ch_p=4, hd_p=4, root_z=0.05)
    else:
        s = -1 if dirn == 'left' else 1   # a blow from the left shoves the body to the right
        K.at(0.06, sp_r=s * 3, root_x=s * 0.01); K.at(0.16, 'stop', sp_r=s * 12, ch_r=s * 8, hd_r=s * 14, hip_r=s * 6, root_x=s * 0.07, sp_y=s * -8, hd_y=16 + s * -14, LU_z=-40 + s * 20, RU_z=40 + s * 20, root_y=-0.06)
        side = 'R' if s > 0 else 'L'
        K.at(0.28, **{f'{"L" if s > 0 else "R"}F_x': (0.16 if s > 0 else -0.17) + s * 0.18, f'{"L" if s > 0 else "R"}F_y': 0.04}); K.at(0.38, **{f'{"L" if s > 0 else "R"}F_y': 0.0})
        K.at(0.45, sp_r=s * 4, ch_r=s * 3, hd_r=s * 5, hip_r=s * 2, root_x=s * 0.03)
    K.at(0.75, 'stop', sp_p=3, ch_p=0, hd_p=0, nk_p=0, hip_p=4, root_z=0, root_x=0, sp_r=0, ch_r=0, hd_r=0, hip_r=0, root_y=-0.05, sp_y=0, hd_y=16, LU_x=1.1, RU_x=1.1, LU_z=REST['upperarm_L'][2] / D2R, RU_z=REST['upperarm_R'][2] / D2R, LF_x=0.16, RF_x=-0.17, LF_z=0.22, RF_z=-0.20, LF_y=0, RF_y=0)
    return K.render()


def stagger():
    """Staggers back two steps, arms out for balance, head lolling, 0.95 s; ends nearly recovered (the sim then returns to idle or open to a finisher)."""
    K = Clip('stagger', 0.95, kind='stagger'); K.default(**NEUTRAL); K.default(LF_yaw=-4, RF_yaw=-8)
    K.at(0.0, 'stop', sp_p=3, hd_p=0, root_z=0, sp_r=0, root_y=-0.05, hip_p=4)
    K.at(0.12, sp_p=-14, ch_p=-10, hd_p=-16, root_z=-0.06, LU_x=-30, RU_x=-30, LU_z=-60, RU_z=60, LE=-10, RE=-10)
    K.at(0.30, LF_z=-0.30, LF_y=0.07); K.at(0.42, 'stop', LF_z=-0.46, LF_y=0.0)
    K.at(0.54, RF_z=-0.50, RF_y=0.07); K.at(0.66, 'stop', RF_z=-0.64, RF_y=0.0)
    K.at(0.12, root_z=-0.06); K.at(0.42, root_z=-0.28); K.at(0.66, root_z=-0.40); K.at(0.95, 'stop', root_z=-0.34)
    K.at(0.3, sp_r=6, hip_r=3, hd_r=8); K.at(0.55, sp_r=-6, hip_r=-3, hd_r=-8); K.at(0.8, sp_r=2, hip_r=1, hd_r=3); K.at(0.95, 'stop', sp_r=0, hip_r=0, hd_r=0)
    K.at(0.5, sp_p=-6, hd_p=-8, LU_x=-10, RU_x=-10); K.at(0.95, 'stop', sp_p=4, hd_p=2, ch_p=0, LU_x=1.1, RU_x=1.1, LU_z=REST['upperarm_L'][2] / D2R, RU_z=REST['upperarm_R'][2] / D2R, root_y=-0.07, hip_p=6)
    K.at(0.12, root_y=-0.06); K.at(0.42, root_y=-0.08); K.at(0.66, root_y=-0.08)
    return K.render()


def knockdown():
    """Knocked off their feet, 1.2 s: legs go, the body falls back and lies supine with arms out."""
    F = FKClip('knockdown', 1.2, kind='fall')
    F.key(0.0, 'flow', gw=0, gy=0.0, root=(0, 0, 0), hips_root=(4, 0, 0), spine=(3, 0, 0), head=(0, 0, 0))
    F.key(0.14, 'flow', gw=0, spine=(-10, 0, 0), chest=(-6, 0, 0), head=(-14, 0, 0), upperarm_L=rest_deg('upperarm_L', -40, 0, 14), upperarm_R=rest_deg('upperarm_R', -40, 0, -14), hips_root=(-4, 0, 0))
    F.key(0.40, 'flow', gw=0, hips_root=(-50, 0, 0), root=(0, -0.05, -0.2), thigh_L=(-70, 0, 4), thigh_R=(-55, 0, -4), shin_L=(40, 0, 0), shin_R=(30, 0, 0), spine=(-8, 0, 0), head=(-18, 0, 0),
          upperarm_L=rest_deg('upperarm_L', -70, 0, 30), upperarm_R=rest_deg('upperarm_R', -70, 0, -30), forearm_L=(-10, 0, 0), forearm_R=(-10, 0, 0))
    F.key(0.72, 'stop', gw=1, gy=0.11, hips_root=(-88, 0, 0), root=(0, -0.6, -0.25), thigh_L=(-8, 0, 6), thigh_R=(-14, 0, -8), shin_L=(25, 0, 0), shin_R=(15, 0, 0), spine=(-2, 0, 0), chest=(0, 0, 0), head=(-6, 0, 0),
          upperarm_L=rest_deg('upperarm_L', 10, 0, 50), upperarm_R=rest_deg('upperarm_R', 10, 0, -50), forearm_L=(25, 0, 0), forearm_R=(25, 0, 0))
    F.key(0.85, 'flow', gw=1, gy=0.11, hips_root=(-85, 0, 0), spine=(3, 0, 0), head=(-4, 0, 0))  # a small bounce
    F.key(1.2, 'stop', gw=1, gy=0.11, hips_root=(-88, 0, 0), head=(-10, 0, 0), thigh_L=(-6, 0, 9), thigh_R=(-12, 0, -11), upperarm_L=rest_deg('upperarm_L', 12, 0, 56), upperarm_R=rest_deg('upperarm_R', 12, 0, -56))
    return F.render()


def death():
    """Killed, 1.7 s: the knees buckle, the weapon arm drops, the body folds forward and falls on its face and side, then lies still."""
    F = FKClip('death', 1.7, kind='fall')
    F.key(0.0, 'flow', gw=0, gy=0.0, root=(0, 0, 0), hips_root=(4, 0, 0), spine=(3, 0, 0))
    F.key(0.12, 'flow', gw=0, spine=(-8, 0, 0), head=(-12, 0, 0), upperarm_R=rest_deg('upperarm_R', -30, 0, -12))     # the blow
    F.key(0.50, 'flow', gw=0, root=(0, -0.28, 0.02), hips_root=(14, 0, 0), thigh_L=(-60, 0, 4), thigh_R=(-52, 0, -4), shin_L=(95, 0, 0), shin_R=(88, 0, 0), spine=(26, 0, 4), chest=(10, 0, 0), head=(18, 0, 0),
          upperarm_L=rest_deg('upperarm_L', 12, 0, 6), upperarm_R=rest_deg('upperarm_R', 18, 0, -6), forearm_L=(30, 0, 0), forearm_R=(30, 0, 0))
    F.key(0.95, 'flow', gw=0.7, gy=0.10, root=(0.05, -0.42, 0.22), hips_root=(50, 0, 14), thigh_L=(-50, 0, 8), thigh_R=(-30, 0, -6), shin_L=(70, 0, 0), shin_R=(50, 0, 0), spine=(30, 0, 8), head=(24, 0, 10))
    F.key(1.25, 'stop', gw=1, gy=0.11, root=(0.06, -0.6, 0.4), hips_root=(86, 0, 18), thigh_L=(-8, 0, 8), thigh_R=(-4, 0, -5), shin_L=(15, 0, 0), shin_R=(8, 0, 0), spine=(8, 0, 6), chest=(0, 0, 0), head=(10, 20, 12),
          upperarm_L=rest_deg('upperarm_L', 30, 0, 28), upperarm_R=rest_deg('upperarm_R', 40, 0, -20), forearm_L=(10, 0, 0), forearm_R=(20, 0, 0))
    F.key(1.7, 'stop', gw=1, gy=0.11, hips_root=(86, 0, 18), head=(8, 26, 14))
    return F.render()


def getup():
    """From lying on the back to standing, 1.8 s: sit up on the hands, draw the legs in, push up through a crouch and stand."""
    F = FKClip('getup', 1.8, kind='rise')
    lie = dict(hips_root=(-88, 0, 0), thigh_L=(-6, 0, 9), thigh_R=(-12, 0, -11), upperarm_L=rest_deg('upperarm_L', 12, 0, 56), upperarm_R=rest_deg('upperarm_R', 12, 0, -56), head=(-10, 0, 0), spine=(0, 0, 0), shin_L=(0, 0, 0), shin_R=(0, 0, 0))
    F.key(0.0, 'stop', gw=1, gy=0.11, root=(0, -0.7, -0.3), **lie)
    F.key(0.45, 'flow', gw=1, gy=0.11, root=(0, -0.7, -0.3), hips_root=(-88, 0, 0), spine=(62, 0, 0), chest=(14, 0, 0), head=(0, 0, 0), thigh_L=(-20, 0, 8), thigh_R=(-24, 0, -8), shin_L=(40, 0, 0), shin_R=(40, 0, 0),
          upperarm_L=(30, 0, 20), upperarm_R=(30, 0, -20), forearm_L=(0, 0, 0), forearm_R=(0, 0, 0))
    F.key(0.90, 'flow', gw=1, gy=0.04, root=(0, -0.55, -0.1), hips_root=(-40, 0, 0), spine=(40, 0, 0), chest=(10, 0, 0), head=(-6, 0, 0), thigh_L=(-85, 0, 10), thigh_R=(-95, 0, -10), shin_L=(110, 0, 0), shin_R=(115, 0, 0),
          upperarm_L=(5, 0, 18), upperarm_R=(5, 0, -18), foot_L=(30, 0, 0), foot_R=(30, 0, 0))
    F.key(1.30, 'flow', gw=1, gy=0.0, root=(0, -0.40, 0.0), hips_root=(10, 0, 0), spine=(22, 0, 0), chest=(6, 0, 0), head=(-14, 0, 0), thigh_L=(-70, 0, 8), thigh_R=(-60, 0, -8), shin_L=(105, 0, 0), shin_R=(95, 0, 0),
          upperarm_L=rest_deg('upperarm_L', -20, 0, 8), upperarm_R=rest_deg('upperarm_R', -20, 0, -8), foot_L=(10, 0, 0), foot_R=(10, 0, 0))
    F.key(1.8, 'stop', gw=1, gy=0.0, root=(0, -0.05, 0.0), hips_root=(4, 0, 0), spine=(3, 0, 0), chest=(0, 0, 0), head=(0, 0, 0), thigh_L=(-6, 0, 4), thigh_R=(-8, 0, -4), shin_L=(10, 0, 0), shin_R=(12, 0, 0), foot_L=(-4, 0, 0), foot_R=(-4, 0, 0),
          upperarm_L=rest_deg('upperarm_L'), upperarm_R=rest_deg('upperarm_R'), forearm_L=rest_deg('forearm_L'), forearm_R=rest_deg('forearm_R'))
    return F.render()


def dodge_roll():
    """Forward dodge roll, 0.62 s: a dip to load, a dive, one full tumble tucked, and up on the feet. The sim moves the body; the roll is in the pose."""
    F = FKClip('dodge_roll', 0.62, kind='dodge')
    F.key(0.0, 'flow', gw=0, gy=0.0, root=(0, -0.02, 0), hips_root=(6, 0, 0), spine=(4, 0, 0), head=(0, 0, 0), thigh_L=(-8, 0, 3), thigh_R=(-8, 0, -3), shin_L=(10, 0, 0), shin_R=(10, 0, 0))
    F.key(0.12, 'stop', gw=0, root=(0, -0.26, 0.04), hips_root=(16, 0, 0), spine=(28, 0, 0), chest=(8, 0, 0), head=(-10, 0, 0), thigh_L=(-70, 0, 4), thigh_R=(-64, 0, -4), shin_L=(95, 0, 0), shin_R=(90, 0, 0),
          upperarm_L=rest_deg('upperarm_L', -55, 0, 14), upperarm_R=rest_deg('upperarm_R', -55, 0, -14), forearm_L=(-30, 0, 0), forearm_R=(-30, 0, 0), foot_L=(20, 0, 0), foot_R=(20, 0, 0))
    F.key(0.22, 'flow', gw=0.6, gy=0.12, root=(0, -0.50, 0.15), hips_root=(100, 0, 0), spine=(52, 0, 0), chest=(14, 0, 0), head=(40, 0, 0), thigh_L=(-110, 0, 4), thigh_R=(-108, 0, -4), shin_L=(135, 0, 0), shin_R=(135, 0, 0),
          upperarm_L=(-60, 0, 12), upperarm_R=(-60, 0, -12), forearm_L=(-70, 0, 0), forearm_R=(-70, 0, 0), foot_L=(40, 0, 0), foot_R=(40, 0, 0))
    F.key(0.34, 'flow', gw=1, gy=0.12, root=(0, -0.55, 0.30), hips_root=(200, 0, 0), spine=(54, 0, 0), head=(40, 0, 0))
    F.key(0.46, 'flow', gw=0.6, gy=0.10, root=(0, -0.45, 0.42), hips_root=(300, 0, 0), spine=(40, 0, 0), head=(20, 0, 0))
    F.key(0.56, 'flow', gw=0, gy=0.0, root=(0, -0.28, 0.46), hips_root=(354, 0, 0), spine=(28, 0, 0), chest=(8, 0, 0), head=(-6, 0, 0), thigh_L=(-75, 0, 4), thigh_R=(-60, 0, -4), shin_L=(100, 0, 0), shin_R=(88, 0, 0), foot_L=(22, 0, 0), foot_R=(18, 0, 0),
          upperarm_L=rest_deg('upperarm_L', -30, 0, 14), upperarm_R=rest_deg('upperarm_R', -30, 0, -14), forearm_L=(-20, 0, 0), forearm_R=(-20, 0, 0))
    F.key(0.62, 'stop', gw=0, root=(0, -0.10, 0.46), hips_root=(366, 0, 0), spine=(10, 0, 0), chest=(0, 0, 0), head=(0, 0, 0), thigh_L=(-30, 0, 3), thigh_R=(-22, 0, -3), shin_L=(40, 0, 0), shin_R=(32, 0, 0), foot_L=(0, 0, 0), foot_R=(0, 0, 0),
          upperarm_L=rest_deg('upperarm_L', -10, 0, 4), upperarm_R=rest_deg('upperarm_R', -10, 0, -4), forearm_L=rest_deg('forearm_L', -20), forearm_R=rest_deg('forearm_R', -20))
    return F.render()


def vault():
    """Vault over a waist-high obstacle, 0.7 s: run-up crouch, hands plant, the legs swing through to one side, land running."""
    F = FKClip('vault', 0.7, kind='vault')
    F.key(0.0, 'flow', gw=0, root=(0, -0.05, 0.0), hips_root=(10, 0, 0), spine=(12, 0, 0), thigh_L=(-35, 0, 2), thigh_R=(20, 0, -2), shin_L=(40, 0, 0), shin_R=(30, 0, 0), upperarm_L=rest_deg('upperarm_L', -30), upperarm_R=rest_deg('upperarm_R', 20))
    F.key(0.2, 'flow', gw=0, root=(0, 0.22, 0.18), hips_root=(28, 0, 0), spine=(30, 0, 0), chest=(10, 0, 0), head=(-20, 0, 0), thigh_L=(-70, 0, 6), thigh_R=(-30, 0, -6), shin_L=(95, 0, 0), shin_R=(60, 0, 0),
          upperarm_L=(-100, 0, 12), upperarm_R=(-100, 0, -12), forearm_L=(-8, 0, 0), forearm_R=(-8, 0, 0))
    F.key(0.38, 'flow', gw=0, root=(0.05, 0.30, 0.40), hips_root=(8, 0, 24), spine=(34, 0, 8), thigh_L=(-60, 0, 24), thigh_R=(-80, 0, -2), shin_L=(70, 0, 0), shin_R=(100, 0, 0), upperarm_L=(-70, 0, 10), upperarm_R=(-70, 0, -10), head=(-18, 0, 0))
    F.key(0.55, 'flow', gw=0, root=(0, 0.10, 0.60), hips_root=(6, 0, 0), spine=(14, 0, 0), chest=(4, 0, 0), thigh_L=(-45, 0, 2), thigh_R=(20, 0, -2), shin_L=(50, 0, 0), shin_R=(40, 0, 0), upperarm_L=rest_deg('upperarm_L', 20), upperarm_R=rest_deg('upperarm_R', -30), head=(-6, 0, 0))
    F.key(0.7, 'stop', gw=0, root=(0, -0.04, 0.60), hips_root=(8, 0, 0), spine=(10, 0, 0), thigh_L=(-8, 0, 3), thigh_R=(8, 0, -3), shin_L=(25, 0, 0), shin_R=(30, 0, 0), upperarm_L=rest_deg('upperarm_L'), upperarm_R=rest_deg('upperarm_R'))
    return F.render()


def climb():
    """Climbing a wall or ladder, 1.2 s loop: hands and feet alternate, the body hangs close to the wall and rises a little with each reach."""
    K = Clip('climb', 1.2, loop=True, kind='climb'); K.default(root_y=-0.08, hip_p=-4, sp_p=2, LH_w=1, RH_w=1, LG=0.9, RG=0.9, hd_p=-30, LF_yaw=8, RF_yaw=-8, LF_x=0.12, RF_x=-0.12, LF_z=0.30, RF_z=0.30)
    # world foot heights (rungs): left up while the right hand reaches
    K.at(0.0, LF_y=0.18, RF_y=0.0, LH_x=0.16, LH_y=0.40, LH_z=0.10, RH_x=-0.16, RH_y=0.12, RH_z=0.14, root_y=-0.08, sp_r=-3, ch_r=-2)
    K.at(0.3, LF_y=0.34, RF_y=0.0, LH_x=0.16, LH_y=0.42, LH_z=0.10, RH_x=-0.16, RH_y=0.32, RH_z=0.10, root_y=-0.02, sp_r=0)
    K.at(0.6, LF_y=0.0, RF_y=0.18, LH_x=0.16, LH_y=0.12, LH_z=0.14, RH_x=-0.16, RH_y=0.40, RH_z=0.10, root_y=-0.08, sp_r=3, ch_r=2)
    K.at(0.9, LF_y=0.0, RF_y=0.34, LH_x=0.16, LH_y=0.32, LH_z=0.10, RH_x=-0.16, RH_y=0.42, RH_z=0.10, root_y=-0.02, sp_r=0)
    K.at(0.0, hd_y=3); K.at(0.6, hd_y=-3)
    return K.render()


def all_clips():
    return [hit('hit_front', 'front'), hit('hit_back', 'back'), hit('hit_left', 'left'), hit('hit_right', 'right'), stagger(), knockdown(), death(), getup(), dodge_roll(), vault(), climb()]
