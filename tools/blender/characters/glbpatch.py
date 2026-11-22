"""Post-processes the Blender glTF export: writes the identity/expression shape keys as compact int16 sparse deltas (asset-specific, read by src/gfx/human/highpack.js).
Keys are functions of the rest position (facelib), so they are evaluated on the exported vertices directly (Blender splits vertices at UV seams, so Blender's own indices do not match)."""
import json, struct, numpy as np
import facelib as F

def read_glb(path):
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); bo = 20 + jl + 8; return j, bytearray(b[bo:])

def write_glb(path, j, binb):
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4); binb += b'\0' * ((4 - len(binb) % 4) % 4)
    open(path, 'wb').write(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(binb)) + b'BIN\0' + bytes(binb))

def accessor(j, binb, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5120: np.int8, 5122: np.int16}[a['componentType']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', n * np.dtype(dt).itemsize)
    if stride == n * np.dtype(dt).itemsize: r = np.frombuffer(bytes(binb[off:off + a['count'] * n * np.dtype(dt).itemsize]), dt).reshape(-1, n)
    else: r = np.stack([np.frombuffer(bytes(binb[off + k * stride: off + k * stride + n * np.dtype(dt).itemsize]), dt) for k in range(a['count'])])
    if a.get('normalized') and dt != np.float32: r = r.astype(np.float64) / (np.iinfo(dt).max)
    return r

def jaw_rigid(P, a):
    R = P - F.JAW_PIVOT; ny = R[:, 1] * np.cos(a) - R[:, 2] * np.sin(a); nz = R[:, 2] * np.cos(a) + R[:, 1] * np.sin(a); D = np.zeros_like(P); D[:, 1] = ny - R[:, 1]; D[:, 2] = nz - R[:, 2]; return D

def keyfun(part, flags=None):
    """(key name, positions) -> displacement or None, per part. Same rules for the Blender preview shape keys and the exported deltas.
    flags: for 'mouth', 1 where the vertex belongs to the lower jaw (lower teeth, tongue)."""
    if part == 'eyes':
        def kf(k, P):
            if k in F.EXPRESSIONS: return None
            D = np.zeros_like(P)
            for sx in (1, -1):
                m = np.sign(P[:, 0]) == sx
                if m.any(): D[m] = F.field(k, P[m].mean(0, keepdims=True))
            return D
    elif part == 'mouth':
        def kf(k, P):
            low = flags > 0.5
            if k in ('shout', 'jaw'): D = np.zeros_like(P); D[low] = jaw_rigid(P[low], 0.34); return D
            if k in F.EXPRESSIONS: return None
            return F.field(k, P)
    else: kf = lambda k, P: F.field(k, P)
    return kf

def patch(path):
    j, binb = read_glb(path); blob = bytearray(); total = 0
    for mesh in j['meshes']:
        prim = mesh['primitives'][0]; P = accessor(j, binb, prim['attributes']['POSITION']).astype(np.float64); fl = accessor(j, binb, prim['attributes']['COLOR_0'])[:, 3] if mesh['name'] == 'mouth' else None; kf = keyfun(mesh['name'], fl); entries = []
        for k in F.all_keys():
            D = kf(k, P)
            if D is None: continue
            mag = np.abs(D).max(axis=1); idx = np.nonzero(mag > 1e-4)[0]
            if len(idx) == 0: continue
            scale = float(np.abs(D[idx]).max() / 127.0); q = np.round(D[idx] / scale).astype(np.int8)
            pad = (4 - len(blob) % 4) % 4; blob += b'\0' * pad; off = len(blob)
            blob += idx.astype(np.uint16 if len(P) < 65536 else np.uint32).tobytes()
            blob += b'\0' * ((4 - len(blob) % 4) % 4); blob += q.tobytes()
            entries.append({'name': k, 'count': int(len(idx)), 'offset': off, 'scale': scale}); total += len(idx)
        mesh['extras'] = {'morphs': entries}
    pad = (4 - len(binb) % 4) % 4; binb += b'\0' * pad; base = len(binb); binb += blob
    j['bufferViews'].append({'buffer': 0, 'byteOffset': base, 'byteLength': len(blob)}); j['asset'].setdefault('extras', {})['morphView'] = len(j['bufferViews']) - 1
    j['buffers'][0]['byteLength'] = len(binb); write_glb(path, j, binb)
    return total, len(blob)

def compact(path, hair=False):
    """Rewrites a Blender GLB into a small one: float32 positions; int8 normals; uint16 uv; uint8 joints, weights, colours; uint16 indices; skin matrices kept.
    Needs KHR_mesh_quantization for the normalised small types (three.js reads it natively; highpack.js reads normalised accessors itself)."""
    j, binb = read_glb(path); out = bytearray(); views = []; accs = []
    def put(arr, ct, typ, norm=False, target=34962, stride=None, mm=None):
        arr = np.ascontiguousarray(arr); raw = arr.tobytes(); pad = (4 - len(out) % 4) % 4; out.extend(b'\0' * pad)
        views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(raw), **({'target': target} if target else {})}); out.extend(raw)
        a = {'bufferView': len(views) - 1, 'componentType': ct, 'count': int(arr.shape[0]), 'type': typ}
        if norm: a['normalized'] = True
        if mm: a['min'], a['max'] = mm
        accs.append(a); return len(accs) - 1
    for mesh in j['meshes']:
        p = mesh['primitives'][0]; A = p['attributes']; NA = {}
        pos = accessor(j, binb, A['POSITION']).astype(np.float32)
        if hair:   # int16 positions inside a fixed box (decoded in highpack.js), no normals (the loader uses the direction from the head centre)
            ctr = np.array([0, 1.4, 0.0]); half = np.array([0.25, 0.35, 0.25]); q = np.zeros((len(pos), 4), np.int16); q[:, :3] = np.round(np.clip((pos - ctr) / half, -1, 1) * 32767)
            NA['POSITION'] = put(q, 5122, 'VEC3', True); views[-1]['byteStride'] = 8; j['asset'].setdefault('extras', {})['posBox'] = {'center': ctr.tolist(), 'half': half.tolist()}
        else:
            NA['POSITION'] = put(pos, 5126, 'VEC3', mm=[pos.min(0).tolist(), pos.max(0).tolist()])
            nor = accessor(j, binb, A['NORMAL']).astype(np.float32); nq = np.zeros((len(nor), 4), np.int8); nq[:, :3] = np.round(np.clip(nor, -1, 1) * 127); NA['NORMAL'] = put(nq, 5120, 'VEC3', True); views[-1]['byteStride'] = 4
        if 'TEXCOORD_0' in A:
            uv = accessor(j, binb, A['TEXCOORD_0']).astype(np.float32); uq = np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16); NA['TEXCOORD_0'] = put(uq, 5123, 'VEC2', True)
        if 'COLOR_0' in A:
            c = accessor(j, binb, A['COLOR_0']).astype(np.float32); c = c if c.shape[1] == 4 else np.hstack([c, np.ones((len(c), 1), np.float32)]); NA['COLOR_0'] = put(np.round(np.clip(c, 0, 1) * 255).astype(np.uint8), 5121, 'VEC4', True)
        jn = accessor(j, binb, A['JOINTS_0']).astype(np.uint8); NA['JOINTS_0'] = put(jn, 5121, 'VEC4')
        w = accessor(j, binb, A['WEIGHTS_0']).astype(np.float32); wq = np.round(np.clip(w, 0, 1) * 255).astype(np.int32)
        for r in range(len(wq)):
            d = 255 - wq[r].sum()
            if d: wq[r, wq[r].argmax()] += d
        NA['WEIGHTS_0'] = put(wq.astype(np.uint8), 5121, 'VEC4', True)
        idx = accessor(j, binb, p['indices']).astype(np.uint16).reshape(-1); p['attributes'] = NA; p['indices'] = put(idx, 5123, 'SCALAR', target=34963)
    sk = j['skins'][0]; ibm = accessor_f(j, binb, sk['inverseBindMatrices']); sk['inverseBindMatrices'] = put(ibm, 5126, 'MAT4', target=None)
    j['accessors'] = accs; j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(out)}]; j.setdefault('extensionsUsed', [])
    if 'KHR_mesh_quantization' not in j['extensionsUsed']: j['extensionsUsed'].append('KHR_mesh_quantization')
    j.setdefault('extensionsRequired', [])
    if 'KHR_mesh_quantization' not in j['extensionsRequired']: j['extensionsRequired'].append('KHR_mesh_quantization')
    write_glb(path, j, out)

def accessor_f(j, binb, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; off = v.get('byteOffset', 0) + a.get('byteOffset', 0); return np.frombuffer(bytes(binb[off:off + a['count'] * 16 * 4]), np.float32).reshape(-1, 16)
