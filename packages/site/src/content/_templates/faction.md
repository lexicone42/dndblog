---
# =============================================================================
# Faction Template
# Copy this file to: src/content/campaign/factions/[faction-slug].md
# =============================================================================

name: "Faction Name"
subtype: guild          # cult | guild | government | military | religious | criminal | merchant | noble-house | adventuring-party | secret-society
status: active          # active | inactive | destroyed | unknown | dormant

# =============================================================================
# Leadership
# =============================================================================
leader: ""              # Character slug of current leader
formerLeaders: []       # Previous leader slugs
notableMembers: []      # Important member slugs

# =============================================================================
# Territory & Influence
# =============================================================================
headquarters: ""        # Location slug
territory: []           # Location slugs they control
influence: []           # Location slugs where they have influence (but don't control)

# =============================================================================
# Relationships
# =============================================================================
allies: []              # Allied faction slugs
enemies: []             # Enemy faction slugs

parentOrganization: ""  # If this is a chapter/branch of larger org
subsidiaries: []        # Sub-organizations

relationships: []
# More nuanced relationships:
# - entity: "merchant-guild"
#   type: "trade-partner"
#   note: "Mutually beneficial arrangement"
# - entity: "pc-slug"
#   type: "patron"
#   note: "Hired the party for a mission"

# =============================================================================
# Identity
# =============================================================================
symbol: ""              # Description of their symbol/crest
motto: ""               # Their motto or creed

goals: []
# What does this faction want?
# - "Control all trade in the region"
# - "Awaken the sleeping god"

methods: []
# How do they achieve their goals?
# - "Bribery and political manipulation"
# - "Assassination of rivals"

resources: []
# What resources do they have?
# - "Vast treasury"
# - "Network of spies"
# - "Ancient magical artifacts"

# =============================================================================
# Secrets
# =============================================================================
secrets: []
# DM-only information:
# - "The leader is actually undead"
# - "They're secretly funded by the BBEG"

# =============================================================================
# Tracking
# =============================================================================
firstAppearance: ""     # Session slug
lastAppearance: ""
tags: []                # Useful: ally, enemy, patron, mysterious

visibility: public
description: ""
---

## Overview

<!-- What is this faction? What role do they play in the world? -->

## History

<!-- How did this faction form? Major events in their past -->

## Structure

<!-- How is the faction organized? Ranks, titles, hierarchy -->

## Joining

<!-- How does one become a member? Requirements, initiation -->

## Resources & Assets

<!-- What do they have access to? Locations, items, people -->

## Current Activities

<!-- What are they doing right now in the campaign? -->

## Relationship with the Party

<!-- How have they interacted with the PCs? -->

## Secrets

<!-- DM-only information -->
