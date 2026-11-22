# Graphics log: worst three flaws per round
Shots: prototypes/gfx-shots/out (390x844 and 1280x800 in the real game camera, software GL). Face close-ups come from prototypes/gfx-shots/studio.mjs.
Role change (coordinator, 2026-11-22): from round 3 I am environment and technical artist only. A character artist owns src/gfx/human/* (except anim.js), tools/build-hero.mjs and assets/characters/; an animator owns anim.js.

## Files I edited in the human area before the hand-off (left consistent and bootable; unit tests 216/216 passed after them)
- src/gfx/human/paint.js: eyes (wider aperture, centred iris, limbal ring, iris fibres, tinted sclera, lighter lid shadow, darker lower lid line), softer and lower brows (120 fine strokes), smaller nose-shadow blobs, hair cell repainted (fine strands, dark roots, sheen band, frayed alpha ends).
- src/gfx/human/headgear.js: hair shells now have an irregular hairline, locks and a crown whorl, two layered shells for short and crop hair, Builder gained a `vr` (v range) field; periodic u for the shell UV.
- src/gfx/human/index.js: atlas material now alpha-tests (alphaTest 0.4, alphaToCoverage) so the hair ends can fray.
The character artist may keep, change or revert any of this.

## Round 0 (baseline, old build)
1. The city is boxes: flat-coloured cubes, cone roofs, painted rectangles for windows (src/gfx/city.js was written but never wired in).
2. Ground is a flat lavender sheet with oval blobs; no material detail.
3. Three townspeople crowd the camera on the first Pepper Road shot.
## Round 1 (city.js wired, triplanar PBR materials, golden-hour light)
1. Ground blown out to a white-blue sheet (albedo too light, too much light).
2. Painted cartoon clouds in a grey blocky band.
3. Characters still crowd the first shot; jagged tunic hems, swim-cap hair (human area).
## Round 2 (crowd keep-out, hair shells, eyes)
1. Placeholder toon people show for the first seconds because the human kit loads after the world (fixed in round 3: no placeholder crowd).
2. Ground still reads as snow flecks (cobble scale far too small, pebbles too light).
3. Sky painter is cartoon puffs, not clouds (replaced by a noise cloud sky in round 3).

## Animator rounds (clips in assets/characters/anim, scripts in tools/blender/anim). Strips: /tmp/animwork/strip_*_side.png and _top.png (not in the repo)
Round A1 (locomotion first build, stick overlay only): 1. Walk knees snapped to full extension before heel strike (foot target unreachable); fixed by limiting pelvis height to 98.5 percent of leg reach. 2. Toe bone toggled 0.6 rad at toe-off (pop); fixed. 3. Foot slide measured 20 cm because the check compared the wrong contact point; after fixing, slide is 0.5 cm walk, under 0.1 cm jog and sprint.
Round A2 (combat first build): 1. Review renders showed the mesh frozen in the last frame: the keyed Blender action overrode the pose. Round A1 and A2 judgments came from the stick skeleton only. Fixed (action detached). 2. Hand targets were out of reach (arm is 0.447 m): IK residual 50 to 260 mm. Targets are now clamped into reach and the pull-in is stored per clip (clamp_mm). 3. Strikes snapped (elbow 2 rad per frame); the active phase is now stretched 1.45x.
Round A3 (with the mesh visible): 1. Knockdown fell like a plank, feet never left the floor; legs now kick up first. 2. Hit reaction from the front too weak; stronger torso, head and arm recoil and a larger step. 3. Staff and spear hands collapse onto the chest and the shaft crosses the torso (short arms); not fixed.
Round A4 (in-engine check with prototypes/gfx-shots/studio.mjs, sword attack): 1. Weapon hand is correct and the blade points where authored, but the left hand holds the lamp from procedural arms. 2. Rear foot lifts in the strike (heel pitch too large). 3. Only one frame pair was checked in-engine; most clips were judged in Blender only.

## Character artist rounds (Blender 5.3 pipeline, tools/blender/characters/, assets/characters/high/)
Shots: Blender Workbench and Cycles close-ups (/tmp, not kept) and the three.js rig prototypes/gfx-shots/chars.mjs. Skeleton: bone names and hierarchy of hero.glb are unchanged; the pack only adds spring bones hair1..3 (already defined in headgear.js).
### Character round 1 (first head in engine: skin, eyes, brows, lashes)
1. Skin read as plastic and pale: no texture detail at head scale, pores invisible at 1024 px (0.38 mm per texel). Fixed: pores, 4 mm skin lattice, forehead creases baked per texel from 3D, lips and cheeks tinted, cheap subsurface term.
2. Mouth interior stain: a position mask painted the chin red. Fixed with a ray-cast cavity mask (ray along the normal hits the other wall).
3. Brows were scratchy dark scribbles (strands 0.2 mm wide vanish at game distance). Fixed: dense core plus 0.4 mm strands; still too heavy and uniform black (open).
### Character round 2 (expressions and identities)
1. Expression keys exist and move (blink, smile, angry, worried, shout) but were judged only on brows and eyelids; mouth and teeth for shout were not looked at closely (open).
2. Identities: 14 shape keys defined as functions of position; only the small differences between them were checked on 3 faces, not a full sheet (open).
3. Eye whites too bright against skin. Fixed (sclera tinted, darker toward the lids).
### Character round 3 (hair cards)
1. First cards were hard slabs of paper (opaque core, wide). Fixed: narrower cards, translucent core, 0.4 to 1.0 per cent opacity strands.
2. Bald patches between cards: darken the scalp under hair (hair-root uniform) so gaps read as roots.
3. Long hair reads as stringy dark strokes, no volume or sheen (open). Braid, bun and topknot were built but not looked at closely.
### Character round 4 (budget)
1. High pack was 5.7 MB gz in assets: int8 morph deltas, quantised hair, webp q72 for the ORM map: now about 1.2 MB gz for characters/high.
2. Whole-repo assets total is still over 4,096 KB because assets/world is about 4.1 MB gz on its own (not mine).
3. Arm length: arms are about 20 per cent short (animator measurement); not changed here, see hand-back.

## Round 3 (Blender world kit, baked cobble ground, tiers; environment artist, 2026-11-22)
Shots: prototypes/gfx-shots/out/b1 (before), r1, r2, r4 (after), software GL, `?q=medium&gov=0`, Pepper Road (sangam-staff).
Flaws seen in the before shot (b1): 1. ground reads as snow flecks (procedural cobbles tiny, pale); 2. every building is a box with painted-looking windows and a flat cone roof; 3. the wall to vault is a flat pale slab.
Fixed: 1. real cobbles baked from high-poly stones (bake_ground.py); 2. kit windows, doors, columns, roofs, stalls, lanterns, props (build_kit.py); 3. obstacles use the world's masonry and timber materials (instanced variant, instance transform now seen by the triplanar shader).
## Round 4 (r1 shot)
1. Cobbles 2 m per tile: stones far too big and blue-black. 2. Triangles 587k (budget 150k Medium): kit pieces drawn at full detail. 3. Wall black after the material swap (triplanar ignored the instance matrix).
Fixed: tile scale 1/40; Low and Medium draw the decimated LOD1, rounded boxes use 1, 2, 3 segments by tier; instance matrix applied in the triplanar vertex code.
## Round 5 (r2 shot)
1. Triangles still 403k, of which 126k are skinned people (character artist) and 131k the world. 2. Roof reads as stacked flat bands, colour too tan. 3. Sky is a soft grey wash with no sun, no shaft of light.
Fixed: roof tint darkened to terracotta. Open: roof tile pattern, the sky, the people triangle count (see the report).
## Round 6 (r4 shot, props)
1. Props had no 3D form at all: added src/gfx/city-props.js (15 kinds, three crack states by shape, debris pile, idle ring, hand attach through human GRIPS). 2. Crack marks float off thin props. 3. Steel looks black without the sky env in the preview.
Honest note: all shots are software GL (SwiftShader) on 2 cores; every frame time and the benchmark result (Low, 104 ms step) are meaningless as phone numbers.

## Round 7 (art director r4 feedback)
Shots: prototypes/gfx-shots/out/r6-390x844.png, r6-1280x800.png (Medium, software GL, pot + staff + torch placed in frame).
Worst three flaws found in r6 and status:
1. Ground still reads cool blue-grey outside the lamp/sun patch (baked cobble albedo is grey; only a warm band catches the sun). NOT fixed; next: warm the baked albedo tint and lower hemi sky colour.
2. Grass is still spiky dark-green cards (denser/softer attempt did not read as soft). NOT fixed; recommend removal or a lighter, wider tuft texture.
3. Palisade is no longer a black comb (timber tone, tapered stakes) but sits in shade as dark red-brown; reads as timber, still heavy.
Done: warm sun/sky gradient with glow, lamp pools batched (one InstancedMesh + one Points), bench.js guard (aborts on slow call), shadow casters limited to big forms, kit LOD1 off-High.
Counts (Medium, incl. shadow pass): 390x844 135 calls / 250k tris; 1280x800 150 calls / 267k tris. Tri budget (150k) still exceeded: skinned people ~87k (human area), palisade/kit wood, shadow pass. Distance LOD for merged static meshes not built.

## Character artist round 5
Worst three flaws found, then fixed or reported:
1. Crown and back of the head showed bare skin between hair cards. Cause: the scalp tint was off whenever the hero wore any headgear, and the hairline mask stopped at the temples. Fixed: the tint follows whether a hair mesh exists, the mask now covers the sides, the tint is nearly opaque. In-game from behind the crown is now dark hair, but a skin-coloured gap remains at the nape and the cards still read as blocky dark patches (alpha cut-outs are too wide).
2. Right-hand finger curl had the wrong sign (the right hand is the mirrored mesh): a sword was held by straight fingers. Fixed in grips.js; props now sit at the palm, not the wrist. Checked in a close-up render for the sword; staff, spear, bow and torch were not re-checked.
3. Arms were 17-20% short. build-hero.mjs now stretches the shoulder-to-wrist span by ARM_K = 1.2 (hand rigid), bones and mesh together, bone names and hierarchy unchanged: shoulder to wrist 0.416 m to 0.500 m. hero.glb is 77 KB gz. The animator must rebuild the clips (tools/blender/anim/build.py) and re-tune two-handed grips.
Also: pack heads are capped (High 8, Medium 3, hero and bosses always); far (lod >= 2) humans fall back to the base head, near ones take a free slot. src/test/highpack.mjs covers pack-load failure and the cap/LOD swap.
Not done this round: sandals, new hand mesh, Blender turban/kurta/dhoti fold maps, 14-identity sheet.
