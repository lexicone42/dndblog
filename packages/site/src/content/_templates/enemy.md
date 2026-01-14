---
# =============================================================================
# Enemy Template
# Copy this file to: src/content/campaign/enemies/[enemy-slug].md
# =============================================================================

name: "Enemy Name"
subtype: creature       # boss | lieutenant | minion | creature | swarm | trap
status: active          # active | dead | destroyed | unknown | dormant

# Monster Reference
baseMonster: ""         # Base monster from SRD (e.g., "goblin", "dragon")
cr: "1/4"               # Challenge Rating
creatureType: ""        # beast, humanoid, undead, fiend, etc.

# =============================================================================
# Combat Customizations
# =============================================================================
customizations: []
# Examples:
# - "Increased HP to 45"
# - "Added fire resistance"
# - "Wields a magic sword (+1)"

legendaryActions: []
# For bosses - describe legendary actions

lairActions: []
# For lair encounters

# =============================================================================
# Organization
# =============================================================================
faction: ""             # Faction this enemy belongs to
master: ""              # Character/enemy slug of their master
minions: []             # Enemy slugs of their minions

# Locations
lair: ""                # Primary lair location slug
territory: []           # Location slugs they control/patrol

# =============================================================================
# Encounter History
# =============================================================================
encounters: []          # Session slugs where encountered

defeats: []
# When/if defeated:
# - session: "session-5"
#   method: "Killed in combat"
#   defeatedBy:
#     - "rudiger"
#     - "stol"

# =============================================================================
# Relationships
# =============================================================================
relationships: []
# Examples:
# - entity: "villain-slug"
#   type: "serves"
#   note: "Loyal lieutenant"
# - entity: "rival-enemy-slug"
#   type: "rival"
#   note: "Competing for territory"

# =============================================================================
# Tracking
# =============================================================================
firstAppearance: ""     # Session slug
lastAppearance: ""
tags: []                # Useful: undead, flying, spellcaster, ranged

visibility: public      # dm-only to hide from players
description: ""
---

## Tactics

<!-- How does this enemy fight? What strategies do they use? -->

## Motivation

<!-- Why are they opposing the party? What do they want? -->

## Stat Block Modifications

<!-- Any changes from the base monster stat block -->

## Loot

<!-- What do they carry? What can be harvested? -->

## Notes

<!-- Session notes, plot hooks, memorable moments -->
