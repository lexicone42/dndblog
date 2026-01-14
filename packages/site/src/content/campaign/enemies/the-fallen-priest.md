---
name: "The Fallen Priest"
type: "enemy"
subtype: "boss"
status: "dead"
visibility: "public"
description: "Primary antagonist of the Shavras arc, wielded a bone sword"

# Combat
cr: "8"
creatureType: "undead"
customizations:
  - "Bone sword that drains life"
  - "Portal ritual abilities"
  - "Liquified upon death"

# Affiliations
lair: "shavras"
territory:
  - shavras
  - shavras-vault

# Combat History
encounters:
  - session-03
  - session-04
defeats:
  - session: "session-04"
    method: "Party defeated in battle at Shavras"
    defeatedBy:
      - stol
      - kei
      - rudiger
      - skid-demon
      - accoa

# Cataloging
tags:
  - boss
  - undead
  - villain
  - defeated
  - shavras-arc

relationships:
  - entity: "greeve"
    type: "enemy"
    note: "Killed Greeve with bone sword"
  - entity: "shavras"
    type: "controls"
  - entity: "the-party"
    type: "enemy"

authority:
  variants:
    - "The Priest"
    - "Fallen One"
---

# The Fallen Priest

The primary antagonist of the Shavras arc, the Fallen Priest was an undead entity seeking to complete a dark portal ritual.

## Abilities

- Wielded a bone sword capable of draining life
- Commanded various undead and monstrous minions
- Attempted portal ritual (interrupted by the party)

## Domain

The Fallen Priest controlled the Shavras Shrine and the vault beneath it. Various creatures served under his command:
- Goblins
- Skeletal warriors
- Ogre
- Giant spiders

## Defeat

The party confronted the Fallen Priest at Shavras Shrine. During the final battle:
1. The portal ritual was interrupted
2. Greeve was impaled by the bone sword
3. The Fallen Priest was destroyed
4. His body liquified into the earth, opening the vault below

## Legacy

Though destroyed, the Fallen Priest's actions had lasting consequences:
- Greeve became the eternal guardian of the vault
- The white dragon Ulfandor was spotted fleeing the scene
- Treasures from the vault were claimed by the party
