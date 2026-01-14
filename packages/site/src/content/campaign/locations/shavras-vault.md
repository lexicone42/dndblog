---
name: "Shavras Vault"
type: "location"
subtype: "dungeon"
status: "inactive"
visibility: "public"
description: "Ancient sealed dungeon beneath the Shavras Shrine, now guarded by Greeve's spirit"

# Hierarchy
parentLocation: "shavras"

# Geography
terrain: "underground"

# Control
controlledBy: "greeve"
formerControllers:
  - the-fallen-priest

# Features
pointsOfInterest:
  - heart-chamber

# Cataloging
tags:
  - dungeon
  - sealed
  - ancient
  - vault
  - sacred
  - bloodline

relationships:
  - entity: "greeve"
    type: "guarded-by"
    note: "Eternal wraith guardian"
  - entity: "shavras"
    type: "located-in"
    note: "Beneath the ancient shrine"
  - entity: "the-fallen-priest"
    type: "formerly-controlled"

notableEvents:
  - session-04

secrets:
  - "Contains murals depicting sacred bloodlines"
  - "Heart Chamber holds a floating box with a heart inside"

authority:
  variants:
    - "The Vault"
    - "Shavras Underground"
    - "The Sealed Dungeon"
  broaderTerm: "shavras"
---

# Shavras Vault

An ancient sealed dungeon beneath the Shavras Shrine, containing secrets of sacred bloodlines and treasures from ages past.

## Access

The vault opened after the Fallen Priest's body liquified into the earth following his defeat. It has since been sealed by Greeve's sacrifice.

## Notable Features

### Shadow Memories
The walls display shadow memories of ancient priests, replaying scenes from the distant past.

### Bloodline Murals
Murals depicting sacred bloodlines line the chambers. Greeve recognized his own family crest among them, revealing his unknown royal heritage.

### Heart Chamber
The deepest chamber contains:
- Purple light emanating from unknown sources
- A floating box containing a heart
- The source of the vault's power

## Enemies Encountered

During the party's exploration:
- Goblins
- Skeletal warriors
- An ogre
- Giant spiders

## Treasures Found

Before the vault was sealed:
- Ring of Protection
- Battering Shield
- Bag of Holding
- Pipes of Haunting

## Current Status

**SEALED** - Greeve serves as the eternal guardian. The vault will remain sealed until someone tracks down all of Greeve's ancestors.
