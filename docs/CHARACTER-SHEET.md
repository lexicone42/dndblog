# Character Sheet System

The character sheet system renders interactive, accessible D&D 5e 2024 character data as reusable Astro components. Designed for both desktop and mobile viewing with PWA offline support.

## Overview

Character sheets display:
- Ability scores with modifiers and saving throws
- Combat statistics (AC, HP, Speed, Initiative)
- Skills with proficiency indicators
- Equipment grouped by type (weapons, armor, accessories)
- Spellcasting with color-coded spell slots
- Active conditions with visual indicators
- Class features and traits

## Schema (5e 2024)

Character data is defined in YAML/MDX frontmatter:

```yaml
---
csheet:
  # Core Stats
  level: 6
  species: "Human"
  class: "Wizard"
  subclass: "Evoker"
  background: "Sage"

  # Ability Scores
  abilities:
    str: 8
    dex: 14
    con: 12
    int: 18
    wis: 10
    cha: 15

  # Proficiencies
  savingThrows: ["int", "wis"]
  skillProficiencies: ["arcana", "history"]
  skillExpertise: ["arcana"]  # Double proficiency

  # Combat
  armorClass: 12
  hitPoints:
    current: 49
    max: 49
    temp: 0
  speed: 30
  initiative: null  # null = use DEX modifier

  # Conditions (5e 2024)
  activeConditions:
    - name: "Poisoned"
      duration: "1 hour"
    - name: "Exhaustion"
      level: 1

  # Equipment (grouped display)
  equipment:
    currency:
      gp: 150
      sp: 20
    equipped:
      - slot: "Main Hand"
        item: "staff-of-frost"  # Links to /campaign/items/staff-of-frost
        displayName: "Staff of Frost"
        mastery: "Topple"       # 5e 2024 weapon mastery
        rarity: "rare"
      - slot: "Armor"
        item: null              # No item page
        displayName: "Mage Armor (spell)"

  # Spellcasting
  spellcasting:
    ability: "int"
    spellSaveDC: 15
    spellAttackBonus: 7
    slots:
      1: { total: 4, used: 2 }
      2: { total: 3, used: 1 }
      3: { total: 3, used: 0 }
    prepared:
      cantrips: ["fire-bolt", "prestidigitation", "mage-hand"]
      level1: ["magic-missile", "shield", "detect-magic"]
      level2: ["scorching-ray", "misty-step"]
      level3: ["fireball", "counterspell"]
---
```

## Component Architecture

```
CharacterSheet.astro
├── CharacterHeader.astro      # Name, level, class, species
├── AbilityScoresBlock.astro   # 6 ability cards with saves
├── CombatStatsPanel.astro     # AC shield, HP bar, speed
├── SkillsSection.astro        # 18 skills grid
├── ConditionsDisplay.astro    # Active conditions badges
├── EquipmentSection.astro     # Grouped equipment lists
├── SpellcastingSection.astro  # Spell slots + prepared spells
└── FeaturesSection.astro      # Class features, traits
```

## Accessibility Features

### Semantic HTML
- Uses `<section>`, `<header>`, `<nav>` for screen readers
- Proper heading hierarchy (h1 → h2 → h3)
- `role="list"` and `role="listitem"` for custom-styled lists

### ARIA Labels
```html
<div class="ability-card"
     data-ability="str"
     aria-label="Strength: 18, modifier +4, saving throw +7">
```

### Color Contrast
- All text meets WCAG AA contrast ratios (4.5:1 minimum)
- Spell slot colors tested for color blindness compatibility
- Conditions use both color AND icons for status indication

### Keyboard Navigation
- All interactive elements are focusable
- Logical tab order follows visual layout
- Visible focus indicators for all controls

### Screen Reader Support
- Proficiency dots include title attributes: `<span title="Proficient">●</span>`
- HP percentages announced: `aria-label="45 of 52 hit points"`
- Equipment rarity is announced, not just color-coded

## Visual Design

### Spell Slot Color Coding
```css
.spell-slot--available { background: var(--color-success); }  /* Green */
.spell-slot--used { background: var(--color-text-muted); }    /* Gray */
.spell-slot--empty { background: var(--color-bg-secondary); } /* Dark */
```

### Equipment Rarity Colors
```css
.rarity--common { color: var(--color-text); }
.rarity--uncommon { color: #1eff00; }  /* Green */
.rarity--rare { color: #0070dd; }       /* Blue */
.rarity--very-rare { color: #a335ee; }  /* Purple */
.rarity--legendary { color: #ff8000; }  /* Orange */
```

### Condition Badges
Active conditions display with severity indicators:
```html
<span class="condition-badge condition-badge--negative">
  <span class="condition-icon">⚠</span>
  Poisoned (1 hour)
</span>
```

### HP Bar Visualization
Color changes based on health percentage:
- Green (> 50%): `var(--color-success)`
- Yellow (25-50%): `var(--color-warning)`
- Red (< 25%): `var(--color-error)`

## PWA / Offline Support

### Caching Strategy
Character sheets are static HTML, cached via service worker:
```javascript
// Precache character pages
workbox.precaching.precacheAndRoute([
  '/campaign/characters/accoa/index.html',
  '/campaign/characters/cribben-hayduke/index.html',
  // ... all character pages
]);
```

### Offline-First
- Character data is embedded in HTML at build time
- No API calls required for viewing
- Images use responsive `srcset` with fallbacks

### Mobile Responsiveness
```css
/* Ability scores grid */
@media (max-width: 640px) {
  .ability-scores__grid {
    grid-template-columns: repeat(3, 1fr);  /* 3x2 on mobile */
  }
}

/* Skills section */
@media (max-width: 480px) {
  .skills-grid {
    grid-template-columns: 1fr;  /* Single column on phone */
  }
}
```

## Security Considerations

### XSS Prevention
- All character data is sanitized at build time
- No user-generated content in character sheets
- Astro components auto-escape expressions

### Content Security Policy
Character sheets comply with the site's CSP:
```
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
```

### No External Dependencies
- All styles are inline or from site CSS
- No external JavaScript on character pages
- Item/spell links stay within the site

## Testing

### Component Tests
```bash
pnpm --filter site test
```

Tests verify:
- Ability modifier calculations
- Proficiency bonus application
- HP percentage calculations
- Spell slot rendering
- Equipment grouping

### Snapshot Tests
Located in `__snapshots__/CharacterSheet.test.ts.snap`:
- Full character sheet HTML output
- Individual component rendering
- Edge cases (no equipment, no spells, etc.)

### Visual Regression
- Character pages included in Playwright smoke tests
- Mobile viewport testing for responsive layout

## Content Schema Validation

The Zod schema (`packages/site/src/content/config.ts`) validates:

```typescript
const csheetSchema = z.object({
  level: z.number().min(1).max(20),
  species: z.string(),
  class: z.string(),
  abilities: z.object({
    str: z.number().min(1).max(30),
    dex: z.number().min(1).max(30),
    // ... all six abilities
  }),
  activeConditions: z.array(z.object({
    name: z.string(),
    duration: z.string().optional(),
    level: z.number().optional(),  // For exhaustion
  })).optional(),
  // ... full schema
}).optional();
```

Build fails if character frontmatter doesn't match schema.

## Future Enhancements

### Planned
- [ ] Print stylesheet for paper character sheets
- [ ] PDF export functionality
- [ ] Interactive HP tracker (localStorage)
- [ ] Spell slot toggle (localStorage)

### Considered
- [ ] Character comparison view
- [ ] Level-up wizard
- [ ] Integration with D&D Beyond import
