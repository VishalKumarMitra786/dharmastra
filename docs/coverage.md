# Event coverage

Which source lists the events in `data/events/` are drawn from, and what is still unimported. Gaps are listed here so they are not hidden. Counts come from `node tools/check-events.mjs` (never typed by hand); at the time of writing it reports 58 events, 22 levels, 3 playable.

Every event today comes from one source: `docs/timeline-levels.md` (studio draft, "The full event list"). None has been checked against a primary source. See that file's "Needs scholarly review" list: 44 of the 58 events are flagged `needsReview`.

| Yuga | Events in shard | Levels | Drawn from | Still unimported |
|---|---|---|---|---|
| Satya | see index.json | 4 planned | timeline-levels.md (Satya list) | Indus-tradition and other early sites beyond Lothal; oral-tradition texts; any dated archaeology not yet listed; further Puranic stories set in this age |
| Treta | see index.json | 4 planned | timeline-levels.md (Treta list) | Further Puranic and regional traditions of this age; Ayurveda and craft traditions beyond the one card each |
| Dvapara | see index.json | 5 (1 built) | timeline-levels.md (Dvapara list) | Other Painted Grey Ware and Ganga-plain sites; regional epic traditions; later reviews of the 2021-22 excavation report |
| Kali | see index.json | 5 (2 built) | timeline-levels.md (Kali list) | The long run of dated history is thin: no entries yet for the Satavahanas, Kushanas, Pallavas, Pandyas, Chalukyas, Rashtrakutas, Hoysalas, Marathas, Sikh history, Bhakti and Sufi movements, regional literatures, science and craft, trade routes, and the colonial period. Events after 1947 are left out until a reviewer agrees |
| Kalki | see index.json | 4 planned | timeline-levels.md (Kalki list) | Kept small on purpose; needs scholarly review of every entry before anything is added |

Not yet in any list: region tags are present only where the intro text names a place; every other event has none. A storyteller agent will import the remaining events as new objects in the shard files; run `node tools/check-events.mjs` after each import.
