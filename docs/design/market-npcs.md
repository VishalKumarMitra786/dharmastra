# Market NPCs: talk to anyone, and the market feels alive

Status: design for CEO review and developer hand-off. Nothing here is built. No file in src/, index.html, missions/ or tests was changed.
Data: [../../data/npcs/market.json](../../data/npcs/market.json) holds every line, name, stock item, task and reaction. This doc explains the rules. Where the two differ, fix the doc.
Label key: History, Tradition or Invented, each with a year or "Legend" (CLAUDE.md).
Text rule: every in-game string is 80 characters or fewer, plain words, `{name}` for the player. The data file was checked by script (see the end).

## 0. Things to know before building
1. Conflict with a past decision. docs/decisions.md item 12 says "Violence is self-defence only". The CEO now asks for shove, steal and hit on any NPC. This design allows them, but makes them costly (Dharma standing), blocks them on three respect groups (child, elder, priest), makes "hit" an open hand that never wounds, and never kills. The CEO must confirm (open question 1).
2. The Hunt is not the market. Hunt soldiers (grey cord, docs/design/levels-v2.md) are enemies. Market guards are the city or road watch, who are friendly by default. Hunt fights never change Dharma standing. Civilians flee from Hunt fights.
3. Skills come in the shunya order (hands, then crouch, staff, sword, bow). Market items that need a skill (arrow bundle needs the bow, spare staff needs the staff) are hidden until that skill is granted. "Crouch cover" in the witness rules only works after crouch.
4. No ruler or epic figure is shown or named. No deity is a shopkeeper, a name or a joke. Name pools were screened against a list of deity names (see section 9).
5. Levels are not edited. Optional hooks into levels are listed in section 8.

## 1. Interaction: verbs on every NPC
Every NPC in the market can be tapped, so the player can talk to anyone. Protected NPCs still open a menu.

### 1.1 Contextual menu (4 choices at most)
| Verb | Shows when | What it does |
|---|---|---|
| Talk | always | Opens a 2 to 3 step talk tree (section 3.2) |
| Ask | the NPC has a rumour and standing is not Shadowed | One rumour or hint about the level's route or danger |
| Trade | the NPC has goods and is not hostile | Buy at the standing price. Sell back at 50 percent of base |
| Help | the NPC has a tiny task available, active or ready | Offer, progress and hand-in for the side task |

Rules:
- Show only choices that apply. Never show a greyed-out choice. Talk is always present, so 1 to 4 buttons show.
- Buttons are at least 44 px tall. Keys 1 to 4 pick, Esc closes. Menu text uses the NPC's name and role as the accessible name.
- Opening the menu pauses the world and the level clock (WCAG 2.2.1, timing).
- Which archetypes show Trade: lamp seller, spice seller, potter, cloth merchant, fruit seller, water carrier, blacksmith. The other seven show Talk, Ask and Help (3 buttons).

### 1.2 World actions (no menu)
| Action | Input | Range | Effect |
|---|---|---|---|
| Greet | tap Greet or key G | 3 m | Namaste (hands joined) or a nod. NPC turns Warm for 2 minutes. No standing change |
| Follow | hold or toggle | 3 m | NPC walks beside you up to 60 s. Used by elder and child tasks. Wary NPCs refuse |
| Give | pick an item, tap the NPC | 2 m | Hands over one item. Standing +1, once per NPC per level. Ends an angry NPC's anger |
| Take | tap the "Catch!" prompt, or pick up a dropped item | 2 m | Catch an item an NPC tosses to you, or pick one up. Costs nothing |
| Shove | the existing Push key (V) | 1.2 m | Short push. See section 4 |
| Take unseen (steal) | hold Do on a stall item while the NPC looks away | 1.2 m | Take one item without paying |
| Strike (hit) | light cut key (J), unarmed only | 1.2 m | Open-hand blow. Stagger only. No damage. Weapons are never used on bystanders |

