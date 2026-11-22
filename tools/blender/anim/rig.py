"""Shared rig maths for the animation scripts (pure Python plus mathutils, which ships with the bpy module).

Run any script here with:  /tmp/bl/bin/python tools/blender/anim/<script>.py   (see tools/setup-blender.sh)

Conventions (identical to src/gfx/human/anim.js, which is what plays the clips back):
  - glTF space: Y up, the person faces +Z, character-left is +X, units are metres.
  - A bone rotation is Euler XYZ in radians in the parent's frame, matrix R = Rx * Ry * Rz (three.js 'XYZ').
  - The bind pose is the skeleton in assets/characters/hero.glb. The game's "rest" is REST below (arms hang, elbows near straight).
  - Negative x on a thigh or upper arm swings it forward; positive x on a shin bends the knee (foot goes back);
    positive x on a foot points the toes down; negative x on a forearm bends the elbow (rest 0.8 is almost straight).
  - A Pose is {bone: [x, y, z]} plus root = [sway, lift, fwd], the offset of hips_root from its bind position.
"""
import json
import math
import struct
import bpy  # noqa: F401  (importing bpy first is what makes mathutils importable)
from mathutils import Matrix, Vector

GLB = '/home/claude/dharmastra/assets/characters/hero.glb'
BONES = ['hips_root', 'hips', 'spine', 'chest', 'neck', 'head'] + [n for s in 'LR' for n in
         (f'shoulder_{s}', f'upperarm_{s}', f'forearm_{s}', f'hand_{s}', f'thumb_{s}', f'fingers_{s}', f'fingers2_{s}', f'thigh_{s}', f'shin_{s}', f'foot_{s}', f'toe_{s}')]
REST = {'upperarm_L': (0.02, 0.1, -0.66), 'upperarm_R': (0.02, -0.1, 0.66), 'forearm_L': (0.8, 0, 0), 'forearm_R': (0.8, 0, 0), 'shoulder_L': (0, 0, -0.06), 'shoulder_R': (0, 0, 0.06),
        'thumb_L': (0, 0, 0.2), 'thumb_R': (0, 0, -0.2), 'fingers_L': (0.25, 0, 0), 'fingers_R': (0.25, 0, 0), 'fingers2_L': (0.3, 0, 0), 'fingers2_R': (0.3, 0, 0)}
D2R = math.pi / 180.0


