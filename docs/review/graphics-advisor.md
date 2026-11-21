# Graphics review: reaching a painted anime-film look (independent advisor)
Date 2026-11-22. Status: review only, no code changed, nothing run on a phone. Read: CLAUDE.md, docs/harness.md, docs/decisions.md, docs/review/progression-architecture.md, src/renderer3d.js, src/camera.js, src/characters.js, uncommitted src/gfx/*, the four screenshots in /tmp/h and the CEO's reference (style only).

## Verdict
The CEO is right, and the current direction cannot fix it. People are built from about 19 cylinders, boxes and spheres each, plus an outline copy of every part: about 37 draw calls per person. With 20 townspeople, stall keepers, guards and raiders, that is likely over 1,000 draw calls, against a budget of 150. This is my estimate from reading the code, not a measurement. The scene is also lit the wrong way for the target. PBR walls, a RoomEnvironment light and ACES filmic tone mapping give grey, desaturated night scenes (see tq_start, sg_raider), while the target is flat, warm and saturated daylight. Decision 10 ("anime people in a physically lit city") should be replaced: **everything toon-shaded, no PBR, no tone mapping.**

## 1. Can code-only reach the look?
- **Architecture, sky, ground and props: mostly yes.** These are geometric shapes. Code-built shapes with a painted canvas atlas, ink outlines and good light can reach about 70% of the target.
- **Foliage: partly.** Canvas-painted leaf cards on sphere-normal clumps can reach about 60%.
- **People: no.** Primitives, and the rigid segments in src/gfx/people.js, top out at "smooth mannequin". They show seams at the joints, no cloth drape and no shoulder or hip deformation, and a face decal cannot carry expression. That is about 3 out of 10 against the reference, however much tuning goes in. Realistic proportions need a **skinned, authored mesh**. Stop investing in primitive people.

## 2. Recommended pipeline (all costs are estimates until the spike measures them)
| Piece | Choice | Download (gzip) | Phone cost |
|---|---|---|---|
| Body | **MakeHuman hm08 base mesh, CC0 (verified, see Sources).** Shaped in Blender with MPFB on a dev machine to 7 to 7.5 heads tall, with the head about 5% large. Rebuilt or decimated to about 4k triangles for the hero and 1.5k for the crowd. Game rig of about 25 bones (MakeHuman's default rig is too heavy). Clothes are part of the mesh: dhoti, uttariya, sari and angavastra variants, all original. | 40-60 KB per body as GLB with meshopt (gltf-transform; three's decoder is MIT) | 1 draw per person, plus 1 for its outline |
| Animation | Own clips: idle, walk, run, crouch, vault, staff, hurt. The existing procedural state-to-pose code can drive bones in the meantime. | 10-20 KB per clip | Skinning 25 bones on 30 actors is well under 2 ms |
| Face | Canvas-painted atlas of 256 px per face. Eyes are separate quads, so blinking and looking around is a UV shift. The face painter in gfx/people.js can be reused here. | 0 KB (drawn at load) | 0 extra draws if put in the body atlas |
| Shading | MeshToonMaterial with a 2-band ramp (flat colour plus one soft shade, narrow linear edge) and a hemisphere fill. `NoToneMapping`. Remove PMREM/RoomEnvironment. | Saves bundle size and startup time | Cheaper than Standard |
| Outline | Inverted hull along smoothed normals (gfx/toon.js already has this; it must be checked with skinning). Use it for people and big props; paint ink lines into the architecture atlas. A screen-space Sobel pass only on desktop. | 0 | 1 extra draw per mesh. A Sobel pass would be 1-3 ms on a phone, so not there |
| Architecture | Instanced modular kit of about 30 pieces: wall, arch, jharokha, chhatri, pillar, step and roof types, each 100-300 triangles. One 1024 px painted atlas per era, WebP. Do not use KTX2 (its transcoder is about 200 KB). | 150-250 KB per era, lazy | 20-40 draws per city |
| Sky | Painted dome: canvas gradient plus 4 to 6 painted cumulus sprites (gfx/paint.js). Or a single 2048x1024 WebP equirect if commissioned. | 0 or about 150 KB | 2-7 draws, under 0.3 ms |
| Foliage | Instanced clumps of alpha-tested leaf cards with normals taken from a sphere, so toon light reads as one mass. | About 30 KB atlas | Watch overdraw; cap at 8 cards per clump |
| Post | None on phones (grade baked into the palette). Bloom and grade on desktop only. | 0 | 0 |
Budget per frame: draws ≤ 150 (city 40, people 60, effects 20, sky 10), triangles ≤ 150k, device pixel ratio capped at 1.5 on phones. Lazy art ≤ 600 KB per level. First-load budget unchanged.

Rejected:
- three.js example Xbot, Soldier and Michelle: Mixamo-derived, not CC0.
- RobotExpressive: CC0, but a robot.
- npm `dramatis`: three weeks old, licence still "owner decision to confirm", fetches from its own CDN. Watch it, do not depend on it.
- Quaternius UAL clips: CC0 according to their author, but quaternius.com is unreachable from here, so the licence is not verified.

### The half-finished src/gfx work: keep parts, drop people
It is not wired in (no import outside src/gfx), has no tests, and its screenshots do not exist. Do not merge it as is.
- **Keep:** toon.js (ramps and the smoothed-normal outline), paint.js (painted sky and tileable textures with no download), quality.js (pure and testable, needs tests), batch.js (merged static scenery), and post.js (the vignette).
- **Keep provisionally:** city.js, as the interim kit generator, after measuring its draw calls.
- **Drop:** people.js. Rigid merged segments still look like a mannequin, and its own header says 22 draws per person. Salvage only its face painter.
- **src/vendor/three-lite.js** has uncommitted changes (+1.7 KB gzip). Either commit it with the build script and a list of what was added, or revert it.

## 3. Phased plan with gates (each is checked by something that can fail)
Every phase adds these to `tools/smoke.mjs`:
- Log `renderer.info` (draw calls, triangles) and fail over budget.
- Golden screenshots at fixed seed, camera and time: 360x740 and 1280x800, for the hero close-up, the street and the crowd.
- A pixelmatch (MIT) diff, used only to catch unintended changes.
- A gzip budget line per art file in check-budget.mjs.

Quality is judged by people, not by the author:
- The CEO votes blind, A/B, against the previous golden.
- A rubric: head-to-height ratio between 1:7 and 1:7.5, measured from the bounding box; outline visible at 360 px; at most 2 shade tones per material; key actors at least 3:1 luminance contrast against the ground (WCAG 1.4.11); no colour-only meaning.

| Phase | Scope | Pass when |
|---|---|---|
| 0 Spike (≤ 1 week) | One skinned hero walking on one painted street block in `prototypes/`, in daylight | Hero GLB ≤ 80 KB gzip. Scene ≤ 60 draws. Median ≤ 33 ms and p95 ≤ 40 ms in perf.html on the named reference phone. CEO prefers it over tp_start.png in a blind vote |
| 1 People | Hero (6 looks via atlas and colour swaps, 4 hair meshes), 3 crowd bodies, 7 clips, outline with skinning, wired into renderer3d behind `?gfx=2` | Every level's people ≤ 60 draws. Crowd of 30 holds the frame budget on the phone. 2D fallback unchanged. Reduced motion respected |
| 2 Cities | Kit plus atlas for Hastinapur and Pataliputra, painted sky, foliage, daylight and dusk palettes. PBR removed | City ≤ 40 draws, ≤ 250 KB per era. Goldens approved. First frame not delayed (art loads after it) |
| 3 Polish | LOD and impostor crowd, face expressions, desktop post, quality tiers (quality.js) | Probe drops a tier on a slow phone (unit test plus device). Real-device numbers pasted into status.md |

## 4. What the CEO should provide or commission
All work for hire, with copyright or a CC0-compatible licence assigned to the studio in writing, original designs only, no deities.
1. **Concept artist (1-2 weeks):** style sheet with palette, line weight and two shade tones; turnarounds of 2 original heroes; a crowd sheet; one street per era. This becomes our golden target in place of the film reference.
2. **3D character artist (2-3 weeks):** retopology from the MakeHuman CC0 base, 25-bone rig, 7 clips, 2 outfits, painted atlas.
3. **Environment artist (2-3 weeks):** 30-piece kit plus a painted 1024 atlas per era.
4. **A reference mid-range Android phone** for the gate, and **Blender on one dev machine**. Our build environment has neither Blender nor access to the usual asset sites.

Without them we can still build:
- the toon shading, sky, foliage, lighting and camera
- the code-built kit
- the GLB import path
- a MakeHuman-based placeholder body, though it will look generic.

## 5. Risks, and the first spike
**Risks:**
- Realistic proportions with anime eyes can look uncanny. Fix it on the concept sheet first, not in code.
- Skinned outlines and alpha foliage overdraw on weak phones.
- Asset builds are not reproducible without Blender in CI. Commit the source .blend files and an export script.
- Licence drift: a CREDITS line for every file, and nothing from Mixamo or ripped models.
- Agents claiming the art looks good. Only goldens plus a human vote count.

**First spike:** take MakeHuman hm08 through MPFB to a 4k-triangle, 25-bone GLB with one walk clip. Load it in `prototypes/char-spike.html` with the toon ramp, the skinned hull outline and a painted face, on a gfx/paint.js daylight street. Record GLB size, `renderer.info`, and frame time on the phone, and capture 360 px screenshots. The outcome is a go or no-go on the skinned-mesh route before anyone commissions art.

## Sources checked (2026-11-22)
- MakeHuman LICENSE.md, section C: "The assets ... the base mesh and proxies ... Textures, Clothes ... released under CC0 1.0 Universal", and output may be used freely. https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md and LICENSE.ASSETS.md (CC0 legal text).
- Header of makehuman/data/3dobjs/base.obj: "explicitly released as CC0 in september 2020". It has 19,158 vertices, so it must be reduced.
- rigs/default_weights.mhw: `"license": "CC0"`.
- three.js examples/models/gltf/RobotExpressive/README.md: CC0, by Quaternius.
- npm registry metadata for three 0.187.0 (MIT), dramatis 0.1.3, @netforge/asset-library-files and @jgengine/assets. These are unvetted and not recommended.
- three-lite.js measured at 171 KB gzip (169.6 KB committed).
