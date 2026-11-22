"""Build the clip sets: author in code, key into Blender actions, read the evaluated pose back, check it, write glTF animations, and (optionally) render strips.

  /tmp/bl/bin/python tools/blender/anim/build.py [--strips] [group ...]       groups: loco combat react interact   (default: all)
Outputs: assets/characters/anim/<group>.glb, .blend files and strips in /tmp/animwork (not in the repo)."""
import os, sys, json, importlib, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blenderio as B, check
from rig import *

OUT = '/home/claude/dharmastra/assets/characters/anim'; WORK = '/tmp/animwork'
GROUPS = {'loco': 'clips_loco', 'combat': 'clips_combat', 'react': 'clips_react', 'interact': 'clips_interact'}


def main():
    args = sys.argv[1:]; strips = any(a.startswith('--strips') for a in args); strip_only = [n for a in args if a.startswith('--strips=') for n in a.split('=')[1].split(',')]; names = [a for a in args if not a.startswith('--')] or list(GROUPS)
    only = [n for a in args if a.startswith('--only=') for n in a.split('=')[1].split(',')]
    os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
    report = {}
    for g in names:
        try: mod = importlib.import_module(GROUPS[g])
        except ModuleNotFoundError: print('skip', g); continue
        t0 = time.time(); clips = mod.all_clips(); arm = B.setup(); done = []
        for c in clips:
            if only and c['name'] not in only: continue
            unwrap_frames(c['frames'])
            B.set_props(c['extras'].get('propR'), c['extras'].get('propL'))
            B.key_clip(arm, c); back, worst = B.readback(arm, c)
            assert worst < 1e-4, (c['name'], worst)
            c['frames'] = back
            ex = c['extras']; lp = ex.get('loop', False)
            rep = {'frames': len(back), 'dur': ex.get('dur'), 'roundtrip': round(worst, 7)}
            if 'stride' in ex:
                rep['feet'] = check.feet_report(c); ex['slide_cm'] = round(rep['feet']['slide'] * 100, 2); ex['min_y_cm'] = round(rep['feet']['minY'] * 100, 2)
            rep['maxstep'] = [round(check.maxstep(c, lp)[0], 3), check.maxstep(c, lp)[1]]
            report[c['name']] = rep; done.append(c)
            if strips and (not strip_only or c['name'] in strip_only):
                n = len(back); picks = sorted(set(int(round(n * k / 8)) if lp else int(round((n - 1) * k / 7)) for k in range(8)))
                picks = [min(p, n - 1) for p in picks]
                tr = c.get('travel'); sp = ex.get('speed', 0.0) if lp else 0.0
                trav = (lambda i, tr=tr, f=c['fps']: tr(i / f)) if tr else (lambda i, sp=sp, f=c['fps']: sp * i / f)
                B.strip(arm, back, f"{WORK}/strip_{c['name']}_side.png", picks, 'side', travel=trav, scale=2.4 if ex.get('big') is None else ex['big'])
                B.strip(arm, back, f"{WORK}/strip_{c['name']}_top.png", picks, 'top', travel=trav, scale=2.4)
        bpy_path = f'{WORK}/anim_{g}.blend'
        import bpy; bpy.ops.wm.save_as_mainfile(filepath=bpy_path)
        if not only: write_glb(f'{OUT}/{g}.glb', done)
        print(f'{g}: {len(done)} clips in {time.time() - t0:.1f}s -> {OUT}/{g}.glb' + (' (skipped write: --only)' if only else ''))
    json.dump(report, open(f'{WORK}/report.json', 'w'), indent=1)
    for k, v in report.items(): print(k, v)


main()