def _load():
    b = open(GLB, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    sk = j['skins'][0]
    names = [j['nodes'][i]['name'] for i in sk['joints']]
    off, parent = {}, {}
    for i in sk['joints']:
        n = j['nodes'][i]
        off[n['name']] = Vector(n.get('translation', [0, 0, 0]))
        for c in n.get('children', []):
            if j['nodes'][c]['name'] in names:
                parent[j['nodes'][c]['name']] = n['name']
    return off, parent


OFF, PARENT = _load()
LEG_L1 = (OFF['shin_L']).length          # thigh joint to knee
FOOT_H = 0.072                            # ankle height above the floor with a flat foot
HEEL = Vector((0, -FOOT_H, -0.06))        # heel contact point in the foot frame
BALL = Vector((0, -FOOT_H, 0.14))         # ball-of-foot contact point in the foot frame
UP = Vector((0, 1, 0))


class Pose:
    __slots__ = ('rot', 'root', 'res', 'clamp', 'resl', 'shaft')

    def __init__(self):
        self.rot = {b: list(REST.get(b, (0, 0, 0))) for b in BONES}
        self.root = [0.0, 0.0, 0.0]; self.res = 0.0; self.clamp = 0.0; self.resl = 0.0; self.shaft = 0.0

    def copy(self):
        p = Pose(); p.rot = {k: list(v) for k, v in self.rot.items()}; p.root = list(self.root); return p

    def set(self, bone, x=None, y=None, z=None):
        r = self.rot[bone]
        if x is not None: r[0] = x
        if y is not None: r[1] = y
        if z is not None: r[2] = z
        return self

    def add(self, bone, x=0.0, y=0.0, z=0.0):
        r = self.rot[bone]; r[0] += x; r[1] += y; r[2] += z; return self


def rotm(x, y, z):
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return Matrix(((1, 0, 0), (0, cx, -sx), (0, sx, cx))) @ Matrix(((cy, 0, sy), (0, 1, 0), (-sy, 0, cy))) @ Matrix(((cz, -sz, 0), (sz, cz, 0), (0, 0, 1)))


def rx(a): return rotm(a, 0, 0)


def euler_of(m, prev=None):
    """three.js XYZ Euler of a 3x3 matrix; with prev, the representation nearest to it (keeps rolls continuous)."""
    m13 = max(-1.0, min(1.0, m[0][2])); y = math.asin(m13)
    if abs(m13) < 0.9999999:
        x = math.atan2(-m[1][2], m[2][2]); z = math.atan2(-m[0][1], m[0][0])
    else:
        x = math.atan2(m[2][1], m[1][1]); z = 0.0
    e = [x, y, z]
    if prev is not None:
        for i in (0, 2):
            e[i] += round((prev[i] - e[i]) / (2 * math.pi)) * 2 * math.pi
    return e


def fk(pose):
    """World matrices (4x4, glTF space) for every bone."""
    W = {}
    for b in BONES:  # BONES lists parents before children except thighs; resolve lazily
        pass

    def get(b):
        if b in W: return W[b]
        t = OFF[b].copy()
        if b == 'hips_root': t = t + Vector((pose.root[0], pose.root[1], pose.root[2]))
        local = Matrix.Translation(t) @ rotm(*pose.rot[b]).to_4x4()
        W[b] = local if b not in PARENT else get(PARENT[b]) @ local
        return W[b]
    for b in BONES: get(b)
    return W


def pos(W, b): return W[b].translation.copy()


def _solve_knee(K0, F0, dist, kmin, kmax):
    """Joint angle k about x such that |K0 + Rx(k) F0| = dist (monotone on the bracket)."""
    def ln(k): return (K0 + rx(k) @ F0).length
    lo, hi = kmin, kmax
    inc = ln(hi) > ln(lo)
    if dist >= max(ln(lo), ln(hi)): return hi if inc else lo
    if dist <= min(ln(lo), ln(hi)): return lo if inc else hi
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if (ln(mid) < dist) == inc: lo = mid
        else: hi = mid
    return 0.5 * (lo + hi)


def solve_limb(parent_R, joint_pos, target, K0, F0, b_yaw, kmin, kmax, prefer=0.0):
    """Two-bone IK. Returns (thigh/upperarm Euler [x,y,z], knee/elbow x angle, residual metres).
    parent_R: 3x3 world rotation of the parent; joint_pos: world position of the limb root; target: world position the end must reach."""
    d = parent_R.transposed() @ (target - joint_pos)
    k = _solve_knee(K0, F0, d.length, kmin, kmax)
    w = K0 + rx(k) @ F0
    # Rx(a) Ry(b) Rz(c) w = d  with b fixed: solve c from the x row, then a from the yz rows
    cb, sb = math.cos(b_yaw), math.sin(b_yaw)
    A, B, Dd = cb * w.x, -cb * w.y, d.x - sb * w.z
    R = math.hypot(A, B)
    best = None
    if R > 1e-9:
        ratio = max(-1.0, min(1.0, Dd / R)); base = math.atan2(B, A); da = math.acos(ratio)
        for c in (base + da, base - da):
            c = (c + math.pi) % (2 * math.pi) - math.pi
            if best is None or abs(c - prefer) < abs(best - prefer): best = c
    else:
        best = 0.0
    c = best
    w1 = rotm(0, 0, c) @ w; w2 = rotm(0, b_yaw, 0) @ w1
    a = math.atan2(d.z, d.y) - math.atan2(w2.z, w2.y)
    a = (a + math.pi) % (2 * math.pi) - math.pi
    Rt = rotm(a, b_yaw, c)
    end = joint_pos + parent_R @ (Rt @ (K0 + rx(k) @ F0))
    return [a, b_yaw, c], k, (end - target).length


def ik_leg(pose, side, ankle, foot_R, yaw=0.0):
    """Set thigh, shin and foot of `side` so the ankle reaches `ankle` (world) with the foot oriented as the 3x3 matrix foot_R."""
    W = fk(pose)
    Rr = W['hips_root'].to_3x3(); H = W['hips_root'] @ OFF[f'thigh_{side}']
    th, k, res = solve_limb(Rr, H, ankle, OFF[f'shin_{side}'], OFF[f'foot_{side}'], yaw, 0.0, 2.9, prefer=-0.05 if side == 'L' else 0.05)
    pose.rot[f'thigh_{side}'] = th; pose.rot[f'shin_{side}'] = [k, 0, 0]
    Rchain = Rr @ rotm(*th) @ rx(k)
    pose.rot[f'foot_{side}'] = euler_of(Rchain.transposed() @ foot_R)
    return res


def ik_arm(pose, side, hand, yaw=0.0, kmin=-1.7, kmax=0.9):
    W = fk(pose)
    Rp = W[f'shoulder_{side}'].to_3x3(); J = W[f'shoulder_{side}'] @ OFF[f'upperarm_{side}']
    th, k, res = solve_limb(Rp, J, hand, OFF[f'forearm_{side}'], OFF[f'hand_{side}'], yaw, kmin, kmax)
    pose.rot[f'upperarm_{side}'] = th; pose.rot[f'forearm_{side}'] = [k, 0, 0]
    return res


def leg_reach():
    K0, F0 = OFF['shin_L'], OFF['foot_L']
    return (K0 + F0).length


# ---------------------------------------------------------------- key-pose splines
def smooth(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)


def smoother(x):
    x = max(0.0, min(1.0, x)); return x * x * x * (x * (6 * x - 15) + 10)


def hermite(p0, p1, m0, m1, u):
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1


def track(keys, t, loop_len=None):
    """Value at time t of a scalar track: keys = [(time, value, mode)] sorted by time; mode 'stop' gives a zero slope (an ease in and out,
    a hold or an impact), 'lin' a straight line to the next key, anything else a Catmull-Rom style slope clamped so it never overshoots a key."""
    n = len(keys)
    if t <= keys[0][0]: return keys[0][1]
    if t >= keys[-1][0]: return keys[-1][1]
    i = 0
    while keys[i + 1][0] < t: i += 1
    t0, v0, m0 = keys[i]; t1, v1, m1 = keys[i + 1]
    h = t1 - t0; u = (t - t0) / h
    if m0 == 'lin' or m1 == 'lin' and False:
        return v0 + (v1 - v0) * u

    def slope(j):
        if keys[j][2] == 'stop': return 0.0
        if j == 0 or j == n - 1: return 0.0
        a = (keys[j][1] - keys[j - 1][1]) / (keys[j][0] - keys[j - 1][0]); b = (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0])
        if a * b <= 0: return 0.0  # a turning point: flat, no overshoot
        s = (a + b) / 2
        return max(-3 * min(abs(a), abs(b)), min(3 * min(abs(a), abs(b)), s)) if s * a > 0 else 0.0
    return hermite(v0, v1, slope(i) * h, slope(i + 1) * h, u)


