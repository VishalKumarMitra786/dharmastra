# Levels v2: make every level addictive

Status: design proposal for CEO review. Nothing here is built. No file in missions/, src/ or tests was changed.
Data: [levels-v2-data.json](levels-v2-data.json) holds the five level scripts. Every new field starts with `x_` and is PROPOSED. This doc is generated from the same data for the level sections, so the two match.
Label key: History, Tradition or Invented, each with a year or "Legend".
Why: the CEO played the live build and found the checkpoint story not interesting. Reaching three markers is not a reason to play. This doc replaces that with fights, a rival, a clock and a hook.

## 0. Rules this design keeps and one it changes
Kept (CLAUDE.md, docs/decisions.md, docs/shunya-arc.md):
- No deity, epic figure or ruler on screen. Sacred traditions are only named briefly, with respect.
- No one is killed on screen. Beaten enemies yield: they stagger, drop a weapon, sit or flee. A hit shows a small impact mark. Blood stays optional (Settings switch, decision 12).
- No community, religion or real people is the enemy. Hurdles stay water, fire, dark, hurry and fear.
- Skills come in the shunya-arc order: hands, evasion, staff, sword, bow.

Changed (needs the CEO, see question 1): the arc said "nothing is a villain". The CEO now wants armed soldiers and captains. So we add ONE invented faction, the Hunt. It is not a people or a state. It is a band of hired soldiers who wear a grey cord on the left wrist, in every era, and who follow one rival, Ulka. They want to stop messages. They do not want to destroy cities. Captain Dandaka, the gate captain of the existing Hastinapur story, stays friendly.

## 1. The level formula
Every level, every time. Aim for 5 to 7 minutes.

| Beat | When | Rule |
|---|---|---|
| Hook | 0 to 10 s | Control at once. No text card first. Something happens to the player: a spear, a thief, a snapping rope, a fire. One line, 10 words or fewer. |
| Verb | 10 to 60 s | One signature verb or gimmick, learned by doing, never by a tutorial wall. |
| Stake | on screen all level | One public stake and one personal stake. Shown as a single short line in the HUD. |
| Pressure | all level | A ticking meter: dawn, tide, flood gauge, gate bar. It is visible and it also has a shape or number (no colour-only meaning). |
| Escalation | encounters 1 to 3 | Each encounter adds one new enemy type or one new twist. Order: one enemy, a mixed pair, a crowd or a hazard. |
| Set piece | about 60 percent in | One big scripted moment: chase, collapse, duel on a ledge, defend a gate or escape a fire. Each level uses a different one. |
| Boss | the end | A captain or Ulka, with 3 phases. Each phase has a tell and a counter. Win by making them yield. |
| Optional | all level | 2 to 3 optional objectives. They feed rank and style. They never block progress. |
| Rank | results card | Bronze, silver or gold from speed, damage and style (section 1.3). |
| Reward | results card | A weapon, a move or a title. Gold adds a title variant. |
| Cliffhanger | last 8 s | One line plus one image that points at the next level. |

### 1.1 Enemy roster and when each appears
Five types, built by the combat developer with windup, hit and recover attacks. Every windup has a shape cue as well as a colour cue.

| Type | Tell and counter | First level |
|---|---|---|
| Spearman | Long thrust after a pull-back. Dodge sideways, then shove. | 1 |
| Shield bearer | Blocks the front. Shove or parry breaks the guard. | 1 |
| Swordsman | Two or three slashes with a pause. Parry the last one. | 2 |
| Archer | Aim line, then a shot. Dodge when the line appears, or climb and close in. | 3 |
| Captain | Mixes the others and changes in 3 phases. | 1 (mini boss) |

### 1.2 Checkpoints are respawn points only
- A checkpoint is never a goal and never appears in the objective list. In the data they are `x_respawns`.
- Dying sends the player back to the last respawn point with the current encounter reset. No loading screen.
- Instant retry: "Try again" is the focused button and lands within 1 second. It is at least 44 px tall. Keyboard: Enter.
- Assist setting (more time, slower windups) stays available and must not hide the rank (question 4).

### 1.3 Rank: bronze, silver, gold
Three scores: speed (seconds), damage (hits taken) and style (points).
- Bronze: finish the level.
- Silver: finish and meet two of three: time under the silver time, 3 hits or fewer, style 4 or more.
- Gold: meet all three: time under the gold time, 0 hits, style 8 or more.
- Style points: parry 2, perfect dodge 1, shove into a hazard 2, an unseen zone 3, an optional objective 3, mercy 3. Each source counts up to 6.
- Numbers per level are in each level below. They are starting guesses to tune in playtest.
- Rank is shown with text and a shape, never colour alone.

