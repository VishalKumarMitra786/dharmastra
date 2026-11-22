"""Blender side: load the hero, put a Pose on it, key clips into actions, read them back, and render frame strips (side and top).
Rendering is Cycles on the CPU at low samples: Workbench and EEVEE need a GPU context that a headless box does not have."""
import math, os, sys
import bpy, mathutils
import numpy as np
from rig import *

C_SIDE = {'view': 'side', 'loc': (-6.0, 0, 0.9), 'rot': (math.pi / 2, 0, -math.pi / 2)}


def setup(res=(200, 280)):
    _PROPS.clear()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    arm = bpy.data.objects['Hero']
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name != 'human': bpy.data.objects.remove(o)
    # the garment hides the legs, so the body is drawn translucent and the bones are drawn as coloured sticks: left orange, right cyan, centre white
    body = bpy.data.objects['human']
    bm = bpy.data.materials.new('body'); bm.use_nodes = True; bs = bm.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.75, 0.62, 0.52, 1); bs.inputs['Alpha'].default_value = 0.28; bs.inputs['Roughness'].default_value = 0.9
    body.data.materials.clear(); body.data.materials.append(bm)
    global STICKS; STICKS = {}
    for b in BONES:
        for c in [k for k, v in PARENT.items() if v == b]:
            col = (1.0, 0.55, 0.1, 1) if b.endswith('_L') or c.endswith('_L') else (0.1, 0.8, 1.0, 1) if b.endswith('_R') or c.endswith('_R') else (0.95, 0.95, 0.95, 1)
            m = bpy.data.materials.new('s' + c); m.use_nodes = True; bn = m.node_tree.nodes['Principled BSDF']; bn.inputs['Base Color'].default_value = col; bn.inputs['Emission Color'].default_value = col; bn.inputs['Emission Strength'].default_value = 0.6
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.014, depth=1.0); o = bpy.context.object; o.data.materials.append(m); o.name = f'stick_{b}_{c}'; STICKS[(b, c)] = o
    # foot contact markers (heel and ball) so planting reads against the floor
    for nm in ('heelL', 'heelR', 'ballL', 'ballR'):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, segments=8, ring_count=6); o = bpy.context.object; o.name = nm
        m = bpy.data.materials.new(nm); m.use_nodes = True; bn = m.node_tree.nodes['Principled BSDF']; col = (1, 0.2, 0.1, 1) if 'L' in nm[-1] else (0.2, 0.4, 1, 1); bn.inputs['Base Color'].default_value = col; bn.inputs['Emission Color'].default_value = col; bn.inputs['Emission Strength'].default_value = 1.0; o.data.materials.append(m)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 6; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.20, 0.22, 0.26, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0; sc.world = w; sc.view_settings.view_transform = 'Standard'
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.rotation_euler = (0.7, 0.0, 0.5); sun.data.energy = 3.0
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.type = 'ORTHO'
    # floor: a plane with a 0.25 m grid (lines are thin planes) so foot slide is visible against the ground
    mat = bpy.data.materials.new('floor'); mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.30, 0.30, 0.28, 1)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.002)); fl = bpy.context.object; fl.scale = (6, 24, 1); fl.data.materials.append(mat); fl.name = 'floor'
    lm = bpy.data.materials.new('line'); lm.use_nodes = True; lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.8, 0.5, 1)
    for k in range(-40, 41):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, k * 0.25, 0.0)); g = bpy.context.object; g.scale = (6, 0.008 if k % 4 else 0.016, 0.003); g.data.materials.append(lm); g.name = f'grid{k}'
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0.7, k * 0.25, 0.04)); g = bpy.context.object; g.scale = (0.02, 0.012 if k % 4 else 0.03, 0.08 if k % 4 else 0.16); g.data.materials.append(lm); g.name = f'tick{k}'
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.0)); g = bpy.context.object; g.scale = (0.012, 24, 0.004); g.data.materials.append(lm); g.name = 'mid'
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
    return arm


