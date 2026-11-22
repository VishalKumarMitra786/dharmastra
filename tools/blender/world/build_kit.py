# Builds the world kit: models every piece (pieces.py), unwraps it into one shared atlas, bakes normal, ambient occlusion and curvature maps from the
# detailed version onto the game version, makes a decimated far LOD, and exports assets/world/kit.glb plus the texture maps.
# Run: /tmp/bl/bin/python tools/blender/world/build_kit.py [--only a,b] [--preview /tmp/kit.png] [--res 2048] [--no-bake] [--blend /tmp/kit.blend]
import bpy, bmesh, sys, os, math, argparse, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pieces import PIECES
import numpy as np
from mathutils import Vector

ap = argparse.ArgumentParser(); ap.add_argument('--only', default=''); ap.add_argument('--preview', default=''); ap.add_argument('--res', type=int, default=2048)
ap.add_argument('--no-bake', action='store_true'); ap.add_argument('--blend', default='/tmp/kit.blend'); ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/world'))
ap.add_argument('--samples', type=int, default=24)
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
OUT = os.path.abspath(a.out); os.makedirs(OUT, exist_ok=True)
names = [n for n in PIECES if not a.only or n in a.only.split(',')]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = False
SP = 6.0  # spacing so the ambient occlusion of one piece never sees another