## 2. Objective types (these replace "reach a checkpoint")
Each level has one main objective type plus optional ones. The engine needs a goal type for each.

| Type | The player must | Fails when | Used in |
|---|---|---|---|
| chase | Run a route while pursuers close in | Caught, or the clock ends | 1, 5 (tower exit) |
| steal-escape | Take an item, then leave unseen or fast | Item lost, or alarm at full | 2 |
| escort | Bring a person or goods to a place | They fall or goods are lost | 1 (optional), 3 |
| defend | Keep a gate or a fire alive for a time | Gate bar or fire hits zero | 4 |
| survive-waves | Beat numbered waves | Player down | 3 (optional), 4 |
| rescue | Bring someone out of danger | They are hurt too often | 2, 3, 5 |
| sabotage | Cut, jam or douse something of the Hunt | Time runs out | 1, 2, 4, 5 |
| duel | Beat one fighter in a small space | Player down | 1 (optional), 3, 4, 5 |
| defeat-captain | Make a captain yield | Player down | 1, 2, 4 |

"Yield" means a poise bar empties and the captain drops a weapon, sits or flees. No one dies.

## 3. Cast
- {name}, the traveller (female or male, name chosen by the player). Want: five roads, then home. {name} stepped in as courier because no one else was free, and Suvrata promised a door home after the fifth road. Flaw: stubborn and kind. Stays in character: shoves rather than strikes, and pulls people up.
- Suvrata, the mentor (Invented, Legend). The courier from the existing Hastinapur story. She gives {name} a road-lamp and speaks through it in later levels (caption "Suvrata (lamp)"). She is warm, dry and tired. She has a secret (see the turn).
- Ulka, the rival (Invented, Legend). A hunter with a torch and a spear, and a lamp like {name}'s. Glimpsed in level 1, a note in level 2, face to face in level 3, the final fight in level 5. He believes every message ends in a loss, so the Hunt stops messages.
- Local teachers, one per level, who give the skill: Revati (evasion), Poonkodi (staff), Ayasa (sword), Tamarai (bow). All Invented, Legend.
- The Hunt's captains, one per level: Kunjara, Ghora, Karuman, Shaila. Invented, Legend. They yield, never die.
- Captain Dandaka (existing, Invented, Legend). The friendly gate captain who opens the gate.

The turn, by level 5 (tragic and surprising): Ulka was a courier before {name}. His fifth plea ended in a flood and a lost village. Suvrata sent him, as she sent {name}. She knows the door home opens at the fifth road, but only for one who leaves the roads shut, and she needs a courier who stays. She says sorry. The player now wants level 6: does {name} stay, or go home?

The recurring line stays: "No glory in this. Just a road that stayed open."

## 4. The five levels
They match the shunya arc. Ladder numbers are the position on the timeline ladder (docs/timeline-levels.md). Levels 1, 2, 3 and 4 come from the stories already in the repo. Level 5 is new.

| Arc | Mission id | Ladder | Source in repo | Skill gained |
|---|---|---|---|---|
| 1 | dvapara-escape | 10 | Escape from Hastinapur | hands: dodge, shove, climb, vault |
| 2 | mauryan-spy | 14 | The Night Report of Pataliputra | evasion: crouch, snatch |
| 3 | sangam-staff | 15 | The Pepper Road | staff: sweep, plant |
| 4 | gupta-forge | 16 | The Forge Road | sword: parry |
| 5 | chola-tank | 17 | New | bow: held draw |

## Level 1. Escape from Hastinapur
Mission id: dvapara-escape. Ladder 10. Era: Dvapara Yuga.

- Hook: A spear hits the lamp post by your head. Run.
- First 10 seconds: Night. Suvrata presses the plea into your hands. A spear thuds into the stall beside you. Control is yours at once.
- Stake: The plea feeds the farm villages. Suvrata trusts you with it. It is your first of five roads home.
- Pressure: Dawn bar (lamps burn out). The canal bridge lifts at the bell.
- Signature verb: Shove: push through crowds and shove spears and shields aside.

### Encounters, in order
1. Bazaar mouth: 1 spearman. Teaches: dodge, then shove.
2. Lamp rows: 2 spearman, 1 shield-bearer. Teaches: shove breaks a shield; climb a stall roof.
3. Canal lane (the chase): 3 spearman. Teaches: run, vault, do not fight.
4. Canal bridge: 1 captain (Kunjara), 2 spearman. Teaches: boss.