class Keyed:
    """Hand-keyed clip: add(time, {bone: (x, y, z) in degrees}, root=(sway, lift, fwd), mode). Bones a key leaves out are not keyed there, so
    each bone only follows the keys that name it (the others hold or flow through). Every bone starts at REST at t=0 unless the first key names it."""
    def __init__(self, dur):
        self.dur = dur; self.tracks = {}; self.rootk = {0: [], 1: [], 2: []}

    def key(self, t, mode='flow', root=None, **bones):
        for b, v in bones.items():
            b = b.replace('__', '_')
            for i in range(3):
                if v[i] is None: continue
                self.tracks.setdefault((b, i), []).append((t, v[i] * D2R, mode))
        if root is not None:
            for i in range(3):
                if root[i] is not None: self.rootk[i].append((t, root[i], mode))
        return self

    def pose_at(self, t, base=None):
        p = base.copy() if base else Pose()
        for (b, i), ks in self.tracks.items():
            ks = sorted(ks, key=lambda k: k[0])
            if ks[0][0] > 0: ks = [(0.0, p.rot[b][i], 'flow')] + ks
            p.rot[b][i] = track(ks, t)
        for i, ks in self.rootk.items():
            if ks:
                ks = sorted(ks, key=lambda k: k[0])
                if ks[0][0] > 0: ks = [(0.0, 0.0, 'flow')] + ks
                p.root[i] = track(ks, t)
        return p


def mirror(pose):
    """Swap left and right: x rotations stay, y and z flip sign; root sway flips."""
    q = Pose()
    for b in BONES:
        o = b[:-1] + ('R' if b.endswith('L') else 'L') if b.endswith(('_L', '_R')) else b
        x, y, z = pose.rot[b]
        if b in REST or o in REST:  # offsets relative to rest are mirrored, rest itself is already mirrored in REST
            rx_, ry_, rz_ = REST.get(b, (0, 0, 0)); ox, oy, oz = REST.get(o, (0, 0, 0))
            q.rot[o] = [ox + (x - rx_), oy - (y - ry_), oz - (z - rz_)]
        else:
            q.rot[o] = [x, -y, -z] if o != b else [x, -y, -z]
    q.root = [-pose.root[0], pose.root[1], pose.root[2]]
    return q


