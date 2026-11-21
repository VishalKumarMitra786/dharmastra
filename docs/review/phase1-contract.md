# Phase 1 contract (TPO). Agents build against THIS, change it only by messaging the TPO.
Scope: crouch and vault hurdles, collect and evade objectives, the staff, one enemy type, saved abilities. Missions without `"rules": 2` behave exactly as today.

## Layout legend (world.js, owner: sim agent)
`=` low wall: blocks walking, vault over it (needs `vault`). `~` low beam: blocks a standing player, crouch under it (needs `crouch`). `,` tall grass: stealth cover (halves enemy sight while crouched inside). `k` pickup spot. `a` enemy spawn. Entity details in `layout.entities` keyed by letter, e.g. `{ k: {kind:'staff'}, a: {kind:'raider', hp:3} }`. These tiles are NOT merged into `walls`; they go in `world.obstacles: [{x,y,w,d,kind:'lowwall'|'beam'|'grass'}]` (world units, x,y = top-left), `world.pickups: [{x,y,id,kind}]`, `world.spawns: [{x,y,kind,hp}]`. Beams and low walls are solid for collision unless the player is in the matching state.

## Sim (sim.js, owner: sim agent). New modules: src/abilities.js, combat.js, objectives.js, progress.js
sim.player = { hp, state: 'idle'|'walk'|'run'|'crouch'|'vault'|'attack'|'hurt', stateT (seconds in state), weapon: 'none'|'staff', cooldown }
sim.abilities = array of ids. Start set when no save: ['walk','run']. Others: 'crouch','vault','staff'.
step controls: { mx, my, run, action: { attack, jump, crouch, interact } }. attack, jump and interact are edge-triggered (true on the tick pressed). crouch is a toggle edge.
Vault: jump near a lowwall in the facing direction, needs `vault`, 0.5 s, moves the player across, invulnerable. Crouch: speed x0.5, passes `~`, halves enemy sight.
Staff: attack with weapon 'staff', 0.45 s swing, short wide arc (60 units, 120 degrees), 1 damage, staggers the enemy for 1.2 s. Enemy kind 'raider': hp 3, patrol, sight cone 160 units, hearing 60 (30 crouched), chase, melee 10 damage with a 0.5 s wind-up shown as state 'windup'. Staggered or hp 0 enemies flee and are 'down' (no corpse, no gore beyond the effect).
Objectives (objectives.js, pure): types reach, collect, evade, survive-not-needed-yet. `evade`: finish without being seen N times (max `seen` count). Win = all non-optional done. Checkpoints stay as implicit `reach`.
Events (strings in step()'s returned array, objects with `type`): wall, guard (existing), vault, crouch, pickup {id}, hit-enemy {id}, enemy-down {id}, seen {id}, hurt {amount}, objective {id,state}, ability {id}.
Progress (progress.js): key `dharmastra.progress.v1`, { v:1, abilities:[...], weapon, completed:{missionId:{best}} }. loadProgress whitelists ids and clamps numbers, falls back to the shunya start on any error, tolerates blocked storage. saveProgress is best effort.
Determinism: no Math.random or Date in sim code; seeded mulberry32 in sim.rng.

## Frame (renderer.js makeFrame, owner: sim agent; renderers read it)
Existing fields stay. Add, always present (empty arrays when unused):
player: { state, stateT, weapon, crouch: boolean }  (in addition to chariot {x,y,angle,...})
enemies: [{ id, x, y, angle, hpFrac, state: 'patrol'|'alert'|'chase'|'windup'|'stagger'|'down' }]
pickups: [{ id, x, y, kind, taken }]
obstacles: [{ x, y, w, d, kind }]
events: [{ type, x, y }]   one-shot feedback for this frame only (hit-enemy, enemy-down, hurt, vault, pickup)
attack: { active, progress 0..1, angle } 
blood: boolean (from settings)

## UI (owner: UI agent): input.js, hud.js, settings.js, index.html, styles.css
Touch pad: keep the 3x3 pad. Add a 64px Attack button and a context 'Do' button (vault or pick up, whichever is in front) and a Crouch toggle button, all >= 44px, reachable on a 360px screen without covering the minimap or caption. Keyboard: Space jump/vault, J attack, C crouch toggle, F interact/pick up. input.read() returns the controls above. Settings: add validated boolean `blood` (default true). HUD: an abilities/weapon indicator with text (not colour only), objective list that shows every objective's progress, aria-live announce for events (throttled), captions for new cues.

## Render (owner: render agent): renderer3d.js, renderer2d.js
Draw enemies (existing guard model is fine; give raiders a distinct shape plus a text-free icon above the head per state: ! alert, ? search, shield stagger), obstacles (low wall box, beam, grass patches), pickups (floating staff), staff in hand and swing arc when attack.active, crouch pose (squash), vault pose (hop), hit flash on events, small blood or neutral spark burst (pooled, <= 24 particles, fade 300 ms, honour frame.blood and reducedMotion). 2D fallback draws the same with simple shapes. Perf budget: no new draw calls per enemy beyond the model, no per-frame allocation.

## Data (owner: TPO): missions/shunya-*.js and .json, src/mission.js, src/game.js