### Set piece: The lantern chase (chase)
1. Three spearmen pour into the lane.
2. Run through the crowd; shove a cart to block them.
3. Vault stalls; the bell begins to toll.
4. Reach the bridge before it lifts.

### Boss: Captain Kunjara
Shield captain of the Hunt, a mini boss.

| Phase | Tell | Counter | Ends when |
|---|---|---|---|
| 1. Wall | Shield forward, slow spear thrust | Dodge to the side; shove while he recovers | his poise bar halves |
| 2. Bell | He swings for the alarm rope; two spearmen join | Climb the post and cut the rope; dodge the spearmen | rope cut or bell rings once |
| 3. Split shield | Fast double thrusts, shield low | Parry or dodge, then one clean shove into the canal shallows | he yields and sits on the bridge step |

### Objectives
- Main (chase): Get the plea out the east gate by dawn
- Main (defeat-captain): Make Captain Kunjara yield at the canal bridge
- Optional (escort): Keep the child's lantern lit
- Optional (sabotage): Cut the bell rope before it rings
- Optional (defeat-captain): Shove three spearmen into the canal

### Rank
- Gold: under 240 s, 0 hits, style 8+.
- Silver: two of: under 360 s, 3 hits or fewer, style 4+.
- Bronze: finish.

### Reward
- Weapon: none. Move: vault (grants: vault). Title: Lamp-Runner. Title variant: Lamp-Runner, Gold.

### Cliffhanger
Suvrata: "Someone hunts couriers, {name}. Keep walking." Image: A torch on the far bank goes out.

### Dialogue (80 characters or fewer)
| Trigger | Speaker | Line |
|---|---|---|
| start | Suvrata | Take the plea, {name}. Run. The bridge bell rings soon. |
| start | {name} | Five roads, then home. This is the first. |
| start | Spearman | Courier! Stop there! |
| ability | Suvrata | Slip sideways from the spear. Then shove. |
| ability | Suvrata | Stall roofs hold. Climb when the lane is full. |
| encounter-1 | Suvrata | Grey cords on their wrists. That is not the city watch. |
| encounter-2 | {name} | Shields now. Shove, do not strike. |
| setpiece | Suvrata | The crowd is thick. Use it. Keep the plea flat! |
| boss-start | Kunjara | The bridge is shut. Hand over the plea. |
| boss-phase-2 | Kunjara | Bell! Bring every spear! |
| boss-phase-2 | {name} | The rope! Climb the post and cut it! |
| boss-phase-3 | Kunjara | My shield is split. Still I stand. |
| boss-down | Kunjara | Enough. I yield. Go. |
| hit | Suvrata | Up! Keep moving. The plea is safe. |
| optional-done | {name} | The lantern still burns. Good. |
| fail | Suvrata | Again, {name}. The plea can wait a breath. |
| win | Captain Dandaka | Open the gate. Those fields feed my kin too. |
| win | {name} | No glory in this. Just a road that stayed open. |
| lamp | Suvrata | Take this lamp. I will speak through it. |
| rank-gold | Suvrata | Not one scratch. Lamp-Runner, indeed. |
| cliffhanger | Suvrata | Someone hunts couriers, {name}. Keep walking. |

### Labels
- History, c. 1100-800 BCE: Hastinapur Period II, Painted Grey Ware occupation (B. B. Lal)
- History, c. 1500-1000 BCE (as reported): Hastinapur 2021-22 excavation reports an earlier Painted Grey Ware layer
- Tradition, Legend: The eve of the great war; Dvapara placement of the story
- Invented, Legend: {name} carries the villagers' grain plea out of the city
- Invented, Legend: Suvrata, Captain Kunjara, the Hunt and its grey cords

## Level 2. The Night Report of Pataliputra
Mission id: mauryan-spy. Ladder 14. Era: Mauryan empire.

- Hook: Vasuka falls. The report is gone. Take it back.
- First 10 seconds: Rain on the wharf. A swordsman snatches the pouch and runs. Chase him down the planks and grab it back.
- Stake: A flood warning for the wall. Hundreds sleep behind it. Vasuka trusted you.
- Pressure: River gauge rising at the sluice. Watch lanterns sweep the lane.
- Signature verb: Crouch in shadow, then snatch from behind.

