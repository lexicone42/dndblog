---
# =============================================================================
# Item Template
# Copy this file to: src/content/campaign/items/[item-slug].md
# =============================================================================

name: "Item Name"
subtype: weapon         # weapon | armor | artifact | consumable | quest | treasure | tool | wondrous | vehicle | property
status: active          # active | destroyed | missing | unknown

# =============================================================================
# Item Properties
# =============================================================================
baseItem: ""            # Base item from SRD (e.g., "longsword", "plate-armor")
magicItem: ""           # Magic item reference if applicable
rarity: common          # common | uncommon | rare | very-rare | legendary | artifact | unique

attunement: false       # Requires attunement?
attunementRequirements: ""  # "by a spellcaster", "by a cleric", etc.

properties: []
# Examples for weapons:
# - "Versatile (1d10)"
# - "Finesse"
# - "+1 to attack and damage"
# - "Deals an extra 1d6 fire damage"

charges: null           # Current charges (if applicable)
maxCharges: null        # Maximum charges

# =============================================================================
# Ownership
# =============================================================================
currentOwner: ""        # Character slug of current owner
location: ""            # Location slug if not owned by anyone

ownershipHistory: []
# Example:
# - owner: "ancient-wizard"
#   method: "Created it"
# - owner: "dragon-hoard"
#   acquiredIn: "session-1"
#   method: "Stolen from wizard"
# - owner: "rudiger"
#   acquiredIn: "session-5"
#   lostIn: ""
#   method: "Looted from dragon"

# =============================================================================
# Lore
# =============================================================================
creator: ""             # Who made this item?
creationDate: ""        # When was it made?
significance: ""        # Why is this item important?

secrets: []
# DM-only secrets about this item
# - "Actually cursed"
# - "Key to unlocking the vault"

# =============================================================================
# Relationships
# =============================================================================
relationships: []
# Examples:
# - entity: "matching-sword-slug"
#   type: "paired-with"
#   note: "Part of a matched set"
# - entity: "villain-slug"
#   type: "sought-by"
#   note: "Will do anything to get it"

# =============================================================================
# Tracking
# =============================================================================
firstAppearance: ""     # Session slug where first found/mentioned
lastAppearance: ""
tags: []                # Useful: cursed, sentient, legendary, quest-item

visibility: public      # dm-only to hide from players
description: ""
---

## Description

<!-- Physical description of the item -->

## Properties

<!-- Mechanical effects and abilities -->

## History

<!-- The item's backstory and how it came to be here -->

## Secrets

<!-- DM-only information -->

## Notes

<!-- Session notes, how it was used, etc. -->
