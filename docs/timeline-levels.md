# Timeline levels: the climb from Satya to the Kalki dawn

Status: design draft for CEO review. Nothing here is in missions/*.json yet, and no code was written or run.
Label key: History, Tradition or Invented, each with a year or "Legend". Dialogue uses {name} and is at most 140 characters.
Rules inherited: docs/decisions.md items 1, 11, 12; docs/shunya-arc.md (defence only, restrained violence, invented mortal teachers); docs/story.md (the traveller is a courier, "No glory in this. Just a road that stayed open.").

## The CEO's direction, as designed (Invented, Legend)
Every event, place or practice on the timeline is a level. The thrill is the climb through the eras to the latest, Kali Yuga, and then the Kalki era. The ladder is ordered by the yuga timeline in tradition: Satya, Treta, Dvapara, Kali, then the Kalki era. There are 22 playable levels and one epilogue card.

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
- Unlock rule, same for every level: the next level opens when the route is finished. The last level of each ring is its keystone and its objective must also be done, or the ring seal is not earned and the next ring stays closed. No permanent lock-out: a failed objective can be retried, and an assist setting (more time, wider windows) is available, which keeps the gate fair for players who need it.
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

## Edits to existing missions (need approval before any file is touched)
- Level 10: move the stance part of Suvrata's lesson to level 9, and add the lantern-and-child objective (docs/shunya-arc.md, Era 1). Her opening line may need to change because the player will already know the stance.
- Level 14: add the porter-rescue objective, Vasuka's position question from docs/story.md, and the relay-signal finale (still open).
- Both missions need their ring and level number added as data so the hub can place them.

## Time chakra UI note (for the designer and developer; prototypes/time-chakra/)
- Eras are rings. Five concentric rings, Satya outermost and Kalki at the centre, so the climb is a walk inward to the hub where the wheel turns. If design prefers an upward climb, the order must stay Satya first and Kalki last.
- Levels are nodes on their ring, in level order, clockwise. Each node shows a level number, a short name and a text state: "Locked", "Open", "Done" or "Done, objective complete". The state is never colour alone. Each state also has its own shape and outline: locked is a dashed outline with a lock icon, open is a solid outline, done is a double outline with a tick, and objective complete adds a small ring mark with the word "Objective".
- A locked node shows a text reason, for example "Locked: finish The Lac-House Lane." A locked ring shows "Locked: seal the Dvapara ring."
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