### Encounters, in order
1. Wharf snatch: 1 swordsman. Teaches: chase and snatch.
2. Timber yard: 2 spearman, 1 swordsman. Teaches: crouch past; snatch or dodge.
3. Palisade lane: 2 swordsman, 1 shield-bearer. Teaches: doubled watch; parry window on swordsmen.
4. Sluice walk: 1 captain (Ghora). Teaches: boss.

### Set piece: The palisade gives way (collapse)
1. The flood loosens a stretch of posts.
2. Posts fall behind you in a rolling line.
3. Climb the leaning timbers; do not stop.
4. Leap the gap to the sluice walk.

### Boss: Night Captain Ghora
Swordsman captain of the Hunt, a mini boss.

| Phase | Tell | Counter | Ends when |
|---|---|---|---|
| 1. Chain | Three-slash chain, long pause on the third | Dodge two, parry the third | his guard breaks once |
| 2. Lamp throw | He hurls an oil lamp; a small flame patch lights the planks | Dodge the lamp; fight off the flame patch | two parries land |
| 3. Rising water | Water covers the walk; he fights faster | Shove him against the rail at the right moment | he drops his blade and clings to the rail |

### Objectives
- Main (steal-escape): Take the report back from the thief
- Main (defeat-captain): Reach the sluice house and beat Night Captain Ghora
- Optional (rescue): Lead the porter out of the flooded lane
- Optional (steal-escape): Cross the palisade lane unseen
- Optional (sabotage): Jam the watch drum so it cannot sound

### Rank
- Gold: under 300 s, 0 hits, style 8+.
- Silver: two of: under 420 s, 3 hits or fewer, style 4+.
- Bronze: finish.

### Reward
- Weapon: none. Move: crouch (grants: crouch). Title: Quiet Foot. Title variant: Quiet Foot, Gold.

### Cliffhanger
Overseer Kshema: "A note in the pouch: 'Turn back, courier. U.'" Image: The lamp flame leans toward the hills.

### Dialogue (80 characters or fewer)
| Trigger | Speaker | Line |
|---|---|---|
| lamp | Suvrata (lamp) | Rain, {name}. Good cover. Good luck. |
| start | Vasuka | He took the report! Get it back, {name}! |
| start | {name} | Rain, dark, one thief. Easy. |
| ability | Revati | Crouch in shadow. The watch sees what moves. |
| ability | Revati | Snatch from behind. Quiet hands win here. |
| beat-1 | {name} | Got it. Now the wall, before the water. |
| encounter-2 | Revati | Lantern swings left. Go right. |
| encounter-3 | Revati | Two blades and a shield. Wait for the turn. |
| setpiece | Revati | The posts are going! Climb, {name}, climb! |
| boss-start | Ghora | Courier. The report stays here. |
| boss-phase-2 | Ghora | Quick hands. Now quick feet. |
| boss-phase-3 | Ghora | The water is up. Finish it. |
| boss-down | Ghora | I do not fight a flood. Go. |
| seen | {name} | Seen! Break their line of sight. |
| hit | Revati | Breathe. Back into the shadow. |
| fail | Revati | The watch turns at the drum. We go again. |
| win | Overseer Kshema | A jammed sluice, not a plot. Wake the timber crews! |
| rank-gold | Revati | Never seen, never hit. Quiet Foot. |
| cliffhanger | Overseer Kshema | A note in the pouch: 'Turn back, courier. U.' |
| cliffhanger | Suvrata (lamp) | Ulka. He knows your road. Keep walking. |

### Labels
- History, c. late 4th to early 3rd century BCE (as reported, not verified): Megasthenes' account of Pataliputra's wooden wall and wide ditch (survives only through later writers)
- History, 1892-1899 CE: Waddell's excavations find remains of a timber palisade near Patna
- Tradition, Contested: Arthashastra, traditionally credited to Kautilya, with a chapter on spies; authorship and date contested
- Invented, Legend: {name} steals back a ferry clerk's flood warning
- Invented, Legend: Revati, Night Captain Ghora, Ulka's note

## Level 3. The Pepper Road
Mission id: sangam-staff. Ladder 15. Era: Sangam age, Tamilakam.

- Hook: A rope bridge snaps. Catch the master's hand.
- First 10 seconds: Hill stream. The caravan is mid-bridge when an arrow cuts the rope. Climb down and catch the master before he falls.
- Stake: The pepper is a hill village's winter pay. Poonkodi lent you her staff and her trust.
- Pressure: Evening tide at the harbour scales. A sack lost is pay lost.
- Signature verb: Staff: sweep to keep distance, plant to steady a rope or a ledge.

