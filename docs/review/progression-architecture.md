# Progression, hurdles and objectives: architecture (principal engineer)
Date 2026-11-22. Status: design only, nothing built or run. Based on reading src/sim.js, world.js, input.js, mission.js, game.js, loop.js, settings.js, renderer.js, renderer3d.js.

## Recommendation
Extend the existing pure sim in place, as small modules the sim calls: `src/combat.js`, `src/abilities.js`, `src/objectives.js`, `src/progress.js`. Keep `step(sim, dt, controls)` returning events. No ECS, no physics library. Cost of being wrong is low: each module is behind a feature flag in mission data (`"rules": 2`), so the two existing missions keep working unchanged.

## 1. Data model (sim state, all plain JSON, no DOM)
- `sim.player`: `{hp, stamina, state: 'idle|walk|run|crouch|vault|climb|dodge|attack|hurt|dead', stateT, facing, weapon: 'none|staff|sword|bow', cooldown, combo, ammo}` replacing loose `chariot` fields for foot mode (chariot stays as is).
- `sim.abilities`: set of ids from `shunya` start: `walk, run` (given) then `crouch, vault, dodge, staff, sword, bow, climb, push`. Mission `grants` and `requires` reference these ids, so a hurdle can never block a player who lacks the ability (validator checks it).
- `sim.enemies[]`: `{id, kind, x, y, hp, state: 'patrol|alert|chase|attack|stagger|dead', alert 0..1, hearing, sight}`. Replaces `guards`; guards stay as `kind:'watch'` with the existing path format so old data loads.
- `sim.projectiles[]` (arrows): fixed pool of 16, `{x,y,vx,vy,life,owner,active}`. No allocation per tick.
- `sim.pickups[]`, `sim.props[]` (pushables), `sim.npcs[]` (rescue/deliver targets), `sim.inventory`: `{items:{id:count}, carried: id|null}`.
- Weapon table in `TUNING.weapons`: staff (short arc, wide, stagger, 0 kill damage on bosses), sword (higher damage, slower, needs stamina), bow (projectile, ammo, slow draw). All numbers data, not code.
- Hurdle table `TUNING.hurdles`, each `{ability, durationMs, invulnerable}`.

## 2. ASCII legend additions (world.js)
Keep `# o . S 1-9`. New chars, parsed into `world.obstacles/pickups/spawns` plus a per-tile `kind` grid; `solid` stays the collision source of truth:
- `=` low wall (vault; solid unless vaulting), `~` low beam (crouch under; blocks standing), `x` crate (push; becomes a prop), `H` climbable ledge, `^` spikes or pit (dodge or jump; damage), `,` tall grass/shadow (stealth cover).
- `a`-`f` enemy spawns, `k` pickup, `n` npc, `w` wave spawner. Details (kind, hp, item id) live in `layout.entities` keyed by letter, so the ASCII stays readable.
- `parseLayout` validates: every hurdle has a bypass or the required ability is granted earlier (extend `reachable()` with an ability set; BFS per ability tier).

## 3. Input
- Actions, not keys: `{mx,my,run, action:{attack,dodge,jump,crouch,aim,interact,swap}}`, edge-triggered with a 150 ms buffer so thumbs do not miss.
- Touch: left half floating stick (existing). Right side: two-row cluster of 48 px buttons (attack large 64 px, dodge, jump/vault, interact, crouch toggle, weapon swap); camera look moves to a right-edge drag strip above the buttons. Honour `settings.side`. Buttons already map through `data-control`; add entries to `BUTTON_FLAG`.
- Keyboard: Space jump/vault, J or Z attack, K or X dodge, C crouch toggle, F interact, 1-4 weapon, hold Shift run. Mouse click attack is optional.
- Context button: one "Do" button that auto-picks vault, climb, push, or pick up from what is in front, so phones need few buttons.

## 4. Mission JSON (extends mission.js `validateMission`, `TRIGGERS`)
```
"objectives":[{"id":"o1","type":"reach|collect|rescue|deliver|evade|survive|defeat",
  "text":"...","target":"cp1","count":3,"seconds":60,"optional":false,"reveals":"o2"}],
"rewards":{"onComplete":{"grants":["staff"],"items":{"herb":1},"xp":0}},
"requires":["vault"], "assists":{"autoAim":true}
```
Objective state machine lives in `objectives.js` (pure), consuming sim events (`pickup`, `npc-freed`, `enemy-down`, `wave-clear`, `seen`, `delivered`). Win is "all non-optional done". Existing checkpoints become implicit `reach` objectives, so old JSON still validates. New dialogue triggers: `objective-N`, `weapon-gained`, `enemy-down`, `spotted`. Story text stays in JSON, mark History/Tradition/Invented as today.

## 5. Progression and save
Arc: M1 shunya, unarmed, evade and sneak only. M2 staff (found, tradition-labelled), defend. M3 sword. M4 bow (ammo pickups). Abilities are granted by mission rewards, never by grind, so the order is authored.
Save key `dharmastra.progress.v1`: `{v, abilities[], weapon, completed{missionId:{best, stars}}, inventory}`. `loadProgress` whitelists ids against the ability/mission registries, clamps numbers, drops unknown keys, falls back to shunya on any parse error, tolerates blocked storage (as settings.js does). Never store the sim mid-run. Mission start applies `requires` and may lend the starter kit so a replay of an early mission works with later gear. Provide a Reset progress button.

