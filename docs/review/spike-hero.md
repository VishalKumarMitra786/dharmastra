# Spike: one skinned hero on a painted street (go / no-go before commissioning art)
Owner: TPO. Builder: developer. Advisor source: docs/review/graphics-advisor.md. Isolated: nothing in src/ or the playable game changes.

## Question
Can a skinned, properly proportioned human built from the CC0 MakeHuman base mesh, cel shaded with an outline and painted face, run in the browser inside our budgets and look clearly better than today's box people?

## Scope
- `tools/build-hero.mjs`: a repeatable script (Node, no Blender) that downloads the MakeHuman base mesh, skeleton and bone weights from GitHub raw (licence text checked and copied), reduces the mesh to about 4,000 triangles (npm `meshoptimizer` or equivalent, run in a scratch dir outside the repo), keeps about 25 bones, and writes `assets/characters/hero.glb`.
- `prototypes/hero-street/index.html` (+ small modules): loads three-lite, the hero, a cel-shaded gradient-ramp material, an outline, a painted face drawn on canvas, a procedural walk and idle cycle on the bones, one painted daylight street (ground, a few buildings, painted sky), a third-person camera like the game's.
- `assets/CREDITS.md` entry with source URL and licence for every external file. `docs/review/spike-hero.md` gets a Results section.
- Out of scope: costumes beyond one simple draped garment, hair beyond one hair shape, combat poses, integration into the game, Blender work.

## Acceptance criteria (each must be measured and written in Results with the number)
1. Licence: the licence file of every source asset is quoted; all are CC0 or equivalent. FAIL if any is unclear.
2. Size: hero.glb <= 80 KB gzipped. Prototype page + new JS <= 60 KB gzipped, excluding three-lite.
3. Geometry: hero <= 5,000 triangles, <= 30 bones, <= 4 draw calls for the hero including outline and face. Scene total <= 150 draw calls and <= 150,000 triangles (read from renderer.info).
4. Proportions (measured from the mesh in code): total height about 7 to 7.5 head heights, shoulder width 1.8 to 2.3 head widths, leg length 0.45 to 0.52 of height.
5. Animation: walk and idle play via bones with no popping; no mesh tearing at elbows and knees in screenshots at 4 phases of the walk cycle.
6. Frame time: report average and 95th percentile frame ms over 20 s in headless Chrome (software GL, so a lower bound on speed only) with 1 hero and with 12 heroes instanced or cloned. Also ship `perf.html` compatibility so the CEO can run the same page on a phone.
7. Visual: screenshots at 360x740 and 1280x800, front, side, back and 3/4 views, with the current box hero from the game shown beside it in the same lighting for comparison. Honest verdict on whether it is clearly better, and on the uncanny risk (realistic body with large anime eyes).
8. Harness: `node tools/check-budget.mjs` and `node src/test/run.mjs` still pass; add `src/test/hero-spike.mjs` checking the asset's triangle, bone and proportion numbers; do not edit src/ game files; do not touch the uncommitted src/gfx/ or src/vendor/three-lite.js (if the bundle lacks an export you need, say so and list it).

## Decision rule
GO: criteria 1 to 5 pass and the person-visible verdict is clearly better and not uncanny. NO-GO or CHANGE: any of 1 to 3 fail, or the verdict is poor; then list what to change.

## Results (builder: developer, 2026-11-22)
Run: `node tools/build-hero.mjs` (meshoptimizer 1.3.0 in /tmp/hero-tools), page at `prototypes/hero-street/index.html`, screenshots in `prototypes/hero-street/shots/` (driver: `prototypes/hero-street/shoot.mjs`), checks in `src/test/hero-spike.mjs` (9 checks, all ok). `./tools/verify.sh`: unit 132/132, server 12/12, budget passed (assets 4 files, 59 KB gzipped), browser smoke passed, ALL CHECKS PASSED.

**Source check.** All five GitHub raw files matched the advisor's description: base.obj 19,158 vertices and says "explicitly released as CC0 in september 2020"; default.mhskel (163 bones) and default_weights.mhw both say `"license": "CC0"`; LICENSE.md section C grants base mesh, rigs and weights under CC0 1.0; LICENSE.ASSETS.md is the CC0 1.0 legal text. Hashes pinned in `assets/characters/hero.sources.json`; the build stops if upstream changes.