### Encounters, in order
1. Stream bank: 2 spearman. Teaches: staff reach beats spear reach.
2. Goat path: 1 shield-bearer, 1 archer. Teaches: archer tell; dodge, then close in.
3. Scattered sacks: 2 swordsman, 1 spearman. Teaches: guard the sacks while fighting.
4. The ledge: 1 captain (Karuman). Teaches: boss.

### Set piece: The ledge over the stream (duel-on-ledge)
1. The last stretch is a narrow rock ledge.
2. Karuman blocks it with a long spear.
3. Ulka watches from the far bank.
4. The ledge crumbles under them.

### Boss: Captain Karuman
Long-spear captain of the Hunt. The duel is the set piece..

| Phase | Tell | Counter | Ends when |
|---|---|---|---|
| 1. Point | Spear drawn back, then a long thrust | Dodge, step inside the point, sweep his legs with the staff | his poise bar halves |
| 2. Rope | He cuts a rope; the ledge sways | Plant the staff to steady yourself, then strike | two staff hits land |
| 3. Slip | A stone gives way; he slides toward the drop | Hold out the staff and pull him up (mercy) or let him slide to the lower rock | he yields; mercy scores style |

### Objectives
- Main (escort): Bring the caravan master and three sacks to the harbour
- Main (duel): Win the duel on the ledge against Captain Karuman
- Optional (escort): Bring all three sacks undamaged
- Optional (rescue): Pull Karuman back up the ledge
- Optional (survive-waves): Reach the harbour without an arrow hit

### Rank
- Gold: under 330 s, 0 hits, style 8+.
- Silver: two of: under 450 s, 3 hits or fewer, style 4+.
- Bronze: finish.

### Reward
- Weapon: staff (grants: staff). Move: plant. Title: Staff-Bearer. Title variant: Staff-Bearer, Gold.

### Cliffhanger
Ulka: "You pulled him up. Nobody pulled me up, {name}." Image: Ulka on the far bank. His lamp matches yours.

### Dialogue (80 characters or fewer)
| Trigger | Speaker | Line |
|---|---|---|
| lamp | Suvrata (lamp) | Hills, {name}. Mind the stream. |
| start | Caravan master | The bridge! Hold the line, {name}! |
| start | Poonkodi | Take my staff. It is a longer arm. Keep trouble at its length. |
| ability | Poonkodi | Sweep low to turn a spear. Plant it to steady a rope. |
| encounter-1 | Poonkodi | Spears have reach. Your staff has more. |
| encounter-2 | Poonkodi | Archer on the rock! Dodge when he draws. |
| pickup | {name} | One sack safe. Two to go. |
| encounter-3 | Caravan master | They want my pepper! Keep them off! |
| setpiece | Poonkodi | The ledge is narrow. Mind your feet first. |
| boss-start | Karuman | Staff against spear. Brave, courier. |
| boss-phase-2 | Karuman | I cut the rope! Fall, or fight! |
| boss-phase-2 | {name} | Plant the staff. Hold the ledge steady! |
| boss-phase-3 | Karuman | My foot! The stone is gone! |
| boss-phase-3 | {name} | Grab the staff! I have you! |
| boss-down | Karuman | You pulled me up. Why? |
| boss-down | {name} | A road is for walking, not falling. |
| hit | Poonkodi | Feet first, then the staff. |
| fail | Poonkodi | The tide waits. We start the road again. |
| win | Harbour clerk | Three sacks, sealed. Keep that staff. It is yours. |
| rank-gold | Poonkodi | Not a sack lost, not a mark on you. Staff-Bearer. |
| cliffhanger | Ulka | You pulled him up. Nobody pulled me up, {name}. |
| cliffhanger | Suvrata (lamp) | He is close now. The next road burns. |

### Labels
- History, c. 300 BCE to 300 CE (dates debated): Sangam age poems and trade in Tamilakam
- Tradition, Tradition, said to be at least 4th century BCE (as reported): Bamboo staff practice named after the silambu bamboo of the hills (silambam)
- History, c. 1st century CE (as reported): Pepper harbour on the coast, Muziris-style (not checked here)
- Invented, Legend: Poonkodi, the caravan, Captain Karuman and the ledge duel
- Invented, Legend: Ulka appears in person for the first time

## Level 4. The Forge Road
Mission id: gupta-forge. Ladder 16. Era: Gupta age, forge road.

