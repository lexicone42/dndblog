---
name: "Rudiger"
type: "character"
subtype: "pc"
status: "active"
description: "A Human Wizard of the Evoker school, master of fire and lightning magic with a noted internal conflict"
race: "Human"
class: "Wizard"
subclass: "Evoker"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Human"
  background: "Sage"
  originFeat: "Magic Initiate (Wizard)"
  backgroundAbilityMods: ["int", "int", "con"]

# Ability Scores
abilityScores:
  str: 8
  dex: 14
  con: 12
  int: 18
  wis: 10
  cha: 15

# Combat Stats
combat:
  ac: 12
  hp: 49
  maxHp: 49
  speed: 30
  initiative: 2
  proficiencyBonus: 3
  hitDice: "6d6"

# Saving Throws (INT and WIS proficient for Wizard)
savingThrows:
  str: false
  dex: false
  con: false
  int: true
  wis: true
  cha: false

# Skills
skills:
  - name: "Arcana"
    proficient: true
    expertise: true
    bonus: 10
  - name: "History"
    proficient: true
    bonus: 7
  - name: "Investigation"
    proficient: true
    bonus: 7
  - name: "Acrobatics"
    proficient: true
    bonus: 5
  - name: "Insight"
    proficient: true
    bonus: 3
  - name: "Perception"
    proficient: true
    bonus: 3

# Senses
senses:
  passivePerception: 13
  passiveInvestigation: 17
  passiveInsight: 13

# Spellcasting
spellcasting:
  ability: "int"
  spellSaveDC: 15
  spellAttackBonus: 7
  spellSlots:
    - { level: 1, total: 4, expended: 0 }
    - { level: 2, total: 3, expended: 0 }
    - { level: 3, total: 3, expended: 0 }
  cantrips:
    - "Ray of Frost"
    - "Fire Bolt"
    - "Light"
    - "Mage Hand"
  preparedSpells:
    - "Fireball"
    - "Lightning Bolt"
    - "Counterspell"
    - "Shield"
    - "Misty Step"
    - "Melf's Acid Arrow"
    - "Magic Missile"

# Equipment
equipment:
  equipped:
    - slot: "main-hand"
      item: "quarterstaff"
      mastery: "topple"
    - slot: "off-hand"
      item: "dagger"
      mastery: "nick"
  mundane:
    - name: "Component pouch"
      quantity: 1
    - name: "Spellbook"
      quantity: 1
    - name: "Scroll of Lightning Resistance"
      quantity: 1
      notes: "Gift from Rook Targrave"
    - name: "Calligrapher's Supplies"
      quantity: 1
  currency:
    gp: 150
    sp: 20

# Class Features
features:
  - name: "Spellcasting"
    source: "class"
    level: 1
  - name: "Arcane Recovery"
    source: "class"
    level: 1
    description: "Recover spell slots during short rest"
    uses:
      current: 1
      max: 1
      recharge: "long-rest"
  - name: "Evocation Savant"
    source: "subclass"
    level: 2
    description: "Copy evocation spells at half time and gold cost"
  - name: "Sculpt Spells"
    source: "subclass"
    level: 2
    description: "Protect allies from your evocation spells"
  - name: "Potent Cantrip"
    source: "subclass"
    level: 6
    description: "Cantrips deal half damage on successful saves"

# Proficiencies
languages:
  - "Common"
  - "Draconic"
  - "Elvish"
weaponProficiencies:
  - "Simple Weapons"
toolProficiencies:
  - "Calligrapher's Supplies"

tags:
  - party
  - wizard
  - evoker
  - fire-magic
  - lightning-magic
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "stol"
    type: "ally"
    note: "Restored Stol after falling to the Fallen Priest"
  - entity: "kei"
    type: "ally"
  - entity: "skid-demon"
    type: "ally"
  - entity: "accoa"
    type: "ally"
  - entity: "rook-targrave"
    type: "mentor"
    note: "Gave Scroll of Lightning Resistance"
  - entity: "emerald-enclave"
    type: "ally"
firstAppearance: "session-01-the-bell-of-shavras"
visibility: "public"
---

# Rudiger

A Human Wizard of the Evoker school whose internal conflict has been noted by Rook Targrave of the Emerald Enclave. Rudiger specializes in devastating area-effect spells, particularly fire and lightning magic.

## Key Moments

### Session 1 - Party Formation
Joined the party in Phandalin as a Human Rogue (later multiclassed to Wizard).

### Session 5 - Internal Conflict
Rook Targrave sensed an internal conflict in Rudiger and took him aside to his study. Rook demonstrated his own magical power and gave Rudiger a Scroll of Lightning Resistance, saying: "The storm within us can manifest out if we are not careful."

### Session 7 - Nythraxil's Lair
Successfully secured the ley stone from Nythraxil's lair after the ancient rose quartz dragon's death, a critical victory for the party.

### Session 8 - Lightning Rail Battle
Rudiger's Fireball proved particularly devastating during the combat aboard the Lightning Rail, igniting the sleeping Circle agents' car and eliminating all but one.

### Session 8 - Sharn Chase
Attempted to stop the fleeing pickpocket with Ray of Frost but missed.

## Combat Role

As the party's primary arcane damage dealer, Rudiger excels at eliminating groups of enemies with area-effect spells. His Evoker specialization allows him to position Fireballs without endangering allies. The high Intelligence (+4) gives him exceptional Arcana and Investigation skills, making him valuable for identifying magical threats and solving puzzles.