# ---------------------------------------------------------------- glTF writer (animation only; the skeleton is the one in hero.glb)
def write_glb(path, clips):
    """clips: list of dict(name, fps, frames: list[Pose], extras). Rotations are stored as normalised int16 quaternions, shared time accessor."""
    nodes = [{'name': 'Hero', 'children': [1]}]
    idx = {}
    for b in BONES:
        idx[b] = len(nodes); nodes.append({'name': b, 'translation': [round(v, 5) for v in OFF[b]]})
    for b in BONES:
        if b in PARENT: nodes[idx[PARENT[b]]].setdefault('children', []).append(idx[b])
    nodes[0]['children'] = [idx['hips_root']]
    buf = bytearray(); views = []; accs = []; anims = []

    def add(data, ctype, count, typ, extra=None, minmax=None):
        while len(buf) % 4: buf.append(0)
        views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data)}); buf.extend(data)
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': count, 'type': typ}
        if extra: a.update(extra)
        if minmax: a['min'], a['max'] = minmax
        accs.append(a); return len(accs) - 1
    for c in clips:
        fr = c['frames']; n = len(fr); fps = c['fps']
        times = [i / fps for i in range(n)]
        tin = add(struct.pack(f'<{n}f', *times), 5126, n, 'SCALAR', minmax=([0.0], [times[-1]]))
        t1 = add(struct.pack('<f', 0.0), 5126, 1, 'SCALAR', minmax=([0.0], [0.0]))
        samplers = []; channels = []
        for b in BONES:
            qs = []; last = None
            for p in fr:
                q = rotm(*p.rot[b]).to_quaternion()
                if last is not None and q.dot(last) < 0: q = -q
                qs.append(q); last = q
            const = all((q - qs[0]).magnitude < 1e-4 for q in qs)
            r0 = REST.get(b, (0, 0, 0))
            if const and (rotm(*r0).to_quaternion() - qs[0]).magnitude < 1e-4: continue
            use = [qs[0]] if const else qs
            data = b''.join(struct.pack('<4h', *[max(-32767, min(32767, round(v * 32767))) for v in (q.x, q.y, q.z, q.w)]) for q in use)
            acc = add(data, 5122, len(use), 'VEC4', {'normalized': True})
            samplers.append({'input': t1 if const else tin, 'output': acc, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': idx[b], 'path': 'rotation'}})
        # root translation: absolute hips_root position
        rt = [[OFF['hips_root'][i] + p.root[i] for i in range(3)] for p in fr]
        if any(max(abs(rt[k][i] - rt[0][i]) for k in range(n)) > 1e-4 for i in range(3)):
            acc = add(b''.join(struct.pack('<3f', *v) for v in rt), 5126, n, 'VEC3')
            samplers.append({'input': tin, 'output': acc, 'interpolation': 'LINEAR'}); channels.append({'sampler': len(samplers) - 1, 'target': {'node': idx['hips_root'], 'path': 'translation'}})
        ex = dict(c.get('extras', {})); ex['fps'] = fps
        anims.append({'name': c['name'], 'samplers': samplers, 'channels': channels, 'extras': ex})
    js = {'asset': {'version': '2.0', 'generator': 'dharmastra tools/blender/anim (Blender 5.3 bpy)', 'extras': {'note': 'animation only; skeleton matches assets/characters/hero.glb'}},
          'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': nodes, 'buffers': [{'byteLength': len(buf)}], 'bufferViews': views, 'accessors': accs, 'animations': anims}
    jb = json.dumps(js, separators=(',', ':')).encode()
    while len(jb) % 4: jb += b' '
    while len(buf) % 4: buf.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(buf)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(bytes(buf))


def unwrap_frames(frames):
    """Make every bone's Euler angles continuous from frame to frame (no 2 pi jumps, no gimbal flips): per frame pick, of the two Euler triples that
    give the same rotation (each also shifted by multiples of 2 pi), the one nearest the previous frame."""
    TWO = 2 * math.pi
    for i in range(1, len(frames)):
        for b in BONES:
            p = frames[i - 1].rot[b]; e = frames[i].rot[b]
            alt = [e[0] + math.pi, math.pi - e[1], e[2] + math.pi]
            best = None
            for cand in (e, alt):
                c = [cand[k] + round((p[k] - cand[k]) / TWO) * TWO for k in range(3)]
                d = sum(abs(c[k] - p[k]) for k in range(3))
                if best is None or d < best[0]: best = (d, c)
            frames[i].rot[b] = best[1]
    return frames