PROP_PARTS = {  # (centre along the long axis, length, radius x, radius y, rgb); grip at 0, long axis +Y (same as src/gfx/human/props.js)
    'staff': [(0.32, 1.75, 0.02, 0.02, (0.55, 0.38, 0.2))], 'stick': [(0.2, 1.2, 0.016, 0.016, (0.55, 0.38, 0.2))], 'club': [(0.3, 0.62, 0.04, 0.04, (0.5, 0.33, 0.18))],
    'spear': [(0.3, 2.0, 0.015, 0.015, (0.55, 0.38, 0.2)), (1.46, 0.2, 0.026, 0.008, (0.8, 0.82, 0.85))],
    'sword': [(0.46, 0.82, 0.03, 0.012, (0.9, 0.92, 0.98)), (0.05, 0.02, 0.065, 0.013, (0.85, 0.65, 0.25)), (-0.02, 0.11, 0.013, 0.013, (0.3, 0.2, 0.1))],
    'bow': [(0.0, 1.5, 0.014, 0.014, (0.5, 0.33, 0.18))],
}
_PROPS = {}
C4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def set_props(right=None, left=None):
    """Stand-in meshes for what the hands hold (a long axis and a size, nothing prettier): staff, spear, sword, club in the right hand; shield or bow on the left."""
    for o in _PROPS.values(): bpy.data.objects.remove(o)
    _PROPS.clear()
    kinds = []
    if right: kinds += [('R', right)]
    if left: kinds += [('L', left)]
    for side, k in kinds:
        parts = PROP_PARTS.get(k, [])
        if k == 'shield':
            parts = [('disc', 0.32)]
        for i, pt in enumerate(parts):
            if pt[0] == 'disc': bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.27, depth=0.03)
            else: bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.0, depth=1.0)
            o = bpy.context.object; o.name = f'prop_{side}_{k}_{i}'
            m = bpy.data.materials.new(o.name); m.use_nodes = True; bn = m.node_tree.nodes['Principled BSDF']; col = (0.6, 0.5, 0.3, 1) if pt[0] == 'disc' else (*pt[4], 1)
            bn.inputs['Base Color'].default_value = col; o.data.materials.append(m); _PROPS[(side, k, i)] = o


def _place_props(W, dist):
    for (side, k, i), o in _PROPS.items():
        if k == 'shield':
            M = W['forearm_L'] @ Matrix.Translation((0.04, -0.12, 0)) @ rotm(0, math.pi / 2, 0).to_4x4() @ Matrix.Scale(1, 4)
        else:
            cy, L, rxr, ryr, _ = PROP_PARTS[k][i]
            M = W[f'hand_{side}'] @ rotm(0, 0, math.pi / 2).to_4x4() @ Matrix.Translation((0, cy, 0)) @ rotm(-math.pi / 2, 0, 0).to_4x4() @ Matrix.Diagonal((rxr, ryr, L, 1))
            if k == 'bow': M = W['hand_L'] @ rotm(0, 0, math.pi / 2).to_4x4() @ Matrix.Translation((0, cy, 0)) @ rotm(-math.pi / 2, 0, 0).to_4x4() @ Matrix.Diagonal((rxr, ryr, L, 1))
        o.matrix_world = Matrix.Translation((0, -dist, 0)) @ C4 @ M


