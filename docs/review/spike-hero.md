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
