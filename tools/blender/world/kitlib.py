# Small modelling helpers for the world kit (Blender 5.x, run headless: /tmp/bl/bin/python tools/blender/world/build_kit.py).
# Everything is built with bmesh from primitives, bevelled, so that edges catch light. Units are metres; Z is up in Blender (exported as Y up),
# the front of a piece faces -Y in Blender (+Z in the game).
import bpy, bmesh, math, random
from mathutils import Matrix, Vector, Euler, noise

class Part:
    """One mesh (one material key of one piece), grown by adding bevelled primitives."""
    def __init__(self, hi):
        self.bm = bmesh.new(); self.hi = hi
    def _add(self, bm2, loc, rot=(0, 0, 0), scale=(1, 1, 1)):
        m = Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        bmesh.ops.transform(bm2, matrix=m, verts=bm2.verts)
        me = bpy.data.meshes.new('t'); bm2.to_mesh(me); self.bm.from_mesh(me); bpy.data.meshes.remove(me); bm2.free()
    def _bevel(self, bm2, w, seg=None):
        if w <= 0: return
        seg = seg or (3 if self.hi else 1)
        bmesh.ops.bevel(bm2, geom=list(bm2.edges), offset=w, offset_type='OFFSET', segments=seg, profile=0.5, affect='EDGES')
    def box(self, loc, size, bevel=0.01, rot=(0, 0, 0)):
        b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0)
        bmesh.ops.transform(b, matrix=Matrix.Diagonal((*size, 1)), verts=b.verts)
        self._bevel(b, min(bevel, min(size) * 0.45)); self._add(b, loc, rot)
    def cyl(self, loc, r1, r2, h, verts=12, bevel=0.0, rot=(0, 0, 0), cap=True):
        b = bmesh.new(); v = verts * (2 if self.hi else 1)
        bmesh.ops.create_cone(b, cap_ends=cap, cap_tris=False, segments=v, radius1=r1, radius2=r2, depth=h)
        self._bevel(b, min(bevel, min(r1, r2 if r2 > 0 else r1) * 0.5, h * 0.45)); self._add(b, loc, rot)
    def sphere(self, loc, r, scale=(1, 1, 1), sub=2, rot=(0, 0, 0)):
        b = bmesh.new(); bmesh.ops.create_icosphere(b, subdivisions=sub + (1 if self.hi else 0), radius=r)
        self._add(b, loc, rot, scale)
    def lathe(self, loc, prof, verts=16, rot=(0, 0, 0), scale=(1, 1, 1), flute=0, flute_amp=0.06):
        """prof: [(radius, z), ...] bottom to top. Closed with caps when the end radii are 0."""
        b = bmesh.new(); v = verts * (2 if self.hi else 1)
        if flute: v = max(v, flute * 2)
        prev = []
        for (r, z) in prof:
            row = []
            for i in range(v):
                a = 2 * math.pi * i / v
                k = 1.0 - (flute_amp if (flute and i % 2 == 0) else 0.0)
                row.append(b.verts.new((math.cos(a) * r * k, math.sin(a) * r * k, z)))
            if prev:
                for i in range(v):
                    j = (i + 1) % v
                    try: b.faces.new((prev[i], prev[j], row[j], row[i]))
                    except ValueError: pass
            prev = row
        bmesh.ops.remove_doubles(b, verts=b.verts, dist=1e-5)
        for cap_row in ([r for r in b.verts if abs(r.co.z - prof[0][1]) < 1e-6], [r for r in b.verts if abs(r.co.z - prof[-1][1]) < 1e-6]):
            if len(cap_row) > 2:
                try: bmesh.ops.contextual_create(b, geom=cap_row)
                except Exception: pass
        bmesh.ops.recalc_face_normals(b, faces=list(b.faces))
        self._add(b, loc, rot, scale)
    def torus(self, loc, R, r, rot=(0, 0, 0), maj=20, minr=6, scale=(1, 1, 1)):
        b = bmesh.new(); maj *= (2 if self.hi else 1); minr += (4 if self.hi else 0)
        rows = []
        for i in range(maj):
            a = 2 * math.pi * i / maj; row = []
            for j in range(minr):
                c = 2 * math.pi * j / minr; rr = R + r * math.cos(c)
                row.append(b.verts.new((math.cos(a) * rr, math.sin(a) * rr, r * math.sin(c))))
            rows.append(row)
        for i in range(maj):
            for j in range(minr):
                b.faces.new((rows[i][j], rows[(i + 1) % maj][j], rows[(i + 1) % maj][(j + 1) % minr], rows[i][(j + 1) % minr]))
        bmesh.ops.recalc_face_normals(b, faces=list(b.faces)); self._add(b, loc, rot, scale)
    def grid(self, fn, nu, nv, flip=False):
        """A parametric surface: fn(u, v) -> (x, y, z), u and v in 0..1."""
        if not self.hi: nu = max(2, nu // 2); nv = max(2, nv // 2)
        b = bmesh.new(); vs = [[b.verts.new(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                q = (vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1])
                b.faces.new(q[::-1] if flip else q)
        self._add(b, (0, 0, 0))
    def tri_fan(self, pts, faces):
        b = bmesh.new(); vs = [b.verts.new(p) for p in pts]
        for f in faces: b.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(b, faces=list(b.faces)); self._add(b, (0, 0, 0))
    def micro(self, amp, freq, seed=0, cuts=2):
        """High detail only: subdivide, then push vertices along their normal with noise (wood grain, chisel marks, plaster pits)."""
        if not self.hi or amp <= 0: return
        bm = self.bm
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > 0.06], cuts=cuts, use_grid_fill=True)
        bm.normal_update()
        for v in bm.verts:
            p = v.co * freq + Vector((seed * 7.3, seed * 3.1, seed * 5.7))
            n = noise.fractal(p, 0.5, 2.0, 3) * 0.7 + noise.noise(p * 6.0) * 0.3
            v.co += v.normal * n * amp
    def finish(self, name, smooth_deg=38):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for e in bm.edges:
            e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(smooth_deg))
        for f in bm.faces: f.smooth = True
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        return ob
