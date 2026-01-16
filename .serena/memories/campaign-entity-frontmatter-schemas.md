# Campaign Entity Frontmatter Schemas

This document describes the repeatable frontmatter formats for creating campaign entities in `packages/site/src/content/campaign/`.

## Base Fields (All Entity Types)

All entities share these base fields:

```yaml
name: "Entity Name"
type: "character" | "enemy" | "location" | "faction" | "item"
status: "active" | "inactive" | "dead" | "destroyed" | "unknown" | "missing" | "transformed" | "dormant"
visibility: "public" | "dm-only"
description: "Short description for lists and previews"

tags:
  - tag1
  - tag2

relationships:
  - entity: "other-entity-slug"
    type: "relationship-type"
    note: "Optional context"
```

---

## Character Schema

Location: `packages/site/src/content/campaign/characters/`

### NPC Template
```yaml
---
name: "Character Name"
type: "character"
subtype: "npc"  # pc | npc | deity | historical
status: "active"
visibility: "public"
description: "Brief description"

faction: "faction-slug"  # Primary faction
secondaryFactions: []    # Additional affiliations

tags:
  - npc
  - ally | enemy | neutral
  - other-tags

relationships:
  - entity: "the-party"
    type: "ally"
    note: "Context for relationship"
  - entity: "faction-slug"
    type: "member"
---

# Character Name

Markdown body content here...
```

### PC Template (Player Characters have additional fields)
```yaml
---
name: "Character Name"
type: "character"
subtype: "pc"
status: "active"
visibility: "public"
description: "Brief description"

player: "Player Name"
race: "Human"
class: "Fighter"
subclass: "Champion"
level: 7
background: "Soldier"
faction: "the-party"

# Optional D&D 5e mechanical stats
abilityScores:
  str: 16
  dex: 14
  con: 15
  int: 10
  wis: 12
  cha: 8

combat:
  ac: 18
  hp: 52
  maxHp: 52
  speed: 30
---
```

---

## Location Schema

Location: `packages/site/src/content/campaign/locations/`

```yaml
---
name: "Location Name"
type: "location"
subtype: "city"  # plane | continent | region | city | town | village | dungeon | wilderness | building | room | landmark
status: "active"
visibility: "public"
description: "Brief description"

parentLocation: "parent-slug"  # Optional
childLocations: []             # Optional

tags:
  - city
  - eberron
  - other-tags

relationships:
  - entity: "faction-slug"
    type: "controlled-by"
---

# Location Name

Markdown body content with subsections...

## Key Locations

### Sub-location Name
- Detail 1
- Detail 2
```

---

## Faction Schema

Location: `packages/site/src/content/campaign/factions/`

```yaml
---
name: "Faction Name"
type: "faction"
subtype: "guild"  # cult | guild | government | military | religious | criminal | merchant | noble-house | adventuring-party | secret-society
status: "active"
visibility: "public"
description: "Brief description"

symbol: "Description of symbol"

tags:
  - tag1
  - tag2

relationships:
  - entity: "leader-slug"
    type: "led-by"
  - entity: "enemy-faction-slug"
    type: "enemy"
---

# Faction Name

Markdown body content...
```

---

## Item Schema

Location: `packages/site/src/content/campaign/items/`

```yaml
---
name: "Item Name"
type: "item"
subtype: "wondrous"  # weapon | armor | artifact | consumable | quest | treasure | tool | wondrous | vehicle | property
status: "active"
visibility: "public"
description: "Brief description"

rarity: "legendary"  # common | uncommon | rare | very-rare | legendary | artifact | unique
attunement: false

owner: "character-slug"  # Optional - use currentOwner for formal tracking
location: "location-slug"  # Optional

tags:
  - legendary
  - other-tags

relationships:
  - entity: "faction-slug"
    type: "created"
  - entity: "character-slug"
    type: "owned-by"
---

# Item Name

Markdown body content...
```

---

## Enemy Schema

Location: `packages/site/src/content/campaign/enemies/`

```yaml
---
name: "Enemy Name"
type: "enemy"
subtype: "boss"  # boss | lieutenant | minion | creature | swarm | trap
status: "active"
visibility: "public"
description: "Brief description"

baseMonster: "monster-name"  # D&D 5e API reference
cr: "5"                       # Challenge rating

faction: "faction-slug"

tags:
  - boss
  - other-tags

relationships:
  - entity: "faction-slug"
    type: "member"
---

# Enemy Name

Markdown body content...
```

---

## Blog Post Schema

Location: `packages/site/src/content/blog/`

```yaml
---
title: "Session X: Title"
description: "Short description for SEO and previews"
pubDate: 2025-01-14
heroImage: "/assets/heroes/session-x-slug.svg"  # Optional
tags: ["session", "arc-2", "location", "faction"]
draft: false
---

## Section Title

Markdown body in first-person plural ("We", "us") style...
```

---

## Common Relationship Types

- `ally`, `enemy`, `neutral` - Disposition
- `member`, `leader-of`, `led-by` - Faction membership
- `created`, `owned-by`, `given-by` - Item provenance
- `connected`, `located-in` - Spatial relationships
- `guards`, `sought-by` - Quest-related

---

## Entity Slug Conventions

- Use lowercase kebab-case: `arvell-dcannith`
- NPCs: `first-lastname` or just `name`
- Locations: `location-name`
- Items: `item-name` (no "the")
- Factions: `faction-name`

---

## File Naming

Files use the slug as filename with `.md` extension:
- `packages/site/src/content/campaign/characters/arvell-dcannith.md`
- `packages/site/src/content/campaign/items/heart-of-the-wild.md`
