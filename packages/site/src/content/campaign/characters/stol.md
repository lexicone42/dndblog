---
name: "Stol"
type: "character"
subtype: "pc"
status: "active"
description: "A steadfast Human Cleric devoted to healing and protecting his allies, wielder of the Mace of Disruption"
race: "Human"
class: "Cleric"
subclass: "Life Domain"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Human"
  background: "Acolyte"
  originFeat: "Healer"

# Ability Scores
abilityScores:
  str: 12
  dex: 12
  con: 13
  int: 9
  wis: 16
  cha: 15

# Combat Stats
combat:
  ac: 17
  hp: 44
  maxHp: 44
  speed: 30
  initiative: 1
  proficiencyBonus: 3
  hitDice: "6d8"

# Saving Throws (WIS and CHA proficient for Cleric)
savingThrows:
  str: false
  dex: false
  con: false
  int: false
  wis: true
  cha: true

# Skills
skills:
  - name: "Insight"
    proficient: true
    bonus: 6
  - name: "Medicine"
    proficient: true
    bonus: 6
  - name: "Survival"
    proficient: true
    bonus: 6
  - name: "History"
    proficient: true
    bonus: 2
  - name: "Religion"
    proficient: true
    bonus: 2

# Senses
senses:
  passivePerception: 13
  passiveInvestigation: 9
  passiveInsight: 16

# Spellcasting
spellcasting:
  ability: "wis"
  spellSaveDC: 14
  spellAttackBonus: 6
  spellSlots:
    - { level: 1, total: 4, expended: 0 }
    - { level: 2, total: 3, expended: 0 }
    - { level: 3, total: 3, expended: 0 }
  cantrips:
    - "Sacred Flame"
    - "Spare the Dying"
    - "Guidance"
    - "Light"
  preparedSpells:
    - "Cure Wounds"
    - "Healing Word"
    - "Guiding Bolt"
    - "Shield of Faith"
    - "Spiritual Weapon"
    - "Prayer of Healing"
    - "Spirit Guardians"
    - "Mass Healing Word"

# Equipment
equipment:
  equipped:
    - slot: "main-hand"
      item: "mace-of-disruption"
      mastery: "sap"
    - slot: "off-hand"
      item: "devotees-censer"
    - slot: "armor"
      item: "chain-mail"
    - slot: "shield"
      item: "shield"
  mundane:
    - name: "Holy Symbol"
      quantity: 1
    - name: "Healer's Kit"
      quantity: 1
    - name: "Calligrapher's Supplies"
      quantity: 1

# Class Features
features:
  - name: "Channel Divinity"
    source: "class"
    level: 2
    uses:
      current: 3
      max: 3
      recharge: "long-rest"
  - name: "Turn Undead"
    source: "class"
    level: 2
    description: "Forces undead to flee, crucial against Dhakaani Wraith-Tacticians"
  - name: "Sear Undead"
    source: "class"
    level: 2
    description: "Deals 1d8 radiant damage to undead creatures"
  - name: "Battle Medic"
    source: "class"
    level: 3
    description: "Use Healer's Kit to heal creature within 5 ft equal to Hit Die +3"
  - name: "Destroy Undead"
    source: "class"
    level: 5
    description: "Undead CR 1/2 or lower destroyed by Turn Undead"
  - name: "Blessed Healer"
    source: "subclass"
    level: 6
    description: "When casting healing spell on another, heal self for 2 + spell level"

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
  - "Calligrapher's Supplies"

tags:
  - party
  - cleric
  - healer
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "rudiger"
    type: "ally"
    note: "Restored by Rudiger after falling to the Fallen Priest"
  - entity: "the-fallen-priest"
    type: "enemy"
    note: "Fell in battle against him"
firstAppearance: "session-01-the-bell-of-shavras"
visibility: "public"
---

# Stol

A Human Cleric whose Turn Undead ability and healing magic have proven invaluable against the undead threats the party has faced. Stol serves as the party's primary healer and spiritual anchor.

## Key Moments

### Session 1 - Party Formation
Joined the party in Phandalin, answering Townmaster Riglid's call to investigate the raids.

### Session 3 - Whisperwood Ossuary
Used Turn Undead to repel skeletal warriors and zombies in the haunted ossuary.

### Battle with the Fallen Priest
Fell during the climactic battle with the Fallen Priest at the Shrine of Shavras, but was restored by Rudiger.

### Session 5 - The Vault of Shavras
Turn Undead proved crucial in defeating the undead priests guarding the vault.

### Dhakaani Ruins
Turn Undead was instrumental in defeating the Dhakaani Wraith-Tacticians in the ancient ruins beneath Sharn. Also cast Moonbeam (via Accoa) to break the wraiths' fear spell.

## Combat Role

As the party's primary healer and undead specialist, Stol provides crucial support in battle. His Channel Divinity abilities make him especially effective against the undead threats the party frequently encounters. The Mace of Disruption deals devastating bonus damage to undead, making Stol both a healer and a formidable combatant against unholy foes.
