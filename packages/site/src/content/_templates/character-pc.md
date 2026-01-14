---
# =============================================================================
# Player Character Template
# Copy this file to: src/content/campaign/characters/[character-slug].md
# =============================================================================

name: "Character Name"
subtype: pc
player: "Player Name"
status: active          # active | inactive | dead | missing | transformed

# Basic Info
race: "Human"           # Species name
class: "Fighter"        # Primary class
subclass: "Champion"    # Subclass (if applicable)
level: 1
background: "Soldier"
alignment: "Neutral Good"

# Location & Affiliations
location: ""            # Current location slug (e.g., "astgrove")
homeLocation: ""        # Home location slug
faction: ""             # Primary faction slug
secondaryFactions: []   # Additional faction slugs

# Personality
ideals:
  - ""
bonds:
  - ""
flaws:
  - ""

# =============================================================================
# D&D 5e 2024 Origin (optional - for full character sheet support)
# =============================================================================
origin:
  species: "Human"
  lineage: ""           # "High Elf", "Protector Aasimar", etc.
  size: medium
  background: "Soldier"
  originFeat: ""        # Feat from background
  backgroundAbilityMods: []  # Which abilities background boosted

# =============================================================================
# Combat Statistics
# =============================================================================
abilityScores:
  str: 10
  dex: 10
  con: 10
  int: 10
  wis: 10
  cha: 10

combat:
  ac: 10
  hp: 10
  maxHp: 10
  tempHp: 0
  speed: 30
  proficiencyBonus: 2
  hitDice: "1d10"

savingThrows:
  str: false
  dex: false
  con: false
  int: false
  wis: false
  cha: false

skills: []
# Example:
# - name: "Athletics"
#   proficient: true
#   expertise: false

senses:
  passivePerception: 10
  passiveInvestigation: 10
  passiveInsight: 10

defenses:
  resistances: []
  immunities: []
  vulnerabilities: []
  conditionImmunities: []

activeConditions: []
# Example:
# - name: "Blessed"
#   source: "Bless spell"
#   duration: "1 minute"
#   concentration: true
#   beneficial: true

# =============================================================================
# Proficiencies
# =============================================================================
languages:
  - "Common"

armorProficiencies: []
weaponProficiencies: []
toolProficiencies: []

# =============================================================================
# Equipment
# =============================================================================
equipment:
  equipped: []
  # Example:
  # - slot: main-hand
  #   item: "longsword"      # slug from items collection
  #   attuned: false
  #   mastery: "sap"         # 5e 2024 weapon mastery

  mundane:
    - name: "Backpack"
      quantity: 1

  currency:
    pp: 0
    gp: 10
    ep: 0
    sp: 0
    cp: 0

# =============================================================================
# Spellcasting (if applicable)
# =============================================================================
# spellcasting:
#   ability: int           # int | wis | cha
#   spellSaveDC: 13
#   spellAttackBonus: 5
#   spellSlots:
#     - level: 1
#       total: 2
#       expended: 0
#   cantrips:
#     - "fire-bolt"
#   preparedSpells:
#     - "magic-missile"
#     - "shield"

# =============================================================================
# Features & Traits
# =============================================================================
features: []
# Example:
# - name: "Second Wind"
#   source: class
#   level: 1
#   description: "Regain 1d10 + fighter level HP"
#   uses:
#     current: 1
#     max: 1
#     recharge: short-rest

# =============================================================================
# Relationships & Tracking
# =============================================================================
relationships: []
# Example:
# - entity: "other-character-slug"
#   type: "ally"
#   note: "Fellow party member"

firstAppearance: ""     # Session slug
lastAppearance: ""
tags: []

# Visibility: public = shown on site, dm-only = hidden from players
visibility: public

# Description shown on character page (can also use markdown body below)
description: ""
---

<!-- Character backstory and notes go here in markdown -->

## Backstory

## Notes

## Session Highlights