- Hook: The forge gate is burning. Take the blade.
- First 10 seconds: Night at the forge. A ram thumps the gate. Ayasa throws you a blade and a spearman is already through the smoke.
- Stake: The bridge nails must be finished by dawn or the village cannot cross the river. Ayasa risks the forge for you.
- Pressure: Dawn bar; gate bar health; bellows heat that cools if left alone.
- Signature verb: Sword parry: block just as the blow lands, and a spark of iron answers.

### Encounters, in order
1. Gate wave 1: 3 spearman. Teaches: parry a thrust.
2. Gate wave 2: 2 swordsman, 1 shield-bearer. Teaches: parry breaks a shield.
3. Gate wave 3: 2 archer, 2 spearman. Teaches: climb the shed; shove archers off.
4. The ram: 1 captain (Shaila), 1 shield-bearer. Teaches: boss.

### Set piece: Hold the gate until dawn (defend-gate)
1. The gate bar cracks under the ram.
2. Waves arrive in three bursts.
3. Pump the bellows between waves.
4. The dawn bell rings; the Hunt falls back.

### Boss: Captain Shaila
Heavy-shield captain of the Hunt, boss.

| Phase | Tell | Counter | Ends when |
|---|---|---|---|
| 1. Ram | She orders the ram; the gate shudders | Cut the ram rope with your sword | ram rope cut |
| 2. Wall | She and a shield bearer stand shoulder to shoulder | Parry to break the guard, then strike the shield bearer first | the shield bearer yields |
| 3. Last blows | Fast overhead chops, long recovery | Dodge, then parry the final chop | she yields at the dawn bell |

### Objectives
- Main (defend): Hold the gate until dawn
- Main (survive-waves): Turn back all three waves
- Main (defeat-captain): Make Captain Shaila yield
- Optional (sabotage): Cut the ram rope
- Optional (defend): Keep the bellows going
- Optional (duel): Land three parries

### Rank
- Gold: under 390 s, 0 hits, style 8+.
- Silver: two of: under 540 s, 3 hits or fewer, style 4+.
- Bronze: finish.

### Reward
- Weapon: sword (grants: sword). Move: parry. Title: Sheath-Keeper. Title variant: Sheath-Keeper, Gold. Note: Bow moves to level 5. The existing gupta-forge JSON grants bow; that grant should move.

### Cliffhanger
Shaila: "Ask Ulka who he lost to the flood." Image: A grey cord lies on the road, tied to a lamp like yours.

### Dialogue (80 characters or fewer)
| Trigger | Speaker | Line |
|---|---|---|
| lamp | Suvrata (lamp) | Smoke ahead, {name}. Sparks too. |
| start | Ayasa | Fire at the gate! Take this blade, {name}! |
| ability | Ayasa | Block, then answer. Parry as the blow lands. |
| encounter-1 | Ayasa | Spears first. Step in past the point. |
| encounter-2 | Ayasa | Shields next. A parry breaks their guard. |
| encounter-3 | Ayasa | Archers on the shed. Climb and shove them into the hay. |
| setpiece | Ayasa | The bar is cracking! Hold the gate, {name}! |
| optional-done | {name} | The bellows still breathe. Good. |
| boss-start | Shaila | Break the gate! The courier is mine. |
| boss-phase-2 | Shaila | Shields up! A wall of iron! |
| boss-phase-3 | Shaila | Dawn is near. One more blow! |
| boss-down | Shaila | I yield. Ulka said your road ends in a flood. |
| hit | Ayasa | Breathe. Block first, always. |
| fail | Ayasa | The forge is still warm. Again, {name}. |
| win | Ayasa | A sword sheathed has done its best work. Sheathe it. |
| rank-gold | Ayasa | No harm, no haste. Sheath-Keeper. |
| cliffhanger | Shaila | Ask Ulka who he lost to the flood. |
| cliffhanger | Suvrata (lamp) | Do not ask him. Not yet. Walk. |

### Labels
- History, c. 320 to 550 CE: Gupta empire
- History, c. 4th to 5th century CE: Wrought-iron pillar at Delhi, date and original site debated
- Tradition, Tradition, date unclear: The Dhanurveda, the science of the bow, lists swords and bows among arms; its date and text versions are unclear
- Invented, Legend: Ayasa the smith, Captain Shaila and the night at the forge gate

## Level 5. The Tank and the Sluice
Mission id: chola-tank. Ladder 17. Era: Chola age, Kaveri delta.

- Hook: A fire arrow hits the tower. Shoot the rope.
- First 10 seconds: Flood night at the tank. A burning arrow thuds into the tower roof. Tamarai hands you a bow and a target rope appears.
- Stake: A boat of strangers is stranded in the swollen channel. The bund may overtop. Ulka is here and he knows your road.
- Pressure: Fire climbs the tower; the water gauge rises on the bund.
- Signature verb: Bow: hold the draw, breathe, loose at rope and flag.

