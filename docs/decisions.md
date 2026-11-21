# Decisions log

Decisions made by the studio on the CEO's instruction to decide on its own ("You can decide on your own will"), 2026-11-21.

1. **Epic figures stay off screen.** Missions use original mortal characters. Epic figures may be referred to briefly and respectfully, never shown or made targets. Reason: respect for living traditions, and it keeps the stories original.
2. **Grain-relief twist approved** for "Escape from Hastinapur": the courier's plea asks for grain relief and the gate captain opens the gate. No community is the villain.
3. **Player choices are deferred** until the engine supports branching. The screenplay keeps the two choices (back lanes or main road; cross now or wait a bell) for a later version.
4. **Sources checked.** Lal's 1100-800 BCE date for Hastinapur Period II is confirmed against his own chapter and a university summary. The 2021-22 excavation date (c. 1500-1000 BCE) comes from a Wikipedia summary of a report we have not read, so the game labels it "as reported". The Amrita essay is devotional, so it supports only the tradition, not history. A scholarly review is still recommended before a public launch.
5. **3D by default, 2D as fallback.** Three.js is vendored as a tree-shaken build. The performance claim for mid-range phones is unproven until tested on real devices.
6. **Mission 2 ("The Night Report of Pataliputra") decisions.** The informer may act as the reporter in the story. Branching stays deferred. The Mauryan-era theme is approved. A scholarly review is recommended before a public launch.
7. **Mission 2 winnability is only partly verified.** Tests assert that the route is reachable and guard paths avoid walls. A scripted bot wins with guards removed and also with guards on (health 12, 4 hits), but that bot ignores guards, so it is not proof a human can win. Real playtesting is needed.
8. **Visual identity: lapis night, marigold gold, sindoor red, peacock teal.** Title poster with a turning chakra and a Devanagari wordmark (system fonts only, no downloads), glass HUD, mission title card, glowing 3D night scene (lit windows, lamps, light-beam checkpoints, dust trail). Motion and flashes are off with reduce motion. The 2D fallback view still uses the older flat colours.
