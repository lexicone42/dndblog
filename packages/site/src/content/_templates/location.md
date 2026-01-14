---
# =============================================================================
# Location Template
# Copy this file to: src/content/campaign/locations/[location-slug].md
# =============================================================================

name: "Location Name"
subtype: city           # plane | continent | region | city | town | village | dungeon | wilderness | building | room | landmark
status: active          # active | destroyed | abandoned | unknown

# =============================================================================
# Hierarchy
# =============================================================================
parentLocation: ""      # Slug of containing location (e.g., city is in region)
childLocations: []      # Slugs of contained locations

# =============================================================================
# Geography
# =============================================================================
climate: ""             # temperate, arctic, tropical, desert, etc.
terrain: ""             # forest, mountains, plains, swamp, urban, etc.
population: ""          # "~3,000", "sparse", "uninhabited", etc.

# For dungeons
dungeonLevel: null      # 1, 2, 3... for dungeon floors

# =============================================================================
# Control & Politics
# =============================================================================
controlledBy: ""        # Faction or character slug
formerControllers: []   # Previous controllers

# =============================================================================
# Points of Interest
# =============================================================================
pointsOfInterest: []
# Describe or link notable places within this location
# - "The Golden Tankard tavern"
# - "Mayor's mansion"
# - "Ancient shrine in the woods"

# =============================================================================
# History & Events
# =============================================================================
notableEvents: []
# Major events that happened here
# - "The Great Fire of 1042"
# - "Where the party defeated the vampire"

secrets: []
# DM-only secrets
# - "Hidden entrance to the Underdark beneath the well"
# - "The mayor is actually a doppelganger"

# =============================================================================
# Relationships
# =============================================================================
relationships: []
# Examples:
# - entity: "allied-city-slug"
#   type: "trade-partner"
#   note: "Major trade route between them"
# - entity: "enemy-faction-slug"
#   type: "threatened-by"
#   note: "Under siege"

# =============================================================================
# Tracking
# =============================================================================
firstAppearance: ""     # Session slug
lastAppearance: ""
tags: []                # Useful: safe-haven, dangerous, quest-location, shop

visibility: public
description: ""
---

## Overview

<!-- General description of this location -->

## Notable Features

<!-- What stands out about this place? -->

## Inhabitants

<!-- Who lives/works here? NPCs of note -->

## History

<!-- How did this place come to be? Major events -->

## Hooks & Rumors

<!-- Adventure hooks, local rumors, quest starters -->

## Secrets

<!-- DM-only information -->

## Map Notes

<!-- Description of layout, or reference to a map file -->
