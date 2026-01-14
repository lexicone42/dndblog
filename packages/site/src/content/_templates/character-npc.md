---
# =============================================================================
# NPC Template
# Copy this file to: src/content/campaign/characters/[npc-slug].md
# =============================================================================

name: "NPC Name"
subtype: npc
status: active          # active | inactive | dead | missing | unknown

# Basic Info (all optional for NPCs)
race: ""
class: ""
background: ""
alignment: ""

# Location & Affiliations
location: ""            # Current location slug
homeLocation: ""
faction: ""             # Primary faction slug
secondaryFactions: []

# Role-playing hooks
ideals: []
bonds: []
flaws: []

# =============================================================================
# Relationships (important for NPCs!)
# =============================================================================
relationships: []
# Examples:
# - entity: "tavern-owner-slug"
#   type: "employer"
#   note: "Works as a barmaid"
# - entity: "villain-slug"
#   type: "enemy"
#   note: "Seeks revenge for family"
# - entity: "pc-slug"
#   type: "ally"
#   note: "Owes a favor"

# =============================================================================
# Tracking
# =============================================================================
firstAppearance: ""     # Session slug where first introduced
lastAppearance: ""
tags:
  - "quest-giver"       # Useful tags: quest-giver, merchant, ally, informant

# Visibility: dm-only hides from player-facing pages
visibility: public

description: ""
---

## Role in Story

<!-- What is this NPC's purpose? Quest giver? Information source? Ally? -->

## Personality

<!-- Key personality traits, mannerisms, voice/accent notes -->

## Secrets

<!-- DM-only information about this NPC -->

## Key Dialogue

> "Sample dialogue that captures their voice"

## Notes

<!-- Session notes, plot connections, etc. -->
