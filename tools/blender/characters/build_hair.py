"""Builds assets/characters/high/hair.glb: hair and beard card meshes grown on the head surface (hairstyles.py), one mesh per style.
Run: /tmp/bl/bin/python tools/blender/characters/build_hair.py   (after build_head.py: it shares the tex folder)"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy, numpy as np
from PIL import Image
import mhbase, hairlib, hairstyles, parts_tex as PT, glbpatch, facelib as F
import build_head as BH
ROOT = BH.ROOT; WORK = BH.WORK
STYLES = ['crop', 'short', 'long', 'bun', 'topknot', 'braid', 'moustache', 'goatee', 'beard_short', 'beard_full']

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    S = hairlib.Scalp(); bones = mhbase.game_bones()
    arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(rig); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT'); from mathutils import Vector
    extra = [('hair1', 'head', [0, 1.485, -0.07]), ('hair2', 'hair1', [0, 1.375, -0.07]), ('hair3', 'hair2', [0, 1.265, -0.07])]
    for name, parent, pos in [(b[0], b[1], b[2]) for b in bones] + extra:
        eb = arm.edit_bones.new(name); h = BH.conv(np.array([pos]))[0]; eb.head = Vector(h); eb.tail = Vector(h) + Vector((0, 0, 0.04))
    for name, parent, pos in [(b[0], b[1], b[2]) for b in bones] + extra:
        if parent: arm.edit_bones[name].parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for st in STYLES:
        m = hairstyles.style(S, st); ob = BH.new_obj('hair_' + st, m['P'], m['F'], m['UV'])
        # custom normals: mostly the scalp normal so the cards shade like a mass of hair, not like flat ribbons
        ob.data.normals_split_custom_set_from_vertices(BH.conv(m['N']).tolist())
        ob.vertex_groups.new(name='head')
        if m['chain']:
            for b in m['chain']: ob.vertex_groups.new(name=b)
            y = m['P'][:, 1]; t = np.clip((1.485 - y) / 0.22, 0, 1) * 3.0
            for vi in range(len(y)):
                k = min(2, int(t[vi])); u = t[vi] - k if t[vi] < 3 else 1.0
                if t[vi] <= 0: ob.vertex_groups['head'].add([vi], 1.0, 'REPLACE'); continue
                names = ['head'] + m['chain']; a = min(k, 2); ob.vertex_groups[names[a]].add([vi], 1 - u if a < 3 else 1, 'REPLACE'); ob.vertex_groups[names[a + 1]].add([vi], u, 'REPLACE')
        else: ob.vertex_groups['head'].add(list(range(len(m['P']))), 1.0, 'REPLACE')
        ob.parent = rig; mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
        print(st, 'cards', len(m['F']), 'tris', len(m['F']) * 2)
    outdir = os.path.join(ROOT, 'assets', 'characters', 'high'); os.makedirs(outdir, exist_ok=True)
    for ob in bpy.data.objects: ob.select_set(True)
    path = os.path.join(outdir, 'hair.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_apply=False, export_morph=False, export_skins=True, export_materials='NONE', export_image_format='NONE',
        export_cameras=False, export_lights=False, export_yup=True, export_attributes=False, export_animations=False, export_extras=False)
    glbpatch.compact(path, hair=True)
    Image.fromarray(PT.hair_atlas()).save(os.path.join(outdir, 'hair_strands.webp'), 'WEBP', quality=76, method=6)
    print({f: os.path.getsize(os.path.join(outdir, f)) for f in ('hair.glb', 'hair_strands.webp')})
main()