| # | Criterion | Result | Proved by |
|---|---|---|---|
| 1 | Licence | PASS. Both licence files copied to assets/characters/, quoted above, every file has a CREDITS line with URL and CC0 | test 1 and 2 |
| 2 | Size | hero.glb 104,192 bytes raw, **55,725 bytes gzipped** (limit 80 KB). Page plus new JS **about 18 KB gzipped** (limit 60 KB; shoot.mjs not counted) | test 3 |
| 3 | Geometry | **4,246 triangles** (body 3,330 + dhoti 420 + hair 280 + face patch 216), **22 bones**, **3 draw calls** (body, outline, face). Scene totals from renderer.info: 1 hero 35 draws peak, 12,080 triangles; 12 heroes 69 draws peak, 103,150 triangles. Both under 150 and 150,000 | test 4, 5, perf run |
| 4 | Proportions (from the mesh, body shell without hair) | height 1.666 m, **7.13 heads**, shoulders **1.92 head widths** (joint to joint; outer shoulder-bone edge gives 1.81), legs (crotch height) **0.465** of height | test 6 |
| 5 | Animation | Walk loops exactly, largest joint step 0.12 rad per frame or less, idle and blend smooth. CPU skinning at 4 walk phases: worst stretch of any body edge of 1 cm or more is **1.74x** (limit 1.75, little margin); the dhoti stretches up to 3.6x between the legs at the hem (60 of 11,910 edges). Screenshots at phases 0, 0.25, 0.5, 0.75 (shots/phase-*-390x844.png): no tearing at elbows or knees | test 7, 8, 9 and screenshots |
| 6 | Frame time, headless Chrome, software GL (SwiftShader), 390x844, pixel ratio 1, 20 s | 1 hero: average **97.0 ms**, p95 **149.9 ms** (10.3 fps). 12 cloned heroes: average **205.9 ms**, p95 **333.2 ms** (4.9 fps). JS update plus render, 1 hero 1.2 ms average / 2.5 ms p95; 12 heroes 2.3 / 6.1 ms. Software GL is a lower bound for speed and says nothing about a phone's GPU; only the draw, triangle and JS numbers carry over. The page has its own "Run 20 second performance test" button, same text format as perf.html, plus `?perf=1&heroes=12` | shoot.mjs perf |
| 7 | Visual | See verdict. 360x740 and 1280x800 for front, side, back and three-quarter, with the box hero beside at the same lighting; plus game camera, crowd of 12, and the controls at 360 | shots/ |
| 8 | Harness | check-budget and run.mjs pass; one import line added to run.mjs; no src/ game file, src/gfx or three-lite touched. Nothing missing from the three-lite bundle (GLTFLoader, cloneSkinned, MeshToonMaterial, InstancedMesh, CanvasTexture, DataTexture were enough) | verify.sh |

**Verdict: GO on criteria 1 to 5 (all pass); visual: clearly better than the box hero, and only mildly uncanny.**
- Clearly better: real proportions, shoulders, a draped dhoti, a readable stride with knee and arm swing, and a face that reads as a person. Next to it the box hero looks like a toy; in the game camera the new hero still reads at 360 px.
- Uncanny risk: moderate, not severe. The head is realistic with eyes about 15 to 20 percent larger than life and a small painted mouth. At game distance it reads as stylised; in close-ups (view with dist=34) the faceted nose and jaw plus the large eyes look slightly off. It is nowhere near the target's anime look yet: this is "smooth realistic person with cel shading", not painted anime.
- Honest flaws: toes are spiky at close range; the hair is a helmet-like cap; hands are mitten-like; the top is painted on the body (no geometry); the dhoti stretches between the legs at the hem; the skin tone is flat. These are art problems for the commissioned artist, not blockers.
- Not fixable by code in the spike: the decimated face is jagged, so the painted features sit on a coarse head. A commissioned retopology should spend 1,500 or more triangles on the head.

**How it was built (so it can be repeated).** MakeHuman's 163 bones folded onto 22 (fingers into the hand, face into the head, twist bones into their parent, toes into one). Body, MakeHuman's own skirt helper cut at the knee (the dhoti) and a hair cap lifted from the skull, merged into one skinned mesh and reduced with meshoptimizer in two passes (head budget separate from body). Colour comes from a 4x2 palette texture picked by vertex uv, so looks are palette swaps (3 shipped). The face is a 9x12 patch draped on the reduced head with a canvas-painted face and a blink. Outline is an inverted hull in a patched MeshBasicMaterial on the same skeleton, thinner over the face.

**Not tested.** Any real phone or GPU; frame time on a device; screen reader on the page (buttons have names, aria-pressed and 44 px height, checked by eye, not by the smoke audit); reduced-motion beyond starting paused; the game camera boom clips into a roof at one corner (the spike has no camera collision); blind A/B vote by the CEO; Safari and Firefox; a perf run with outline off. The headless screenshots were taken at device pixel ratio 2.

**Changes to make before commissioning art.** (1) Spend 1,500+ triangles on the head and hands, 25 bones with twist bones at the forearms. (2) Paint the face into an atlas texture on the head, not a patch. (3) Real hair meshes and footwear. (4) Tailor the dhoti with its own weights so it does not stretch between the legs. (5) Walk and idle as authored clips instead of procedural. (6) Decide the eye size on the concept sheet first.