def join(objs, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; return o

def mat_for(key, shared):
    m = bpy.data.materials.get(key)
    if m: return m
    m = bpy.data.materials.new(key); m.use_nodes = True; return m

H = {}; L = {}
for i, n in enumerate(names):
    for hi, store in ((True, H), (False, L)):
        ps = PIECES[n](hi); objs = []
        for key, part in ps.items():
            if not len(part.bm.verts): part.bm.free(); continue
            ob = part.finish(f'{"H" if hi else "L"}_{n}__{key}'); ob.location = (i * SP, 0, 0)
            ob.data.materials.append(mat_for(key, None)); objs.append(ob)
        store[n] = join(objs, f'{"H" if hi else "L"}_{n}')
        store[n].location = (i * SP, 0, 0)
print('built', {n: (len(H[n].data.polygons), len(L[n].data.polygons)) for n in names})

if a.preview:  # contact sheet of the detailed pieces, front view
    for o in H.values(): o.hide_render = False
    for o in L.values(): o.hide_render = True
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.65, 0.8, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9; sc.world = w
    for key, col in (('stone', (0.72, 0.66, 0.55)), ('wood', (0.35, 0.22, 0.12)), ('cloth', (0.75, 0.25, 0.15)), ('clay', (0.62, 0.32, 0.2)), ('gold', (0.8, 0.6, 0.2)), ('lit', (1, 0.8, 0.4)), ('roof', (0.6, 0.28, 0.17)), ('goods', (0.9, 0.5, 0.1))):
        m = bpy.data.materials.get(key)
        if m: m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6 if key != 'gold' else 0.35; m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 1.0 if key == 'gold' else 0.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (math.radians(55), 0, math.radians(-35)); sc.collection.objects.link(sun)
    gp = bpy.data.objects.new('g', bpy.data.meshes.new('g')); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200); bm.to_mesh(gp.data); sc.collection.objects.link(gp)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.data.type = 'ORTHO'; sc.collection.objects.link(cam); sc.camera = cam
    n = len(names); cam.data.ortho_scale = max(6.5, n * SP * 0.5 * 1.1 / 1.6) * 1.0; cols = 4; rows = math.ceil(n / cols)
    # lay pieces out on a grid instead of a line
    for i, nm in enumerate(names):
        x, y = (i % cols) * 3.6, -(i // cols) * 3.6
        for o in (H[nm], L[nm]): o.location = (x, 0, y)
    cam.location = (cols * 3.6 / 2 - 1.8, -20, -(rows - 1) * 3.6 / 2 + 1.2); cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.ortho_scale = cols * 3.6 + 0.6; sc.render.resolution_x = 1600; sc.render.resolution_y = int(1600 * (rows * 3.6 + 0.6) / (cols * 3.6 + 0.6))
    sc.render.filepath = a.preview; bpy.ops.render.render(write_still=True); print('preview', a.preview); sys.exit(0)

# ---- UV unwrap the game versions into one shared atlas ----
def sel_only(objs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
lows = [L[n] for n in names]
sel_only(lows); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.004, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT'); bpy.ops.uv.average_islands_scale(); bpy.ops.uv.pack_islands(margin=0.003, rotate=False)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- Bake: normal, ambient occlusion and curvature from the detailed pieces onto the game pieces ----
RES = a.res
imgs = {k: bpy.data.images.new(k, RES, RES, alpha=False, float_buffer=False) for k in ('normal', 'ao', 'curv')}
imgs['normal'].colorspace_settings.name = 'Non-Color'; imgs['ao'].colorspace_settings.name = 'Non-Color'; imgs['curv'].colorspace_settings.name = 'Non-Color'
imgs['normal'].generated_color = (0.5, 0.5, 1, 1); imgs['ao'].generated_color = (1, 1, 1, 1); imgs['curv'].generated_color = (0.5, 0.5, 0.5, 1)
for k, im in imgs.items():
    px = np.zeros(RES * RES * 4, dtype=np.float32); px[3::4] = 1
    px[0::4], px[1::4], px[2::4] = {'normal': (0.5, 0.5, 1.0), 'ao': (1, 1, 1), 'curv': (0.5, 0.5, 0.5)}[k]; im.pixels.foreach_set(px)
for mname in set(m.name for o in lows for m in o.data.materials):  # every game material gets the bake target image node
    m = bpy.data.materials[mname]; m.use_nodes = True; nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.name = 'BAKE'; tex.image = imgs['normal']; nt.nodes.active = tex
# curvature material for the detailed pieces: emission driven by the geometry's pointiness
cm = bpy.data.materials.new('curvmat'); cm.use_nodes = True; nt = cm.node_tree; nt.nodes.clear()
geo = nt.nodes.new('ShaderNodeNewGeometry'); ramp = nt.nodes.new('ShaderNodeValToRGB'); em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[1].position = 0.65
nt.links.new(geo.outputs['Pointiness'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
orig_mats = {n: [m for m in H[n].data.materials] for n in names}
try: bpy.data.worlds['w'].light_settings.distance = 0.5
except Exception: pass
sc.world = sc.world or bpy.data.worlds.new('bw')
bk = sc.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = 0.05; bk.max_ray_distance = 0.15; bk.margin = 10; bk.margin_type = 'EXTEND'; bk.use_clear = False
bk.normal_space = 'TANGENT'
for pas, typ in (('normal', 'NORMAL'), ('ao', 'AO'), ('curv', 'EMIT')):
    for n in names:
        for m in L[n].data.materials: m.node_tree.nodes['BAKE'].image = imgs[pas]
        if pas == 'curv': H[n].data.materials.clear(); H[n].data.materials.append(cm)
        elif pas == 'ao' or pas == 'normal':
            H[n].data.materials.clear(); [H[n].data.materials.append(m) for m in orig_mats[n]]
        for o in bpy.context.selected_objects: o.select_set(False)
        H[n].select_set(True); L[n].select_set(True); bpy.context.view_layer.objects.active = L[n]
        if typ == 'AO': sc.cycles.samples = max(a.samples, 32)
        bpy.ops.object.bake(type=typ)
    print('baked', pas)

def arr(im): return np.array(im.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
nrm = arr(imgs['normal']); miss = nrm[..., 2] < 0.35; nrm[miss] = (0.5, 0.5, 1.0, 1.0);  # rays that found nothing become a flat normal
print('normal miss fraction', float(miss.mean()))
ao = arr(imgs['ao'])[..., 0]; cv = arr(imgs['curv'])[..., 0]
orm = np.ones((RES, RES, 4), np.float32); orm[..., 0] = np.clip(ao, 0, 1); orm[..., 1] = np.clip(cv, 0, 1); orm[..., 2] = 0
def save(data, name, color='Non-Color', fmt='JPEG'):
    im = bpy.data.images.new(name, RES, RES, alpha=False); im.colorspace_settings.name = color; im.pixels.foreach_set(data.reshape(-1))
    ims = sc.render.image_settings; ims.file_format = fmt; ims.quality = 92; ims.color_mode = 'RGB'
    im.save_render(os.path.join(OUT, name), scene=sc); bpy.data.images.remove(im)
save(nrm, 'kit_normal.jpg')  # the packed AO + curvature map is only shipped at 1k (low frequency)
# a half-size copy for the Low tier
RES0 = RES
def half(d): return d.reshape(RES0 // 2, 2, RES0 // 2, 2, 4).mean(axis=(1, 3))
RES = RES0 // 2; save(half(nrm), 'kit_normal_1k.jpg'); save(half(orm), 'kit_orm_1k.jpg'); RES = RES0

# ---- LOD1 (decimated) and export ----
for n in names:
    lod = L[n].copy(); lod.data = L[n].data.copy(); lod.name = f'L_{n}_lod1'; sc.collection.objects.link(lod)
    mod = lod.modifiers.new('d', 'DECIMATE'); mod.ratio = 0.4; mod.use_collapse_triangulate = True
for o in list(bpy.data.objects):
    if o.name.startswith('H_'): bpy.data.objects.remove(o)
if a.blend: bpy.ops.wm.save_as_mainfile(filepath=a.blend)
for o in bpy.data.objects:
    if o.name.startswith('L_'):
        o.name = o.name[2:]; o.location = (0, 0, 0)
# strip bake nodes so no image is embedded
for m in bpy.data.materials:
    if m.use_nodes and 'BAKE' in m.node_tree.nodes: m.node_tree.nodes.remove(m.node_tree.nodes['BAKE'])
for o in bpy.context.selected_objects: o.select_set(False)
for o in bpy.data.objects:
    if o.type == 'MESH': o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'kit.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True)
print('exported', os.path.getsize(os.path.join(OUT, 'kit.glb')))
