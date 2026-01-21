---
name: "Kei Eaglesnout"
type: "character"
subtype: "pc"
status: "retired"
description: "A powerful Human Fighter and Champion of the battlefield, known for his exceptional strength and competitive spirit. Now founder of the Eaglesnout Academy."
race: "Human"
class: "Fighter"
subclass: "Champion"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Human"
  background: "Soldier"
  originFeat: "Savage Attacker"

# Ability Scores
abilityScores:
  str: 17
  dex: 16
  con: 14
  int: 10
  wis: 10
  cha: 10

# Combat Stats
combat:
  ac: 18
  hp: 64
  maxHp: 64
  speed: 30
  initiative: 3
  proficiencyBonus: 3
  hitDice: "6d10"

# Saving Throws (STR and CON proficient for Fighter)
savingThrows:
  str: true
  dex: false
  con: true
  int: false
  wis: false
  cha: false

# Skills
skills:
  - name: "Acrobatics"
    proficient: true
    bonus: 6
  - name: "Athletics"
    proficient: true
    bonus: 6
  - name: "Animal Handling"
    proficient: true
    bonus: 3
  - name: "Nature"
    proficient: true
    bonus: 3
  - name: "Survival"
    proficient: true
    bonus: 3

# Senses
senses:
  darkvision: 60
  passivePerception: 10
  passiveInvestigation: 10
  passiveInsight: 10

# Equipment
equipment:
  equipped:
    - slot: "main-hand"
      item: "handaxe-plus-1"
      mastery: "vex"
    - slot: "off-hand"
      item: "shortsword-plus-1"
      mastery: "vex"
    - slot: "armor"
      item: "chain-mail"
    - slot: "shield"
      item: "shield"
  mundane:
    - name: "Battleaxe"
      quantity: 1
      notes: "Topple mastery"
    - name: "Carpenter's Tools"
      quantity: 1

# Class Features
features:
  - name: "Fighting Style: Two-Weapon Fighting"
    source: "class"
    level: 1
    description: "Add ability modifier to damage of off-hand attack"
  - name: "Second Wind"
    source: "class"
    level: 1
    description: "Regain 1d10+6 HP as bonus action"
    uses:
      current: 1
      max: 1
      recharge: "short-rest"
  - name: "Action Surge"
    source: "class"
    level: 2
    description: "Take an additional action on your turn"
    uses:
      current: 1
      max: 1
      recharge: "short-rest"
  - name: "Improved Critical"
    source: "subclass"
    level: 3
    description: "Weapon attacks score a critical hit on a roll of 19 or 20"
  - name: "Extra Attack"
    source: "class"
    level: 5
    description: "Attack twice when taking the Attack action"

# Proficiencies
languages:
  - "Common"
  - "Dwarvish"
  - "Elvish"
armorProficiencies:
  - "Heavy Armor"
  - "Medium Armor"
  - "Light Armor"
  - "Shields"
weaponProficiencies:
  - "Martial Weapons"
  - "Simple Weapons"
toolProficiencies:
  - "Carpenter's Tools"

tags:
  - party
  - fighter
  - champion
  - martial
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "rudiger"
    type: "ally"
  - entity: "stol"
    type: "ally"
  - entity: "skid-demon"
    type: "ally"
  - entity: "accoa"
    type: "ally"
firstAppearance: "session-01-the-bell-of-shavras"
visibility: "public"
---

# Kei Eaglesnout

A Male Human Fighter who has chosen the Champion martial archetype. Kei is renowned for his exceptional strength, combat prowess, and competitive spirit—as demonstrated by his arm-wrestling victory in Astgrove.

## Key Moments

### Session 1 - Party Formation
Joined the party in Phandalin, answering Townmaster Riglid's call to investigate the raids.

### Session 4 - Releasing the Souls
After defeating the Night Hag, Kei released the trapped souls from her Soul Bag, freeing the tormented spirits she had collected.

### Session 6 - Arm-Wrestling Champion
Won the arm-wrestling competition at The Mason and the Chain tavern in Astgrove, defeating 3 of 4 competitors and claiming the 400gp prize.

### Session 8 - Cornerstone Tavern
Stayed behind with Stol to finish off the thugs at the Cornerstone Tavern in Sharn when the party's Black Mantle cover was blown.

### Session 9 - Vision in the Dhakaani Ruins
Experienced a haunting vision in the Hall of Warriors—the weight of command and failure, echoing the burden carried by ancient Dhakaani generals. This psychic experience showed Kei the consequences of leadership in war.

## Combat Role

As the party's frontline damage dealer and tank, Kei excels at sustained melee combat. With Extra Attack and high Strength, he can reliably put out consistent damage every turn. The Champion's Improved Critical gives him a 10% chance of devastating critical hits, and his Topple mastery allows battlefield control by knocking enemies Prone for the party to capitalize on.

## The Eaglesnout Academy

After Session 10, Kei received word that his family farm had been destroyed. With support from the Emerald Enclave, he returned home—not just to rebuild, but to pursue a dream: founding the **[Eaglesnout Academy](/eaglesnout-academy)**, a place to train future guardians of the realms.

Before departing, Kei left gifts for each party member: pieces of Eaglesnout clan tartan that carry a portion of his strength (+1 STR when equipped). His farewell letter speaks to the bonds forged through adventure:

> *"My friends, it has been one of life's great joys to come to know and fight alongside you all. I hold hope that our paths will cross again. Until then, wield your strength in my absence."*

The Emerald Enclave watches over Kei, and his legacy continues through the adventurers he trained and inspired.

---

## In Memoriam

*Kei Eaglesnout was brought to life by **tyrjal**, whose strength of spirit matched that of his champion. Though the player has left this world, Kei's story lives on in these chronicles.*

*The Eaglesnout Academy will train guardians for generations to come. And we carry the tartan forward, into whatever darkness awaits.*

*Rest well, friend. We miss you.*
