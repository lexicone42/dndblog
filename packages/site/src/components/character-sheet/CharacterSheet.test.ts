import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, it, expect, beforeEach } from 'vitest';
import CharacterSheet from './CharacterSheet.astro';
import AbilityScoresBlock from './AbilityScoresBlock.astro';
import CombatStatsPanel from './CombatStatsPanel.astro';
import EquipmentSection from './EquipmentSection.astro';

/**
 * Normalize HTML output for snapshot testing.
 * Removes Astro debug attributes that contain environment-specific paths.
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/\s*data-astro-source-file="[^"]*"/g, '')
    .replace(/\s*data-astro-source-loc="[^"]*"/g, '')
    .replace(/\s*data-astro-cid-[a-z0-9]+/g, '');
}

describe('CharacterSheet Components', () => {
  let container: AstroContainer;

  beforeEach(async () => {
    container = await AstroContainer.create();
  });

  describe('AbilityScoresBlock', () => {
    it('renders all six ability scores', async () => {
      const result = await container.renderToString(AbilityScoresBlock, {
        props: {
          abilityScores: {
            str: 10,
            dex: 14,
            con: 12,
            int: 18,
            wis: 10,
            cha: 15,
          },
          savingThrows: {
            int: true,
            wis: true,
          },
          proficiencyBonus: 3,
        },
      });

      // Check all abilities are rendered
      expect(result).toContain('STR');
      expect(result).toContain('DEX');
      expect(result).toContain('CON');
      expect(result).toContain('INT');
      expect(result).toContain('WIS');
      expect(result).toContain('CHA');

      // Check scores are rendered
      expect(result).toContain('>10<');
      expect(result).toContain('>14<');
      expect(result).toContain('>18<');

      // Check modifiers are calculated correctly
      expect(result).toContain('+0'); // STR mod
      expect(result).toContain('+2'); // DEX mod
      expect(result).toContain('+4'); // INT mod

      // Snapshot for visual regression
      expect(normalizeHtml(result)).toMatchSnapshot();
    });

    it('renders nothing when no ability scores provided', async () => {
      const result = await container.renderToString(AbilityScoresBlock, {
        props: {},
      });

      expect(result.trim()).toBe('');
    });

    it('handles missing individual scores gracefully', async () => {
      const result = await container.renderToString(AbilityScoresBlock, {
        props: {
          abilityScores: {
            str: 10,
            // other scores undefined
          },
        },
      });

      expect(result).toContain('STR');
      expect(result).toContain('>10<');
      expect(result).toContain('—'); // Dash for missing scores
    });
  });

  describe('CombatStatsPanel', () => {
    it('renders combat stats correctly', async () => {
      const result = await container.renderToString(CombatStatsPanel, {
        props: {
          combat: {
            ac: 18,
            hp: 45,
            maxHp: 52,
            speed: 30,
            initiative: 2,
            proficiencyBonus: 3,
          },
        },
      });

      expect(result).toContain('18'); // AC
      expect(result).toContain('45'); // Current HP
      expect(result).toContain('52'); // Max HP
      expect(result).toContain('30'); // Speed
      expect(normalizeHtml(result)).toMatchSnapshot();
    });

    it('renders nothing when no combat stats provided', async () => {
      const result = await container.renderToString(CombatStatsPanel, {
        props: {},
      });

      expect(result.trim()).toBe('');
    });
  });

  describe('EquipmentSection', () => {
    it('renders equipped items with links when in lookup', async () => {
      const result = await container.renderToString(EquipmentSection, {
        props: {
          equipment: {
            equipped: [
              { slot: 'main-hand', item: 'longsword', mastery: 'sap' },
              { slot: 'armor', item: 'plate-armor' },
            ],
            currency: { gp: 150, sp: 20 },
          },
          itemLookup: {
            longsword: {
              name: 'Longsword +1',
              path: '/campaign/items/longsword',
              rarity: 'uncommon',
            },
          },
        },
      });

      // Linked item should have href
      expect(result).toContain('href="/campaign/items/longsword"');
      expect(result).toContain('Longsword +1');

      // Non-linked item should show plain text
      expect(result).toContain('plate-armor');

      // Weapon mastery should show
      expect(result).toContain('Sap');

      // Currency should render
      expect(result).toContain('150 GP');
      expect(result).toContain('20 SP');

      expect(normalizeHtml(result)).toMatchSnapshot();
    });

    it('renders nothing when no equipment provided', async () => {
      const result = await container.renderToString(EquipmentSection, {
        props: {},
      });

      expect(result.trim()).toBe('');
    });
  });

  describe('CharacterSheet (integration)', () => {
    it('renders complete character sheet', async () => {
      const result = await container.renderToString(CharacterSheet, {
        props: {
          character: {
            name: 'Test Character',
            class: 'Wizard',
            subclass: 'Evoker',
            level: 6,
            origin: {
              species: 'Human',
              background: 'Sage',
            },
            abilityScores: {
              str: 8,
              dex: 14,
              con: 12,
              int: 18,
              wis: 10,
              cha: 15,
            },
            combat: {
              ac: 12,
              hp: 49,
              maxHp: 49,
              speed: 30,
            },
            savingThrows: {
              int: true,
              wis: true,
            },
            skills: [
              { name: 'Arcana', proficient: true, expertise: true },
              { name: 'History', proficient: true },
            ],
          },
        },
      });

      // Header info
      expect(result).toContain('Level 6');
      expect(result).toContain('Human');
      expect(result).toContain('Wizard (Evoker)');

      // Ability scores section
      expect(result).toContain('Ability Scores');

      // Skills
      expect(result).toContain('Arcana');
      expect(result).toContain('History');

      expect(normalizeHtml(result)).toMatchSnapshot();
    });

    it('renders nothing when character has no sheet data', async () => {
      const result = await container.renderToString(CharacterSheet, {
        props: {
          character: {
            name: 'NPC Without Stats',
          },
        },
      });

      // Should not render the character sheet container
      expect(result).not.toContain('character-sheet');
    });
  });
});
