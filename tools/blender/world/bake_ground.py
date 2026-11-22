# Bakes tileable ground textures from real geometry: a 2 m x 2 m patch of rounded cobbles (or packed earth) is modelled as high-poly stones on a periodic
# lattice (stones near an edge are repeated on the opposite side, so the bake tiles), then albedo, tangent normal and ambient occlusion are baked onto a flat plane.
# Output: assets/world/ground_cobble_{albedo,normal}.png (albedo alpha = roughness variation). Run: /tmp/bl/bin/python tools/blender/world/bake_ground.py [--res 1024]
import bpy, bmesh, sys, os, math, random, argparse
import numpy as np
from mathutils import Vector, noise
ap = argparse.ArgumentParser(); ap.add_argument('--res', type=int, default=1024); ap.add_argument('--samples', type=int, default=24); ap.add_argument('--kind', default='cobble')
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/world'))
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]); OUT = os.path.abspath(a.out); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = False
T = 2.0; N = 6; cell = T / N; rnd = random.Random(11)
hi_mat = bpy.data.materials.new('stone'); hi_mat.use_nodes = True; nt = hi_mat.node_tree; bsdf = nt.nodes['Principled BSDF']
oi = nt.nodes.new('ShaderNodeObjectInfo'); ramp = nt.nodes.new('ShaderNodeValToRGB'); tex = nt.nodes.new('ShaderNodeTexNoise'); mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
mix.inputs['Factor'].default_value = 0.5; tex.inputs['Scale'].default_value = 30; tex.inputs['Detail'].default_value = 6
# per-stone tint from the object's random value: a range of warm and cool greys and ochres
ramp.color_ramp.elements[0].color = (0.30, 0.27, 0.24, 1); ramp.color_ramp.elements[1].color = (0.62, 0.55, 0.45, 1)
e = ramp.color_ramp.elements.new(0.5); e.color = (0.45, 0.42, 0.40, 1); e = ramp.color_ramp.elements.new(0.75); e.color = (0.52, 0.45, 0.36, 1)
nt.links.new(oi.outputs['Random'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], mix.inputs['A']); nt.links.new(tex.outputs['Color'], mix.inputs['B']); nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
mortar = bpy.data.materials.new('mortar'); mortar.use_nodes = True; mortar.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.13, 0.10, 1)
def stone(cx, cy):
    r = rnd; sx = cell * r.uniform(0.44, 0.52); sy = cell * r.uniform(0.42, 0.5); hz = r.uniform(0.05, 0.075)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=__import__('mathutils').Matrix.Diagonal((sx * 2, sy * 2, hz * 2, 1)), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(sx, sy) * 0.55, segments=5, profile=0.5, affect='EDGES')
    s = r.uniform(0, 100)
    for v in bm.verts:
        v.co.z -= 0.0; n = noise.noise(Vector((v.co.x * 14 + s, v.co.y * 14, v.co.z * 14))) * 0.012 + noise.noise(Vector((v.co.x * 45 + s, v.co.y * 45, v.co.z * 45))) * 0.004
        v.co.z += n * (1 if v.co.z > 0 else 0.3)
    me = bpy.data.meshes.new('s'); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new('s', me); sc.collection.objects.link(ob)
    ob.rotation_euler = (0, 0, r.uniform(0, 3.14)); ob.location = (cx, cy, -0.012 + hz * 0.8 * 0 + hz * 0.0)
    ob.data.materials.append(hi_mat); ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons)); return ob
his = []
for j in range(N):
    for i in range(N):
        cx = (i + 0.5) * cell + rnd.uniform(-0.1, 0.1) * cell; cy = (j + 0.5) * cell + rnd.uniform(-0.1, 0.1) * cell
        base = stone(cx, cy)
        for ox in (-T, 0, T):
            for oy in (-T, 0, T):
                if (ox, oy) == (0, 0) or not (-cell < cx + ox < T + cell and -cell < cy + oy < T + cell): continue
                d = base.copy(); d.data = base.data; sc.collection.objects.link(d); d.location = (cx + ox, cy + oy, base.location.z); his.append(d)
        his.append(base)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=T * 1.6); me = bpy.data.meshes.new('m'); bm.to_mesh(me); mo = bpy.data.objects.new('mortar', me); sc.collection.objects.link(mo)
mo.location = (T / 2, T / 2, -0.03); mo.data.materials.append(mortar); his.append(mo)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=T / 2); bmesh.ops.translate(bm, vec=(T / 2, T / 2, 0), verts=bm.verts)
lo_me = bpy.data.meshes.new('low'); bm.to_mesh(lo_me); lo = bpy.data.objects.new('low', lo_me); sc.collection.objects.link(lo)
lo.data.uv_layers.new(name='UV'); uv = lo.data.uv_layers.active.data
for li, loop in enumerate(lo.data.loops):
    p = lo.data.vertices[loop.vertex_index].co; uv[li].uv = (p.x / T, p.y / T)
lm = bpy.data.materials.new('lowm'); lm.use_nodes = True; lo.data.materials.append(lm)
R = a.res; imgs = {k: bpy.data.images.new(k, R, R, alpha=False) for k in ('albedo', 'normal', 'ao')}
for k, im in imgs.items(): im.colorspace_settings.name = 'sRGB' if k == 'albedo' else 'Non-Color'
tn = lm.node_tree.nodes.new('ShaderNodeTexImage'); tn.name = 'BAKE'; lm.node_tree.nodes.active = tn
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.light_settings.distance = 0.25; sc.world = w
b = sc.render.bake; b.use_selected_to_active = True; b.cage_extrusion = 0.15; b.max_ray_distance = 0.4; b.margin = 0; b.use_clear = True; b.normal_space = 'TANGENT'
for k, typ in (('albedo', 'DIFFUSE'), ('normal', 'NORMAL'), ('ao', 'AO')):
    tn.image = imgs[k]
    for o in sc.objects: o.select_set(False)
    for o in his: o.select_set(True)
    lo.select_set(True); bpy.context.view_layer.objects.active = lo
    if typ == 'DIFFUSE': b.use_pass_direct = False; b.use_pass_indirect = False; b.use_pass_color = True
    bpy.ops.object.bake(type=typ); print('baked', k)
def arr(im): return np.array(im.pixels[:], np.float32).reshape(R, R, 4)
alb = arr(imgs['albedo']); nor = arr(imgs['normal']); ao = arr(imgs['ao'])[..., 0]
nor[nor[..., 2] < 0.35] = (0.5, 0.5, 1, 1)
nor[..., 1] = 1.0 - nor[..., 1]  # the engine's triplanar shader reads green along +v of an unflipped image, so the green axis is mirrored here
# roughness variation: stone tops smoother, joints rougher; gentle AO darkening goes into the albedo, as the engine's procedural maps do
rough = np.clip(0.55 + (1 - ao) * 0.9, 0, 1); alb[..., :3] *= (0.55 + 0.45 * ao[..., None]); alb[..., 3] = rough
def save(d, name, cs, fmt='JPEG'):
    im = bpy.data.images.new(name, R, R, alpha=False); im.colorspace_settings.name = cs; im.pixels.foreach_set(d.reshape(-1))
    ims = sc.render.image_settings; ims.file_format = fmt; ims.quality = 90; ims.color_mode = 'RGB'; im.save_render(os.path.join(OUT, name), scene=sc)
save(alb, f'ground_{a.kind}_albedo.jpg', 'sRGB'); save(nor, f'ground_{a.kind}_normal.jpg', 'Non-Color')
bpy.ops.wm.save_as_mainfile(filepath='/tmp/ground.blend'); print('done')
