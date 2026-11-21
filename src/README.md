# Dharmastra engine (src/)

Plain HTML, CSS and ES modules. No dependencies, no build step.

## Run it

ES modules and `fetch` do not work from `file://`, so serve the repo over HTTP:

```
cd dharmastra
python3 -m http.server 8000
# open http://localhost:8000/
```

Tests (Node 20+): `node src/test/run.mjs`

## Layout

| File | Role |
| --- | --- |
| `main.js` | Loads mission JSON + layout, wires modules, shows start screen |
| `game.js` | Run state (play, pause, win, fail), connects sim, runner, HUD, screens |
| `sim.js`, `world.js` | Pure rules: driving, collisions, guards, checkpoints, health, timer |
| `mission.js` | Loads and validates mission JSON; runner turns sim events into objectives and dialogue |
| `loop.js` | Fixed 60 Hz update, render per animation frame |
| `input.js` | Keyboard, on-screen buttons, drag steering |
| `renderer.js`, `renderer2d.js` | Renderer interface and the 2D canvas implementation |
| `hud.js`, `screens.js`, `styles.css` | DOM HUD, captions, overlays, settings form |
| `settings.js`, `audio.js` | Saved settings; audio stub (no sound yet) |

To swap in a 3D renderer, implement `resize(w, h, dpr)`, `setWorld(world)` and `render(frame)` as described in `renderer.js` and pass it in `main.js`.

## Mission data (`missions/<id>.json`)

```json
{"id":"dvapara-escape","era":"Dvapara Yuga","title":"","logline":"",
 "objectives":[{"id":"","text":""}],
 "dialogue":[{"id":"","speaker":"","text":"","trigger":""}],
 "events":[{"name":"","year":"","label":"History|Tradition|Invented"}]}
```

- `objectives[i]` is shown until checkpoint `i+1` is reached. The count must equal the number of checkpoints in the layout.
- `trigger` is one of `start`, `checkpoint-1`, `checkpoint-2`, `checkpoint-3`, `hit`, `fail`, `win`. Several lines may share a trigger; they play in rotation. `hit` lines are rate limited to one per 5 seconds.
- `win` and `fail` lines appear on the end screens, the others as live captions.
- `events` are listed on the win screen. `year` may be `"Legend"`. `label` follows the project rule: History, Tradition or Invented.
- The loader rejects files that break this schema and shows the reason on screen.

Map layout and tuning live in `missions/<id>.js` (exports `layout`): an ASCII grid (`#` wall, `o` pillar, `.` road, `S` start, digits = top-left tile of a 2x2 checkpoint spot), guard paths and the time limit.

## 3D graphics

The game has a 3D chase-camera view (Three.js) and the original 2D top-down view. Both draw from the same plain frame snapshot through the renderer interface in `renderer.js`, so game rules are identical.

- Settings > Graphics switches between them at any time. The default is 3D.
- If WebGL is missing, fails to start, or the context is lost, the game falls back to 2D and shows a note. The saved preference is not overwritten by a fallback.
- Three.js loads only when 3D is used. `src/vendor/three-lite.js` is a tree-shaken build (about 540 KB, 138 KB gzipped). See `THIRD_PARTY_LICENSES.md` for the version and rebuild steps.
- `src/camera.js` holds the chase-camera maths and the graphics choice rules, both covered by node tests. With reduced motion on, the camera has no lag, there is no shake, and the screen flash is off.
- Meaning is not carried by colour alone in 3D: checkpoints change height and style and show a number or a check mark; guards have a spear, a ground ring and a facing wedge; a ring shows while the chariot is protected.
