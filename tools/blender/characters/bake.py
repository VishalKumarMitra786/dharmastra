"""Bakes skin textures + per-vertex data for the head and builds Blender preview materials. Run inside build_head.py."""
import os, time
import numpy as np, bpy
from PIL import Image
import skin_tex as ST, parts_tex as PT, facelib as F
unconv = lambda A: np.stack([A[:, 0], A[:, 2], -A[:, 1]], 1)

def mesh_arrays(ob):
    me = ob.data; me.calc_loop_triangles(); nv = len(me.vertices)
    pos = np.zeros(nv * 3, np.float32); me.vertices.foreach_get('co', pos); pos = unconv(pos.reshape(-1, 3))
    nor = np.zeros(nv * 3, np.float32); me.vertex_normals.foreach_get('vector', nor); nor = unconv(nor.reshape(-1, 3))
    uvl = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers[0].data.foreach_get('uv', uvl); uvl = uvl.reshape(-1, 2)
    tris = me.loop_triangles; vid = np.array([t.vertices[:] for t in tris]); lid = np.array([t.loops[:] for t in tris])
    return pos, nor, uvl, vid, lid

def cavity_mask(ob, P, N, mask):
    """1 where a texel lies inside the mouth: a ray along its own normal hits the other wall within 4 cm (outer skin rays escape)."""
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new(); bm.from_mesh(ob.data); tree = BVHTree.FromBMesh(bm)
    out = np.zeros(mask.shape, np.float32); ys, xs = np.nonzero(mask)
    pos = P[ys, xs]; ok = (np.abs(pos[:, 0]) < 0.036) & (pos[:, 1] > 1.447) & (pos[:, 1] < 1.49) & (pos[:, 2] < 0.162)
    cv = lambda v: Vector((v[0], -v[2], v[1]))
    for k in np.nonzero(ok)[0]:
        n = N[ys[k], xs[k]]; n = n / (np.linalg.norm(n) + 1e-9); p = pos[k]
        if tree.ray_cast(cv(p + n * 0.0004), cv(n), 0.04)[0] is not None: out[ys[k], xs[k]] = 1.0
    from scipy import ndimage
    return ndimage.gaussian_filter(out, 0.8)

def bake_skin(ob, S, outdir, seed=7):
    t0 = time.time(); pos, nor, uvl, vid, lid = mesh_arrays(ob)
    uvt = uvl[lid]                                               # (T,3,2)
    P, N, T, B, mask = ST.rasterize(S, (uvt, vid), None, pos, nor)
    tri_pos = pos[vid]
    mouth_in = cavity_mask(ob, P, N, mask)
    A, Nm, O, R = ST.build(S, P, N, T, B, mask, tri_pos, seed, mouth_in)
    A = ST.pad(A, mask); Nm = ST.pad(Nm, mask); O = ST.pad(O, mask)
    os.makedirs(outdir, exist_ok=True)
    def save(name, a, mode='RGB'): Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), mode).save(os.path.join(outdir, name))
    save(f'skin_albedo_{S}.png', A); save(f'skin_normal_{S}.png', Nm); save(f'skin_orm_{S}.png', O)
    print('skin textures %d px in %.1fs, coverage %.0f%%' % (S, time.time() - t0, 100 * mask.mean()))
    return dict(mask=mask)

def vertex_data(ob):
    """Per-vertex occlusion (ray cast), thickness (thin ears, nose wings, lids) and scalp mask. Stored as colour attribute 'Col' (r=ao, g=thick, b=scalp)."""
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    me = ob.data; pos, nor, *_ = mesh_arrays(ob); bm = bmesh.new(); bm.from_mesh(me); tree = BVHTree.FromBMesh(bm)
    rng = np.random.default_rng(4); n = len(pos); ao = np.ones(n, np.float32)
    dirs = rng.normal(size=(20, 3)); dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    cv = lambda v: Vector((v[0], -v[2], v[1]))
    for i in range(n):
        nn = nor[i]; hit = 0
        for d in dirs:
            dd = d if d @ nn > 0 else -d
            dd = dd * 0.7 + nn * 0.3; dd = dd / np.linalg.norm(dd)
            if tree.ray_cast(cv(pos[i] + nn * 0.0008), cv(dd), 0.035)[0] is not None: hit += 1
        ao[i] = 1 - 0.85 * hit / len(dirs)
    R = ST.region_masks(pos)
    thick = np.clip(np.maximum.reduce([R['ear'] * 1.0, R['alae'] * 0.8, R['nose_tip'] * 0.5, R['eye_in'] * 0.4, R['lips'] * 0.3]), 0, 1)
    col = np.stack([ao, thick, R['scalp'], np.ones(n)], 1).astype(np.float32)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); attr.data.foreach_set('color', col.ravel())
    return col

