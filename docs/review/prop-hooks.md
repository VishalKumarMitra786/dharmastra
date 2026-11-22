# Props: requests for the graphics developer and the HUD / input owners

Props are objects a traveller picks up and fights with. Everything here is already in `frame` (documented in the `src/renderer.js` header) and in events; the 2D renderer draws placeholder shapes. Rules and numbers: `PROPS` in `src/abilities.js`, behaviour in the props section at the end of `src/combat.js`.

## Frame data
- `frame.props[]`: `{id, kind, name, x, y, state: idle|held|thrown|broken, angle, z, uses, maxUses, durability 0..1, crack 0|1|2|3, holder: 'player'|null, fire}`.
  - `crack`: 0 intact, 1 cracked (2/3 or less left), 2 about to break (1/3 or less), 3 broken (debris, removed 4 s later). Show the crack by shape (lines), not colour alone.
  - `thrown`: `z` is a 0..1 lift (a parabola over the flight); spin it. `held` props are also in `frame.player.held`; draw them in the hand, not on the ground.
- `frame.player.held`: `null | {id, kind, name, cls, uses, maxUses, durability, crack, twoHands, canThrow, fire, guard}`. `frame.player.weapon` is `'none'` while a prop is held, so a renderer that knows nothing about props draws an empty hand.
- `frame.enemies[].carry`: the prop kind in hand, or `null` (unarmed: it fights with fists). `frame.enemies[].rearm`: `null | {propId, grabbing, t 0..1}` while an unarmed enemy walks to a loose prop (`grabbing` once it is bending to take it). Please draw it so the player can read it (a reach or bend pose, the prop highlighted).
- `frame.enemies[].weapon` follows what the enemy carries: `club, spear, sword, shield, stick, fists` (bow and blade are unchanged).
- `frame.attack.via === 'prop'` for prop swings; `frame.attack.id` is the move (`bash`, `thrust`, `throw`, ...). `frame.attack.kind` is `heavy` for a prop's heavy blow.

## Placeholder art wanted, per kind (3D renderer)
Each prop is small (about 0.3 to 1.8 m long) and must read from the third-person camera: stick, bamboo staff (nodes), club, clay pot, stone, oil lamp (flame), torch (flame), spear, old sword, wood shield, bench, crate, market pole (cloth flag), rope coil, grain sack. Three crack states per prop (intact, cracked, nearly broken) plus a broken-debris pile. Held poses: one-hand swing, two-hand swing (`twoHands`), spear thrust, overhead heavy, underhand throw. Thrown props use `angle` and `z`. Shattering (`prop-shatter`) wants a short burst of shards (clay brown), and `prop-break` a splinter burst.

## Events (all carry `x, y`; none is needed for the game to work)
`prop-pickup {id, kind, name, swap}`, `prop-drop {id, kind, by: 'player'|enemy id, reason: drop|swap|disarm|down}`, `prop-throw {id, kind, angle, range}`, `prop-hit` (a thrown prop struck an enemy), `prop-land`, `prop-break`, `prop-shatter`, `disarm {id, prop}` (an enemy's weapon was knocked away), `enemy-rearm {id, prop}` (an unarmed enemy starts going for a loose prop), `enemy-pickup {id, prop}`, `prop-twohands` (block pressed with both hands on a prop), `prop-nothrow`. `hit-enemy` now also has `prop` (the prop kind, for prop hits) and `dir`, the direction the blow travelled (this is the `dir` that `graphics-hooks.md` item 2 asked for).

## HUD request (the HUD owner; `hud.js` is not ours)
1. Held item: show `frame.hud.heldName` and a durability bar from `frame.hud.heldDurability` (0..1), with `frame.hud.heldCrack` (0..3) as a text or shape cue (for example "Cracked" at 1, "Nearly broken" at 2), not colour only. Hide it when `heldName` is `''`. Give it an accessible name such as "Holding Club, durability 70 percent".
2. Pick-up prompt: `frame.hud.prompt` is plain text of at most 3 words ("Take club", "Swap old sword", "Throw"), or `''` when there is nothing to do. Show it near the Do button and put it in a polite live region. The prompt also appears over the prop in the 2D renderer. Do (key F, the context button) performs it: taking a prop, swapping, or (prompt "Throw") throwing at the enemy in front.
3. Buttons and keys, for the input owner. The sim already reads two new one-shot actions, `throw` and `drop`, in `controls.action` (the names must be added to `ACTION_NAMES` in `input.js`). Wanted: a Throw button and key and a Drop button and key, shown only while an item is held (Throw only when `frame.player.held.canThrow`). G and Home are taken by the camera reset, so suggest T for Throw and H for Drop. Until they exist: Swap (R) puts a held prop down, the weapon keys 1/2/3 put it down and equip the weapon, and light attack (J) throws a missile (pot, stone, lamp). Do throws only when the prompt says "Throw".
4. `VIA_CUE` needs a `prop` entry (the HUD currently falls back to the staff or fists caption for a prop blow). Captions for every new event already come from `audio.captionFor`, so `hud.cue` shows them; please keep them in the live region.
5. Two-handed props (`held.twoHands`) cannot block; show the Block button as unavailable while one is held, and keep the 44 px target.

## Not done
- Burning cloth awnings with the torch or lamp (optional in the brief): `fire: true` is in the data and frame, nothing uses it yet.
- No minimap icons for props.
