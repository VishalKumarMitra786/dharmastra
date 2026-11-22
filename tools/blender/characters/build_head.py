"""Builds the High head pack from the CC0 MakeHuman base mesh and saves /tmp/hero-blend/head.blend, then exports assets/characters/high/head-*.glb.
Run: /tmp/bl/bin/python tools/blender/characters/build_head.py [--no-export]
Needs /tmp/hero-cache (tools/build-hero.mjs downloads it) and `pip install pillow scipy` in /tmp/bl (tools/blender/characters/setup.sh)."""
import sys, os, math, time, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import mhbase, facelib as F, headparts as HP, bake

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..')); WORK = os.environ.get('BLEND_WORK', '/tmp/hero-blend'); os.makedirs(WORK, exist_ok=True)
conv = lambda A: np.stack([A[:, 0], -A[:, 2], A[:, 1]], 1)       # game y-up (+z forward) -> Blender z-up (-y forward)
unconv = lambda A: np.stack([A[:, 0], A[:, 2], -A[:, 1]], 1)

def new_obj(name, P, faces, UV=None, coll=None):
    me = bpy.data.meshes.new(name); me.from_pydata(conv(np.asarray(P)).tolist(), [], [list(f) for f in faces]); me.update()
    if UV is not None:
        uv = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices): uv.data[li].uv = tuple(UV[vi])
    ob = bpy.data.objects.new(name, me); (coll or bpy.context.scene.collection).objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob

def add_keys(ob, P, keyfun):
    """keyfun(name, P) -> displacement in game coords (N,3). Writes a Basis and one shape key per name."""
    ob.shape_key_add(name='Basis', from_mix=False)
    for name in F.all_keys():
        D = keyfun(name, P)
        if D is None: continue
        sk = ob.shape_key_add(name=name, from_mix=False); sk.data.foreach_set('co', conv(P + D).ravel())

def export_pack(S, tex):
    outdir = os.path.join(ROOT, 'assets', 'characters', 'high'); os.makedirs(outdir, exist_ok=True)
    from PIL import Image
    for ob in bpy.data.objects: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(outdir, 'head-high.glb'), export_format='GLB', use_selection=False, export_apply=False, export_morph=False,
        export_try_sparse_sk=False, export_skins=True, export_materials='EXPORT', export_image_format='NONE', export_cameras=False, export_lights=False, export_yup=True,
        export_vertex_color='ACTIVE', export_attributes=False, export_animations=False, export_extras=False)
    import glbpatch; glbpatch.compact(os.path.join(outdir, 'head-high.glb')); print('morph deltas', glbpatch.patch(os.path.join(outdir, 'head-high.glb')))
    # textures: WebP (lossy q88; the normal map keeps q92), one set per size
    def conv(src, dst, q): Image.open(src).convert('RGB').save(dst, 'WEBP', quality=q, method=6)
    for sz in [S]:
        for nm, q in (('albedo', 88), ('normal', 92), ('orm', 72)):
            src = os.path.join(tex, f'skin_{nm}_{S}.png'); im = Image.open(src).convert('RGB')
            if sz != S: im = im.resize((sz, sz), Image.LANCZOS)
            im.save(os.path.join(outdir, f'skin_{nm}_{sz}.webp'), 'WEBP', quality=q, method=6)
    conv(os.path.join(tex, 'eye_atlas.png'), os.path.join(outdir, 'eye_atlas.webp'), 80); conv(os.path.join(tex, 'eye_orm.png'), os.path.join(outdir, 'eye_orm.webp'), 90)
    Image.open(os.path.join(tex, 'cards.png')).save(os.path.join(outdir, 'cards.webp'), 'WEBP', quality=75, method=6)
    for stale in ('brow.webp', 'lash_upper.webp', 'lash_lower.webp', 'skin_albedo_512.webp', 'skin_normal_512.webp', 'skin_orm_512.webp'):
        if os.path.exists(os.path.join(outdir, stale)): os.remove(os.path.join(outdir, stale))
    print('exported to', outdir, {f: os.path.getsize(os.path.join(outdir, f)) for f in sorted(os.listdir(outdir))})

