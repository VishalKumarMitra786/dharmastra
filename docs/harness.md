# How we build (the harness)
Rule of this repo: no vibe coding. Work is specified, checked by something that can fail, and only then pushed.

## The loop
1. **Spec.** Write acceptance criteria first (what a person can do, what must never happen, which CLAUDE.md rules apply). Each criterion must be checkable. Put it in the task brief or in docs/review/.
2. **Test first.** For every criterion add a unit test (src/test/) or a smoke check (tools/smoke.mjs). Watch it fail when the behaviour is missing, when that is cheap to do.
3. **Build.** One owner per file. Cross-boundary data goes through a written contract (example: docs/review/phase1-contract.md). A change to a contract goes through the TPO.
4. **Verify.** Run `./tools/verify.sh` (tests, size and licence budget, browser smoke test). Look at the screenshots in tools/out/. Record what was and was not tested.
5. **Gate.** Push only when verify passes. CI runs the same checks on every push (.github/workflows/ci.yml).
6. **Review.** A role that did not write the change reviews it (QA for behaviour and accessibility, principal engineer for architecture and performance). The author's report is a claim, not evidence.
7. **Record.** Decisions go in docs/decisions.md, status in docs/status.md.

## Definition of done (every agent hands back with this filled in)
- [ ] Acceptance criteria listed, each with the test or check that proves it
- [ ] `./tools/verify.sh` result pasted (numbers, not "passes")
- [ ] Files touched, all inside the files the task allowed
- [ ] What was NOT tested, plainly (real phone, screen reader, performance on a device, etc.)
- [ ] New assets: source URL and licence in assets/CREDITS.md
- [ ] Mobile 360 px, 44 px targets, keyboard path, visible focus, names, reduced motion, no colour-only meaning (CLAUDE.md)
- [ ] Open risks and follow-ups

## What the automatic checks cover and do not cover
Covered: logic (sim, objectives, save validation, missions), first-load size and per-asset size, missing licence lines, accidental secrets, console errors, sideways scrolling, touch target size, missing control names, picker on first visit, 2D fallback when WebGL is missing, reduced-motion load.
Not covered: how it feels, real-phone frame rate, screen-reader behaviour, contrast of painted art, historical accuracy (scholarly review), visual regression (screenshots are for a person to look at).

## Real-device check (manual, until we have a device lab)
Open `perf.html` on the phone, let it run, and paste the numbers back. Test touch controls on a 360 px width phone in portrait and landscape.