### Encounters, in order
1. Tank steps: 2 archer, 1 spearman. Teaches: bow duel at range; cover.
2. Bund path: 1 shield-bearer, 2 swordsman. Teaches: all moves together.
3. Burning tower: 3 archer. Teaches: fire arrows; the set piece.
4. The bund: 1 captain (Ulka). Teaches: boss and rival.

### Set piece: The burning tower (escape-fire)
1. Archers set the watch tower alight.
2. Climb up to the sluice-rope window as stairs burn.
3. Shoot the rope to open the sluice; the flood douses the flames.
4. Slide down the scaffold to the bund.

### Boss: Ulka
The rival. Spear and torch. Final boss of this arc, and the turn..

| Phase | Tell | Counter | Ends when |
|---|---|---|---|
| 1. Torch and spear | Torch swing then a thrust; he feints | Parry the thrust, dodge the torch | his guard breaks twice |
| 2. Fire arrows | He leaps to the bund and shoots flaming arrows | Shoot his lamp rope; use cover; close in | his lamp rope is cut |
| 3. The boat | A child cries from the stranded boat; he hesitates | Do not strike. Shoot a line to the boat; Ulka helps haul it | the boat is ashore and Ulka lowers his spear |

### Objectives
- Main (rescue): Shoot a line to the stranded boat and draw it ashore
- Main (duel): Stand against Ulka at the bund
- Main (chase): Leave the burning tower
- Optional (sabotage): Cut the Hunt's oil-jar rope
- Optional (rescue): Bring Tamarai down safe
- Optional (duel): Hit every target with one arrow

### Rank
- Gold: under 420 s, 0 hits, style 8+.
- Silver: two of: under 600 s, 3 hits or fewer, style 4+.
- Bronze: finish.

### Reward
- Weapon: bow (grants: bow). Move: held draw. Title: Tank-Watcher. Title variant: Tank-Watcher, Gold.

### Cliffhanger
Suvrata: "Your door is open. So is a road where a river rises." Image: Two lights: a door of home, and a lamp road by a dark river.

### The turn
Ulka carried a fifth plea that ended in a flood and a lost village. Suvrata sent him, as she sent {name}. The way home opens at the fifth road, but only for one who leaves it shut.

### Dialogue (80 characters or fewer)
| Trigger | Speaker | Line |
|---|---|---|
| lamp | Suvrata (lamp) | Water ahead, {name}. A lot of it. |
| start | Tamarai | Fire on the tower! Take the bow, {name}! |
| ability | Tamarai | Breathe out. Hold. Let go. |
| ability | Tamarai | Aim at rope and flag, never at a person. |
| encounter-1 | Tamarai | Archers on the steps. Keep low and move. |
| encounter-2 | Tamarai | Shield and blades on the bund. Parry, then shove. |
| setpiece | Tamarai | The sluice rope! Shoot it, then climb down! |
| setpiece | {name} | Rope cut. The water is running. Go go go! |
| boss-start | Ulka | Five roads, courier. The fifth drowns. |
| boss-phase-2 | Ulka | Run back. The water is not kind. |
| boss-phase-3 | Ulka | A boat. A child. Not again. |
| boss-down | Ulka | I carried five. The fifth drowned my village. |
| hit | Tamarai | Steady. Breathe, then loose. |
| fail | Tamarai | The tank will wait. Try again, {name}. |
| win | Tamarai | The boat is ashore. All hands. Well shot. |
| beat-1 | Suvrata | Ulka was my courier before you. I sent him. |
| beat-1 | Suvrata | Home waits for one who leaves. The roads need one who stays. |
| beat-1 | {name} | You said five roads, then home. |
| beat-1 | Suvrata | I did. Forgive me. |
| rank-gold | Tamarai | Every arrow true. Tank-Watcher. |
| win | {name} | No glory in this. Just a road that stayed open. |
| cliffhanger | Suvrata | Your door is open. So is a road where a river rises. |

### Labels
- History, c. 850-1279 CE: Chola empire
- History, Chola age (as reported): Large temple-and-tank irrigation works of the Kaveri delta (specific tank not chosen, dates not checked)
- History, 4th to 6th century CE (as reported): Gupta archer-type gold coins issued by several kings (the coin in the game is an original drawing)
- Tradition, Tradition, date unclear: The Dhanurveda, the science of the bow; date uncertain
- Invented, Legend: Tamarai, the flood night, the Hunt and Ulka's story
- Invented, Legend: Suvrata's secret: the wheel needs a courier who stays