def save_parts_tex(outdir):
    os.makedirs(outdir, exist_ok=True)
    eyes, names = PT.eye_atlas(); Image.fromarray((eyes * 255 + 0.5).astype(np.uint8)).save(os.path.join(outdir, 'eye_atlas.png'))
    Image.fromarray((PT.eye_orm() * 255 + 0.5).astype(np.uint8)).save(os.path.join(outdir, 'eye_orm.png'))
    cards = np.concatenate([PT.brow_strip(), PT.lash_strip(upper=True), PT.lash_strip(upper=False, seed=6, count=30)], axis=0)      # bands: brow, upper lash, lower lash
    Image.fromarray(cards).save(os.path.join(outdir, 'cards.png'))
    return names

def img(path, nc=False, alpha=False):
    im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = 'Non-Color' if nc else 'sRGB'
    if alpha: im.alpha_mode = 'STRAIGHT'
    return im

def preview_materials(tex, S, objs, hair_rgb=(0.04, 0.025, 0.02), skin_tint=(1, 1, 1)):
    """Cycles look-dev materials with the baked maps (the game uses its own three.js materials)."""
    def new(name):
        m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree.nodes, m.node_tree.links
    m, nd, ln = new('skin'); b = nd['Principled BSDF']
    a = nd.new('ShaderNodeTexImage'); a.image = img(f'{tex}/skin_albedo_{S}.png'); o = nd.new('ShaderNodeTexImage'); o.image = img(f'{tex}/skin_orm_{S}.png', True)
    n = nd.new('ShaderNodeTexImage'); n.image = img(f'{tex}/skin_normal_{S}.png', True); nm = nd.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 1.0
    sp = nd.new('ShaderNodeSeparateColor'); ln.new(o.outputs['Color'], sp.inputs['Color'])
    ln.new(a.outputs['Color'], b.inputs['Base Color']); ln.new(sp.outputs['Green'], b.inputs['Roughness']); ln.new(n.outputs['Color'], nm.inputs['Color']); ln.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Subsurface Weight'].default_value = 0.35; b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.18); b.inputs['Subsurface Scale'].default_value = 0.006
    b.inputs['Specular IOR Level'].default_value = 0.45
    for ob in objs['skin']: ob.data.materials.append(m)
    # eyes
    m, nd, ln = new('eye'); b = nd['Principled BSDF']; a = nd.new('ShaderNodeTexImage'); a.image = img(f'{tex}/eye_atlas.png'); a.extension = 'EXTEND'
    mp = nd.new('ShaderNodeMapping'); tc = nd.new('ShaderNodeTexCoord'); mp.inputs['Scale'].default_value = (1 / 8, 1, 1); mp.inputs['Location'].default_value = (1 / 8 * 1, 0, 0)
    ln.new(tc.outputs['UV'], mp.inputs['Vector']); ln.new(mp.outputs['Vector'], a.inputs['Vector']); ln.new(a.outputs['Color'], b.inputs['Base Color'])
    o = nd.new('ShaderNodeTexImage'); o.image = img(f'{tex}/eye_orm.png', True); sp = nd.new('ShaderNodeSeparateColor'); ln.new(o.outputs['Color'], sp.inputs['Color']); ln.new(sp.outputs['Green'], b.inputs['Roughness'])
    ln.new(tc.outputs['UV'], o.inputs['Vector']); b.inputs['Specular IOR Level'].default_value = 0.7; b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.0
    for ob in objs['eye']: ob.data.materials.append(m)
    # hair-card materials: alpha from the PNG, colour from hair_rgb
    m, nd, ln = new('cards'); bs = nd['Principled BSDF']; a = nd.new('ShaderNodeTexImage'); a.image = img(f'{tex}/cards.png', alpha=True)
    mix = nd.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0; mix.inputs['B'].default_value = (*hair_rgb, 1)
    ln.new(a.outputs['Color'], mix.inputs['A']); ln.new(mix.outputs['Result'], bs.inputs['Base Color']); ln.new(a.outputs['Alpha'], bs.inputs['Alpha']); bs.inputs['Roughness'].default_value = 0.45
    for ob in objs['cards']: ob.data.materials.append(m)
    m, nd, ln = new('mouth'); bs = nd['Principled BSDF']; ca = nd.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; ln.new(ca.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.3
    for ob in objs['mouth']: ob.data.materials.append(m)
