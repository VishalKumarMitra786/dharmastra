# Event sources: where Dharmastra's timeline events come from

Status: plan plus first import. Scholarly review is PENDING for every event. Complete coverage of every yuga is a GOAL tracked in docs/coverage.md. It is never claimed, and no count here is a claim of completeness.

Rules: every event is History, Tradition or Invented, with a year or "Legend". Summaries are in our own words (Wikipedia is CC BY-SA, our repo is all rights reserved, so no wiki prose is copied). Facts (names, dates, places, order) are reused. Each event has a source note with page title and URL where the web was used. History dates need two sources; if they disagree we store `yearRange` and a `flag`. Events marked "memory only" were written from general knowledge and not checked on the web. They need checking before shipping.

Estimates below are rough guesses, not counts of known lists.

## Satya Yuga (almost all Tradition, Legend)
- Puranas (Bhagavata, Vishnu, Matsya, Kurma, Varaha, Narasimha-related texts): avatar stories, creation episodes. Tradition. Est. 60-150 events.
- Mahabharata Shanti Parva and Manusmriti ch. 1: description of the age and durations. Tradition. Est. 10-20.
- Surya Siddhanta: yuga arithmetic. Tradition (astronomical convention). Est. 5-10.
- No dated History belongs here by tradition. Archaeology (Indus periods) is held separately, see "Placement" below.
Imported: 11 (Wikipedia Satya Yuga, Yuga, Dashavatara). Primary texts not read.

## Treta Yuga (Tradition, Legend; plus text-dating History)
- Valmiki Ramayana, seven kandas and sargas: episode level, est. 100-300 for a full sarga-level plan. Tradition.
- Puranic avatars (Vamana, Parashurama) and royal genealogies (Surya vamsha lists). Tradition. Est. 50-150.
- History only for the text itself (composition range 750 BCE to 3rd c. CE, debated).
Imported: 13.

## Dvapara Yuga (Tradition, Legend; plus archaeology History)
- Mahabharata (18 parvas, about 100 sub-parvas): est. 150-400 episodes. Tradition. Harivamsa and Bhagavata Purana (Krishna tradition): est. 50-150.
- Archaeology: Painted Grey Ware, Kuru kingdom, Hastinapur excavations (History, dates debated). Est. 20-50. Placement pending.
- Kurukshetra war dating proposals (History of scholarship). Est. 15 proposals.
Imported: 18 (plus 15 in archaeology-texts).

## Kali Yuga (mostly History)
- Dynastic chronologies (Mahajanapadas, Magadha, Maurya, Shunga, Satavahana, Kushan, Gupta, Chalukya, Pallava, Rashtrakuta, Pala, Chola, Delhi Sultanate, Vijayanagara, Mughal, Maratha, Sikh, colonial): est. 600-1500.
- Inscriptions (Ashokan edicts, Hathigumpha, Allahabad pillar, Aihole, Uttaramerur, temple plates; ASI and Epigraphia Indica): est. 300-800.
- Battles and treaties: est. 200-500. Reforms and law: est. 100-300.
- Archaeological periods and sites (Indus, PGW, Keezhadi, Sanchi, Ajanta, Ellora): est. 200-500.
- Texts and sciences (Aryabhata, Panini, Sangam literature, Kalhana): est. 200-500. Traditional religious dates (Mahavira, Buddha, saints): Tradition, est. 100-300.
- Post-1947 events and living political or religious disputes: excluded until a reviewer agrees.
Imported: 204 (kali-batch1).

## Kalki era (Tradition, Legend)
- Vishnu, Bhagavata, Garuda, Agni, Kalki, Vayu Puranas; Kalachakra Tantra; Sikh Chaubis Avatar. Accounts differ and none is followed. Est. 20-50 events. No prediction is made. The Kalki figure is never shown (docs/decisions.md item 1).
Imported: 9.

## Placement
By Puranic count Kali starts 3102 BCE, so Indus, Vedic and PGW archaeology falls in Kali, while docs/timeline-levels.md places Hastinapur and Indus inspiration in other rings. The 15 events in data/import/archaeology-texts-batch1.json carry a `placement` note. TPO must decide.

## Web sources used (all accessed 2026-11-22)
- https://en.wikipedia.org/wiki/Yuga ; Satya_Yuga ; Treta_Yuga ; Dvapara_Yuga ; Dashavatara ; Kalki ; Ramayana ; Mahabharata ; Kurukshetra_War
- https://en.wikipedia.org/wiki/Timeline_of_Indian_history ; Ashoka ; Kushan_Empire ; Gupta_Empire ; Indus_Valley_Civilisation ; Painted_Grey_Ware_culture ; Vedic_period
- https://www.britannica.com/biography/Ashoka
Not used: Wikisource, Wikidata, ASI reports, primary texts.

## Known disagreements stored as ranges
Ashoka accession (273-265 BCE), Kalinga war (265-260 BCE), Buddha's death (486-400 BCE), Kushan start and Kanishka era (25-90 CE; 78-144 CE), Samudragupta accession (335/350), Nalanda founding (415-455), Persian arrival (538-518 BCE), Seleucus treaty (305/304), Vikrama era (58/57 BCE).

## Needs scholarly review
Everything. First: the yuga placements of avatars (lists vary by tradition), the respectful wording about Kalki, Krishna, Rama and the Gita, the 154 Kali events never checked on the web, and the sensitive modern entries (1857, 1919, 1947).
