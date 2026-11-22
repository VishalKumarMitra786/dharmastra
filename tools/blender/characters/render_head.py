"""Renders close-ups of /tmp/hero-blend/head.blend for review. Not shipped.
Run: /tmp/bl/bin/python tools/blender/characters/render_head.py OUT.png view[,view...] [key=value ...] [--cycles] [--size 800]
views: front, three, side, eye, mouth. key=value sets a shape key (e.g. id_warrior=1 smile=0.8)."""
import sys, os, math
import bpy
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = argv[0]; views = argv[1].split(','); kv = {a.split('=')[0]: float(a.split('=')[1]) for a in argv[2:] if '=' in a and not a.startswith('--')}
cycles = '--cycles' in argv; size = int(argv[argv.index('--size') + 1]) if '--size' in argv else 700
blend = os.environ.get('BLEND', '/tmp/hero-blend/head.blend')
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
for ob in bpy.data.objects:
    sk = getattr(ob.data, 'shape_keys', None) if ob.type == 'MESH' else None
    if sk:
        for k in sk.key_blocks:
            if k.name != 'Basis': k.value = kv.get(k.name, 0.0)
sc.render.resolution_x = size; sc.render.resolution_y = size
if cycles:
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = float(os.environ.get('EXPOSURE', -0.3))
    sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SAMPLES', 40)); sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.55, 0.62, 0.75, 1); bg.inputs[1].default_value = 0.5
    for nm, loc, e in (('key', (-0.9, -1.2, 1.95), 120), ('rim', (0.9, 0.9, 1.9), 60), ('fill', (0.8, -1.0, 1.5), 20)):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA')); L.data.energy = e; L.data.size = 0.5; L.location = loc; sc.collection.objects.link(L)
        d = Vector((0, 0, 1.52)) - Vector(loc); L.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
else:
    sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE' if '--tex' in argv else 'MATERIAL'; sh.show_cavity = False
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
VIEWS = {'front': ((0, -0.95, 1.52), 0, 85, (0, 0, 1.53)), 'three': ((0.5, -0.8, 1.54), 0, 85, (0, 0, 1.53)), 'side': ((0.95, 0.0, 1.52), 0, 85, (0, 0, 1.53)),
         'eye': ((0.03, -0.45, 1.55), 0, 85, (0.03, 0, 1.55)), 'mouth': ((0, -0.5, 1.47), 0, 85, (0, 0, 1.47)), 'back': ((0, 0.95, 1.52), 0, 85, (0, 0, 1.53)), 'wide': ((0, -2.2, 1.45), 0, 85, (0, 0, 1.5))}
from PIL import Image
imgs = []
for v in views:
    loc, _, lens, tgt = VIEWS[v]; cam.location = Vector(loc); cam.data.lens = lens
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    p = out if len(views) == 1 else out.replace('.png', f'_{v}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); imgs.append(p)
if len(views) > 1:
    ims = [Image.open(p) for p in imgs]; W = sum(i.width for i in ims); sheet = Image.new('RGB', (W, ims[0].height)); x = 0
    for i in ims: sheet.paste(i, (x, 0)); x += i.width
    sheet.save(out)
