/**
 * Session Note Templates
 *
 * Pre-built templates for different types of D&D session notes.
 * Based on real session note patterns from The Mawframe campaign.
 */

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const sessionTemplates: SessionTemplate[] = [
  {
    id: 'full-session',
    name: 'Full Session',
    description: 'Comprehensive template for a complete session',
    content: `## Session Overview

**Location:**
**Setting:**

---

## Characters Present

- [ ]
- [ ]
- [ ]

## NPCs Encountered

| Name | Role | Disposition | Notes |
|------|------|-------------|-------|
|      |      |             |       |

---

## Session Events

### Opening Scene


### Key Moments

1.

2.

3.

### Objectives

**New Objectives:**
-

**Completed:**
-

---

## Combat Encounters

### Encounter 1:

**Enemies:**
-

**Tactics Used:**
-

**Notable Moments:**
-

---

## Loot & Rewards

| Item | Value | Claimed By |
|------|-------|------------|
|      |       |            |

**Gold/Currency:**

---

## Plot Hooks for Next Session

-

---

## DM Notes (Private)

**What Went Well:**
-

**To Improve:**
-

**Remember for Next Time:**
-
`,
  },
  {
    id: 'combat-heavy',
    name: 'Combat Session',
    description: 'Template focused on encounters and tactical notes',
    content: `## Combat Session Notes

**Location:**
**Encounter Setting:**

---

## Party Status (Start of Session)

| Character | HP | Spell Slots | Conditions |
|-----------|-----|-------------|------------|
|           |     |             |            |

---

## Encounter 1:

**Enemy Forces:**
-

**Terrain Features:**
-

**Initiative Order:**
1.
2.
3.

**Round-by-Round:**

*Round 1:*
-

*Round 2:*
-

**Outcome:**


**Loot:**
-

---

## Encounter 2:

**Enemy Forces:**
-

**Initiative Order:**
1.

**Key Moments:**
-

**Outcome:**


---

## Post-Combat

**Healing Used:**
-

**Resources Expended:**
-

**Party Status (End):**


---

## Loot Summary

| Item | Description | Value | Claimed By |
|------|-------------|-------|------------|
|      |             |       |            |

**Total Gold:**

---

## Notes for Next Session

-
`,
  },
  {
    id: 'roleplay',
    name: 'Roleplay Session',
    description: 'Template for social encounters and story-heavy sessions',
    content: `## Roleplay Session Notes

**Location:**
**Atmosphere:**

---

## NPCs Featured

### [NPC Name]
**Role:**
**Motivation:**
**Key Dialogue:**
> ""

**Party's Impression:**


### [NPC Name]
**Role:**
**Motivation:**
**Key Dialogue:**
> ""

---

## Social Encounters

### Scene 1:

**Setting:**

**What Happened:**


**Skill Checks:**
-

**Outcome:**


### Scene 2:

**Setting:**

**What Happened:**


---

## Information Revealed

**Lore/Backstory:**
-

**Plot Hooks:**
-

**Secrets Discovered:**
-

---

## Character Moments

**[Character Name]:**
-

**[Character Name]:**
-

---

## Faction Updates

| Faction | Relationship Change | Notes |
|---------|---------------------|-------|
|         |                     |       |

---

## Shopping/Downtime

**Purchases:**
-

**Services:**
-

---

## Hooks for Next Session

-

---

## DM Notes

**Threads to Follow Up:**
-

**Player Interests Noted:**
-
`,
  },
  {
    id: 'exploration',
    name: 'Exploration Session',
    description: 'Template for dungeon crawls and travel',
    content: `## Exploration Session Notes

**Region:**
**Destination:**
**Travel Method:**

---

## Journey Overview

**Day 1:**
- Weather:
- Events:

**Day 2:**
- Weather:
- Events:

---

## Locations Discovered

### [Location Name]
**Type:** (Dungeon / Ruin / Settlement / Landmark)
**Description:**


**Notable Features:**
-

**Inhabitants:**
-

**Loot Found:**
-

---

## Random Encounters

### Encounter 1
**Trigger:**
**Enemies/NPCs:**
**Outcome:**

---

## Dungeon/Area Map Notes

**Room 1:**
- Contents:
- Traps:
- Secrets:

**Room 2:**
- Contents:
- Traps:
- Secrets:

---

## Environmental Hazards

-

---

## Resources Used

**Rations:**
**Torches/Light:**
**Spell Slots:**
**Hit Dice:**

---

## Discoveries

**Treasure:**
-

**Lore/Clues:**
-

**Map Updates:**
-

---

## Hooks for Next Session

-
`,
  },
  {
    id: 'quick-notes',
    name: 'Quick Notes',
    description: 'Minimal template for fast note-taking during play',
    content: `## Quick Session Notes

**Date:**
**Location:**

---

## What Happened

-

---

## NPCs Met

-

---

## Combat

**Enemies:**

**Outcome:**

---

## Loot

-

---

## Next Session

-
`,
  },
  {
    id: 'session-prep',
    name: 'Session Prep',
    description: 'Pre-game prep with staged enemies, loot, and NPCs',
    content: `## Session Prep - [Session Number]

**Planned Date:**
**Expected Duration:**

---

## Planned Encounters

### Encounter 1: [Name]
**Location:**
**Trigger:**

**Enemies (create in /campaign/enemies/):**
| Enemy | CR | HP | AC | Link |
|-------|----|----|----|----- |
|       |    |    |    | \`/campaign/enemies/slug\` |

**Tactics:**
-

**Difficulty:** Easy / Medium / Hard / Deadly

### Encounter 2: [Name]
**Location:**
**Enemies:**
-

---

## Staged Loot

*Create items in /campaign/items/ before the session*

| Item | Rarity | Location Found | Link |
|------|--------|----------------|------|
|      |        |                | \`/campaign/items/slug\` |

**Gold/Treasure:**
-

---

## NPCs to Introduce

*Create NPCs in /campaign/characters/ (type: npc)*

| Name | Role | Disposition | Link |
|------|------|-------------|------|
|      |      |             | \`/campaign/characters/slug\` |

**Key NPC Dialogue to Prepare:**
> [NPC Name]: ""

---

## Locations

*Create locations in /campaign/locations/*

| Location | Type | Link |
|----------|------|------|
|          |      | \`/campaign/locations/slug\` |

---

## Plot Points to Advance

- [ ]
- [ ]

## Secrets & Clues to Reveal

- [ ]
- [ ]

---

## Contingencies

**If party goes left:**
-

**If party goes right:**
-

**If party ignores the hook:**
-

---

## Session Goals

1.
2.
3.

---

## Resources Needed

- [ ] Battle maps prepared
- [ ] Minis/tokens ready
- [ ] Music playlist
- [ ] Handouts printed

---

## Notes

-
`,
  },
  {
    id: 'session-zero',
    name: 'Session Zero',
    description: 'Template for campaign setup and character introductions',
    content: `## Session Zero Notes

**Campaign:**
**Setting:**
**Starting Location:**

---

## Campaign Overview

**Premise:**


**Themes:**
-

**Tone:** (Heroic / Gritty / Comedic / Horror / etc.)

---

## Player Characters

### [Character Name]
**Player:**
**Race/Class:**
**Background:**
**Motivation:**
**Connections to Other PCs:**
-

### [Character Name]
**Player:**
**Race/Class:**
**Background:**
**Motivation:**
**Connections to Other PCs:**
-

---

## House Rules

-

---

## Session Expectations

**Combat vs Roleplay Balance:**

**PvP Policy:**

**Character Death:**

**Sensitive Topics to Avoid:**
-

---

## Starting Hooks

-

---

## World Building Notes

**Key Factions:**
-

**Important NPCs:**
-

**Current Events:**
-

---

## Scheduling

**Session Frequency:**
**Typical Duration:**
**Next Session:**
`,
  },
];

/**
 * Get a template by ID
 */
export function getTemplate(id: string): SessionTemplate | undefined {
  return sessionTemplates.find(t => t.id === id);
}

/**
 * Get template content by ID
 */
export function getTemplateContent(id: string): string {
  const template = getTemplate(id);
  return template?.content ?? '';
}