## 6. Determinism and tests
- All combat in `step` at the fixed 1/60 tick, no `Math.random` or `Date`: a seeded PRNG in `sim.rng` (mulberry32), seed from mission id plus attempt. No timers from renderer. Events are the only output to HUD/audio.
- Tests (src/test, existing runner): replay a recorded control script and assert identical state hash after N ticks; hit arcs, arrow travel and wall stop; hurdle gating by ability; objective state machine per type; save validation fuzz (garbage, old version, huge numbers); mission validator and reachability per ability tier; "every mission completable unarmed with assists on" bot run.
- Enemy AI is a simple state machine with sight cone and hearing radius (crouch halves it). No pathfinding beyond waypoint plus chase straight with wall slide; revisit with a tile A* only if needed.

## 7. 3D renderer (budget: 30 fps on a 4-core low-end phone, <= 150 draw calls, +60 KB gzip, no new textures over 512 px)
- `makeFrame` adds `player.state/weapon/stateT`, `enemies[]` with state and hp fraction, `projectiles[]`, `pickups[]`, `props[]`, `events[]` for one-shot feedback.
- Animation: procedural pose from `state` and `stateT` (rotate limbs and weapon, squash for crouch). No skeletal assets, no licences.
- Blood/sparks: pooled points or tiny instanced quads, honouring `settings.blood`.
- Hit feedback: 80 ms scale pulse plus white emissive flash on the enemy, small hit-stop of 3 ticks in sim (not renderer), camera shake gated by reduceMotion, damage numbers avoided.
- Arrows: one InstancedMesh of 16, shared geometry. Weapon meshes: 3 small merged geometries. Reuse pools, no per-frame allocation. Shadows stay off for dynamic extras.
- 2D fallback must draw the same new frame fields (shapes plus icons), kept in step with the 3D one.

## 8. Accessibility
- Every cue has a second channel: enemy state shown by icon shape and text label above health bar (not colour); telegraph before enemy attacks (wind-up 400 ms or more); damage direction arrow plus text.
- `hud.announce` (aria-live polite) for: weapon gained, enemy defeated, hit taken, low health, objective change; throttled like `HIT_GAP`. Captions for all new audio cues (swing, arrow, alert) through `showCaption`.
- Reduced motion: no shake, no hit-stop flash, no camera sway, simple fade instead of flash; honour existing `settings.reduceMotion`.
- Assist settings (add to settings.js, validated): auto-aim (snaps attack/arrow to nearest enemy in cone), enemy damage 100/50/25/0 percent, enemies slower, hold-to-toggle for crouch and aim, no timers (exists), skip hurdle (a context button vaults automatically). All hurdles have a non-timing alternative or the skip. Keyboard: every action reachable, visible focus on buttons, 44 px minimum.
- Gore policy (CEO): brief hit sparks and small blood spatter only, fading within about 300 ms; no dismemberment, no corpses with wounds, no lingering decals. Settings toggle `blood` (default on, validated boolean in settings.js, separate from `reduceMotion`); off swaps spatter for neutral sparks, same timing. Spatter is a small pooled particle burst (cap 24 particles), and reduced motion also shortens or removes it. Hit feedback never relies on red alone: every hit also gives a caption, an aria-live announcement, a sound and a shape cue (flash plus enemy stagger pose). Early weapons stagger or make enemies flee; deities not shown.

## 9. Phased plan (file ownership so parallel agents do not collide)
| Phase | Scope | New/owned files | Shared files touched (single owner) |
|---|---|---|---|
| 1 smallest playable slice | Crouch + vault hurdle, collect and evade objectives, staff, one enemy type, save of abilities | `src/abilities.js`, `src/combat.js` (staff only), `src/progress.js`, `src/objectives.js`, `src/test/*` new files, `missions/shunya-*.js/json` | Agent A (sim): `src/sim.js`, `src/world.js`. Agent B (UI): `src/input.js`, `src/hud.js`, `src/settings.js`, `index.html`, css. Agent C (render): `src/renderer.js`, `renderer3d.js`, `renderer2d.js`. Agent D (data): `src/mission.js`, `src/game.js`. |
| 2 | Dodge, push, climb; rescue/deliver/survive-wave; sword; stamina | `src/ai.js`, `src/props.js`, 2 missions | same owners |
| 3 | Bow, arrows pool and instanced mesh, ammo, auto-aim | `src/projectiles.js`, renderer additions | A, C |
| 4 | Assists complete, polish, captions audit, perf pass on real phone, difficulty tuning | `docs/qa/*` | all |
Phase 1 order: frame contract (makeFrame fields) agreed first by A, C, D in a short interface note, then work in parallel against stubs.

## 10. Top risks
1. Touch crowding: too many buttons on a 360 px screen. Mitigate with the context "Do" button and a usability test on a real phone in phase 1.
2. Renderer/sim contract drift across parallel agents. Mitigate: frozen frame schema plus a test that both renderers accept it.
3. Phone performance (instances, lights, shadows). Mitigate: budgets above, profile at end of each phase, drop shadows and effects first.
4. Soft-locks: a hurdle needing an ability the save lacks, or a pushed crate blocking a lane. Mitigate: validator, bypass BFS, restart button, crates only push along open tiles.
5. Save corruption or tampering: strict whitelist validation, versioned key.
6. Accessibility regressions in combat (timing, colour, motion): assists and QA checklist in phase 1 not last.
7. Scope creep and sim.js growing past maintainability: modules above; sim.js stays an orchestrator.
8. Untested: nothing here has been prototyped. Collision of vault/crouch with the merged-rectangle walls in `mergeWalls` is the first technical spike (tile kinds must not be merged into `walls`).
