# Modern-look plan: a current-generation third-person look in a phone browser
Date 2026-11-22. Author: principal engineer. Status: review and plan only. No code changed, nothing run on a phone.
Read first: CLAUDE.md, docs/harness.md, docs/review/graphics-advisor.md, docs/review/spike-hero.md (with Results), tools/check-budget.mjs, src/renderer3d.js, plus (read only) src/gfx/sky.js and the export list of src/vendor/three-lite.js, because the graphics developer is already moving this way.

Basis codes used for every number below: **M** = measured by me in this repo or from a downloaded package, **D** = documented by a page I fetched (URL given), **E** = estimated by me, with the derivation shown. No GPU time in this document is M. Treat every E as plus or minus a factor of 2 until section 6 is done on a real phone.

## 0. Verdict and what it replaces
- The CEO's target (a modern-day game look) is reachable in a phone browser to a high level **if we spend the frame budget where the eye is, and stop spending it where phones cannot afford it.** The eye pays for: light and colour grade (almost free), sky and fog (cheap), materials with real detail and baked ambient occlusion (cheap), characters that are authored, not primitives (art cost, not GPU cost), one good shadow (moderate). The eye does not pay enough for what phones cannot afford: screen-space AO, full-resolution bloom chains, screen-space god rays, depth of field. Those are desktop and flagship extras.
- **This replaces the advisor's "everything toon, no PBR, no tone mapping" (graphics-advisor.md, Verdict) and decision 10's anime direction.** The advisor's cost findings stand: no primitive people, skinned authored meshes, draw-call budgets, MakeHuman CC0 base, the spike gate. Only the shading language changes, from cel shading to physically based materials with a filmic grade. Toon ramps and the inverted-hull outline are kept only for an optional "interactable highlight" rim and for accessibility modes, not as the character look. The spike hero (cel ramp plus outline) needs a PBR-lite re-skin, not a rebuild.
- Suggested text for docs/decisions.md (TPO to log; I did not edit it): "19. Look: modern semi-realistic (stylised realism). Physically based materials, filmic tone map and grade, procedural sky lighting, baked ambient occlusion, one tuned shadow map, three quality tiers with a 30 fps floor. Supersedes decision 10 and the toon verdict in graphics-advisor.md. Cel shading stays only for highlights."
- The graphics developer's work in progress already points here (src/gfx/sky.js: generated sky baked into a PMREM environment, grade values per era; three-lite now exports Sky, GTAOPass, NeutralToneMapping, FXAAPass, BokehPass, SpotLight). I agree with the direction and give corrections in section 2: bake the sky instead of drawing the analytic shader every frame, and do not ship GTAOPass or BokehPass on phones.

## 1. Art direction (one page)
**Name: "Lived-in stone and light."** Semi-realistic, grounded, warm, a little painterly. Real proportions (7 to 7.5 heads, already met by the spike: 7.13), believable cloth, stone, wood, brass and skin, and light that tells the story of the hour. Not photoreal: we simplify surfaces and push colour and value structure so that it reads on a 6-inch screen in sunlight.

**Rules of the look**
1. **Value first.** Every frame has a clear dark, mid and light mass; the hero is the highest local contrast. Rim light (a cool or warm back light) separates the hero from the background in every mood.
2. **Atmosphere gives depth.** Three layers (near, mid, far), each lighter, hazier and less saturated than the one before. Fog colour comes from the sky, not grey.
3. **One accent per scene.** A dominant palette per location, one accent colour that leads the eye to the objective (marigold, sindoor red, peacock teal, lapis). Meaning is never colour alone (CLAUDE.md, WCAG): the objective also has shape, motion and an icon.
4. **Material honesty.** Lime plaster, sandstone, basalt, terracotta, teak, brass and copper, cotton and silk, each with its own roughness range and wear: dust at wall bases, dampness at river steps, soot above lamps.
5. **Dense where the player walks, quiet elsewhere.** Prop clutter, banners, awnings, pots and carts along the path and at set pieces; calm backdrop buildings. This is where polygons and texture go.
6. **Weight in motion.** Foot planting, weight shift, cloth and hair secondary motion, restrained camera shake (off with reduced motion).
7. **Quiet UI.** Glass HUD, small, high contrast, kept out of the centre third (decision 8 keeps the identity).

**What we copy in spirit from current third-person action-adventure games (ideas, never assets):** over-the-shoulder camera with a slight low angle; a key light, fill and rim treatment on the hero; strong time-of-day colour scripts; layered haze and shafts of light through dust; dense hero-path set dressing; wet and dry material variation; footstep dust and ambient particles that show the wind. **What we never copy:** any game's name, characters, costumes, map layouts, logos, UI layouts or textures (CLAUDE.md). Concept sheets are drawn from our own research, with no game screenshots in the pipeline.

**Indian history and mythology palette and architecture** (each item tagged per CLAUDE.md; none re-verified by a scholar here, so the existing "needs review" stands):
- Natural-pigment palette: lime-wash ochre, red and buff sandstone, black basalt, terracotta, teak brown, marigold, sindoor, indigo, turmeric, peacock teal, brass and copper. Textiles: our own block-print, ikat and bandhani-like patterns, drawn originally.
- Hastinapur (Dvapara Yuga): the epic city is **Tradition (Legend)**. The archaeology of Hastinapur Period II is **History (c. 1100 to 800 BCE, Lal; decisions.md item 4)** and is mud-brick and painted-ware culture, not cream palaces. The cream-and-gold palace city on screen is therefore **Invented**, a mythic imagining, and the game says so on the era card. Epic figures stay off screen (decision 1).
- Pataliputra (Mauryan): a timber palisade city on a river is **History (c. 4th to 3rd century BCE; traditional description plus excavated wooden structures, to be confirmed by the scholarly review)**. Monsoon light, wet stone, timber and thatch are the look.
- Sacred buildings and symbols: shown with respect, never the site of violence or comedy; no deity depictions (decision 1).