def apply(arm, pose, dist=0.0, yaw=0.0):
    """Put a Pose on the armature. glTF local rotation == Blender pose-bone quaternion because every bone's rest frame is the same +90 degree X turn."""
    for b in BONES:
        pb = arm.pose.bones[b]; q = rotm(*pose.rot[b]).to_quaternion(); pb.rotation_quaternion = q
    r = arm.pose.bones['hips_root']; r.location = Vector(pose.root)
    arm.location = (0, -dist, 0)   # forward is -Y in Blender
    arm.rotation_euler = (0, 0, yaw)
    W = fk(pose); g2b = lambda v: Vector((v.x, -v.z, v.y))
    for (b, c), o in STICKS.items():
        p0 = g2b(W[b].translation if b != 'hips_root' else W[b].translation); p1 = g2b(W[c].translation); d = p1 - p0; L = max(d.length, 1e-4)
        o.location = p0 + d / 2 + Vector((0, -dist, 0)); o.scale = (1, 1, L); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    _place_props(W, dist)
    for side in 'LR':
        for nm, pt in (('heel', HEEL), ('ball', BALL)):
            o = bpy.data.objects[f'{nm}{side}']; w = W[f'foot_{side}'] @ pt; o.location = g2b(w) + Vector((0, -dist, 0))
    bpy.context.view_layer.update()


def key_clip(arm, clip):
    """Store a clip as a Blender action (one key per frame), and return the pose read back from the evaluated armature."""
    act = bpy.data.actions.new(clip['name']); arm.animation_data_create(); arm.animation_data.action = act
    fps = clip['fps']
    for i, p in enumerate(clip['frames']):
        apply(arm, p)
        for b in BONES:
            arm.pose.bones[b].keyframe_insert('rotation_quaternion', frame=i + 1, group=b)
        arm.pose.bones['hips_root'].keyframe_insert('location', frame=i + 1, group='hips_root')
    return act


def readback(arm, clip, tol=1e-4):
    """Evaluate the keyed action frame by frame and compare ROTATIONS (matrices, so equivalent Euler triples are not counted as differences)."""
    out = []; worst = 0.0
    for i, p in enumerate(clip['frames']):
        bpy.context.scene.frame_set(i + 1); q = p.copy()
        for b in BONES:
            m = arm.pose.bones[b].rotation_quaternion.to_matrix(); q.rot[b] = euler_of(m, p.rot[b])
            d = rotm(*q.rot[b]) - rotm(*p.rot[b]); worst = max(worst, max(abs(v) for row in d for v in row))
        q.root = list(arm.pose.bones['hips_root'].location); worst = max(worst, max(abs(q.root[k] - p.root[k]) for k in range(3)))
        out.append(q)
    return out, worst


def _cam(view, cx, zc, scale):
    cam = bpy.context.scene.camera; cam.data.ortho_scale = scale
    if view == 'side': cam.location = (-6.0, cx, zc); cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    else: cam.location = (0.0, cx, 6.0); cam.rotation_euler = (0, 0, -math.pi / 2)


def strip(arm, frames, path, picks, view='side', travel=None, scale=2.3, cols_dist=None, label=None):
    """Render the chosen frame indices into one image (a strip). travel(i) = metres moved forward at frame i (the person walks along the floor).
    The camera stays fixed per cell, centred on the person, but the floor grid scrolls past, so planted feet stay on their grid cell."""
    sc = bpy.context.scene; W, H = sc.render.resolution_x, sc.render.resolution_y; cells = []
    if arm.animation_data: arm.animation_data.action = None   # the keyed action would override the pose set below with its last frame (found in review round 1)
    zc = 0.85 if view == 'side' else 0.0
    for i in picks:
        d = travel(i) if travel else 0.0
        apply(arm, frames[i], dist=d)
        _cam(view, -d - 0.6 * frames[i].root[2], zc, scale)   # the camera follows most of the pelvis travel so lunges are not cropped
        sc.render.filepath = '/tmp/animwork/_cell.png'; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load('/tmp/animwork/_cell.png', check_existing=False); px = np.array(img.pixels[:]).reshape(H, W, 4); bpy.data.images.remove(img); cells.append(px)
    row = np.concatenate(cells, axis=1)
    # thin separators between cells
    for k in range(1, len(cells)): row[:, k * W - 1, :3] = 0.9
    im = bpy.data.images.new('strip', row.shape[1], row.shape[0], alpha=False); im.pixels = row.flatten().tolist(); im.filepath_raw = path; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
    return path
