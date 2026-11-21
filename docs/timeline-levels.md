# Timeline levels: the climb from Satya to the Kalki dawn

Status: design draft for CEO review. Nothing here is in missions/*.json yet, and no code was written or run.
Label key: History, Tradition or Invented, each with a year or "Legend". Dialogue uses {name} and is at most 140 characters.
Rules inherited: docs/decisions.md items 1, 11, 12; docs/shunya-arc.md (defence only, restrained violence, invented mortal teachers); docs/story.md (the traveller is a courier, "No glory in this. Just a road that stayed open.").

## The CEO's direction, as designed (Invented, Legend)
Every event, place or practice on the timeline is a level. The thrill is the climb through the eras to the latest, Kali Yuga, and then the Kalki era. The ladder is ordered by the yuga timeline in tradition: Satya, Treta, Dvapara, Kali, then the Kalki era. There are 22 playable levels and one epilogue card, plus 36 info-only event cards (58 entries in all, listed in the data section below). The chakra zooms from the whole wheel to one ring of events to one event and its year.

| Ring | Era | Levels | Level numbers |
|---|---|---|---|
| 1 (outer) | Satya Yuga | 4 | 1-4 |
| 2 | Treta Yuga | 4 | 5-8 |
| 3 | Dvapara Yuga | 5 | 9-13 |
| 4 | Kali Yuga | 5 | 14-18 |
| 5 (centre) | Kalki era | 4 + epilogue | 19-22 |

Existing today: level 10 "Escape from Hastinapur" (missions/dvapara-escape.json) and level 14 "The Night Report of Pataliputra" (missions/mauryan-spy.json). Every other level is new.

## Two things the ladder must say plainly
1. Tradition's yuga order and the dated record do not line up, and the game does not pretend they do. In the Puranic reckoning the Kali Yuga starts at 3102 BCE and the four yugas run 1,728,000, 1,296,000, 864,000 and 432,000 solar years including dawn and dusk (Wikipedia, "Yuga cycle", summarising the Surya Siddhanta and Puranic figures; other authors give different cycles). Hastinapur Period II (c. 1100-800 BCE, History) and Pataliputra (c. 300 BCE, History) would both fall inside the Kali Yuga by that count, yet the Hastinapur level sits in Dvapara because it is about the eve of the great war (Tradition, Legend). So each level carries two labels: its ring (a Tradition placement) and its own year or "Legend". The hub must never imply a level's History year is the yuga's date.
2. The shunya-arc skill order (hands, evasion, staff, sword, bow) was written for five eras starting at Dvapara. The CEO's ladder adds Satya and Treta before Dvapara. This draft keeps the shunya-arc intact: Satya and Treta are "shunya" rings where {name} has no weapon and no fighting skill, only footing, carrying, breath and stillness (pre-skill). Hands start at Dvapara, evasion at Mauryan, then staff, sword, bow in Kali, and mastery in the Kalki era. This also suits tradition, where Satya is described as the age of full dharma. DECISION NEEDED: if the CEO wants a skill taught in Satya, the alternative is to shift every skill one ring earlier and rewrite the Dvapara and Mauryan lessons, which are already built.

## Rules for all levels
- Defence only. Hurdles are crowds, water, animals, dark, hurry and fear, never a villain or a community. Violence is restrained (docs/shunya-arc.md, CEO update 2026-11-22): at most a brief small impact mark, no one is killed on screen, nothing graphic or lingering.
- No deity, epic figure or ruler is ever shown, spoken or harmed (docs/decisions.md, item 1). They are referred to briefly and respectfully in captions only. Teachers are invented mortals.
- Each level has one non-checkpoint objective (protect, rescue, collect, endure, deliver) as a separate goal.
- Unlock rule, same for every level (full rule in "Intro cards and the unlock rule"; locked levels can still be read about): the next level opens when the route is finished. The last level of each ring is its keystone and its objective must also be done, or the ring seal is not earned and the next ring stays closed. No permanent lock-out: a failed objective can be retried, and an assist setting (more time, wider windows) is available, which keeps the gate fair for players who need it.
- Skill column: "pre-skill" means footing, carrying, breath and stillness only.

---

## Ring 1. Satya Yuga: the quiet age (pre-skill, shunya)
Era label: Satya (Krita) Yuga, the first age, in which dharma is described as whole (Tradition, Legend). All four levels are Invented, Legend stories set inside that Tradition. Where a real place inspires the setting it is named as inspiration only.

**Level 1. The Still Ford.** New. Invented, Legend.
- Skill: footing (pre-skill). Teaches balance on wet stones and a slow, steady walk.
- Hurdle: a misty ford with slick stones and a heron that startles. Waiting is the answer, not hurrying.
- Objective (protect): carry a full water pot to a sleeper's door without spilling more than a cupful.
- Unlock: finish the route. Opens level 2.

**Level 2. The Drain-Lane Dusk.** New. Invented, Legend, inspired by the planned lanes and drains of Indus-tradition cities, c. 2600-1900 BCE (History, as reported; not checked in a primary source here).
- Skill: carrying and lane-reading (pre-skill). Teaches the carry grip and sidestepping in a narrow lane.
- Hurdle: an evening crowd of water-carriers in a lane barely two people wide, with a rising puddle.
- Objective (collect): gather loose clay tablets-for-counting that fell from a trader's basket into the drains, before the lane lamps are lit.
- Unlock: finish the route. Opens level 3.

**Level 3. The Reed Harbour.** New. Invented, Legend, inspired by the basin at Lothal, c. 2400-1900 BCE (History). Archaeologists disagree whether it was a dock or an irrigation tank, so the game never says which.
- Skill: breath and stillness (pre-skill). Teaches holding still on a moving boat deck and calm breathing before a step.
- Hurdle: a reed-boat that rocks, a tide that turns, and geese on the quay.
- Objective (deliver): relay three sealed jars of seed from boat to shore by hand-to-hand passing, none dropped.
- Unlock: finish the route. Opens level 4.

**Level 4. The Teaching Grove (keystone).** New. Invented, Legend, inside the oral-teaching tradition (the Vedic texts were kept by memory for a long time; Tradition, date of writing debated).
- Skill: attention (pre-skill). The traveller must learn a message by ear, since nothing is written, and carry it unchanged.
- Hurdle: darkness under trees, and a deliberately confusing echo that tests memory under fear.
- Objective (deliver): speak the learned message correctly at the far hut. A mistake costs a retry, never a penalty.
- Unlock: finish the route and the objective. Seals Satya and opens level 5 (Treta).
- Teacher (Sumedha, Invented, Legend): "{name}, carry nothing you cannot set down gently. The road will ask for little, and then for more." (102 characters)

---

## Ring 2. Treta Yuga: tools and fire (pre-skill)
Era label: Treta Yuga, the second age, in which dharma is described as three parts of four (Tradition, Legend). The age is also the setting of the Ramayana tradition (Tradition, Legend). No figure from the epic appears.

**Level 5. The Southern Road at Dusk.** New. Tradition, Legend (the road of exile is a Tradition setting, not a mapped place). The courier is Invented.
- Skill: carrying a load over rough ground (pre-skill).
- Hurdle: a rock-strewn forest road at dusk, and monkeys who rattle the branches overhead but mean no harm.
- Objective (protect): keep a bundle of healing herbs dry through a stream crossing.
- Unlock: finish the route. Opens level 6.

**Level 6. The Camp of Stone and Rope.** New. Tradition, Legend. The causeway of the Ramayana tradition is a living sacred story, so it is shown only as quiet labour: workers, rope, water. No figure and no god is shown.
- Skill: teamwork and relay (pre-skill).
- Hurdle: a long line of workers, a tide, and hurry. The player must pace the relay, not rush it.
- Objective (collect): bring water and cloth to each worker station before the noon heat.
- Unlock: finish the route. Opens level 7.

**Level 7. The Hall of Small Fires.** New. Tradition, Legend (household and altar fire practice, History for later Vedic fire altars, dates debated).
- Skill: stillness and carrying a flame (pre-skill).
- Hurdle: a windy hall, an ember in a clay pot, and an inquisitive child.
- Objective (endure): keep one hearth-fire alive until dawn while a village sleeps.
- Unlock: finish the route. Opens level 8.

**Level 8. The Herb Path (keystone).** New. Invented, Legend, with Ayurveda as inspiration only (Tradition, dates debated).
- Skill: stillness (pre-skill). Teaches going quiet so that a startled animal passes by.
- Hurdle: a forest at night with a boar and a wasp nest. Both pass if the player stays calm.
- Objective (rescue): find a lost child by following a bell and lead them out by the hand.
- Unlock: finish the route and the objective. Seals Treta and opens level 9 (Dvapara).
- Teacher (Vanya, Invented, Legend): "{name}, a fire is a promise. Keep it small, keep it fed, and carry it like a sleeping child." (96 characters)

---

## Ring 3. Dvapara Yuga: the eve and the aftermath (bare hands)
Era label: Dvapara Yuga, the third age, in which dharma is described as half (Tradition, Legend). The Mahabharata tradition places its great war at the end of Dvapara (Tradition, Legend; versions differ and the game gives no war date). No epic figure appears.

**Level 9. The Well-Rope at Dawn.** New. Invented, Legend, set among farms near Hastinapur (Period II, c. 1100-800 BCE, History).
- Skill: bare hands, stance and fall. A small edit is needed in level 10, where Suvrata currently teaches the stance as well. See "Edits to existing missions".
- Hurdle: a crowded well, a rope that pulls, and a slick stone curb.
- Objective (rescue): help a villager who slipped, up from the curb without letting the bucket fall on anyone.
- Unlock: finish the route. Opens level 10.

**Level 10. Escape from Hastinapur.** EXISTING (missions/dvapara-escape.json). Labels: Hastinapur Period II c. 1100-800 BCE (History); the great war's eve (Tradition, Legend); the grain-plea courier (Invented, Legend). See docs/story.md.
- Skill: bare hands, grip-break and a safe fall, taught by Suvrata (Invented, Legend).
- Hurdle: the Lamp Bazaar crush and the stranger who grabs the sleeve in panic.
- Objective (protect): keep a child's paper lantern lit and the child beside {name} through the bazaar (docs/shunya-arc.md, Era 1). The objective is not built in the JSON yet.
- Unlock: reach the east gate. Opens level 11.

**Level 11. The Lac-House Lane.** New. Tradition, Legend (an episode of the Mahabharata tradition; the plot to burn the house is left out, so it is a lane fire for the courier, with no one at fault).
- Skill: bare hands under pressure: carry, lift, pull a stranger clear.
- Hurdle: a thatch fire spreading along a lane of wooden houses. The player drags and wets, never fights.
- Objective (rescue): bring four neighbours to the clearing by calling and guiding them through smoke.
- Unlock: finish the route. Opens level 12.

**Level 12. The Ferry at the Sea City.** New. Tradition, Legend. The sea city of the Krishna tradition, said to have gone under the sea at the end of Dvapara. Marine-archaeology claims of a submerged site off Gujarat are contested and the game makes none. No deity or ruler shown.
- Skill: bare hands mastery (hands tier ends): carrying, steadying and releasing a grip safely.
- Hurdle: a rising tide on the quay and a crowd carrying bundles up the steps.
- Objective (rescue): ferry families' bundles and an elder to the high steps before the water rises, in relays.
- Unlock: finish the route. Opens level 13.

**Level 13. The Water-Bearers' Road (keystone).** New. Tradition, Legend (the aftermath of the great war). Quiet, no combat, no epic figure, and nothing from the Gita is quoted or dramatised.
- Skill: bare hands, tested (hands tier complete): lifting, steadying, and putting everything down.
- Hurdle: a long field-road at dusk, grief, thirst and a crowd that does not know where to go.
- Objective (deliver): carry water and cloth to three resting places, with no one turned away.
- Unlock: finish the route and the objective. Seals Dvapara and opens level 14 (Kali).
- Teacher (Suvrata, existing): "{name}, after the noise the water-bearers walk. Nobody sings of them. Everybody drinks." (88 characters)

---

## Ring 4. Kali Yuga: the long age of strain (evasion, staff, sword, archery)
Era label: Kali Yuga, the fourth and present age in the Puranic reckoning, traditionally starting 3102 BCE (Tradition). The game uses Kali as a story setting. It does not say our times are or are not that age, and it does not judge any people.
Levels 14 to 17 follow docs/shunya-arc.md Eras 2 to 5. Their full detail is there. In short:

**Level 14. The Night Report of Pataliputra.** EXISTING (missions/mauryan-spy.json). Labels: timber palisade and ditch, c. late 4th to early 3rd century BCE (History, as reported); the ferry clerk's flood warning (Invented, Legend).
- Skill: evasion, taught by Revati (Invented, Legend).
- Hurdle: the doubled night watch in the palisade lane (lost step, not a fight).
- Objective (rescue): lead a stranded porter out of a flooded lane using only quiet movement. Not built in the JSON yet.
- Unlock: deliver the report at the sluice house. Opens level 15.

**Level 15. The Hill Stream and the Harbour Road (Sangam age).** New. Sangam period c. 300 BCE to 300 CE (History, as reported, dates debated); the caravan is Invented, Legend.
- Skill: staff, taught by Poonkodi (Invented, Legend).
- Hurdle: a swollen stream, a rope bridge and startled goats, turned aside by touch and sound, never a blow.
- Objective (collect): gather scattered pepper sacks on the harbour road before the evening tide.
- Unlock: finish the route. Opens level 16.

**Level 16. The Forge Road (Gupta age).** New. Gupta empire c. 320-550 CE (History); the smith's yard is Invented, Legend.
- Skill: sword, taught by Ayasa (Invented, Legend), block before cut, sheathe at the end.
- Hurdle: a toppled cart of hot iron in a night forge-yard. The blade blocks a pole and cuts a pinning rope.
- Objective (endure): hold the gate bar and keep the bellows going until dawn.
- Unlock: finish the route. Opens level 17.

**Level 17. The Tank and the Sluice (Chola age).** New. Chola empire c. 850-1279 CE (History); the delta village is Invented, Legend.
- Skill: archery, taught by Tamarai (Invented, Legend). Arrows go only at rope, flag and target.
- Hurdle: a flood-night, with a fouled sluice rope out of reach.
- Objective (deliver): send a signal line to a stranded boat and draw it ashore.
- Unlock: finish the route. Opens level 18.

**Level 18. The Lamp Road of the River Fair (keystone, the gate to the Kalki era).** New. Tradition, Legend (river fairs held by pilgrim and village communities are living traditions, so the setting is generic and unnamed; no real fair is copied).
- Skill: mastery rehearsal. All five skills are offered as choices, and the best answer is often to put them away: hands to steady, staff to part a crowd by sound, bow only for a signal line, sword never drawn.
- Hurdle: a night crowd of thousands, lanterns, a missing child's cry, and fear spreading faster than any threat.
- Objective (protect): guide the whole crowd's slowest group (elders, children) along the lamp road to the high ground before the river rises.
- Unlock: finish the route and the objective, with levels 14 to 17 sealed. Seals Kali and opens level 19 (Kalki era).
- Teacher (the fair's lamp-warden, Invented, Legend): "{name}, you carry five things now. Tonight, see how many you can leave in the bag." (87 characters)

---

## Ring 5. The Kalki era: a hopeful dawn (mastery, a courier and protector)
Era label: Tradition (Kalki is named as a future avatar who ends the Kali Yuga in the Vishnu Purana and the Bhagavata Purana, per Wikipedia, "Kalki"); gameplay is Invented, Legend. The accounts differ: the Kalki Purana places his birth in Shambhala to Vishnuyashas and Sumati, the Vayu Purana gives the role to a figure named Pramiti, and the Yuga Purana does not mention Kalki. No single account is followed and none is claimed as a prediction. The era is a story of preparation and hope.

Hard rules for this ring:
- The Kalki avatar is never shown, spoken or harmed on screen (docs/decisions.md, item 1). This also means no silhouette, shadow, voice, hoofbeat or off-screen speaker, no white horse, no sword and no "chosen one" character that could stand in for him. The player only ever meets the people who are getting a road ready.
- There is no final boss, no enemy force and no battle. The ending is the end of fear.
- {name} is a courier and protector, not the avatar's champion and not a saviour.
- No living person, group, state or religion is the object of this era. It does not mock any religion's end-times, and it is not an end-times prediction. It is a gentle story of people keeping a road open.
- Violence: none required. The player may carry every earlier skill but the last level asks for them to be put away.

**Level 19. The Night Before the Lamps.** New. Tradition, Legend setting; Invented gameplay.
- Skill: mastery of hands and evasion together.
- Hurdle: a storm-felled road in a dark hill region and travellers frightened of the dark.
- Objective (protect): guide a family of five to a roadside shelter without any member being left more than a few steps behind.
- Unlock: finish the route. Opens level 20.

**Level 20. The Bridge of Many Hands.** New. Tradition, Legend setting; Invented gameplay.
- Skill: staff mastery. The staff steadies the rope, tests planks and signals the crew.
- Hurdle: rushing water and a half-built bridge, with hurry as the danger.
- Objective (collect): relay planks, nails and rope between villagers on both banks until the span is whole.
- Unlock: finish the route. Opens level 21.

**Level 21. The Pass Without a Lamp.** New. Tradition, Legend setting; Invented gameplay.
- Skill: archery and sword mastery, with restraint. The bow sends a line to a ledge. The sword is shown, then sheathed, and is never needed.
- Hurdle: a night pass with loose rock and a flock that will not move in the dark.
- Objective (rescue): send a signal line to a stranded traveller on a ledge and bring them across.
- Unlock: finish the route. Opens level 22.

**Level 22. The Dawn Road (keystone and ending).** New. Tradition, Legend setting; Invented gameplay.
- Skill: mastery as restraint. All five marks of the shunya-arc are tested by whether the player puts them down: open hands are the last "skill".
- Hurdle: a frightened gathering at a hill gate before first light. Any drawn weapon makes the crowd panic, so every tool must stay put away and the player calms the crowd with voice, lamp and steady footing.
- Objective (protect): carry one lamp from the foot of the hill to the gate and keep every person in the lamplight.
- Unlock: finish the route and the objective. Opens the epilogue card. Nothing is shown at the gate except an opening road and the first light.
- Closing hub line (Invented, Legend): "No glory in this. Just a road that stayed open." (47 characters)
- Lamp-keeper Dipika (Invented, Legend): "{name}, the lamp is not for the one who comes. It is for whoever is walking in the dark tonight." (96 characters)

**Epilogue card. The Wheel Turns.** A short text-and-chakra scene, not a level. Tradition, Legend: in the Puranic cycle a new Satya Yuga follows, so the rings turn back to the outer ring. Nothing is predicted. Player options: replay any level, or open "Journey marks" (all five skills as plain-language captions, no trophy).

---

## The full event list (CEO update: capture as many events as we responsibly can)
The ladder above is the playable spine. The list below adds every event, place and practice we can include with a label and a year or "Legend". There are 58 entries: 22 are levels (2 built, 20 planned) and 36 are info-only cards that can be read now and may become levels later. Info-only entries never gate anything.
- Order: the order field is ladder order inside each ring. Legend and Tradition entries follow tradition's order. Dated History entries follow their year. A keystone level always sits last in its ring so the ring gate works, even when its setting is "Legend".
- kind: "level-built" (missions/*.json exists today: levels 10 and 14), "level-planned" (designed here, not built) or "info" (card only, for later).
- Honest limits: the Satya, Treta and Dvapara rings are almost all Legend, so they hold few dated events. The Kali ring is the only one with a real run of years. Dates marked "as reported" or "debated" were not checked in a primary source. Events after 1947 CE, and any living political or religious dispute, are left out until a reviewer agrees.
- needsReview true means the entry is on the "Needs scholarly review" list below, and it should not ship until a reviewer has read it.
- unlockAfter names the one level that must be succeeded at before this level can be played. "Succeeded" means the route is finished, and also the objective when that earlier level has needsObjective true (the keystones).
- Intro text is the card text (see "Intro cards"). Teacher lines are not in the data, they stay in the mission files.

### Satya
```json
[
  {"id": "sat-age", "ring": "satya", "title": "The Satya Yuga", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "The first of the four ages in the Puranic tradition. It is described as an age when dharma stands whole, without strain. The game treats it as a quiet story setting.", "order": 1},
  {"id": "sat-l1", "ring": "satya", "title": "The Still Ford", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 1, "skill": "footing (pre-skill)", "unlockAfter": null, "needsObjective": false, "needsReview": false, "intro": "You carry a water pot across a misty ford of wet stones. Nothing here asks for strength, only a slow and steady walk. Learn footing before anything else.", "order": 2},
  {"id": "sat-churning", "ring": "satya", "title": "The Churning of the Ocean", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A story told in several Puranas, in which many beings pull a great rope together. Where it sits in the ages varies by text. The game only mentions it and shows no one from it.", "order": 3},
  {"id": "sat-indus", "ring": "satya", "title": "Lanes and Drains of Indus Cities", "label": "History", "year": "c. 2600-1900 BCE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Excavated cities such as Mohenjo-daro and Harappa had straight lanes and covered drains. The dates are as reported and were not checked in a primary source. They are inspiration only for the next level.", "order": 4},
  {"id": "sat-l2", "ring": "satya", "title": "The Drain-Lane Dusk", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 2, "skill": "carrying and lane-reading (pre-skill)", "unlockAfter": "sat-l1", "needsObjective": false, "needsReview": false, "intro": "At dusk a narrow lane fills with people carrying water. You carry your load and step aside for others. Gather the counting tablets that fell into the drains.", "order": 5},
  {"id": "sat-lothal", "ring": "satya", "title": "The Basin at Lothal", "label": "History", "year": "c. 2400-1900 BCE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Lothal in Gujarat has a large rectangular basin. Scholars disagree whether it was a dock or an irrigation tank. The game takes no side.", "order": 6},
  {"id": "sat-l3", "ring": "satya", "title": "The Reed Harbour", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 3, "skill": "breath and stillness (pre-skill)", "unlockAfter": "sat-l2", "needsObjective": false, "needsReview": false, "intro": "A reed boat rocks at a quiet quay while the tide turns. Hold still, breathe, and pass the seed jars hand to hand. Hurry would spill them.", "order": 7},
  {"id": "sat-l4", "ring": "satya", "title": "The Teaching Grove", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 4, "skill": "attention (pre-skill)", "unlockAfter": "sat-l3", "needsObjective": true, "needsReview": false, "intro": "Nothing is written here, so you learn a message by ear and carry it unchanged through a dark grove. A wrong word costs only a retry. This is the keystone of the Satya ring.", "order": 8}
]
```

### Treta
```json
[
  {"id": "tre-age", "ring": "treta", "title": "The Treta Yuga", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "The second age in the Puranic tradition. Dharma is described as three parts of four. It is also the age of the Ramayana tradition, whose figures never appear on screen.", "order": 1},
  {"id": "tre-l5", "ring": "treta", "title": "The Southern Road at Dusk", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 5, "skill": "carrying over rough ground (pre-skill)", "unlockAfter": "sat-l4", "needsObjective": false, "needsReview": false, "intro": "A rough forest road at dusk, with monkeys rattling the branches. You carry healing herbs and keep them dry across a stream. The road is a story setting, not a mapped place.", "order": 2},
  {"id": "tre-rama", "ring": "treta", "title": "The Ramayana Tradition", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A long-loved epic, told in many languages and versions. The game only refers to it and shows none of its people. Please read it in its own retellings.", "order": 3},
  {"id": "tre-l6", "ring": "treta", "title": "The Camp of Stone and Rope", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 6, "skill": "teamwork and relay (pre-skill)", "unlockAfter": "tre-l5", "needsObjective": false, "needsReview": true, "intro": "Workers haul stone and rope by the sea in the tradition of the great causeway. You bring them water and cloth. Only the labour is shown, never any figure from the story.", "order": 4},
  {"id": "tre-shoals", "ring": "treta", "title": "The Shoals Called Rama Setu", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A chain of shoals between India and Sri Lanka is known by this name and as Adam's Bridge. It is sacred to many people. The game gives no account of how it formed.", "order": 5},
  {"id": "tre-fire", "ring": "treta", "title": "Household and Altar Fire", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Keeping a hearth fire is an old practice in many households and rites. Later Vedic fire altars are dated by scholars to different centuries. The dates were not checked here.", "order": 6},
  {"id": "tre-l7", "ring": "treta", "title": "The Hall of Small Fires", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 7, "skill": "stillness and carrying a flame (pre-skill)", "unlockAfter": "tre-l6", "needsObjective": false, "needsReview": false, "intro": "One ember in a clay pot must last until dawn in a windy hall. Keep it small, keep it fed, and keep the village asleep.", "order": 7},
  {"id": "tre-ayur", "ring": "treta", "title": "Herbal Medicine and Ayurveda", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Ayurveda is a living medical tradition with old texts such as the Charaka and Sushruta compilations. Their dates are debated and were not checked here. The game uses it only as inspiration.", "order": 8},
  {"id": "tre-l8", "ring": "treta", "title": "The Herb Path", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 8, "skill": "stillness (pre-skill)", "unlockAfter": "tre-l7", "needsObjective": true, "needsReview": false, "intro": "At night in the forest a child is lost, and a bell is the only guide. Stay calm so that startled animals pass by. This is the keystone of the Treta ring.", "order": 9}
]
```

### Dvapara
```json
[
  {"id": "dva-age", "ring": "dvapara", "title": "The Dvapara Yuga", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "The third age in the Puranic tradition. Dharma is described as half. The Mahabharata tradition sets its great war near the end of this age.", "order": 1},
  {"id": "dva-hastinapur", "ring": "dvapara", "title": "Hastinapur, Period II", "label": "History", "year": "c. 1100-800 BCE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": false, "intro": "Excavations at Hastinapur found a settlement with Painted Grey Ware pottery, dated by the archaeologist Lal to these years. The level uses it as its backdrop.", "order": 2},
  {"id": "dva-l9", "ring": "dvapara", "title": "The Well-Rope at Dawn", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 9, "skill": "bare hands: stance and fall", "unlockAfter": "tre-l8", "needsObjective": false, "needsReview": false, "intro": "A crowded village well at dawn, with a pulling rope and a slick stone curb. Learn how to stand and how to fall. Help a villager up without dropping the bucket.", "order": 3},
  {"id": "dva-l10", "ring": "dvapara", "title": "Escape from Hastinapur", "label": "Invented", "year": "Legend", "kind": "level-built", "level": 10, "skill": "bare hands: grip-break and safe fall", "unlockAfter": "dva-l9", "needsObjective": false, "needsReview": false, "intro": "On the eve of the great war you carry a farm villages' grain plea through a crowded lamp bazaar. Free your sleeve without striking anyone. Reach the east gate before dawn.", "order": 4},
  {"id": "dva-2021", "ring": "dvapara", "title": "Hastinapur Excavation 2021-22", "label": "History", "year": "c. 1500-1000 BCE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A recent excavation reports an earlier Painted Grey Ware layer. The date comes from a summary, and the report was not read. It is shown only as reported.", "order": 5},
  {"id": "dva-l11", "ring": "dvapara", "title": "The Lac-House Lane", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 11, "skill": "bare hands under pressure", "unlockAfter": "dva-l10", "needsObjective": false, "needsReview": true, "intro": "A thatch fire runs along a lane of wooden houses. You wet roofs and guide neighbours through smoke. Nobody is at fault in this version.", "order": 6},
  {"id": "dva-embassy", "ring": "dvapara", "title": "The Peace Embassy", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "In the epic tradition an envoy goes to Hastinapura to plead for peace before the war. Versions differ. No one from it is shown.", "order": 7},
  {"id": "dva-l12", "ring": "dvapara", "title": "The Ferry at the Sea City", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 12, "skill": "bare hands mastery", "unlockAfter": "dva-l11", "needsObjective": false, "needsReview": true, "intro": "A sea city on the western coast is said in tradition to have gone under the water. The game makes no claim about any real site. You ferry families' bundles up the high steps.", "order": 8},
  {"id": "dva-war", "ring": "dvapara", "title": "The Great War", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "The Mahabharata tradition tells of a war between two branches of a family. The game gives no date for it and shows none of it. It is read about, never played.", "order": 9},
  {"id": "dva-l13", "ring": "dvapara", "title": "The Water-Bearers' Road", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 13, "skill": "bare hands, tested", "unlockAfter": "dva-l12", "needsObjective": true, "needsReview": true, "intro": "After the noise of war, tired people walk a long road at dusk. You carry water and cloth to three resting places. No one is turned away, and this is the keystone of the Dvapara ring.", "order": 10}
]
```

### Kali
```json
[
  {"id": "kal-start", "ring": "kali", "title": "The Start of the Kali Yuga", "label": "Tradition", "year": "3102 BCE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Puranic reckoning counts the Kali Yuga from this year, after the Dvapara Yuga ends. Other schools use different cycles and dates. The game treats it as a story setting.", "order": 1},
  {"id": "kal-buddha", "ring": "kali", "title": "The Buddha", "label": "History", "year": "c. 5th century BCE (dates debated)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Siddhartha Gautama taught in the Ganga plain. Scholars disagree by several decades about his dates. The game only names him and shows no one.", "order": 2},
  {"id": "kal-mahavira", "ring": "kali", "title": "Mahavira", "label": "History", "year": "c. 6th-5th century BCE (dates debated)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Mahavira is honoured as the last teacher of the Jain tradition of this age. His dates differ between sources. The game only names him and shows no one.", "order": 3},
  {"id": "kal-alex", "ring": "kali", "title": "Alexander in the Punjab", "label": "History", "year": "326 BCE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A Macedonian army crossed into the Punjab and fought at the Hydaspes river. The date is from general knowledge and was not checked here.", "order": 4},
  {"id": "kal-mauryan", "ring": "kali", "title": "The Mauryan Empire", "label": "History", "year": "c. 321-185 BCE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A large empire ruled from Pataliputra, with a wide road network. The dates are approximate and were not checked here.", "order": 5},
  {"id": "kal-l14", "ring": "kali", "title": "The Night Report of Pataliputra", "label": "Invented", "year": "Legend", "kind": "level-built", "level": 14, "skill": "evasion", "unlockAfter": "dva-l13", "needsObjective": false, "needsReview": true, "intro": "On a monsoon night you carry a ferry clerk's report past a doubled watch to a sluice house. The secret is only a jammed sluice and a rising river. Ease the watch's eyes, never fight.", "order": 6},
  {"id": "kal-wall", "ring": "kali", "title": "Pataliputra's Timber Wall", "label": "History", "year": "c. late 4th-early 3rd century BCE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Megasthenes wrote of a wooden wall and a wide ditch. His book is lost and survives through later writers. Waddell found timber palisade remains near Patna in 1892-1899 CE.", "order": 7},
  {"id": "kal-arth", "ring": "kali", "title": "The Arthashastra", "label": "Tradition", "year": "Contested", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A text on statecraft traditionally credited to Kautilya, with a chapter on spies. Its author and date are disputed. The game borrows only a mood.", "order": 8},
  {"id": "kal-ashoka", "ring": "kali", "title": "Ashokan Edicts", "label": "History", "year": "c. 257 BCE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Edicts carved on rock and pillars speak of wells dug and trees planted along roads. The date comes from a summary and no translation was read.", "order": 9},
  {"id": "kal-sangam", "ring": "kali", "title": "Sangam Literature", "label": "History", "year": "c. 300 BCE-300 CE (dates debated)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Early Tamil poems of the south sing of harbours, hills and trade. Scholars date them differently. The next level borrows only the setting.", "order": 10},
  {"id": "kal-l15", "ring": "kali", "title": "The Hill Stream and the Harbour Road", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 15, "skill": "staff", "unlockAfter": "kal-l14", "needsObjective": false, "needsReview": true, "intro": "A swollen stream and a rope bridge stand between a caravan and the harbour. Learn to use a staff to steady and to guide. Collect the pepper sacks before the tide.", "order": 11},
  {"id": "kal-silambam", "ring": "kali", "title": "Silambam", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A staff art of Tamil country, named after the silambu bamboo. Sources say it is old, but the exact age is not agreed. No move is copied in the game.", "order": 12},
  {"id": "kal-gupta", "ring": "kali", "title": "The Gupta Age", "label": "History", "year": "c. 320-550 CE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A period of large states in north India, known for coins, temples and learning. The game uses it as a backdrop for the forge road.", "order": 13},
  {"id": "kal-pillar", "ring": "kali", "title": "The Iron Pillar of Delhi", "label": "History", "year": "c. 4th-5th century CE (debated)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A tall wrought-iron pillar that has stayed free of heavy rust. Its date and its first location are debated. It is never shown in a way that copies a real inscription.", "order": 14},
  {"id": "kal-l16", "ring": "kali", "title": "The Forge Road", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 16, "skill": "sword", "unlockAfter": "kal-l15", "needsObjective": false, "needsReview": false, "intro": "A smith's yard at night, a toppled cart of hot iron and a village's bridge nails to finish. The blade blocks a pole and cuts a rope, then goes back in its sheath. Keep the bellows going until dawn.", "order": 15},
  {"id": "kal-aryabhata", "ring": "kali", "title": "Aryabhata", "label": "History", "year": "born 476 CE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A mathematician and astronomer of the Gupta age. The date comes from general knowledge and was not checked here.", "order": 16},
  {"id": "kal-nalanda", "ring": "kali", "title": "Nalanda", "label": "History", "year": "c. 5th century CE onward (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A great centre of learning in eastern India. The founding date is as reported and was not checked here.", "order": 17},
  {"id": "kal-brahmagupta", "ring": "kali", "title": "Brahmagupta and Zero", "label": "History", "year": "628 CE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "His text sets out rules for working with zero. This is the idea behind the traveller's shunya start. It is only a starting image in the game.", "order": 18},
  {"id": "kal-chola", "ring": "kali", "title": "The Chola Age", "label": "History", "year": "c. 850-1279 CE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A south Indian empire known for temples and large irrigation works. Which tank and which century were not checked here.", "order": 19},
  {"id": "kal-l17", "ring": "kali", "title": "The Tank and the Sluice", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 17, "skill": "archery", "unlockAfter": "kal-l16", "needsObjective": false, "needsReview": true, "intro": "A flood night at a delta tank, with a fouled sluice rope out of reach. Learn to hold a breath and send a line across with an arrow. Draw a stranded boat to shore.", "order": 20},
  {"id": "kal-brihad", "ring": "kali", "title": "The Brihadisvara Temple", "label": "History", "year": "c. 1010 CE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A great Chola temple at Thanjavur. The date comes from general knowledge and was not checked here.", "order": 21},
  {"id": "kal-sultan", "ring": "kali", "title": "Sultanate and Mughal Periods", "label": "History", "year": "c. 1206-1857 CE", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "Centuries of rule from Delhi and other courts, with new trade, building and art. The period is complex and is told here in neutral terms. It needs expert review.", "order": 22},
  {"id": "kal-vijay", "ring": "kali", "title": "Vijayanagara", "label": "History", "year": "c. 1336-1646 CE (as reported)", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "A southern empire with a capital at Hampi. The dates are as reported and were not checked here.", "order": 23},
  {"id": "kal-1947", "ring": "kali", "title": "Independence of India", "label": "History", "year": "15 August 1947", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "India became independent from British rule on this date. It was also the year of Partition, which caused great suffering. The game keeps this card factual and needs expert review.", "order": 24},
  {"id": "kal-l18", "ring": "kali", "title": "The Lamp Road of the River Fair", "label": "Tradition", "year": "Legend", "kind": "level-planned", "level": 18, "skill": "mastery rehearsal", "unlockAfter": "kal-l17", "needsObjective": true, "needsReview": true, "intro": "A great crowd walks a lamp-lit road beside a rising river, and fear spreads faster than the water. Use what you have learned, or better, put it down. This is the keystone of the Kali ring.", "order": 25}
]
```

### Kalki
```json
[
  {"id": "klk-prophecy", "ring": "kalki", "title": "Kalki in the Puranas", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "The Vishnu and Bhagavata Puranas list Kalki as the final avatar, expected at the end of the Kali Yuga. The accounts differ, and no one is shown in the game. It is a story of hope, not a prediction.", "order": 1},
  {"id": "klk-l19", "ring": "kalki", "title": "The Night Before the Lamps", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 19, "skill": "hands and evasion mastery", "unlockAfter": "kal-l18", "needsObjective": false, "needsReview": false, "intro": "A storm has felled the road in a dark hill region. You guide one frightened family to a shelter. Everyone arrives together.", "order": 2},
  {"id": "klk-l20", "ring": "kalki", "title": "The Bridge of Many Hands", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 20, "skill": "staff mastery", "unlockAfter": "klk-l19", "needsObjective": false, "needsReview": false, "intro": "Villagers on both banks are finishing a bridge over rushing water. You relay planks, nails and rope. The staff steadies, and hurry is the danger.", "order": 3},
  {"id": "klk-l21", "ring": "kalki", "title": "The Pass Without a Lamp", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 21, "skill": "archery and sword mastery, with restraint", "unlockAfter": "klk-l20", "needsObjective": false, "needsReview": false, "intro": "A night pass with loose rock and a stranded traveller on a ledge. A bow sends a line across, and a sword stays in its sheath. Nobody is hurt.", "order": 4},
  {"id": "klk-l22", "ring": "kalki", "title": "The Dawn Road", "label": "Invented", "year": "Legend", "kind": "level-planned", "level": 22, "skill": "mastery as restraint", "unlockAfter": "klk-l21", "needsObjective": true, "needsReview": true, "intro": "A frightened gathering waits at a hill gate before first light. Put every tool away and keep each person in the lamplight. Nothing is shown at the gate except an opening road.", "order": 5},
  {"id": "klk-wheel", "ring": "kalki", "title": "The Wheel Turns", "label": "Tradition", "year": "Legend", "kind": "info", "level": null, "skill": null, "unlockAfter": null, "needsObjective": false, "needsReview": true, "intro": "In the Puranic cycle a new Satya Yuga follows the Kali Yuga. The game predicts nothing. It only shows the rings turning back to the start.", "order": 6}
]
```

## Zoom levels on the time chakra
The chakra zooms in three steps. Every step has a button, a keyboard key and a list alternative, so touch, keyboard and screen-reader users reach the same content.
1. Zoom 0, the whole chakra of yugas. Five rings with a ring header each: name, "Tradition" and the count "2 of 5 levels done". Info-only events are not drawn here, only the level nodes' progress. Tapping a ring zooms to it.
2. Zoom 1, one yuga as a ring of events. Every event of that ring is a node, in the order field. Level nodes show "Level 10" and info nodes show "Info", both as text and a different outline shape. Each node shows its title and its year label as text. Tapping a node zooms to its card.
3. Zoom 2, one event with its year. The card shows the title, year label, introduction and status (see "Intro cards"), and a Play button for levels.
- Zoom to a year: Zoom 1 has a "Go to year" field and a slider for the ring's dated events. Entering a year jumps to the nearest event and says so in text and to screen readers: "Showing the nearest event to 300 BCE: Ashokan Edicts, c. 257 BCE." Years are entered with a BCE or CE choice.
- Legend entries have no year, so each ring has a "Legend" band before its dated events, and the year slider skips it. In Satya, Treta and Dvapara most entries live there, so the year zoom will have little to show. The card says "Legend", never an invented year.
- Controls: plus and minus buttons at least 44px, pinch or double-tap on touch, plus and minus keys and Escape (one step out) on keyboard. Zoom changes are announced in text, for example "Zoomed to Kali Yuga, 25 events."
- Reduced motion: zoom is an instant change, not a flight. The list view works at every zoom and is the default at 360px width.

## Intro cards and the unlock rule
Locked events are still tappable. Anyone can read the introduction and details of any event. A level can be played only once the player has succeeded at the level named in its unlockAfter.

Card content rule, the same for every event:
- Title: at most 40 characters.
- Year label as text: for example "History, c. 300 BCE", "Tradition, Legend" or "Invented, Legend".
- Introduction: two or three plain sentences, no jargon and no spoilers of the ending. A card never shows any epic figure, deity or the Kalki avatar in art or voice. The intro may name them in text only, briefly and respectfully. The card for any event says "as reported" or "debated" wherever the data does.
- Status text, exactly one of: "Open" (a level that can be played now), "Done" or "Done, objective complete" (a level played), "Locked: finish X first" (X is the title of the unlockAfter level, and when that level's needsObjective is true, "Locked: finish X, including its objective, first"), and "Info only: not playable yet" for info cards.
- A Play button on level cards only. When the level is locked the button is aria-disabled, not removed, and stays focusable, with the status text as its description.
- Status never relies on colour. It is text plus a distinct outline and icon (the UI note below).

Unlock rule that applies:
- Level 1 is Open from the start.
- Each other level opens when the level in its unlockAfter is succeeded at. The first level of each ring (levels 5, 9, 14, 19) follows the previous ring's keystone, so a ring opens only when the keystone before it is done including its objective.
- Info-only cards are always readable and never lock.
- No permanent lock-out: a failed attempt can be retried and an assist setting is available.
- Progress is saved in localStorage and validated when read, like the traveller choice (docs/decisions.md, item 9). A damaged save falls back to level 1 Open without crashing.

How a locked card is announced to screen readers:
- On the chakra, each node is a button whose accessible name carries the whole state, in this order: type and number, title, ring, label, status. For example: "Level 11, The Lac-House Lane, Dvapara Yuga, Tradition, Legend. Locked: finish Escape from Hastinapur first. Press Enter to read."
- Opening the card moves focus to its heading. The card is a dialog with the heading as its name and the status text as part of its description. Escape closes it and returns focus to the node.
- If the player presses Play on a locked level, nothing starts and a polite live region says the status text again: "Locked: finish Escape from Hastinapur first." Locking is never announced as an error.
- When a level is completed, a polite live region says "Level 10 done. The Lac-House Lane is now open."
- Info cards are announced as "Info", with the status "Info only: not playable yet".

## Edits to existing missions (need approval before any file is touched)
- Level 10: move the stance part of Suvrata's lesson to level 9, and add the lantern-and-child objective (docs/shunya-arc.md, Era 1). Her opening line may need to change because the player will already know the stance.
- Level 14: add the porter-rescue objective, Vasuka's position question from docs/story.md, and the relay-signal finale (still open).
- Both missions need their ring and level number added as data so the hub can place them.

## Time chakra UI note (for the designer and developer; prototypes/time-chakra/)
- Eras are rings. Five concentric rings, Satya outermost and Kalki at the centre, so the climb is a walk inward to the hub where the wheel turns. If design prefers an upward climb, the order must stay Satya first and Kalki last.
- Levels are nodes on their ring, in level order, clockwise. Each node shows a level number, a short name and a text state: "Locked", "Open", "Done" or "Done, objective complete". The state is never colour alone. Each state also has its own shape and outline: locked is a dashed outline with a lock icon, open is a solid outline, done is a double outline with a tick, and objective complete adds a small ring mark with the word "Objective".
- A locked node is still tappable and opens its intro card (see "Intro cards and the unlock rule"). Its text reason is on the node, for example "Locked: finish The Lac-House Lane first."
- Each node's detail panel shows its label as text: "Tradition, Legend", "History, c. 300 BCE" or "Invented, Legend". The ring header shows the yuga name and "Tradition" with no date claim.
- Mobile first at 360px: rings are too small for touch targets, so under about 480px the hub shows an expandable list of five ring sections with nodes as 44px-or-larger rows. A rings view is an option, not the only way in.
- Keyboard: Tab enters the chakra, arrow keys move around a ring, Page Up and Page Down move between rings, Enter opens a node, Escape closes it. Visible focus on every node.
- Screen reader names, for example: "Ring 3 of 5, Dvapara Yuga, 2 of 5 levels done. Level 10, Escape from Hastinapur, Open, Invented, Legend." Progress is announced when a node changes state.
- Reduced motion: the rings do not spin, glow or pulse. A node changing state is a text change with a brief fade at most, and none when motion is reduced.
- The Kalki ring never shows a figure, horse, sword or silhouette in its art. Its centre shows a plain lamp and the closing line only after level 22.

## Sources
Read on 2026-11-22 (Wikipedia summaries, not primary sources):
- Wikipedia, "Kalki": Kalki is listed in the Vishnu and Bhagavata Puranas; birth in Shambhala to Vishnuyashas and Sumati is from the Kalki Purana; he ends Kali Yuga and begins Satya Yuga; the Vayu Purana names Pramiti; the Yuga Purana omits Kalki; no Maha Purana gives a systematic account (Dimmitt).
- Wikipedia, "Yuga cycle": Puranic durations, the 3102 BCE start of Kali, and alternative cycles by Sri Yukteswar, Guenon and Danielou.
- Wikipedia, "Lothal": c. 2400-1900 BCE urban period; the dock versus irrigation tank debate (Leshnik 1968, Yule 1982).
- docs/story.md, docs/shunya-arc.md, docs/decisions.md for existing eras, teachers and rules.
- Web searches also returned pages on Dholavira, the Matsya and Brahmanda Puranas and Britannica's "Krta Yuga". Only the result titles were seen. They were not read and nothing here relies on them.

## Needs scholarly review
- Kalki, all of ring 5: which Purana to follow, the contested parentage and the Vayu Purana variant. A reviewer from the Vaishnava and Puranic traditions must confirm the era is respectful, that "the avatar is never shown" is acceptable as a treatment, and that calling it "Tradition (prophesied)" is right. Also check no other living tradition's end-times claim (for example Buddhist Shambhala or Kalachakra material, which the Wikipedia summary only notes in passing) is mixed in.
- Yuga durations and the 3102 BCE start: taken from a Wikipedia summary. The mismatch between the yuga reckoning and the dated archaeology (Hastinapur, Pataliputra) is called out in the file but needs a scholar's wording.
- Whether the ring placement for level 10, an event of the Dvapara-to-Kali turn in tradition, should be Dvapara or the first level of Kali.
- Satya and Treta levels: all are Invented stories set in a Tradition. The wording "dharma whole" (Satya) and "three parts of four" (Treta) is general knowledge and was not checked against a text.
- Levels 2 and 3: Indus-tradition cities (c. 2600-1900 BCE) are inspiration only. The date range was not checked against a primary source, and it is not agreed that Indus cities relate to the Vedic or Puranic ages. A reviewer should decide if they belong in Satya at all.
- Lothal basin: dock versus irrigation tank is debated (Wikipedia summary). The game takes no side.
- Level 6 (Ramayana causeway): a sacred living tradition. Depicting it as labour only, with no figure, needs a reviewer's approval, or the level should be dropped.
- Level 11 (lac-house): the Mahabharata episode is reduced to a fire. A reviewer should confirm the change is respectful.
- Level 12 (sea city) and level 13 (aftermath of the war): the submerged-city claims are contested, and the Gita is left out on purpose. A reviewer should confirm the treatment of a scene near the tradition's most sacred text.
- Level 18 (river fair): a living festival, kept generic. A reviewer should confirm it does not resemble a specific fair or pilgrimage in a way that would be unwelcome.
- Level 7: the dates of household fire practice and later Vedic altars were not checked.
- Level 8: Ayurveda as inspiration only. Dates debated, not checked.
- Oral transmission of the Vedic texts (level 4): the claim that they were kept by memory for a long time is general knowledge and was not checked.
- Invented teacher names (Sumedha, Vanya, Dipika are new; Revati, Poonkodi, Ayasa, Tamarai are from docs/shunya-arc.md): check each for region and period fit and that none is a deity's name used as a person's.
- Everything inherited from docs/shunya-arc.md ("Needs scholarly review") still applies to levels 14 to 17.

## Added for the CEO's update
- Sources: the same Wikipedia summaries listed above. No new web search was run for the added entries, so every year marked "as reported", "debated" or "general knowledge" in the data is unchecked.
- Needs scholarly review (added): every entry with needsReview true in the data. In particular the Buddha and Mahavira dates, Alexander 326 BCE, the Mauryan dates, Aryabhata 476 CE, Nalanda, the Brihadisvara date, the Vijayanagara dates, the Sultanate and Mughal entry (a neutral summary of a sensitive period), and the 1947 entry (a card that mentions Partition). A reviewer should also decide whether the Sultanate, Mughal and 1947 cards belong in the game at all.
- Info-only cards that name real religious teachers (Buddha, Mahavira) and sacred epics: they show text only, never a figure.
