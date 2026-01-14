# Campaign Content Templates

Quick-start templates for creating new campaign entities.

## Usage

1. Copy the appropriate template to the correct content folder
2. Rename the file to your entity's slug (e.g., `harlix-darkleaf.md`)
3. Fill in the frontmatter fields
4. Add markdown content below the `---`

## Templates

| Template | Use For | Copy To |
|----------|---------|---------|
| `character-pc.md` | Player Characters | `campaign/characters/` |
| `character-npc.md` | NPCs, allies, contacts | `campaign/characters/` |
| `enemy.md` | Monsters, villains, bosses | `campaign/enemies/` |
| `item.md` | Weapons, armor, magic items | `campaign/items/` |
| `location.md` | Cities, dungeons, regions | `campaign/locations/` |
| `faction.md` | Organizations, cults, guilds | `campaign/factions/` |

## Quick Create Commands

```bash
# Create a new NPC
cp src/content/_templates/character-npc.md src/content/campaign/characters/new-npc.md

# Create a new enemy
cp src/content/_templates/enemy.md src/content/campaign/enemies/new-enemy.md

# Create a new item
cp src/content/_templates/item.md src/content/campaign/items/new-item.md

# Create a new location
cp src/content/_templates/location.md src/content/campaign/locations/new-location.md

# Create a new faction
cp src/content/_templates/faction.md src/content/campaign/factions/new-faction.md
```

## Draft Workflow

For pre-session prep:

1. Create entities with `visibility: dm-only` to hide from players
2. After the session, change to `visibility: public` when ready to reveal
3. Use `status: unknown` for things not yet encountered

## Required vs Optional Fields

### Always Required
- `name` - Display name
- `subtype` - Entity category

### Recommended
- `status` - Current state
- `description` - Brief summary
- `relationships` - Links to other entities
- `tags` - For filtering/searching

### Optional
All other fields are optional. Use what makes sense for your entity.

## Linking Entities

Use slugs to link entities together:

```yaml
# In a character file
faction: "emerald-enclave"      # Links to factions/emerald-enclave.md
location: "astgrove"            # Links to locations/astgrove.md

# In relationships array
relationships:
  - entity: "harlix-darkleaf"   # Links to characters/harlix-darkleaf.md
    type: "ally"
    note: "Fellow Enclave member"
```

## Subtypes Reference

### Characters
- `pc` - Player character
- `npc` - Non-player character
- `deity` - Gods and divine beings
- `historical` - Historical figures

### Enemies
- `boss` - Major villain or boss monster
- `lieutenant` - Mid-tier threat
- `minion` - Cannon fodder
- `creature` - Standard monster
- `swarm` - Group enemy
- `trap` - Hazard or trap

### Locations
- `plane` - Plane of existence
- `continent` - Large landmass
- `region` - Geographic region
- `city` - Large settlement
- `town` - Medium settlement
- `village` - Small settlement
- `dungeon` - Dungeon/underground
- `wilderness` - Wild area
- `building` - Single structure
- `room` - Room within building
- `landmark` - Notable feature

### Factions
- `cult` - Religious cult
- `guild` - Professional guild
- `government` - Ruling body
- `military` - Armed forces
- `religious` - Church/temple
- `criminal` - Crime syndicate
- `merchant` - Trade company
- `noble-house` - Noble family
- `adventuring-party` - Adventurer group
- `secret-society` - Hidden organization

### Items
- `weapon` - Weapons
- `armor` - Armor and shields
- `artifact` - Powerful artifacts
- `consumable` - Potions, scrolls
- `quest` - Quest items
- `treasure` - Valuables
- `tool` - Tools and kits
- `wondrous` - Wondrous items
- `vehicle` - Mounts and vehicles
- `property` - Real estate

## Status Values

- `active` - Currently in play
- `inactive` - Retired/dormant
- `dead` - Deceased (characters)
- `destroyed` - Destroyed (items/locations)
- `unknown` - Fate unknown
- `missing` - Lost/missing
- `transformed` - Changed into something else
- `dormant` - Sleeping/waiting
