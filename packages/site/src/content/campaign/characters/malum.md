---
name: "Malum Munus Exemplar"
type: "character"
subtype: "pc"
status: "active"
description: "A cunning Half-Elf assassin with expertise in stealth, intimidation, and social manipulation"
race: "Half-Elf"
class: "Rogue"
subclass: "Assassin"
level: 6

# D&D 5e 2024 Origin
origin:
  species: "Half-Elf"
  background: "Criminal"
  originFeat: "Alert"

# Ability Scores
abilityScores:
  str: 8
  dex: 17
  con: 13
  int: 15
  wis: 10
  cha: 13

# Combat Stats
combat:
  ac: 17
  hp: 44
  maxHp: 44
  speed: 30
  initiative: 6
  proficiencyBonus: 3
  hitDice: "6d8"

# Saving Throws (DEX and INT proficient for Rogue)
savingThrows:
  str: false
  dex: true
  con: false
  int: true
  wis: false
  cha: false

# Skills
skills:
  - name: "Stealth"
    proficient: true
    expertise: true
    bonus: 9
  - name: "Intimidation"
    proficient: true
    expertise: true
    bonus: 7
  - name: "Persuasion"
    proficient: true
    expertise: true
    bonus: 7
  - name: "Insight"
    proficient: true
    expertise: true
    bonus: 6
  - name: "Acrobatics"
    proficient: true
    bonus: 6
  - name: "Sleight of Hand"
    proficient: true
    bonus: 6
  - name: "Deception"
    proficient: true
    bonus: 4
  - name: "Athletics"
    proficient: true
    bonus: 2

# Senses
senses:
  darkvision: 60
  passivePerception: 10
  passiveInvestigation: 12
  passiveInsight: 16

# Defenses
defenses:
  resistances:
    - "Bludgeoning (nonmagical)"
    - "Piercing (nonmagical)"
    - "Slashing (nonmagical)"
  conditionImmunities:
    - "Magical Sleep"

# Equipment
equipment:
  equipped:
    - slot: "main-hand"
      item: "scimitar"
      mastery: "nick"
    - slot: "off-hand"
      item: "dagger"
      mastery: "nick"
    - slot: "armor"
      item: "studded-leather"
  mundane:
    - name: "Light Crossbow"
      quantity: 1
    - name: "Shortbow"
      quantity: 1
    - name: "Daggers"
      quantity: 2
    - name: "Thieves' Tools"
      quantity: 1
    - name: "Disguise Kit"
      quantity: 1
    - name: "Poisoner's Kit"
      quantity: 1

# Class Features
features:
  - name: "Sneak Attack"
    source: "class"
    level: 1
    description: "Deal 3d6 extra damage when you have advantage or an ally is within 5 ft of target"
  - name: "Expertise"
    source: "class"
    level: 1
    description: "Double proficiency in Stealth, Intimidation, Persuasion, Insight"
  - name: "Cunning Action"
    source: "class"
    level: 2
    description: "Dash, Disengage, or Hide as a bonus action"
  - name: "Assassinate"
    source: "subclass"
    level: 3
    description: "Advantage on attacks against creatures that haven't acted; crits against surprised creatures"
  - name: "Uncanny Dodge"
    source: "class"
    level: 5
    description: "Use reaction to halve damage from an attack you can see"

# Proficiencies
languages:
  - "Common"
  - "Elvish"
  - "Goblin"
  - "Thieves' Cant"
  - "Undercommon"
armorProficiencies:
  - "Light Armor"
weaponProficiencies:
  - "Simple Weapons"
  - "Hand Crossbow"
  - "Rapier"
  - "Scimitar"
  - "Shortsword"
  - "Whip"
toolProficiencies:
  - "Thieves' Tools"
  - "Disguise Kit"
  - "Poisoner's Kit"
  - "Darts"

tags:
  - party
  - assassin
  - stealth
  - the-mawframe
relationships:
  - entity: "the-party"
    type: "member-of"
  - entity: "dain"
    type: "ally"
    note: "Gave Dain Adabra's letter for Riglid"
firstAppearance: "session-01-the-bell-of-shavras"
visibility: "public"
---

# Malum Munus Exemplar

Known simply as "Mal" to companions, Malum is a Male Half-Elf Rogue who has honed his skills as a deadly shadow operative. With expertise in stealth, intimidation, and persuasion, Mal serves as both the party's scout and its silver tongue.

## Key Moments

### The Ulfandor Mines
When Dain was left behind after having his tongue torn out by the Fallen Priest, Mal gave him the letter from Adabra Gwynn to deliver to Riglid, the Townmaster of Phandalin.

### The Whisperwood
While making camp in the haunted forest, Mal's keen eyes discovered a torn piece of fabric from a dress—a vital clue that led Greeve to have a vision of Aidin in danger.

## Combat Role

As a Rogue with expertise in Stealth (+9), Mal excels at reconnaissance and delivering devastating Sneak Attacks from the shadows. The combination of high Intimidation and Persuasion makes Mal equally dangerous in social encounters, able to extract information or cow enemies into submission.
