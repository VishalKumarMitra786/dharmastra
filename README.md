# Dharmastra

An open-world action game set across Indian mythology and history, played in the browser. Pick any era on the time chakra, from before creation to the far future, and start a mission there.

Dharmastra is a web app. It runs on phones and desktops with no install, and it is built to meet WCAG 2.2 AA.

## Project layout

| Folder | What lives there |
|---|---|
| `prototypes/time-chakra/` | The concentric time-chakra era picker (single HTML file) |
| `src/` | Game engine: driving, camera, mission runner, HUD, saving |
| `missions/` | One data and script module per mission |
| `screenplays/` | Storyteller output: screenplays, event data, sources |
| `docs/` | Studio process and product standards |

## How the work is organised

One agent works through a set of role skills: TPO, Creative head, Storyteller, UX designer, Principal engineer, Developer and QA. See `docs/studio.md`.

## Status

Early prototype. The time chakra works, and the first mission, Escape from Hastinapur (Dvapara Yuga), is playable. Run it with `python3 -m http.server 8000` and open http://localhost:8000/. Tests: `node src/test/run.mjs`.

## License

Private project. All rights reserved for now.


## Copyright

© 2026 Vishal Kumar Mitra. All rights reserved. See `LICENSE`. Third-party components keep their own licenses (`THIRD_PARTY_LICENSES.md`).
