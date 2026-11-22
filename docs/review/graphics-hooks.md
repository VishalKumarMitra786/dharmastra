# Graphics hooks: data the renderer would like from other owners

Written by the graphics developer. Nothing here blocks the current build; every item has a safe default in the renderer.

1. Player death: no `defeated` state is in `frame.player.state`. Add `state: 'down'` (or `frame.player.down: true`) so the hero plays the death clip that already exists in `src/gfx/human/anim.js`.
2. Hit direction for enemies: the `hit-enemy` event has `x,y` of the enemy only. Add `dir` (radians, from the attacker) so the knock-back shove and flinch face the right way. Today the renderer shoves away from the player.
3. Enemy hurt flinch: `flinch` is in the frame but is not used for the pose; the renderer derives a 0.3 s flinch from `hit-enemy`. If `flinch` is a timer, expose its fraction.
4. Settings: a `quality` entry (`auto|low|medium|high`) and a `reducedMotion` override in `src/settings.js`, so the renderer can read a saved tier. Not wired: tiers are not implemented yet (see the hand-back).
5. `weapon` for the player when `fists`: the renderer treats `none` as fists.
6. Era key: `world.theme` selects the sky and light (`hastinapur`, `pataliputra`, else default). New eras need an entry in `src/gfx/sky.js` `SKIES` and `THEMES` in `src/renderer3d.js`.
