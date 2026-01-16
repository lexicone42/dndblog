---
name: "Cribben Hayduke"
type: "character"
subtype: "pc"
status: "transformed"
description: "An Elf Druid who was cursed by the Night Hag and transformed into a toad, disappearing into Whisperwood Forest"
race: "Elf"
class: "Druid"
level: 3

# D&D 5e 2024 Origin (pre-transformation)
origin:
  species: "Elf"
  lineage: "Wood Elf"
  background: "Hermit"

# Ability Scores (estimated from narrative)
abilityScores:
  str: 10
  dex: 14
  con: 12
  int: 12
  wis: 16
  cha: 10

# Combat Stats (pre-transformation)
combat:
  ac: 14
  hp: 21
  maxHp: 21
  speed: 35
  initiative: 2
  proficiencyBonus: 2
  hitDice: "3d8"

# Saving Throws (INT and WIS proficient for Druid)
savingThrows:
  str: false
  dex: false
  con: false
  int: true
  wis: true
  cha: false

# Senses
senses:
  darkvision: 60
  passivePerception: 13

# Spellcasting (pre-transformation)
spellcasting:
  ability: "wis"
  spellSaveDC: 13
  spellAttackBonus: 5
  spellSlots:
    - { level: 1, total: 4, expended: 0 }
    - { level: 2, total: 2, expended: 0 }
  cantrips:
    - "Thorn Whip"
    - "Druidcraft"
  preparedSpells:
    - "Entangle"
    - "Goodberry"
    - "Thunderwave"
    - "Moonbeam"

# Class Features (pre-transformation)
features:
  - name: "Wild Shape"
    source: "class"
    level: 2
    description: "Transform into beasts (final transformation was involuntary)"
    uses:
      current: 0
      max: 2
      recharge: "short-rest"
  - name: "Druidic"
    source: "class"
    level: 1
    description: "Secret language of druids"

# Proficiencies
languages:
  - "Common"
  - "Druidic"
  - "Elvish"
  - "Sylvan"
armorProficiencies:
  - "Light Armor"
  - "Medium Armor"
  - "Shields"
weaponProficiencies:
  - "Simple Weapons"
  - "Scimitars"

tags:
  - party
  - druid
  - elf
  - cursed
  - whisperwood-survivor
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "former-member-of"
  - entity: "night-hag"
    type: "enemy"
    note: "Cursed him into toad form"
  - entity: "rudiger"
    type: "ally"
  - entity: "stol"
    type: "ally"
  - entity: "kei"
    type: "ally"
  - entity: "skid-demon"
    type: "ally"
firstAppearance: "session-01-the-bell-of-shavras"
lastAppearance: "session-04-the-dryads-blessing"
visibility: "public"
---

# Cribben Hayduke

An Elf Druid who was one of the original members of the adventuring party. Cribben's fate took a dark turn when the Night Hag's curse affected him differently than the others, transforming him into a toad. He hopped off into Whisperwood Forest and was never seen again.

## Background

Cribben joined the party at the very beginning of their adventure in Phandalin, answering Townmaster Riglid's call to investigate the raids and kidnappings plaguing the town's supply lines.

## Key Moments

### Session 3 - The Ulfandor Mines
During the battle in the skeletal ossuary, Cribben initially transformed into a rat but then used his Thorn Whip to incapacitate enemies and allow the party to gain the upper hand.

### Session 4 - The Night Hag's Curse
When the Night Hag cursed the party in Whisperwood Forest, the curse affected Cribben differently than the others. While the rest of the party suffered wisdom penalties that the Dryad Erinthin later lifted, Cribben was unwillingly [transmuted into something else](/toad)... and hopped off into the forest, never to be seen again.

## Current Status

Cribben's fate remains unknown. Whether he still lives somewhere in Whisperwood as a toad, eventually broke free of the curse, or met some other end is a mystery. The Dryad Erinthin lifted the curse on the remaining party members, but Cribben had already disappeared into the forest by that time.

## Legacy

Cribben's sudden disappearance serves as a stark reminder of the Night Hag's cruelty and the dangerous, unpredictable nature of Whisperwood Forest. His empty place at the party's campfire is a wound that has never fully healed.