def main(export=True):
    t0 = time.time()
    M, VT, G = mhbase.load(); W = mhbase.game_weights(); bones = mhbase.game_bones()
    dom = {v: max(w, key=lambda x: x[1])[0] for v, w in W.items()}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # ---- skin: the full-resolution head and neck faces of the base mesh (same face rule as the game's head group) ----
    hf = [f for f in G['body'] if sum(dom[i] in ('head', 'neck') for i, _ in f) >= 3]
    used = sorted({i for f in hf for i, _ in f}); rm = {v: k for k, v in enumerate(used)}
    skinP = M[used]; skinF = [tuple(rm[i] for i, _ in f) for f in hf]
    skin = new_obj('skin', skinP, skinF)
    # ---- UVs: one clean unwrap (the MakeHuman layout wastes two thirds of the square; everything is baked per texel from 3D, so any layout works)
    bpy.context.view_layer.objects.active = skin; skin.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.004, area_weight=0.6)
    bpy.ops.object.mode_set(mode='OBJECT'); skin.select_set(False)
    # ---- ray-cast surface for placing brow cards ----
    bm = bmesh.new(); bm.from_mesh(skin.data); bvh = BVHTree.FromBMesh(bm)
    def surface(x, y):
        o = Vector((x, -0.5, y)); hit = bvh.ray_cast(o, Vector((0, 1, 0)), 2.0)   # in Blender coords the face points toward -y
        if hit[0] is None: return 0.1, 0, 0, 1
        co, n = hit[0], hit[1]; return -co.y, n.x, n.z, -n.y
    parts = {'skin': (skin, skinP)}
    # ---- eyes (both in one mesh: one draw call) ----
    eyes = HP.merge([HP.eyeball(side) for side in 'LR']); parts['eyes'] = (new_obj('eyes', eyes['P'], eyes['F'], eyes['UV']), eyes['P'])
    # ---- cards: lashes (MakeHuman helper strips, our UVs) and two layered brow ribbons per side, all in one mesh with one atlas ----
    cards = []
    for side, g1, g2 in (('L', 'helper-l-eyelashes-1', 'helper-l-eyelashes-2'), ('R', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2')):
        for g, kind in ((g1, 'lower'), (g2, 'upper')):
            s_ = HP.helper_strip(M, VT, G, g, kind, side); s_['UV'] = HP.card_uv(s_['UV'], HP.CARD_BANDS['lash_' + kind]); cards.append(s_)
    for side in 'LR':
        for layer in (0, 1):
            b_ = HP.brow_card(surface, side, layer); b_['UV'] = HP.card_uv(b_['UV'], HP.CARD_BANDS['brow']); cards.append(b_)
    cards = HP.merge(cards); parts['cards'] = (new_obj('cards', cards['P'], cards['F'], cards['UV']), cards['P'])
    # ---- mouth: teeth and tongue (base helpers), colours and the lower-jaw flag in the colour attribute (rgb colour, a = lower jaw) ----
    mp = []
    for g, rgb, low in (('helper-upper-teeth', (0.80, 0.76, 0.66), 0), ('helper-lower-teeth', (0.78, 0.74, 0.64), 1), ('helper-tongue', (0.50, 0.14, 0.14), 1)):
        s_ = HP.stripped(M, G, g); s_['C'] = np.tile([*rgb, float(low)], (len(s_['P']), 1)); mp.append(s_)
    mouth = HP.merge(mp); parts['mouth'] = (new_obj('mouth', mouth['P'], mouth['F']), mouth['P'])
    attr = parts['mouth'][0].data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); attr.data.foreach_set('color', mouth['C'].astype(np.float32).ravel())
    # ---- shape keys ----
    import glbpatch
    for name, tup in parts.items():
        ob, P = tup[0], tup[1]
        add_keys(ob, P, glbpatch.keyfun(name, mouth['C'][:, 3] if name == 'mouth' else None))
    # ---- armature + weights (game rig names; the runtime remaps by name) ----
    arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    for name, parent, pos in bones:
        eb = arm.edit_bones.new(name); h = conv(np.array([pos]))[0]; eb.head = Vector(h); eb.tail = Vector(h) + Vector((0, 0, 0.04))
    for name, parent, pos in bones:
        if parent: arm.edit_bones[name].parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    def skin_to(ob, wlist):
        for bn in {b for w in wlist for b, _ in w}:
            if bn not in ob.vertex_groups: ob.vertex_groups.new(name=bn)
        for vi, w in enumerate(wlist):
            for b, x in w: ob.vertex_groups[b].add([vi], x, 'REPLACE')
        ob.parent = rig; m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    skin_to(skin, [W[i] for i in used])
    for name, tup in parts.items():
        if name == 'skin': continue
        skin_to(tup[0], [[('head', 1.0)]] * len(tup[1]))
    # ---- textures, vertex data, look-dev materials ----
    S = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 1024
    tex = os.path.join(WORK, 'tex'); bake.save_parts_tex(tex)
    if '--skip-skin' not in sys.argv or not os.path.exists(f'{tex}/skin_albedo_{S}.png'): bake.bake_skin(skin, S, tex)
    bake.vertex_data(skin)
    bake.preview_materials(tex, S, {'skin': [skin], 'eye': [parts['eyes'][0]], 'cards': [parts['cards'][0]], 'mouth': [parts['mouth'][0]]})
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'head.blend'))
    if export: export_pack(S, tex)
    print('geometry built in %.1fs' % (time.time() - t0), 'skin tris', sum(len(p.vertices) - 2 for p in skin.data.polygons))
    return dict(skin=skin, parts=parts, rig=rig)

if __name__ == '__main__':
    main(export='--no-export' not in sys.argv)
