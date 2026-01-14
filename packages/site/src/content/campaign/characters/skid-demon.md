---
name: "Skid Demon"
type: "character"
subtype: "pc"
status: "active"
description: "A Half-Elf Gloom Stalker Ranger with a unique connection to ley energy, wielder of the Dryad's Blessing Longbow"
race: "Half-Elf"
class: "Ranger"
subclass: "Gloom Stalker"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Half-Elf"
  background: "Outlander"
  originFeat: "Observant"

# Ability Scores
abilityScores:
  str: 13
  dex: 16
  con: 12
  int: 11
  wis: 16
  cha: 9

# Combat Stats
combat:
  ac: 17
  hp: 51
  maxHp: 51
  speed: 40
  initiative: 6
  proficiencyBonus: 3
  hitDice: "6d10"

# Saving Throws (STR and DEX proficient for Ranger)
savingThrows:
  str: true
  dex: true
  con: false
  int: false
  wis: false
  cha: false

# Skills
skills:
  - name: "Perception"
    proficient: true
    expertise: true
    bonus: 9
  - name: "Insight"
    proficient: true
    bonus: 6
  - name: "Sleight of Hand"
    proficient: true
    bonus: 6
  - name: "Stealth"
    proficient: true
    bonus: 6
  - name: "Survival"
    proficient: true
    bonus: 6
  - name: "Nature"
    proficient: true
    bonus: 3

# Senses
senses:
  darkvision: 120
  passivePerception: 19
  passiveInvestigation: 10
  passiveInsight: 16

# Defenses
defenses:
  conditionImmunities:
    - "Magical Sleep"

# Spellcasting
spellcasting:
  ability: "wis"
  spellSaveDC: 14
  spellAttackBonus: 6
  spellSlots:
    - { level: 1, total: 4, expended: 0 }
    - { level: 2, total: 2, expended: 0 }
  knownSpells:
    - "Hunter's Mark"
    - "Ensnaring Strike"
    - "Disguise Self"
    - "Pass without Trace"
    - "Rope Trick"

# Equipment
equipment:
  equipped:
    - slot: "two-hand"
      item: "dryads-blessing-longbow"
      mastery: "slow"
    - slot: "armor"
      item: "studded-leather"
  mundane:
    - name: "Scimitar"
      quantity: 1
      notes: "Nick mastery"
    - name: "Shortsword"
      quantity: 1
      notes: "Vex mastery"
    - name: "Thieves' Tools"
      quantity: 1

# Class Features
features:
  - name: "Favored Enemy"
    source: "class"
    level: 1
    description: "Expertise in tracking and hunting chosen foes"
  - name: "Natural Explorer"
    source: "class"
    level: 1
    description: "Expertise in navigating wilderness terrain"
  - name: "Fighting Style: Archery"
    source: "class"
    level: 2
    description: "+2 bonus to attack rolls with ranged weapons"
  - name: "Extra Attack"
    source: "class"
    level: 5
    description: "Attack twice when taking the Attack action"
  - name: "Dread Ambusher"
    source: "subclass"
    level: 3
    description: "+3 to Initiative; extra attack on first turn dealing +1d8 damage"
  - name: "Umbral Sight"
    source: "subclass"
    level: 3
    description: "120 ft Darkvision; invisible to creatures relying on darkvision while in darkness"
  - name: "Dreadful Strike"
    source: "subclass"
    level: 3
    description: "Deal extra 2d6 Psychic damage once per turn"
    uses:
      current: 3
      max: 3
      recharge: "long-rest"
  - name: "Ley Mark"
    source: "item"
    description: "Can sense nearby ley currents; heartbeat syncs with ley pulses; acts as living compass to ley energy"

# Proficiencies
languages:
  - "Common"
  - "Draconic"
  - "Elvish"
  - "Goblin"
  - "Orc"
armorProficiencies:
  - "Light Armor"
  - "Medium Armor"
  - "Shields"
weaponProficiencies:
  - "Martial Weapons"
  - "Simple Weapons"
toolProficiencies:
  - "Thieves' Tools"

tags:
  - party
  - ranger
  - gloom-stalker
  - ley-touched
  - stone-born
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "rudiger"
    type: "ally"
  - entity: "stol"
    type: "ally"
  - entity: "kei"
    type: "ally"
  - entity: "accoa"
    type: "ally"
  - entity: "dryad-erinthin"
    type: "ally"
    note: "Gifted him the Dryad's Blessing Longbow"
  - entity: "heart-stone"
    type: "connected"
    note: "Linked via ley mark"
  - entity: "harlix-darkleaf"
    type: "ally"
    note: "Fellow ranger, initially questioned his Dryad's bow"
firstAppearance: "session-01-the-bell-of-shavras"
visibility: "public"
---

# Skid Demon

A Half-Elf Ranger of the Gloom Stalker conclave with a unique and growing connection to the world's ley energy. Carries the Dryad's Blessing Longbow gifted by Erinthin and has been marked as "Stone-born" by the Molrik clan dwarves.

## The Ley Mark

After falling through a ley gate crack and seeing "rivers of light leading to a heart of stone," Skid developed a ley mark that glows faintly. This mark grants him abilities:

- Can sense nearby ley currents
- Heartbeat syncs with ley pulses
- Acts as a "living compass" to ley energy

The dwarven explorer Glun recognized this mark and called Skid "Stone-born"—a rare individual touched by the deep magic of the world.

## Key Moments

### Session 1 - Party Formation
Joined the party in Phandalin, answering Townmaster Riglid's call.

### Session 4 - Gift from Erinthin
The Dryad Erinthin of the Moonwoods gifted Skid the Dryad's Blessing Longbow +1 with special thorn-bloom arrows after the party helped defeat the cultists.

### Session 6 - Questioned by Harlix
Harlix Darkleaf of The Knock noticed Skid's Dryad bow and questioned how he came to possess it—a tense moment that turned to admiration after learning of their encounter with Erinthin.

### Session 9 - The Ley Gate Vision
Fell through a crack in a ley gate, witnessing rivers of light leading to a heart of stone—a prophetic vision of what awaited in Eberron.

### Session 9 - Recognition by the Dwarves
The Molrik clan's Glun immediately recognized Skid as "Stone-born," treating him with respect usually reserved for ancient beings. Ley energy arced from Skid to Molrik's lantern.

### Session 9 - Prophetic Visions
In the Hall of Warriors, Skid saw a storm tearing through the ley—the same pulse that marked him. Later, in the Heart Stone Chamber, had visions of world destruction if the ley anchors break.

### Session 9 - The Heart Stone Chamber
His ley connection intensified during the vision in the Heart Stone Chamber. His presence helped stabilize the Eberron anchor, and he gained permanent ability to sense nearby ley currents.

## Combat Role

As a Gloom Stalker Ranger, Skid excels at scouting, ambush tactics, and sustained ranged damage. With 120 ft. Darkvision and invisibility to creatures using darkvision while in darkness, he's the perfect reconnaissance specialist. The +9 Perception (Passive 19) means almost nothing escapes his notice. His Dreadful Strike adds burst damage, while the Slow mastery on his bow provides battlefield control.