"Take a thrown item" is read here as catching or picking up items NPCs toss to the player (a fruit seller tossing a fruit, a child's ball, a dropped bundle from a fleeing thief). If the CEO meant something else, see open question 4.

Protected NPCs (child, elder, priest): shove, steal and hit are refused with the line "That is not your way, {name}." Nothing happens and standing does not change. This is respect, not a penalty.

Accessibility for actions: every action has a visible button as well as a key. Targets are 44 px. Actions announce their result in text (caption bubble plus a polite live region).

## 2. Standing: the Lamp of Dharma (one icon)
One icon: a lamp. A taller flame means higher standing. Tooltip and caption: "Kind acts light your lamp. Harm makes it dim." (40 characters). It also shows a word (Radiant, Bright, Steady, Dim, Shadowed) and the number on focus, so it never relies on colour. Reduced motion: no flicker or pulse, text only.

Range -6 to +6, start 0. Clamp at both ends. Reset at the start of each level (open question 2).

| Event | Change | Notes |
|---|---|---|
| Finish a side task | +2 | once per task |
| Give a gift | +1 | once per NPC per level |
| Kind act (help up a fallen NPC, return a dropped item, share water) | +1 | |
| Return a stolen item to its owner | +2 | |
| Shove, witnessed | -1 | the first one each level is a free warning (0) |
| Steal, witnessed | -3 | |
| Steal, no witness | -1 | "Dharma sees all", a smaller mark |
| Hit | -3 | the victim always witnesses |
| Catch or shove a marked task thief | 0 | lawful |

Recovery: below 0, standing rises 1 every 3 minutes toward 0. It does not rise above 0 on its own. Positive standing does not decay. An NPC you harmed stays Wary (no trade, no help) until you Give them something.

| Tier | Standing | Prices (buy / sell) | NPC mood and barks | Guard behaviour |
|---|---|---|---|---|
| Radiant | +5 to +6 | x0.85 / x1.10 | warm barks, NPCs greet first, one extra task offer | 2 warnings, 8 s before turning hostile, accepts an apology |
| Bright | +3 to +4 | x0.90 / x1.05 | warm barks | 1 warning, 6 s, accepts an apology |
| Steady | 0 to +2 | x1.00 / x1.00 | normal barks | 1 warning, 4 s, accepts an apology |
| Dim | -1 to -3 | x1.15 / x0.90 | cold barks | no warning, 2 s |
| Shadowed | -4 to -6 | x1.30 / x0.75 | cold barks, Ask gives only a warning | no warning, hostile at once, challenges you on sight within 6 m |

A hostile guard chases. If he catches you: stolen items go back, you pay up to 5 coins, no jail, no death, standing is unchanged. He gives up after 10 seconds out of sight.

Fairness checks: the first witnessed shove is free; harm is never hidden (you see the lamp dim and read why); good standing is earned by short, doable tasks; the penalty for harm can be undone by gifts and good deeds. Standing never blocks the main mission route. Even at Shadowed, the player can still finish the level (Talk, Ask warnings and the mission NPCs still work).

## 3. The 14 archetypes
Full lines are in the data file. Look tags in the data: age, build, six skin tones, garment, headgear. Skin tone, build and name are chosen at random and are never tied to the job or to status (stereotype rule). Names are 4 per archetype per era (224 in all).

### 3.1 Summary
| Archetype id | Personality | Sells or gives | Side task and reward | Protected |
|---|---|---|---|---|
| lamp_seller | patient, chatty, careful with fire | lamp, oil | Carry a lit lamp 40 m without it going out: a free lamp, +2 | no |
| spice_seller | sharp, fair, warm after trust | spice (pepper or era goods) | Chase a thief and get the pouch back (40 s): spice x2, 3 coins, +2 | no |
| potter | calm, exact | pot | Carry two pots to the well, no fall: a pot, +2 | no |
| cloth_merchant | smooth, honest | rope, cloth strip (bandage) | Deliver a bundle to the scribe: a rope, +2 | no |
| fruit_seller | cheerful, generous | heal fruit, jaggery sweet | Gather three rolled fruits: heal fruit x2, +2 | no |
| water_carrier | quiet, steady | cup of water | Carry water to the guard post: 3 coins, +2 | no |
| child | curious, bold | gives a sweet | Find a lost anklet (jingle plus a visible sparkle): a sweet, a bonus rumour, +2 | yes |
| elder | gentle, slow, wise | gives a sweet | Walk the elder to the bench (follow): a sweet, a bonus rumour, +2 | yes |
| musician | dreamy, generous | tip only | Fetch a cord from the cloth seller: 3 coins, 60 s song buff, +2 | no |
| scribe | precise, dry | none | Carry a note to the guard post: 3 coins, +2 | no |
| blacksmith | gruff, fair | arrow bundle (needs bow) | Hold Do to work the bellows (60 s): 3 arrows (if bow) else 4 coins, +2 | no |
| priest | calm, kind, never pushes | a blessing | Set three small lamps on the steps: a blessing (heal 1 heart), +2 | yes |
| storyteller | warm, dramatic | none | Collect a saying from three NPCs: 3 coins, a bonus rumour, +2 | no |
| town_guard | stern, fair | spare staff (loan, needs staff) | Return a found purse to the fruit seller: staff loan or 4 coins, +2 | no |

Task rules: every task is tiny (40 to 180 seconds), optional, never blocks the mission, has no fail penalty (the NPC just says a kind fail line), and can be done once. The thief in the spice task is a marked task thief, so catching him is lawful.

Item notes: heal fruit restores 2 hearts. The blessing heals 1 heart and nothing else, so it cannot cheapen the gold rank (gold needs 0 hits). No item gives a combat advantage the level did not already allow.

Rewards need these NPCs to exist in the scene together: scribe (for the cloth task), guard (scribe, water carrier), fruit seller (guard), cloth merchant (musician). If a target is missing, the developer hides that task.

### 3.2 Talk tree (2 to 3 steps)
Step 1: the NPC's era line (`variants[id].talk`). Step 2: two player choices with replies. Step 3: one follow-up on the first choice. Then the goodbye line. Max 4 buttons at each step (here 2 plus Back).
Example, any era, blacksmith:
1. "Mind the sparks, {name}. What can I forge or mend?" (Gupta variant)
2. Choice "What do you make?" gives "Hooks, nails and tool tips. Honest iron."
3. Follow-up "Is it hot work?" gives "Hot, loud and good. I would not swap."
Then "Mind the sparks, {name}."

### 3.3 Idle barks
Each archetype has 6 barks per era (336 in all). Rules: show as a caption bubble (and read by screen readers politely) only when the NPC is within 6 m and in view. At most one bark every 4 s on screen. An NPC repeats none until all 6 are used. Audio barks (if added) must have the same caption. Mood barks (one warm, one cold per archetype) replace idle barks at Bright/Radiant and Dim/Shadowed.

## 4. Reactions to the player's acts
Acts: greet, gift, shove, theft, violence (hit). Response codes: return_namaste, nod, thank, scold, flee, flee_and_shout (flee and call the guard), shout_guard (shout and chase for a few seconds), fight_back (a hard shove back, never a weapon), warn, hold_player (guard stops you), forgive, blocked (action refused).

| Archetype | Greet | Gift | Shove | Theft | Violence |
|---|---|---|---|---|---|
| lamp_seller | namaste | thank, +1 | scold | shout_guard, chase 6 s | flee_and_shout |
| spice_seller | namaste | thank | scold | shout_guard, chase 8 s | flee_and_shout |
| potter | namaste | thank | scold, may break a shelf pot (you pay 3 coins) | shout_guard | flee_and_shout |
| cloth_merchant | namaste | thank | scold | shout_guard | flee_and_shout |
| fruit_seller | namaste | thank, gives a fruit back | throws a harmless fruit | shout_guard | flee_and_shout |
| water_carrier | namaste | thank | scold, spills water | shout_guard, chase 5 s | flee_and_shout |
| child | giggles | thanks | blocked | blocked | blocked |
| elder | blessing | blessing | blocked | blocked | blocked |
| musician | namaste | thank | flee | shout_guard | flee_and_shout |
| scribe | namaste | thank | scold | shout_guard | flee_and_shout |
| blacksmith | nod | thank | fight_back (1 s stagger) | fight_back plus shout, chase 8 s | fight_back (1.5 s stagger) plus shout |
| priest | namaste | thank | blocked | blocked | blocked |
| storyteller | namaste | thank | scold | shout_guard | flee_and_shout |
| town_guard | nod | thank, no standing bonus | warn, then hostile on the next act | hostile at once | hold_player |

Forgive: within 20 seconds of a shove or scold, a Give from the player turns the NPC to "Hm. Forgiven. Be gentler." and cancels the Wary flag. A theft or hit is not forgiven in the same way: return the item, or accept that the NPC stays Wary until a Give.
Shout and chase: "shout_guard" NPCs shout once (12 m hearing radius). They chase only a few seconds (chase_s), and then watch from a distance. They never use weapons.
Violence never kills. A hit NPC staggers, then flees. There is no blood in this system.

### 4.1 Witness rules (who sees)
An NPC is a witness if all are true: awake and not in a menu; within 8 m of the player (12 m for guards); the player is in front, within a 120 degree view cone; no wall or stall blocks the line.
- The victim always witnesses a shove or hit. For a steal, the victim witnesses only if facing the player or after noticing (20 s later, no chase if no one else saw).
- Shouts are heard at 12 m. Hearers turn and look, and count as witnesses only if they then see the player within 3 seconds.
- A guard who hears a shout walks over. He turns hostile only if he sees the act, or sees the stolen item in your hands within 10 s.
- Crowd cover: with the crouch skill and 3 or more NPCs within 2 m, sight drops to 4 m.
- Children are witnesses like anyone but never chase.
- A chase ends if the player is out of sight for 10 seconds or 20 m away.
- Hunt soldiers never report market acts.

## 5. Era variants
Each era swaps goods, names and barks. Every era has 14 variants, 84 barks, 14 talk lines and 14 rumours. That is 112 distinct lines per era (the brief asked for 40 or more). Rumours hint at the level's route or danger and match levels-v2.md.

Voice rules for all eras: plain, kind, a little humour. No stereotype or caricature: no job is tied to a skin tone, caste, religion or region. Accents are never spelled out. No one mocks a religious figure or practice. No deity names appear in names, jokes or stock. No chilli, potato, tomato or tea in any era (not present in India in these periods).

### 5.1 Hastinapur, Dvapara Yuga (mission dvapara-escape)
Place: the Lamp Bazaar at night. Pressure: dawn bar and bridge bell. Money: clay tokens (Invented, Legend). Rumour themes: grey cords, bridge bell, bell rope, east gate, canal lane, lit lanes.
| Detail | Label | Year |
|---|---|---|
| Grey bowls of the potter from Painted Grey Ware at Hastinapur Period II (Lal) | History | c. 1100-800 BCE |
| Iron appearing in Painted Grey Ware sites (smith) | History (as reported, unverified) | c. 1000-600 BCE |
| Farming and cattle at these sites (salt, seed and fruit stalls) | History (as reported, unverified) | c. 1100-800 BCE |
| No coins and no known script in these layers, so tokens and tally knots | History (absence, unverified) | not dated |
| Priest as fire-keeper tending a household fire | Tradition | Legend |
| Road reciters of tales | Tradition | Legend |
| The eve of the great war as the frame | Tradition | Legend |
| Lamp Bazaar crowd, names, tasks, clay lamps, woven cloth for sale | Invented | Legend |
Scribe note: the scribe here is a tally keeper (knots, no writing), because no script is known for this layer. The existing mission JSON says "tablet" in two lines (Suvrata, cp1-1). That is a conflict to resolve (open question 3).

### 5.2 Pataliputra, Mauryan empire (mission mauryan-spy)
Place: the Ganga wharf lanes in monsoon rain. Pressure: rising river gauge, watch lanterns. Money: silver pana. Rumour themes: doubled watch, timber stacks, swelling posts, sluice gauge, watch drum.
| Detail | Label | Year |
|---|---|---|
| Punch-marked silver coins (karshapana) | History (as reported, unverified) | c. 4th-2nd century BCE |
| Officials who oversee the city and its markets (Megasthenes, via later writers) | History (as reported, unverified) | c. late 4th-early 3rd century BCE |
| Brahmi script, so a letter writer | History (as reported, unverified) | c. 3rd century BCE |
| Fine glossy pottery (Northern Black Polished Ware) | History (as reported, unverified) | c. 700-200 BCE |
| Wells dug along roads (water carrier) | History (as reported) | c. 257 BCE |
| Wandering monk with Ashoka's patronage of Buddhism, alongside other traditions | History (as reported, unverified) | c. 260-232 BCE |
| City watch and night rules in the Arthashastra | Tradition | Contested |
| Timber wall and palisade | History | c. late 4th-early 3rd century BCE; 1892-1899 CE |
| Rain market stalls, names and tasks | Invented | Legend |
The priest archetype is a wandering monk here, so the era shows more than one tradition. Reviewers should confirm the portrayal.

### 5.3 Sangam pepper road (mission sangam-staff)
Place: hill village stalls on the pepper road at dusk. Pressure: evening tide at the harbour scales. Money: coin or a measure of grain (Invented, Legend). Rumour themes: rope bridge, goat path, crumbling ledge, archer on the rock, tide, Poonkodi at the bamboo grove.
| Detail | Label | Year |
|---|---|---|
| Sangam age poems and trade | History | c. 300 BCE-300 CE (debated) |
| Pepper traded to Yavana (Greek and Roman) merchants | History (as reported) | c. 1st century CE |
| Roman coin finds (a trade hint only) | History (as reported, unverified) | c. 1st century BCE-3rd century CE |
| Tamil-Brahmi inscriptions (scribe) | History (as reported, unverified) | c. 3rd century BCE onward |
| Bards with a lute-harp, the yazh | History (as reported, unverified) | c. 300 BCE-300 CE |
| Black-and-red ware (potter) | History (as reported, unverified) | c. 1000 BCE-300 CE |
| Silambam staff practice (storyteller mentions Poonkodi) | Tradition | at least 4th century BCE (as reported) |
| Hill shrine keeper | Tradition | Legend |
| Market folk, names, tasks | Invented | Legend |
Salt-for-grain trade (label s6 in the data) is listed but not used in any line yet.

### 5.4 Gupta forge road (mission gupta-forge)
Place: roadside stalls beside the forge near dawn. Pressure: dawn bar and gate bar. Money: small coin (Invented, Legend). Rumour themes: strangers at the forge gate, a rider with a grey cord, bridge nails due, anvils gone quiet, bellows, dawn bell.
| Detail | Label | Year |
|---|---|---|
| Gupta empire | History | c. 320-550 CE |
| Delhi iron pillar, known for resisting rust (smith bark) | History (debated) | c. 4th-5th century CE |
| Gupta gold coins, archer types | History (as reported) | 4th-6th century CE |
| Coins with a lute-type instrument, the lyrist type (musician bark; no ruler shown) | History (as reported, unverified) | c. 335-380 CE |
| A silk-weavers' guild in the Mandasor inscription (cloth seller bark) | History (as reported, unverified) | c. 436-473 CE |
| Early brick and stone temples (shrine priest) | History (as reported, unverified) | c. 5th-6th century CE |
| Dhanurveda, the science of the bow (arrow bundle) | Tradition | date unclear |
| Market folk, names, tasks | Invented | Legend |
Note: the existing gupta-forge JSON is a training yard that grants the bow. levels-v2.md moves the bow to level 5. This market follows levels-v2.md: arrow bundles stay hidden until the bow is granted.

## 6. Text and accessibility rules for the developer
- Every in-game string is 80 characters or fewer. `{name}` is replaced by the traveller's name. A script replaced `{name}` with a 12-letter name (the limit in decision 9) in all 174 in-game lines that use it, and none went over 80. Real fonts and wrapping at 360 px were not tested.
- Captions for every bark and reaction. Audio is optional. A caption bubble stays on screen at least 3 seconds, and the same text goes to a polite live region (max 1 announcement per 4 s).
- No colour-only meaning: standing uses a lamp shape plus a word plus a number. NPC state (alert, fleeing, Wary) uses a small icon shape and a text label on focus.
- Keyboard: Tab to nearby NPCs in order of distance, Enter to open the menu, 1 to 4 to choose, Esc to close. Focus ring visible. Touch targets at least 44 px.
- Reduced motion: no screen shake on shoves, no flicker on the lamp, NPCs still move.
- Mobile 360 px: the menu is a bottom sheet with up to 4 stacked 44 px buttons.
- Performance guidance for the developer (not measured): run full behaviour only for the nearest 8 NPCs, make the rest simple idle loops. Minify the data file for production (it is about 96 KB with indentation).

## 7. Data schema (data/npcs/market.json)
Top level: `_meta`, `verbs`, `standing`, `witness`, `hunt_alert`, `items`, `ui`, `archetypes[]`, `eras{}`.
- `archetypes[]`: `id`, `label`, `protected`, `look{age, build, skin_tones[], garment, headgear}`, `personality`, `menu[]`, `talk{choices[{id,label,reply,next{label,reply}}], goodbye}`, `task{id,type,offer,hint,done,fail,reward{items[],coins,standing,rumour_bonus?,buff?,blessing?},target_npc,limit_s,repeatable,blocks_mission}`, `reactions{greet,gift,shove,steal,hit}` each `{act, line, ...options}`, `mood_barks{warm,cold}`.
- `eras.<id>`: `name`, `mission`, `place`, `currency`, `setting`, `dress`, `pressure`, `labels[{id,label,year,text,status}]`, `variants.<archetype id>`.
- `variants.<id>`: `names[4]`, `role_name`, `goods[{item,name,price,qty,needs}]`, `barks[6]`, `talk`, `rumour`, `labels[]` (ids).
- `items[]`: `id`, `name`, `effect`, `needs`, `gift_value`.
- `standing.tiers[]`: `id`, `word`, `min`, `max`, `flame`, `buy_mult`, `sell_mult`, `bark_mood`, `guard{...}`.
Label `status` values: `in_repo_needs_review` (already in docs/story.md), `as_reported_unverified` (taken from memory or a search that was not opened), `tradition_review`, `invented`.
Era ids: hastinapur, pataliputra, sangam, gupta.

## 8. Optional hooks into levels (not done, for the TPO)
- Hastinapur: the child with the lantern can be the child of the level 1 optional objective "Keep the child's lantern lit". The fruit seller's rumour already points to that child.
- Mauryan: the guard's rumour matches the "doubled watch" in level 2. The water carrier's boat rumour matches the rising gauge.
- Sangam: the storyteller points to Poonkodi, the level's teacher (Invented, Legend).
- Gupta: the scribe points to Ayasa and the bridge nails.

## 9. Sources used and what could not be verified
Read in this repo: CLAUDE.md, docs/story.md, docs/harness.md, docs/decisions.md (first items), docs/design/levels-v2.md, docs/design/levels-v2-data.json, missions/*.json (all four).
Web searches were run for each of the claims below. The search tool returned only titles and links. I did not open any page, so none of these claims is verified. Every one is labelled "as reported, unverified" and needs scholarly review:
- Painted Grey Ware and iron: UNESCO Silk Road article "The Painted Grey Ware Culture of the Iron Age" (https://en.unesco.org/silkroad/sites/default/files/knowledge-bank-article/vol_I%20silk%20road_the%20painted%20grey%20ware%20culture%20of%20the%20iron%20age.pdf), https://en.wikipedia.org/wiki/Painted_Grey_Ware_culture, https://en.wikipedia.org/wiki/Hastinapur
- Mauryan karshapana coins: https://en.wikipedia.org/wiki/Karshapana, https://franpritchett.com/00routesdata/bce_299_200/ashoka/coins/coins.html
- Megasthenes and the city officials: https://en.wikipedia.org/wiki/Megasthenes, https://www.Wikipedia.org/wiki/Indica_(Megasthenes)
- Sangam trade, yazh, salt, Tamil-Brahmi: https://en.Wikipedia.com/wiki/Economy_of_ancient_Tamil_country, https://www.keralatourism.org/muziris/history/reference-evidence, https://en.wikipedia.org/wiki/Mangulam
- Gupta coins and the lyrist type: https://www.worldhistory.org/image/10135, https://coinweek.com/ancient-coins/coinweek-ancient-coin-series-coinage-of-the-guptas/
- Mandasor guild and Deogarh temple: https://en.wikipedia.com/wiki/Dashavatara_Temple, https://openthemagazine.com/columns/return-to-dashapura
Not searched at all, so from memory only: Northern Black Polished Ware dates, Black-and-red ware dates, Ashoka's reign dates, Bhitargaon temple, Brahmi use in the Mauryan period. All labelled unverified.

### Needs scholarly review
- Every row above marked "unverified". Priority: iron at Hastinapur, the absence of coins and script in Painted Grey Ware layers, Megasthenes and market officials, Mandasor guild date.
- Whether showing a fire-keeper (Hastinapur), a Buddhist monk (Pataliputra), a hill shrine keeper (Sangam) and a shrine priest (Gupta) is respectful as written. Their lines were kept to greetings and blessings only.
- Whether a "Dharma standing" score may be called that, since dharma is a rich idea that a simple meter reduces. The name follows the game's title and the CEO's request.
- Fruit, spice and cloth lists by era (mango, jackfruit, pomegranate, cotton and silk) were not checked against sources and are only Invented stalls where labelled so.
- Name pools: Sanskrit, Pali and Tamil style names were made up from common word roots. A native-language reviewer should check meaning, gender and respect. Names equal to the level characters (Suvrata, Dandaka, Kunjara, Ghora, Karuman, Shaila, Ulka, Revati, Poonkodi, Ayasa, Tamarai, Vasuka, Kshema, Bhadra) were not used.

## 10. Open questions (5)
1. Violence: decisions.md item 12 says "self-defence only". Is it OK for the market to allow shove, steal and hit with these costs and protections (child, elder, priest blocked, no blood, no killing)?
2. Does Dharma standing reset each level, or carry across the five roads (as a running reputation)?
3. Hastinapur scribe: keep the tally keeper (no writing, historical care) and change the two "tablet" lines in the mission, or keep a tablet and accept the anachronism?
4. "Take a thrown item": is catching items NPCs toss to you the intended meaning, or should the player also be able to throw items for NPCs to catch?
5. Crime tools before skills: steal and strike exist from level 1, but crouch and snatch arrive after level 2. Should "Take unseen" wait until crouch, or stay available from the start with a worse chance of being seen?
