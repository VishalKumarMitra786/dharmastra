# Combat v2: requests for the renderer and HUD owners

The sim now exposes everything below in the frame (`makeFrame`, documented in the `src/renderer.js` header) and in events. Nothing here needs a sim change.

## HUD (blocking for touch play)
- The attack, heavy, block, dodge and push buttons must show when unarmed. The player starts with fists and dodge/push are innate; the attack button is currently hidden unless a staff or sword is held.
- `VIA_CUE` needs a `fists` entry.
- Captions: `hud.cue(text)` already receives the bracketed caption for every event the HUD does not caption itself (`src/audio.js` `captionFor`). Please keep it in the live region.
- Show a stamina bar and, when `frame.player.parrying` is true, a parry cue by shape or text, not colour only.
- Show `frame.waves` (wave n of m) and the captain's health when `kind === 'captain'`.

## Minimap
- It draws `frame.guards`, which is now always empty. Draw `frame.enemies` (use `state`, `aware`, `kind` for the icon shape).

## Renderers (2D and 3D)
- Per enemy: `weapon`, `phase` (windup/active/recover), `phaseT` (0..1), `facing`, `target`, `attack {reach, halfArc, unblockable}`, `guard` (shield up), `open` (can be finished), `role`, `calling`, `phaseNo` (captain).
- Draw the windup as a visible raised weapon plus a ground wedge of `attack.reach` and `attack.halfArc`; make `unblockable` distinct by shape or text, not colour only.
- Archer: draw `aim` (`x0,y0,x1,y1,locked`) as a line; thicker or dashed once `locked`.
- `projectiles` with `from === 'enemy'` are arrows in flight.
- `timeScale` (slow motion), `hitstop` (freeze the world, keep drawing), and `reducedMotion` must be honoured. The sim already turns hit-stop and slow motion off under reduced motion.
- Hurt events carry `from` and `dir`: a damage-direction indicator is wanted.

## Events a renderer or HUD may react to
windup, enemy-swing, enemy-arrow, whiff, hurt, blocked, parry, opened, finisher, shield-block, shield-break, stagger, call, retreat, phase, wave-start, wave-clear, rest, captain-down, enemy-down, dodge, shove-hit.