**Lighting moods per time of day.** Values are starting points for the grade and light rig. Colour temperatures use the common Kelvin-to-sRGB approximation (2000 K about #FF8912, 3000 K #FFB46B, 4000 K #FFD1A3, 5000 K #FFE4CE, 6500 K #FFF9FD, 10000 K #C9E2FF; E, from memory of a standard approximation, not fetched). Exposure in stops relative to midday.

| Mood | Sun elevation | Key colour | Sky (zenith to horizon) | Ambient | Fog (colour, density) | Shadows | Exposure | Grade | Used for |
|---|---|---|---|---|---|---|---|---|---|
| Pre-dawn blue hour | -4 to 0 deg (no sun) | cool sky 9000 K as key at low strength | indigo #1b2a4f to rose #c98a8a | cool, 1.0 | blue-violet, medium | none or very soft | +1.0 | shadows teal-indigo, highlights lifted warm only at lamps | stealth openings, quiet beats |
| Sunrise, golden morning | 8 to 15 | 3200 K | pale blue #8fb3d9 to amber #f2b36b | warm-cool balance 0.9 | peach #e8c3a0, medium | long, soft | +0.3 | saturation 1.08, warm highlights | arrival, hope |
| Midday | 55 to 70 | 5500 K | strong blue to pale haze | cool, 1.1 | pale blue-white, low | short, hard | 0 | contrast +6%, saturation 1.0 | markets, chases (high readability) |
| Golden hour | 5 to 12 | 2800 to 3200 K | blue #6f8fc0 to orange #f09a55 | warm, 0.8 | amber #e0b896 (matches sky.js), medium-high | long, medium soft | -0.2 | saturation 1.1, split-tone teal shadows | drama, set pieces |
| Dusk, lapis twilight | -2 to 3 | 5000 K sun gone, sky as key | lapis #2b3f7a to marigold glow #e8934a | cool, 0.9 | lapis, medium | very soft | +0.6 | lamps as warm accents, shadows deep blue | the current look of decision 8 |
| Night | moon at 30 to 50 | 8000 K moon, low | near-black blue to teal | cool, 0.5 | dark blue, low-medium | soft moon shadow | +1.5 | lamps, windows and torches carry the colour; guarded black floor | stealth, escape |
| Monsoon overcast | diffuse 30 | 6500 K, soft | pewter #8b9aa3 to pale #bcc7c9 | high, 1.2 | grey-green #a9b4b4, high | none, contact AO only | +0.3 | saturation 1.05, wet ground specular up | Pataliputra |

**Colour grading (one pipeline for all moods).** Tone map with Khronos PBR Neutral as the base (it preserves hue and saturation, which matters for marigold and sindoor; ACES shifts saturated oranges toward yellow and desaturates them; AgX desaturates highlights). Then a data-driven grade in the same shader: lift/gamma/gain, saturation, contrast pivot, split-tone (shadow tint, highlight tint), vignette 8 to 12 percent, 1-bit dither to avoid banding in gradients. Per-mood values live in data (section 2, "Lighting preset data"), not in code. Neutral is already compiled into three-lite (M: `vec3 NeutralToneMapping` present in src/vendor/three-lite.js).

## 2. Render pipeline for WebGL2 on mobile

### 2.1 The principle
Phones use tile-based GPUs. Anything that writes the scene to a texture and reads it back pushes data out to main memory and back, which is the expensive part (D: Arm, "Post processing effects on mobile": extra passes that read earlier results move data to DRAM and back; <https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-on-mobile-optimization-and-alternatives>). So the pipeline is **single-pass forward rendering straight to the canvas**, with tone mapping, grade, vignette, dither and fog done inside the material shaders. Extra full-screen passes exist only on the High tier. Anchors I could document (D, Arm GDC18, <https://community.arm.com/developer/tools-software/graphics/b/blog/posts/post-processing-effects-for-mobile-at-gdc18>): a multiple-render-target bloom took 3 ms on the phone they tested; a camera-facing plane overlay got almost the same look in 1 ms or less; RGB24 render targets effectively doubled bandwidth; dropping terrain from 1080p to 720p cut 55 percent of the pixels and render time from 10 ms to 5 ms. Arm also states that 4x MSAA can be low cost on Mali because samples stay on chip (D, <https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/console-quality-game-rendering-on-mobile>); sustained power budget is about 3 to 6 W, so phones throttle (D, Arm Vulkanised 2025 deck, <https://www.vulkan.org/user/pages/09.events/vulkanised-2025/T18-Pete-Harris-Arm-MobileBestPractices.pdf>).

### 2.2 Stage by stage
Reference GPUs: **Mid** = Adreno 610 to 619 and Mali-G52 to G57 class at 1.2 MP (about a 2020 to 2023 mid or entry phone, common in our likely audience). **Flagship** = Adreno 7xx and later, Apple A16 and later, at 2.0 MP. Costs are GPU milliseconds per frame unless marked CPU.

| # | Stage | Choice | Mid ms | Flagship ms | Basis and derivation |
|---|---|---|---|---|---|
| 1 | Materials (PBR) | `MeshStandardMaterial` only (no Physical: clearcoat, sheen and transmission add passes and branches). Packed maps: albedo, normal, and one ORM texture (occlusion, roughness, metal) = 3 fetches. Shared atlases per era so draw calls collapse. Skin: wrap diffuse plus a warm terminator injected with `onBeforeCompile` (fake subsurface). Cloth: high roughness plus fresnel rim. Foliage: alpha-to-coverage with MSAA, no sorted blending. Eyes: separate glossy mesh with env reflection | 8 to 12 (whole opaque pass, 150 draws, about 100k triangles, overdraw about 2.5) | 2.5 to 4 | E: 1.2 MP x 2.5 overdraw = 3 M shaded fragments; a PBR-lite fragment is about 80 to 120 ALU ops plus 4 to 6 fetches; plus vertex work. Largest single line item, so it is where we cut (resolution scale) first |
| 2 | Image-based light | Procedural sky baked once to a small PMREM (64 to 128 px faces) at mission load. Diffuse ambient from 9 spherical-harmonic coefficients (cheap ALU, lerp-able across the day), specular from the cube only for metal, water, wet ground and eyes. Needs `LightProbe` and `SphericalHarmonics3` added to three-lite (small, E: about 1 KB gzip) | 0.5 to 1.0 | 0.15 | E: one cube fetch per fragment for specular, SH is ALU only. Bake: E 10 to 40 ms once at load, behind the loading card |
| 3 | Sky | Do not run the analytic Sky shader over the whole dome every frame. Bake it into a cube or equirect texture when the mood changes, draw a textured dome (1 draw) plus 2 to 4 cloud cards and a sun disc sprite | 0.2 to 0.4 | 0.1 | E. Corrects src/gfx/sky.js, which draws THREE.Sky live as the background; the analytic shader costs full ALU on every sky pixel |
| 4 | Shadows | Low: none, a blob contact shadow batch (1 draw). Medium: **one tuned 1024 map**, hero-centred, 40 m wide (3.9 cm per texel, E: 40 / 1024), texel-snapped to stop shimmer, hardware 2x2 PCF (M: `sampler2DShadow` is in three-lite), fade at 30 to 40 m, slope-scaled bias plus normal bias. Casters limited to the hero, NPCs within 25 m, and big props; a static baked shadow for the city. High: two cascades, 1536 near over 24 m (1.6 cm) and 1024 far over 100 m (9.8 cm); desktop adds a third. I rejected a full CSM everywhere: each cascade re-draws casters, so draw cost multiplies | Medium 1.2 to 2.0, High 2.5 to 3.5 | 0.4 to 0.7 and 0.8 to 1.3 | E: depth-only pass of about 40 draws and 30k triangles at 1024 x 1024; the cost is mostly vertex and submission, not fill. CPU for the extra draws: about 0.5 to 1 ms (E) |
| 5 | Static shadow and ambient occlusion bake | The city is a known grid with a fixed sun per mission. At load, render static casters once into a 2048 depth map and bake ground and wall AO from the tile occupancy grid into a canvas texture (distance to solid tiles). Receivers sample one extra texture. Characters use blob contact shadows plus AO painted into their vertex colours or atlas | 0.2 to 0.4 | 0.1 | E. Bake cost E 10 to 30 ms once. Needs custom shader injection (about 2 to 3 developer days, E). Fallback: skip the static map and use the single tuned map only |
| 6 | Screen-space AO | **Not on phones.** `GTAOPass` renders the scene a second time with an override normal material (M: `_renderOverride(... normalMaterial ...)` in three 0.187.0 GTAOPass.js), which doubles draw calls, then adds depth-aware blur passes. Desktop High only, half resolution | Mid 6 to 10 plus draws x2 (do not ship) | 1.5 to 2.5 | E from the pass structure (normal pre-pass, AO pass, blur pass). Baked AO (row 5) gives most of the visible benefit |
| 7 | Bloom | Low and Medium: no render-to-texture bloom. Use additive halo sprites on emissive lights and windows (D: plane overlay about 1 ms or less in the Arm case study) and emissive-boosted textures. High: custom 3-mip dual-filter bloom, rendering into half-float targets needs `EXT_color_buffer_float` (M survey: 99.89 percent Android, 100 percent iOS, so it is safe to require on High), threshold-then-blur-then-composite merged with tone map and grade in one final pass. `UnrealBloomPass` as shipped uses 5 mips with separate horizontal and vertical blurs at half resolution in half float (M: UnrealBloomPass.js, nMips = 5, kernels 6 to 22), so it is the expensive choice | sprites 0.3 to 0.8; custom 1.8 to 3.0; Unreal 4 to 7 | 0.2; 0.5 to 0.8; 1.0 to 1.5 | D anchor: 3 ms for an MRT bloom on a 2018 phone; the rest E. Scene must also render to an offscreen target (MSAA resolve cost) for the High path, E 1 to 2 ms Mid |
| 8 | Tone map, grade, vignette, dither | In the material shader (no post pass) on Low and Medium; folded into the final composite pass on High. Neutral tone map plus the data-driven grade | 0.1 to 0.3 | 0.05 | E: a few ALU ops per fragment. Caveat: three applies tone mapping inside materials only when rendering to the canvas; with a composer, `OutputPass` does it |
| 9 | Anti-aliasing | `antialias: true` (4x MSAA) on Medium and High; Low uses 2x via lower resolution scale plus alpha-to-coverage on foliage and no MSAA. No FXAA stacked on MSAA. FXAA (already in three-lite) only as a post step where MSAA is unavailable. TAA is out (ghosting, history buffer bandwidth, camera cuts) | 0.3 to 0.8 | 0.1 to 0.3 | D that 4x MSAA is cheap on Mali (Arm, above); numbers E. Dynamic resolution recreates the MSAA buffer; see 3.4 |
| 10 | Fog and haze | Exponential height fog in the material (`onBeforeCompile`), colour from the sky horizon, plus 2 to 3 big soft haze cards at the horizon on High | 0.2 to 0.4 | 0.1 | E |
| 11 | Light shafts | Geometry cards: 2 to 6 additive cone or plane shafts with a gradient and dust-mote scroll, placed by hand at windows, gaps and the sun. **Screen-space radial god rays only on desktop and flagship High**, half resolution, 24 taps | cards 0.3 to 0.6; radial 2.0 to 3.5 (do not ship on Mid) | 0.1; 0.5 to 0.8 | E. Cards cost overdraw, not a render pass |
| 12 | Particles | One instanced quad batch for dust, embers, leaves, rain; cap by tier (Low 120, Medium 400, High 900 live); no soft particles (needs a depth copy); additive for fire and sparks, alpha for dust with small quads | 0.5 to 1.5 | 0.2 to 0.4 | E: overdraw of alpha quads is the cost. Current renderer already uses Points for rain and dust (M: renderer3d.js) |
| 13 | Water and wet ground | Fake planar look: a normal-scrolled glossy plane sampling the sky cube; rain adds ripples with a scrolling normal texture | 0.3 to 0.6 | 0.1 | E |
| 14 | Skinned characters | 30 actors, 22 to 25 bones each (spike: 22, M) | CPU 3 to 5 | CPU 1 to 2 | M on desktop only: 12 heroes JS update plus render 2.3 ms average, 6.1 ms p95, headless Chrome (spike-hero.md, criterion 6). E: phone CPU 3 to 5 times slower than that desktop |
| 15 | Draw submission (CPU) | 150 draws plus shadow draws | CPU 3 to 7 | CPU 1 to 2 | E: WebGL draw-call cost about 20 to 50 microseconds on a phone CPU |
| 16 | Browser compositing and DOM HUD | HUD stays in the DOM at native device pixel ratio | 1 to 2 | under 0.5 | E |

**Frame totals (E).**
- Low tier on Mid at 0.7 MP, 90 draws, no shadows, no particles beyond 120: GPU about 5 to 9 ms. 30 fps with 3x headroom, and a chance of 60.
- Medium tier on Mid at 1.2 MP, 150 draws, one shadow map, sprite bloom: GPU about 12 to 19 ms (rows 1, 2, 3, 4, 5, 7 sprites, 8, 9, 10, 12 at their Mid values). That clears 28 ms with 30 to 60 percent margin, so 30 fps is expected to hold and 60 is not.
- High tier on Flagship at 2.0 MP: GPU about 6 to 10 ms with custom bloom and two cascades; 60 fps expected. CPU (rows 14 to 16) is the risk on Mid phones: 7 to 14 ms of main-thread work in a crowd scene, which is why people count and animation update rate are tier budgets.

### 2.3 Other pipeline rules that decide whether it feels modern
- **Programs and compile hitches.** Shader compile on first use causes hitches. `KHR_parallel_shader_compile` support: iOS 99.04 percent, Windows 90.03, Mac 91.63, **Android 0.37 percent** (M: web3dsurvey, <https://web3dsurvey.com/webgl2/extensions/KHR_parallel_shader_compile>). So on Android we cannot compile in the background. Rule: at most 16 unique programs per mission, all compiled behind the loading card (render one frame of every material combination with `renderer.compile`), no material flags toggled at runtime.
- **Texture size.** MAX_TEXTURE_SIZE is below 8191 on 19 percent of Android reports (M: <https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE>). Our cap is 2048 per map (Low 1024), well inside that.
- **GPU timing is not available on phones.** `EXT_disjoint_timer_query_webgl2` support: Android 0.6 percent, iOS 0.22 percent (M: <https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2>). Every runtime and benchmark decision must use frame intervals or a synchronous read-back, never GPU timers.
- **Lighting preset data.** One JSON per mood (sun azimuth and elevation, key colour and intensity, sky parameters, SH or env keyframe id, fog colour, density and height falloff, exposure, grade values, lamp intensity). A mission names a preset and an optional timeline of up to 3 keyframes (cross-fade of uniforms only; the environment cube swaps at keyframe boundaries under a short exposure dip, so no per-frame PMREM rebuild). This fits CLAUDE.md "missions are data plus script modules".
- **Unit scale.** The spike uses metres (hero 1.666 m); src/renderer3d.js uses world units where a person's legs pivot at 30 units. Pick one scale before tuning shadow, fog and camera constants (recommend 1 unit = 1 m).
- **Context attributes.** `alpha: false`, `stencil: false`, `preserveDrawingBuffer: false`, `antialias` per tier, `powerPreference: 'high-performance'` (no effect on most phones, harmless). `alpha: false` avoids blending the canvas with the page (E).
- **Reduced motion and WCAG.** With reduce motion: no camera shake, static light shafts, no particle drift, no flicker on lamps. A "Clarity" setting raises minimum contrast of key actors and objectives in dark moods (the look gate in section 5 measures it).

### 2.4 Bundle and licence impact (three-lite)
Current: three-lite is **184,166 bytes gzipped (M, gzip -c, 2026-11-22 04:19)**, up from 171,349 earlier today. Its exports already contain Sky, GTAOPass, BokehPass, FXAAPass, NeutralToneMapping, SpotLight, PMREMGenerator, EffectComposer, UnrealBloomPass, GLTFLoader, SkinnedMesh and InstancedMesh (M: export list). They do **not** contain `KTX2Loader`, `MeshoptDecoder`, `DRACOLoader`, `LightProbe`, `SphericalHarmonics3`, a CSM helper, VSM shadows or SMAA (M: export list). All three.js code is MIT (M: LICENSE in three 0.187.0, "The MIT License, Copyright 2010-2026 three.js authors").

## 3. Quality tiers, detection and the 30 fps floor

### 3.1 Exact budgets
Pixel budgets are in render pixels (CSS width x CSS height x scale squared), because device pixel ratio alone is a bad proxy: a 360 x 800 CSS phone at ratio 3 is 2.59 MP (M, arithmetic). Equivalent effective ratios for that phone: Low 0.70 MP gives ratio 1.56 (561 x 1247), Medium 1.20 MP gives 2.04 (735 x 1633), High 2.00 MP gives 2.63 (949 x 2108). The HUD is DOM and always crisp at native ratio.

| Budget | Low | Medium | High |
|---|---|---|---|
| Target device class | 2 to 3 GB RAM, Adreno 5xx to 610, Mali-G52 and older | 4 to 6 GB, Adreno 610 to 650, Mali-G57 to G77, A12 to A14 | 6 GB and up, Adreno 7xx, Apple A15 and later, desktops |
| Draw calls, main pass (renderer.info.render.calls) | 90 | 150 (the advisor's budget) | 220 |
| Extra draws in shadow pass | 0 | 40 | 80 |
| Triangles, main pass | 70,000 | 150,000 | 300,000 |
| Triangles, shadow pass | 0 | 40,000 | 80,000 |
| Skinned actors, full rig / crowd | 12 / 0 | 20 / 12 | 30 / 30 |
| Bones per actor | 22 | 25 | 25 |
| Unique programs | 10 | 14 | 16 |
| Texture memory (decoded GPU bytes, with mips) | 32 MB | 96 MB | 192 MB |
| Largest texture | 1024 | 2048 | 2048 (hero 2048) |
| Render pixels, max / min (dynamic) | 0.70 MP / 0.35 MP | 1.20 MP / 0.60 MP | 2.00 MP phones, 4.0 MP desktop / 1.00 MP |
| Shadows | none; 1 batched blob draw | 1 map, 1024, 40 m, hardware PCF | 2 cascades 1536 over 24 m and 1024 over 100 m; desktop adds a 3rd at 2048 |
| AO | baked only | baked only | baked, plus half-resolution GTAO on desktop |
| Post | none | none (sprite halos) | custom 3-mip bloom, fused grade; desktop radial rays |
| Particles live | 120 | 400 | 900 |
| MSAA | off | 4x | 4x |
| Anisotropy | 1 | 4 | 8 |
| Frame target | 30 fps | 30 fps, 60 when it fits | 60 |

Texture arithmetic (M, exact): 1024 x 1024 RGBA8 with mips is 5.33 MiB decoded, so Low (32 MB) is about 6 such maps and Medium (96 MB) about 17. ASTC blocks are 128 bits each (spec; not fetched here): 4x4 is 8 bits per pixel and 6x6 is 3.56, so a 1024 map is about 1.33 MiB or 0.6 MiB, 4 to 9 times smaller than decoded RGBA8. ASTC availability on phones is 99.79 percent Android and 99.93 percent iOS (M: <https://web3dsurvey.com/webgl2/extensions/WEBGL_compressed_texture_astc>), which is why KTX2 matters later (section 4). Texture memory caps are E: they are what I believe keeps a 2 to 3 GB phone's browser tab alive; confirm on the Low device.

Shadow texel sizes: Medium 40 m / 1024 = 3.9 cm; High near 24 m / 1536 = 1.6 cm; far 100 m / 1024 = 9.8 cm (M, arithmetic).

### 3.2 Automatic detection (a short GPU benchmark plus device hints)
1. **Hints, free and instant** (decide the starting tier and what to skip): `devicePixelRatio`, `screen` size, `navigator.hardwareConcurrency`, `navigator.deviceMemory` (Chromium only, rounded and capped; absent on Safari and Firefox, so absence is not a low score; MDN page was not readable from here, so this is from memory, E), `WEBGL_debug_renderer_info` string (Safari and Firefox may mask it; use only as a deny-list: Mali-4xx, Mali-T, Adreno 3xx and 4xx, PowerVR SGX, SwiftShader or llvmpipe go straight to Low or 2D), `MAX_TEXTURE_SIZE` under 8192 (weak old-GPU signal, M survey), `prefers-reduced-motion` and `Save-Data` (reduce particles and bloom). The existing `pickQuality` in src/gfx/quality.js is a good base; its probe limit of 1/26 s (about 26 fps) must change to match the 30 fps floor below.
2. **The benchmark (about 700 ms, behind the existing loading card, once per device and app version).** Render a fixed synthetic scene, not the game: a full-screen PBR-lite fragment shader with 3 layers of overdraw at 0.5 MP, then a 100k-triangle vertex-heavy mesh. Run a **ladder**: 1x, 2x, 4x workload steps. After each step force completion with a 1 x 1 `gl.readPixels` and time it with `performance.now()` over 8 repeated draws per sample (so the sample is well above timer coarsening; Chrome and Safari coarsen timers). The tier comes from the highest step whose median time stays below 8 ms (Low), 14 ms (Medium) or 6 ms with a faster step (High). This does not depend on vsync quantisation, which is the flaw of a plain rAF probe.
3. **Safety margin.** A cold phone is faster than a hot one (thermal throttling, D above). Choose the tier one step down from the benchmark result if the hints show a thin device (memory 3 GB or less, or battery saver), and rely on the governor (3.4) for the rest.
4. **Persist and override.** Cache the result with a version in localStorage (validated on read, like the save). Settings gets "Graphics: Auto, Low, Medium, High" and "Frame rate: Auto or 30". `?q=` stays for testing.

### 3.3 Frame pacing
Fixed-timestep simulation with interpolated rendering so a steady 30 fps feels smooth. If the governor cannot reach 60, lock presentation to every second vsync rather than letting frames wander between 40 and 50 (a stable 30 reads better than an unstable 45). Pause rendering when the tab is hidden. Cap the simulation step so a long frame cannot teleport actors.

### 3.4 Dynamic resolution rules (numbers are the rule, tune on a phone)
- Metric: rAF interval over a sliding 60-frame window; ignore frames over 100 ms (pauses) and the first 20 after any change.
- **Down:** if p95 > 40 ms, or median > 33 ms, step the render scale down one rung. Rungs of the pixel budget: 1.00, 0.85, 0.72, 0.61, 0.52 (so the minimum is about half the pixels, matching the tier minimums above). At most one down-step per 3 s. Emergency: p95 > 50 ms over 20 frames means two rungs immediately.
- **Up:** only if median <= 18 ms and p95 <= 22 ms for 6 s and at least 10 s have passed since any change. If an up-step is followed by a down-step within 10 s, set the ceiling to the lower rung for the rest of the mission and store it for this device.
- **Resizing the canvas reallocates the drawing buffer and the MSAA buffer and can hitch by tens of milliseconds (E).** So steps are discrete, rate-limited as above, and never per frame. An alternative that avoids reallocation (a fixed render target with a viewport sub-rectangle) requires the offscreen path, so it is High-tier only.
- **Ladder after the lowest rung is reached** (each in order, each undone only after the next mission starts): halve particle count, halve shadow distance and drop to 512, disable shadows, cut crowd to half and the actor update rate to 30 Hz, drop one tier and rebuild, and at Low-min offer the 2D renderer.
- Upscale softness is the honest price: below about 0.6 of native the 3D view will look soft; the DOM HUD stays sharp.

### 3.5 The 30 fps guarantee, stated precisely
We cannot promise 30 fps on every phone ever made. What we promise, and can test: **on every device the benchmark classes as Low or above, the governor holds p95 frame interval at or below 40 ms and the median at or below 33.3 ms after a 10 s warm-up, at the tier's minimum pixel budget; on any device below that, the game offers the existing 2D renderer automatically with a visible, keyboard-reachable switch.** Tests: a unit test of the governor with recorded frame traces (pure code, runs in verify.sh), the smoke test reading `renderer.info` against the tier budgets, and the real-phone runs in section 6. The guarantee is **not proven** until section 6 has numbers.

## 4. Asset strategy

### 4.1 Procedural, or sourced, or commissioned
| Area | Approach | Why |
|---|---|---|
| Sky, clouds, sun, moon, stars, haze | Procedural (THREE.Sky baked to a cube; cloud cards painted in canvas with noise) | Zero download, one source of truth for lighting |
| Ground, terrain, roads, river banks | Procedural: noise plus splat, detail normals made at load from height | Cheap, tileable, era-switchable |
| Walls, plaster, brick, stone, timber, thatch | Procedural tileables first (canvas noise to albedo, roughness and a height-derived normal at load). Replace hero-path surfaces with CC0 scans on the CEO's machine when available | Procedural gets about 70 percent of the way (advisor's estimate, agreed); scans add the last 30 |
| Architecture kit (arches, domes, jharokha, chhatri, pillars, steps, ghats, jaali screens, carved lintels) | Code-generated modules (lathe, extrude, instancing) with a shared atlas; AO baked per piece at build | Ties to src/gfx/city.js. An environment artist later replaces the best 10 hero pieces |
| Trees, grass, shrubs | Procedural leaf cards and a generator (an MIT option on npm is `@dgreenheck/ez-tree`; its bundled texture licences are not verified, so use only its code) | |
| Props (pots, baskets, carts, lamps, banners, cloth) | Procedural lathe and extrusions; cloth waves in the vertex shader | |
| Decals (rangoli, dust, soot, moss, water stain) | Procedural canvas decals | |
| Lightmaps, AO, shadow bake | Procedural at load (section 2.2 row 5) | |
| People | **Authored.** MakeHuman CC0 base (spike, licence verified) is the route, but the final hero and crowd need a character artist (4.4) | Primitives cap at "mannequin" (advisor). Spike verdict: clearly better, mildly uncanny, art problems left for an artist |
| Animation | Procedural pose layer now (existing), authored clips later; IK foot planting in code | No verified CC0 clip source reachable (below) |
| Audio | Out of scope here | |

### 4.2 CC0 and permissive sources: what I could verify from this sandbox
Reachability test (M, curl through the sandbox proxy): polyhaven.com, dl.polyhaven.org, api.polyhaven.com, ambientcg.com, assets.ambientcg.com, kenney.nl, quaternius.com, opengameart.org, sketchfab.com, unpkg.com, cdn.jsdelivr.net, esm.sh, gitlab.com, huggingface.co, archive.org and zenodo.org are all blocked (000 or 403). Reachable: raw.githubusercontent.com, the GitHub search API, and the npm registry. WebFetch of polyhaven.com/license and kenney.nl/support was refused by the permission layer, so **those two licence pages were not read**.

| Source | Reach | Licence evidence (fetched) | Verdict |
|---|---|---|---|
| MakeHuman base mesh, rigs, weights, clothes | GitHub raw | LICENSE.md section C and LICENSE.ASSETS.md (CC0 1.0 legal text), checked in the spike and copied to assets/characters/ (spike-hero.md) | Use. Original designs only |
| `@pmndrs/assets` 1.7.0 on npm | npm pack | package.json `"license": "CC0-1.0"`, LICENSE file is the CC0 1.0 legal text (read it). README line 119: HDRIs are Poly Haven originals resized to 512 x 512 EXR, 134 to 417 KB each (M, base64-wrapped JS). 18 HDRIs including dawn, sunrise, sunset, night, sky, forest, park. Textures and models are only logos, matcaps and three sample meshes | Good for IBL reference and for validating our procedural sky; not a texture library. The Poly Haven CC0 claim inside it is second-hand (see next row) |
| Poly Haven | blocked | First-party statement in the Poly Haven API repo README on GitHub raw (`Poly-Haven/Public-API`, branch master): "The assets themselves are CC0 and never require attribution". Also stated by Khronos in glTF-Sample-Assets README ("Poly Haven offers CC0 ... HDRIs, PBR textures, and glTF models") | CC0 evidence is good but from the project's own repo, not its licence page. Download on the CEO's or artist's machine, never through our sandbox. GitHub mirror seen: `minami110/usd-polyhaven` (CC0 repo, USD format, not directly usable). Record the Poly Haven URL for every file in assets/CREDITS.md |
| ambientCG | blocked | Mirrors only: `fabien-michel/sweethome3d-textures-ambientcg` README ("licensed under the Creative Commons CC0 1.0 Universal License"), `VenitStudios/AmbientCG` README ("All ambientCG materials are licensed under Creative Commons CC0 1.0 Universal", links docs.ambientcg.com/license, not read) | Second-hand only. Download from the source on a dev machine and record the URL |
| Kenney | blocked | First-party GitHub repos `KenneyNL/Starter-Kit-3D-Platformer`, `-FPS`, `-City-Builder`: README "Sprites and 3D Models (CC0 licensed)", code LICENSE.md is MIT (read) | CC0 confirmed for the assets in those kits. Style is low-poly toy, wrong for this look; use only for placeholders |
| Quaternius | blocked | GitHub mirrors exist (for example `Malcolmnixon/Quaternius-Modular-Scifi-Pack`, CC0 declared by the mirror), but the author's own licence page is unreachable | **Unverified.** Do not use until the CEO confirms the licence on quaternius.com and records the URL |
| KhronosGroup/glTF-Sample-Assets | GitHub raw | Per-model READMEs read: Fox is CC BY 4.0, DamagedHelmet includes CC BY and **CC BY-NC 4.0**, Sponza includes the Crytek (Cryengine Limited) licence | **Do not use for shipping.** Attribution, non-commercial and custom terms |
| three.js examples models (Xbot, Soldier, Michelle) | npm | Mixamo-derived (advisor) | Rejected |
| three 0.187.0, gltf-transform, meshoptimizer, simplex-noise, three-mesh-bvh, KTX-parse (npm metadata) | npm | MIT (all `npm view` license fields) | Fine as code. `n8ao` is ISC, `postprocessing` is Zlib, both permissive |

Gap: **there is no reachable, licence-verified source of animation clips, photoreal scans or architecture kits from here.** Those come from the CEO's machine (downloaded from the original site, URL and licence recorded) or from a commissioned artist.

Rule for the harness: every asset line in assets/CREDITS.md carries URL, author, and an SPDX id from an allow-list (CC0-1.0, MIT, original-commissioned). tools/check-budget.mjs today only checks that a CREDITS line mentions the file path (M: reading the script), not that the licence is acceptable. Recommend adding the allow-list check.

### 4.3 Compression and whether three-lite can use it
Sizes are measured from the files in the three 0.187.0 npm tarball (M, gzip -9):

| Item | Raw | Gzipped | In three-lite today? | Verdict |
|---|---|---|---|---|
| `MeshoptDecoder` (meshopt_decoder.module.js) | 29.3 KB | **7.7 KB** | No (not exported; GLTFLoader is) | **Add now.** Tiny, fast, works with GLTFLoader for `EXT_meshopt_compression`. Use quantisation plus meshopt via gltf-transform. The spike glb (55.7 KB gz, M) did not use it; expect another 30 to 50 percent saving for the final hero |
| `KTX2Loader` + `ktx-parse` + `zstddec` + `basis_transcoder.js` + `basis_transcoder.wasm` | 9.2 + 5.6 + 17.1 + 15.1 + 245.4 KB gzipped = about **292 KB** (wasm raw 527 KB) | **about 292 KB gz total, lazy** | No | **Add when decoded textures exceed about 30 MB per level.** Gains: 4 to 9 times less GPU memory and faster upload, transcodes to ASTC on phones (99.8 percent) and BC7 on desktop. Cost: one-time 292 KB lazy download, cached; a transcode step at load (E: tens of ms per 1024 map on a mid phone). The advisor said "do not use KTX2 (about 200 KB)" for a procedural-art world; that holds until we ship real PBR sets. Authoring needs `toktx` from KTX-Software on a dev machine, which I did not test here |
| `DRACOLoader` + decoder | 58.8 KB wrapper + 285.7 KB wasm (192.4 KB gltf subset) | 11.7 + 88.2 KB (63.2 KB subset) | No | **Skip.** Meshopt gives similar savings, decodes faster and costs 7.7 KB. Draco only wins on very large single meshes we do not have |
| WebP / JPEG textures | n/a | n/a | Browser-native | **Use now** for atlases at 1024 (Low 512). Decoded to RGBA8 in GPU memory, so memory is the limit, not download |
| `LightProbe`, `SphericalHarmonics3` | n/a | E: about 1 KB | No | Add (section 2.2 row 2) |
| CSM helper (three examples `csm/CSM.js`) | 13.9 KB | 3.8 KB | No | Optional for High; a hand-rolled 2-cascade split is smaller |

First-load budget stays at 900 KB (M, check-budget.mjs: first-load files are 86 KB now). Everything above is lazy after the first frame. Proposed budget lines for check-budget.mjs (not edited by me): lazy 3D bundle (three-lite plus renderer3d plus gfx) at most 320 KB gz without KTX2 and at most 620 KB with it; per-level art folder at most 1.5 MB gz; characters folder at most 1 MB gz; total assets raised from 4 MB to 8 MB.

### 4.4 What a hired artist adds, with the cheapest honest scope
The code can reach about 70 percent of the target on architecture, sky, ground and props (advisor, agreed). It cannot make good faces, hands, cloth fall, hair or hero props. Scope for **one vertical slice** (one era, one hero, a crowd, one street) so the CEO can judge before buying more. Effort is E from my experience of typical freelance scopes, not quotes; day rates are placeholders (E): about USD 150 to 250 per day for experienced freelancers in lower-cost markets, USD 400 to 600 in the US and Europe. Get two quotes.

| Role | Deliverables | Days | Cost range (E) |
|---|---|---|---|
| Art director or concept artist | Palette and light keyframes for the 7 moods above; hero and two crowd turnarounds (original designs, no deities); one street per era; material boards. This becomes our golden target. | 6 to 8 | 0.9k to 2k low-cost, 2.4k to 4.8k high-cost |
| Character artist | Hero retopology from the MakeHuman CC0 base: 12k-triangle source, 4k game mesh, head with 1,500 or more triangles, hands, footwear, hair meshes; 2 outfits; PBR textures; 25-bone rig with twist bones; 3 crowd bodies | 15 to 20 | 2.3k to 5k; 6k to 12k |
| Environment artist | 30-piece architecture kit for one era, trim sheets, one PBR material set of 3 maps per surface (6 surfaces), baked AO, 2 LODs, 10 hero props | 15 to 20 | 2.3k to 5k; 6k to 12k |
| Technical artist | PBR-lite shaders (skin, cloth, foliage, water), the export pipeline (gltf-transform, meshopt, optional KTX2), LOD and atlas scripts, budget validation against section 3 | 8 to 10 | 1.2k to 2.5k; 3.2k to 6k |
| Animator (not in your brief, but the foot-planting gate needs it) | 14 clips: idle, walk, run, crouch, vault, climb, 3 staff strikes, hurt, fall, 2 talk gestures; foot-contact markers | 8 to 12 | 1.2k to 3k; 3.2k to 7.2k |
| **Total, one slice** | | **52 to 70 days (about 10 to 14 weeks of one person, or about 5 to 6 weeks with three people in parallel)** | **about USD 8k to 17k in lower-cost markets, USD 21k to 42k in the US and Europe** |

Each further era: environment reskin and kit extension 10 to 15 days, 2 more outfits 5 days, so about 15 to 20 days (E). Conditions for any contract: work for hire with copyright (or CC0) assigned in writing, original designs only, no deities, source files delivered (the advisor's requirement), budgets of section 3 and the look gate of section 5 written in as acceptance criteria, and a paid first milestone on the hero head and a single wall so we see quality before the rest. Without any hire, we still deliver: lighting, grade, sky, fog, shafts, shadows, materials with procedural detail, the code-built kit, MakeHuman placeholder people and the import path.

## 5. The look gate
Judge every screenshot against this list. "Tool" means a script I recommend adding to tools/ (pixel stats from the PNG: no new dependency beyond what the smoke test already uses to capture). The gate runs on goldens at fixed seed, camera and mood: 360 x 740 and 1280 x 800, moods Dawn, Midday, Golden hour, Dusk, Night, Overcast, with the hero close-up, the street, the crowd and one set piece each. Colour moods are never judged only on a bright desktop screen.

| # | Check | Pass rule | How measured |
|---|---|---|---|
| 1 | Silhouette | Hero outline contrast against the background at least 3:1 luminance (WCAG 1.4.11 non-text) along at least 80 percent of the outline; hero at least 20 percent of viewport height at the game camera (150 px on 740); head at least 20 px tall; a black-fill render of the hero shows the pose (5 of 5 reviewers name the action) | Tool: mask by object id render, compute contrast ring; human check for the pose |
| 2 | Proportions | 7.0 to 7.5 heads total height; shoulder width 1.8 to 2.3 head widths; leg length 0.45 to 0.52 of height; crowd bodies within 6.5 to 7.5 heads | Existing mesh test (src/test/hero-spike.mjs, M: spike reports 7.13, 1.92 and 0.465) extended to every character |
| 3 | Material read | Each of skin, cloth, metal, stone and wood is distinguishable in a 25 percent downscale; every albedo has local luminance standard deviation of at least 6 percent over 64 px (no flat colour); roughness ranges: skin 0.45 to 0.7, cloth 0.8 to 1.0, stone 0.7 to 0.95, metal 0.3 to 0.5 with metalness 1; metals show a highlight at least 1.5 times their diffuse; hero-path surfaces within 8 m have a normal map | Tool on texture files and material table; human squint test |
| 4 | Lighting contrast | Non-night frames: 5th to 95th percentile luminance ratio at least 8:1 (3 stops); key to shadow side on the hero 1.8:1 to 6:1; clipped pixels (255 in any channel, excluding sun disc and emissives) at most 2 percent; crushed pixels (below 8 of 255) at most 5 percent (night: 15 percent); the hero casts a visible shadow (at least 20 percent darker than adjacent lit ground) in moods with a sun | Tool: histogram and masked patches |
| 5 | Depth cues | At least 3 distinguishable layers; a probe patch at 60 m has at least 35 percent less luminance contrast and at least 25 percent less saturation than the same material at 5 m; contact darkening beside walls and under props at least 15 percent within 0.5 m; horizon haze visible | Tool: patch statistics at marked world points |
| 6 | Foot planting and motion | Stance-foot slide at most 3 cm per step in walk and run (world space); no foot below ground by more than 1 cm; contact frames within 50 ms of the animation markers; root speed to stride ratio within 0.9 to 1.1; no popping above 0.12 rad per frame (spike's existing step limit, M) | Unit test on the bone data; screenshots at 4 cycle phases |
| 7 | UI crispness | HUD in the DOM at native device pixel ratio, never inside the scaled 3D canvas; body text at least 16 CSS px; HUD text contrast at least 4.5:1 against both the brightest and darkest scene patch behind it; touch targets at least 44 px (existing smoke audit); 3D render scale at least 0.6 of native on Medium and High in the screenshot test | Existing smoke audit plus a canvas-size versus devicePixelRatio check |
| 8 | Mood palette | Mean hue of sky and ground within 15 degrees of the mood's spec; saturation within 0.8 to 1.15 of spec | Tool on masked regions |
| 9 | No colour-only meaning | Every objective, enemy and checkpoint has a shape, icon or motion cue in addition to colour; reduced-motion frames still readable | Existing CLAUDE.md rule; human check |
| 10 | Human verdict | CEO blind A/B against the previous golden: at least 8 of 10 picks the new one; a 5-person panel scores "uncanny" no higher than 2 of 5 on close-ups (spike: moderate risk) | Blind vote sheet in docs/review/ |

**Performance gates (on the named reference phones, section 6; no gate is passed from desktop headless numbers):**
| Gate | Low | Medium | High |
|---|---|---|---|
| Median frame interval after 10 s warm-up | at most 33.3 ms | at most 33.3 ms | at most 16.7 ms (flagship) |
| p95 frame interval | at most 40 ms | at most 40 ms | at most 22 ms |
| Frames over 100 ms after warm-up, in 5 min | at most 3 | at most 3 | at most 3 |
| Drift, last 60 s versus first 60 s of a 10 min run (thermal) | at most 15 percent worse | at most 15 percent | at most 15 percent |
| renderer.info draws, triangles, programs, texture MB | within section 3.1 | within | within |
| First 3D frame after Start (mid phone, cached) | at most 3 s including benchmark and shader compile | | |
| Lazy 3D bundle and per-level art | within 4.3 budgets | | |
| Governor test: replayed slow trace steps down within 3 s and never oscillates (pure test) | pass | pass | pass |

## 6. Risks, what cannot be proven, and the real-phone plan

### 6.1 Risks, ranked
1. **The gate is red right now because of in-flight work, not because of this document.** `./tools/verify.sh` stops at the unit tests: src/test/hero-spike.mjs line 24 reads `json.meshes[1].primitives[0]` of assets/characters/hero.glb and fails, because hero.glb was replaced at 04:08 (now 146,256 bytes raw, was 104,192). The browser smoke test then reports THREE.RoomEnvironment is not a constructor at src/renderer3d.js:82, because src/vendor/three-lite.js was rebuilt at 04:19 without RoomEnvironment while renderer3d.js still calls it. Owner: graphics developer. Cost of being wrong: nobody can push until both are reconciled.
2. **Every GPU millisecond here is an estimate.** Cost of being wrong: a factor of 2 either way. If Mid is 2x worse than I estimate, Medium needs 0.85 to 0.6 of its pixel budget (the governor does this) and shadows move to High-only; the look survives, sharpness drops. If it is better, we gain headroom at no cost.
3. **Android feature gaps** (M surveys): no parallel shader compile (0.37 percent), no GPU timer queries (0.6 percent), 19 percent report MAX_TEXTURE_SIZE below 8191. Mitigation is in section 2.3.
4. **Art, not engineering, decides the final quality.** Without the section 4.4 hires we reach "good procedural stylised realism" with a visibly weaker human than the environment. Cost of being wrong: the CEO sees a gap between world and people.
5. **Memory on 2 to 3 GB phones.** Tab kill or context loss under pressure (E). The renderer already handles `webglcontextlost` (M: renderer3d.js). Mitigation: texture caps, KTX2 when needed, drop to Low on loss.
6. **Thermal throttling** (D: 3 to 6 W budget). Short tests lie; the 10 minute drift gate covers it.
7. **Dynamic resolution hitches and oscillation** (E). Rules in 3.4.
8. **Benchmark misclassification:** cold device, timer coarsening, background tabs. Mitigation: ladder with synchronous read-back, one-tier margin, governor, persistent ceiling, user override.
9. **Skin and face uncanny** (spike verdict). Decide eye size and face style on the concept sheet first.
10. **Unit scale mismatch** (metres in the spike, local units in renderer3d.js).
11. **Historical and cultural accuracy of visuals:** the cream palace is Invented and must be labelled; scholarly review before launch (decisions 4 and 6).
12. **Licence drift and second-hand CC0 claims** (4.2). Mitigation: SPDX allow-list in check-budget, original-site download only.
13. **Bundle growth:** three-lite went from 171 to 184 KB gz in one day; add lines to check-budget so growth is a decision.
14. **Accessibility in dark and moving scenes:** reduced-motion variants, minimum-contrast Clarity setting, no flashing. Screen reader behaviour of the 3D scene is untested.

### 6.2 What cannot be proven without a real phone
GPU time of any stage; the tier thresholds; whether the benchmark ladder separates Low from Medium devices; thermal drift; memory and tab survival; shader compile time on Android; MSAA and dynamic-resize hitch size; browser differences (Safari on iOS, Firefox on Android, Samsung Internet); high-refresh behaviour (90 and 120 Hz); iOS Low Power Mode frame cap (E, from memory, not verified); the real look of the grade on an OLED panel in sunlight; touch comfort. None of these can be settled in headless Chrome with software GL (spike-hero.md: 97 ms and 206 ms average frames are not phone numbers).

### 6.3 Plan to get real numbers through perf.html
Current perf.html (M, read): loads index.html in an iframe, waits 8 s, samples requestAnimationFrame intervals for 20 s, prints user agent, cores, memory, screen size, GPU string, frame count, average fps, median, p95, worst and the number over 100 ms. It cannot separate GPU from CPU, vary quality, or run long enough for heat. Steps, with an owner for each (all code is for the developer or QA; I changed none):
- **R0, today, no code.** CEO runs the current perf.html on whatever phone he owns and pastes the text. This gives a first real anchor for the Low or Medium tier.
- **R1, look-bench page** (`prototypes/look-bench/`, built by the developer): a deterministic scene (fixed seed, scripted camera path, 150 draws, 100k triangles, one mood) with query switches such as `?stage=shadow:0,bloom:1,ao:0,scale:0.7,particles:400,msaa:4`. It reports, per run, `renderer.info` (calls, triangles, programs, texture MB), JS ms per frame and frame interval p50, p95 and worst, the chosen tier and scale, and a copyable JSON block in the same text style as perf.html.
- **R2, stage cost method that works under vsync.** Browsers lock requestAnimationFrame to the display, so differences below 16.7 ms are invisible. In the bench, render the same frame K times per rAF (K from 4 to 12, enough to exceed 25 ms), end with a 1 x 1 `readPixels`, time it, and divide by K. Stage cost equals (time with stage minus time without) divided by K. This turns every E in section 2.2 into an M. It measures GPU plus submission together, which is what matters.
- **R3, thermal run.** 10 minutes at the Medium budget with the governor on; log the interval p50 and p95 every 30 s; the drift gate in section 5 reads this.
- **R4, device matrix (CEO decides):** at minimum three real phones: one Low (2 to 3 GB, Adreno 610 or Mali-G52 class), one Mid (4 to 6 GB, Adreno 619 to 650 or Mali-G57 to G77 class), one flagship or an iPhone; plus one Apple device because Safari differs. A remote device cloud is an alternative for breadth, but I did not check any service's availability or price. Chrome remote debugging (`chrome://inspect`) and Safari Web Inspector give CPU profiles without native builds; I did not test either here.
- **R5, record.** Paste each run in docs/status.md with device, browser version and date; replace each E in section 2.2 and 3.1 by the measured M; adjust budgets; then, and only then, close the 30 fps guarantee.

### 6.4 First work packages, in order (cheapest look gain first)
1. Lighting presets as data plus grade in the material shader plus Neutral tone map (about 0 ms, biggest visible change).
2. Baked sky cube plus SH ambient plus fog colour from sky (replace the live Sky draw).
3. Baked ground and wall AO from the grid, blob shadows, one tuned shadow map on Medium.
4. PBR-lite re-skin of the spike hero (skin wrap light, cloth, eyes) and the procedural kit's materials.
5. Quality tiers, the ladder benchmark and the governor (pure code, unit-tested), then look-bench and R0 to R2.
6. Sprite halos, shaft cards, particles. 7. High-tier bloom and cascades. 8. Commission the slice (4.4) in parallel from step 1, because artists take weeks.

## Sources
Fetched and read (2026-11-22): Arm blogs and deck URLs in 2.1; web3dsurvey pages for WEBGL2 (97.96 percent overall, Android 99.49, iOS 99.03), MAX_TEXTURE_SIZE, EXT_disjoint_timer_query_webgl2, WEBGL_compressed_texture_astc, EXT_color_buffer_float, KHR_parallel_shader_compile (URLs in text; the pages show no collection date); the three 0.187.0 npm tarball (sizes and source); `@pmndrs/assets` 1.7.0 tarball; raw GitHub files for Poly-Haven/Public-API, KenneyNL starter kits, KhronosGroup/glTF-Sample-Assets, makehumancommunity/makehuman; npm registry metadata. Not readable from here: polyhaven.com/license, kenney.nl/support, MDN `Navigator.deviceMemory`, quaternius.com, docs.ambientcg.com. Anything marked E is my estimate.
