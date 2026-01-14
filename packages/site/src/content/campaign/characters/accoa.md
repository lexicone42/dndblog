---
name: "Accoa Krigsdottir"
type: "character"
subtype: "pc"
status: "active"
description: "A Protector Aasimar Paladin devoted to the Oath of Ancients, wielding divine light and nature's wrath"
race: "Protector Aasimar"
class: "Paladin"
subclass: "Oath of Ancients"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Aasimar"
  lineage: "Protector"
  background: "Outlander"
  originFeat: "Tough"

# Ability Scores
abilityScores:
  str: 15
  dex: 11
  con: 14
  int: 13
  wis: 15
  cha: 12

# Combat Stats
combat:
  ac: 19
  hp: 57
  maxHp: 57
  speed: 30
  initiative: 0
  proficiencyBonus: 3
  hitDice: "6d10"

# Saving Throws (WIS and CHA proficient for Paladin)
savingThrows:
  str: false
  dex: false
  con: false
  int: false
  wis: true
  cha: true

# Skills
skills:
  - name: "Animal Handling"
    proficient: true
    bonus: 5
  - name: "Athletics"
    proficient: true
    bonus: 5
  - name: "Persuasion"
    proficient: true
    bonus: 4
  - name: "Survival"
    proficient: true
    bonus: 5

# Senses
senses:
  darkvision: 60
  passivePerception: 12
  passiveInvestigation: 11
  passiveInsight: 12

# Defenses
defenses:
  resistances:
    - "Necrotic"
    - "Radiant"
  conditionImmunities:
    - "Disease"

# Spellcasting
spellcasting:
  ability: "cha"
  spellSaveDC: 12
  spellAttackBonus: 4
  spellSlots:
    - { level: 1, total: 4, expended: 0 }
    - { level: 2, total: 2, expended: 0 }
  preparedSpells:
    - "Divine Smite"
    - "Shield of Faith"
    - "Cure Wounds"
    - "Bless"
    - "Misty Step"
    - "Moonbeam"

# Equipment
equipment:
  equipped:
    - slot: "main-hand"
      item: "dragons-wrath-weapon-stirring"
      mastery: "sap"
    - slot: "off-hand"
      item: "shield"
    - slot: "armor"
      item: "plate-armor"
  mundane:
    - name: "Longbow"
      quantity: 1
    - name: "Arrows"
      quantity: 20
    - name: "Alchemist's Supplies"
      quantity: 1

# Class Features
features:
  - name: "Divine Sense"
    source: "class"
    level: 1
    uses:
      current: 4
      max: 4
      recharge: "long-rest"
  - name: "Lay on Hands"
    source: "class"
    level: 1
    description: "Pool of 30 HP to heal or cure disease/poison"
  - name: "Divine Smite"
    source: "class"
    level: 2
    description: "Expend spell slot to deal extra radiant damage on hit"
  - name: "Extra Attack"
    source: "class"
    level: 5
  - name: "Aura of Protection"
    source: "class"
    level: 6
    description: "+1 to saving throws for allies within 10 ft"
  - name: "Channel Divinity"
    source: "subclass"
    level: 3
    uses:
      current: 1
      max: 1
      recharge: "short-rest"
  - name: "Nature's Wrath"
    source: "subclass"
    level: 3
    description: "Spectral vines restrain creatures within 10 ft (STR/DEX save DC 12)"
  - name: "Turn the Faithless"
    source: "subclass"
    level: 3
    description: "Turn fey and fiends"
  - name: "Radiant Soul"
    source: "species"
    level: 1
    description: "Sprout spectral wings, gain flying speed equal to walking speed for 1 minute"
    uses:
      current: 1
      max: 1
      recharge: "long-rest"

# Proficiencies
languages:
  - "Celestial"
  - "Common"
armorProficiencies:
  - "Heavy Armor"
  - "Medium Armor"
  - "Light Armor"
  - "Shields"
weaponProficiencies:
  - "Martial Weapons"
  - "Simple Weapons"
toolProficiencies:
  - "Alchemist's Supplies"
  - "Vehicles (Land)"

tags:
  - party
  - aasimar
  - paladin
  - oath-of-ancients
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "night-hag"
    type: "enemy"
    note: "Kidnapped by her as a child"
  - entity: "dryad-erinthin"
    type: "ally"
    note: "Blessed by the Dryad"
firstAppearance: "session-04-the-dryads-blessing"
visibility: "public"
---

# Accoa Krigsdottir

A Female Protector Aasimar Paladin who has sworn the Oath of Ancients. Accoa was taken from Whisperwood Forest by the Night Hag as a child, freed by the party, and now travels with them wielding divine power and nature magic.

## Origin

Accoa was kidnapped by the Night Hag when young and held captive in Whisperwood Forest for years. The hag drained victims slowly in their sleep, keeping Accoa weak but alive for some unknown purpose. Her celestial heritage as a Protector Aasimar may have been what the hag sought.

## Key Moments

### Freedom from the Night Hag
Helped the party defeat her captor, finally ending years of torment.

### Blessed by Erinthin
The Dryad of the Forest Heart recognized Accoa and blessed her with the forest's protection, which aligned with her Oath of Ancients.

### The Sharn Pursuit
Stunned the pickpocket runner in Sharn's streets, proving her worth as a capable party member.

## Combat Role

As a Paladin with the Oath of Ancients, Accoa serves as both a frontline defender and healer. Her Channel Divinity: Nature's Wrath provides battlefield control, while her Aasimar heritage grants resistance to both necrotic and radiant damage—making her particularly effective against undead and celestial threats alike.
