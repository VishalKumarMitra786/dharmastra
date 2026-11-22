"""Numeric checks on a clip, run at build time: foot penetration and slide against a floor moving at the clip's speed, loop seam, per-frame steps."""
import math
from rig import *


def feet_report(clip, speed=None):
    """Contact points (heel, ball) are planted when within 12 mm of the floor. Slide = how far a planted point moves in the world during one planted run
    (the floor moves under the clip at its speed). Also: lowest point of the foot, and the share of the cycle each foot is planted."""
    fr = clip['frames']; n = len(fr); fps = clip['fps']; v = speed if speed is not None else clip['extras'].get('speed', 0.0)
    rep = {'minY': 9.0, 'slide': 0.0, 'planted': {}}
    for side in 'LR':
        for nm, pt in (('heel', HEEL), ('ball', BALL)):
            ser = []
            for i, p in enumerate(fr):
                q = fk(p)[f'foot_{side}'] @ pt; ser.append((q.y, q.z, q.x))
                rep['minY'] = min(rep['minY'], q.y)
            runs = []; cur = []
            for i in range(2 * n):
                y, z, x = ser[i % n]; z = z + v * i / fps
                if y < 0.012: cur.append((z, x))
                else:
                    if len(cur) > 2: runs.append(cur)
                    cur = []
            if len(cur) > 2: runs.append(cur)
            for r in runs: rep['slide'] = max(rep['slide'], max(a for a, _ in r) - min(a for a, _ in r), max(b for _, b in r) - min(b for _, b in r))
            rep['planted'][f'{nm}{side}'] = round(sum(1 for y, _, _ in ser if y < 0.012) / n, 2)
    return rep


def seam(clip):
    fr = clip['frames']; worst = 0.0
    for b in BONES:
        d = max(abs(fr[0].rot[b][k] - fr[-1].rot[b][k]) for k in range(3)); worst = max(worst, d)
    step = max((max(abs(fr[i + 1].rot[b][k] - fr[i].rot[b][k]) for k in range(3) for b in BONES)) for i in range(len(fr) - 1))
    return worst, step   # worst last-to-first angle gap vs the typical step: a clean loop has a gap about one step


def maxstep(clip, loop=True):
    """Largest rotation of any bone between two consecutive frames, as the angle of the relative quaternion (not Euler components, which jump near gimbal lock)."""
    fr = clip['frames']; n = len(fr); worst = 0.0; wb = ''
    qs = [{b: rotm(*p.rot[b]).to_quaternion() for b in BONES} for p in fr]
    for i in (range(n) if loop else range(n - 1)):
        for b in BONES:
            d = min(1.0, abs(qs[i][b].dot(qs[(i + 1) % n][b])))
            ang = 2 * math.acos(d)
            if ang > worst: worst, wb = ang, b
    return worst, wb