## 5. History, Tradition and Invented, all in one place
| Point | Label | Year |
|---|---|---|
| Hastinapur Period II, Painted Grey Ware (B. B. Lal) | History | c. 1100-800 BCE |
| Hastinapur 2021-22 earlier layer | History | c. 1500-1000 BCE (as reported) |
| The eve of the great war; Dvapara placement | Tradition | Legend |
| Megasthenes on Pataliputra's wooden wall | History | c. late 4th to early 3rd century BCE (as reported) |
| Waddell's palisade finds near Patna | History | 1892-1899 CE |
| Arthashastra and its spy chapter | Tradition | Contested |
| Sangam period | History | c. 300 BCE to 300 CE (debated) |
| Silambam, the staff art | Tradition | at least 4th century BCE (as reported) |
| Pepper harbour, Muziris-style | History | c. 1st century CE (as reported, not checked) |
| Gupta empire | History | c. 320-550 CE |
| Delhi iron pillar | History | c. 4th-5th century CE (debated) |
| Dhanurveda, the bow science | Tradition | date unclear |
| Gupta archer coins | History | 4th to 6th century CE (as reported) |
| Chola empire | History | c. 850-1279 CE |
| Chola temple-and-tank irrigation | History | as reported, tank not chosen |
| The wheel of ages; yuga rings | Tradition | Legend |
| {name}, the courier's errands, the road-lamp | Invented | Legend |
| Suvrata, Ulka, the Hunt and its grey cord, all captains, all teachers | Invented | Legend |
| Soldiers' kit: spears, swords, shields, bows in every era | Invented | Legend (no period accuracy claimed) |

Respect: the sacred is only named in one line: the "great war's eve" and the yuga rings. No deity speaks or appears. Fighting is never done against a faith, a people or a state.

## 6. Notes for developers
- Checkpoints become `x_respawns`. The three old "reach X" objectives are replaced.
- New triggers: beat-N, encounter-N, setpiece, boss-start, boss-phase-2, boss-phase-3, boss-down, optional-done, rank-gold, cliffhanger, lamp.
- Existing gupta-forge grants bow, dodge, push, climb and sword. In v2 the bow moves to level 5. Dodge, push and climb are basic from the start of level 1, so the "grant" is only a record.
- All in-game text is 80 characters or fewer, checked by script (103 lines, 0 over). All lines use `{name}` for the player, never a real name.
- Captions are needed for every voice line, every Ulka cue and the bell, drum and fire sounds.
- Reduced motion: no screen shake and no flash. The chase and collapse set pieces still work with slower camera.
- Touch controls: 44 px minimum, one thumb for move and one for the three action buttons (attack, block-parry, dodge). Shove, climb and the bow use context buttons. This is for the UX role to confirm.

## 7. Sources used and what was not checked
- docs/story.md, docs/shunya-arc.md, docs/timeline-levels.md, docs/decisions.md and the four mission JSON and JS files, read 2026-11-22. All History dates above come from these docs, which cite Wikipedia summaries and B. B. Lal, not primary texts.
- No web search was run and no new source was read for this work.
- Not run: the live build. This doc was written from the files, not from playing the game.
- Not checked: all dates in section 5 (inherited, see "Needs scholarly review" in docs/story.md, docs/shunya-arc.md and docs/timeline-levels.md); real period arms in each era; the names Ulka (from Sanskrit "ulka", firebrand, not checked), Kunjara, Ghora, Karuman, Shaila, Tamarai, Revati, Poonkodi for fit with region and period; "road-lamp" as a courier's tool; the reading of "five roads, then home" against Tradition. These need scholarly review before launch.
- The numbers for time, hits and style are guesses with no playtest.

## 8. Open questions for the CEO
1. Is it fine to add one armed faction (the Hunt) to the early arc, which the old rules called "nothing is a villain", if enemies only yield and never die on screen?
2. Do you like the turn: Suvrata knew the way home needs a courier who stays, and Ulka was her earlier courier? If not, what should the surprise be?
3. Should these five play as their own run (arc 1 to 5), skipping ladder levels 11 to 13 between Hastinapur and Pataliputra, or only as part of the full ladder?
4. Should assist mode (slower windups, more time) still earn gold, or cap rank at silver?
5. Should the existing Captain Dandaka gate scene stay as the happy end of level 1, with Kunjara as the fight before it?
