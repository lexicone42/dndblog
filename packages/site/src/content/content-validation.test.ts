/**
 * Content Validation Tests
 *
 * These tests verify that cross-references between content collections are valid.
 * Run these tests before build to catch broken links early.
 *
 * Usage: pnpm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Content directories
const CONTENT_DIR = path.join(__dirname, '.');
const CAMPAIGN_DIR = path.join(CONTENT_DIR, 'campaign');

interface FrontmatterData {
  name?: string;
  spellcasting?: {
    cantrips?: string[];
    preparedSpells?: string[];
    knownSpells?: string[];
  };
  equipment?: {
    equipped?: Array<{ item?: string }>;
    magical?: Array<{ item?: string }>;
  };
  relationships?: Array<{ entity: string }>;
  subtype?: string;
}

/**
 * Parse YAML frontmatter from markdown file
 * Simple parser - extracts key values from frontmatter
 */
function parseFrontmatter(content: string): FrontmatterData {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const yaml = frontmatterMatch[1];
  const data: FrontmatterData = {};

  // Extract name
  const nameMatch = yaml.match(/^name:\s*"(.+?)"/m);
  if (nameMatch) data.name = nameMatch[1];

  // Extract subtype
  const subtypeMatch = yaml.match(/^subtype:\s*"?(\w+)"?/m);
  if (subtypeMatch) data.subtype = subtypeMatch[1];

  // Extract spellcasting section
  const spellcastingMatch = yaml.match(/^spellcasting:[\s\S]*?(?=\n[a-z]|$)/m);
  if (spellcastingMatch) {
    const spellSection = spellcastingMatch[0];

    // Extract cantrips
    const cantripsMatch = spellSection.match(/cantrips:\n((?:\s+-\s+"[^"]+"\n?)+)/);
    if (cantripsMatch) {
      const cantrips = cantripsMatch[1].match(/- "([^"]+)"/g);
      data.spellcasting = data.spellcasting || {};
      data.spellcasting.cantrips = cantrips?.map((c) => c.match(/"([^"]+)"/)?.[1] || '') || [];
    }

    // Extract prepared spells
    const preparedMatch = spellSection.match(/preparedSpells:\n((?:\s+-\s+"[^"]+"\n?)+)/);
    if (preparedMatch) {
      const prepared = preparedMatch[1].match(/- "([^"]+)"/g);
      data.spellcasting = data.spellcasting || {};
      data.spellcasting.preparedSpells = prepared?.map((s) => s.match(/"([^"]+)"/)?.[1] || '') || [];
    }

    // Extract known spells
    const knownMatch = spellSection.match(/knownSpells:\n((?:\s+-\s+"[^"]+"\n?)+)/);
    if (knownMatch) {
      const known = knownMatch[1].match(/- "([^"]+)"/g);
      data.spellcasting = data.spellcasting || {};
      data.spellcasting.knownSpells = known?.map((s) => s.match(/"([^"]+)"/)?.[1] || '') || [];
    }
  }

  // Extract relationships
  const relationshipsMatch = yaml.match(/relationships:\n((?:\s+-\s+entity:[\s\S]*?(?=\n[a-z]|\ntags:|$))+)/);
  if (relationshipsMatch) {
    const relSection = relationshipsMatch[1];
    const entities = relSection.match(/entity:\s*"?([^"\n]+)"?/g);
    data.relationships = entities?.map((e) => ({
      entity: e.match(/entity:\s*"?([^"\n]+)"?/)?.[1]?.trim() || '',
    })) || [];
  }

  return data;
}

/**
 * Get all spell names from the spells collection
 */
function getSpellNames(): Set<string> {
  const spellDir = path.join(CAMPAIGN_DIR, 'spells');
  const spellNames = new Set<string>();

  if (!fs.existsSync(spellDir)) return spellNames;

  const files = fs.readdirSync(spellDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(spellDir, file), 'utf-8');
    const nameMatch = content.match(/^name:\s*"(.+?)"/m);
    if (nameMatch) {
      spellNames.add(nameMatch[1]);
    }
  }

  return spellNames;
}

/**
 * Get all item IDs from the items collection
 */
function getItemIds(): Set<string> {
  const itemDir = path.join(CAMPAIGN_DIR, 'items');
  const itemIds = new Set<string>();

  if (!fs.existsSync(itemDir)) return itemIds;

  const files = fs.readdirSync(itemDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    // ID is the filename without extension
    itemIds.add(file.replace('.md', ''));
  }

  return itemIds;
}

/**
 * Get all entity IDs from characters, enemies, locations, factions
 */
function getEntityIds(): Set<string> {
  const entityIds = new Set<string>();
  const collections = ['characters', 'enemies', 'locations', 'factions', 'items'];

  for (const collection of collections) {
    const dir = path.join(CAMPAIGN_DIR, collection);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      entityIds.add(file.replace('.md', ''));
    }
  }

  return entityIds;
}

/**
 * Get all character data with spells
 */
function getCharactersWithSpells(): Array<{
  file: string;
  name: string;
  subtype: string;
  spells: string[];
}> {
  const characterDir = path.join(CAMPAIGN_DIR, 'characters');
  const characters: Array<{ file: string; name: string; subtype: string; spells: string[] }> = [];

  if (!fs.existsSync(characterDir)) return characters;

  const files = fs.readdirSync(characterDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(characterDir, file), 'utf-8');
    const data = parseFrontmatter(content);

    const allSpells: string[] = [];
    if (data.spellcasting?.cantrips) {
      allSpells.push(...data.spellcasting.cantrips);
    }
    if (data.spellcasting?.preparedSpells) {
      allSpells.push(...data.spellcasting.preparedSpells);
    }
    if (data.spellcasting?.knownSpells) {
      allSpells.push(...data.spellcasting.knownSpells);
    }

    if (allSpells.length > 0) {
      characters.push({
        file,
        name: data.name || file,
        subtype: data.subtype || 'unknown',
        spells: allSpells.filter((s) => s), // Filter out empty strings
      });
    }
  }

  return characters;
}

describe('Content Validation', () => {
  let spellNames: Set<string>;
  let itemIds: Set<string>;
  let entityIds: Set<string>;

  beforeAll(() => {
    spellNames = getSpellNames();
    itemIds = getItemIds();
    entityIds = getEntityIds();
  });

  describe('Spell References', () => {
    it('should have spell collection loaded', () => {
      expect(spellNames.size).toBeGreaterThan(0);
    });

    it('all character spell references should have matching spell entries', () => {
      const characters = getCharactersWithSpells();
      const errors: string[] = [];

      for (const char of characters) {
        for (const spell of char.spells) {
          if (!spellNames.has(spell)) {
            errors.push(`${char.name} (${char.file}): Missing spell "${spell}"`);
          }
        }
      }

      if (errors.length > 0) {
        console.error('\n=== Missing Spell Entries ===');
        errors.forEach((e) => console.error(`  - ${e}`));
        console.error('\nTo fix: Create spell files or update character spell names to match existing spells.');
        console.error('Available similar spells:');
        for (const err of errors.slice(0, 5)) {
          const spellName = err.match(/Missing spell "(.+?)"/)?.[1] || '';
          const similar = [...spellNames].filter((s) => s.toLowerCase().includes(spellName.toLowerCase().split(' ')[0]));
          if (similar.length > 0) {
            console.error(`  "${spellName}" -> possible matches: ${similar.join(', ')}`);
          }
        }
      }

      expect(errors, `Found ${errors.length} broken spell references`).toHaveLength(0);
    });
  });

  describe('Entity References', () => {
    it('should have entity collection loaded', () => {
      expect(entityIds.size).toBeGreaterThan(0);
    });

    it('relationship entity references should be valid (warning only)', () => {
      const characterDir = path.join(CAMPAIGN_DIR, 'characters');
      const warnings: string[] = [];

      if (!fs.existsSync(characterDir)) return;

      const files = fs.readdirSync(characterDir).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(characterDir, file), 'utf-8');
        const data = parseFrontmatter(content);

        if (data.relationships) {
          for (const rel of data.relationships) {
            // Skip generic entities like "the-party"
            if (rel.entity === 'the-party') continue;

            if (!entityIds.has(rel.entity)) {
              warnings.push(`${data.name || file}: Unknown entity "${rel.entity}"`);
            }
          }
        }
      }

      if (warnings.length > 0) {
        console.warn('\n=== Missing Entity References (warnings) ===');
        warnings.forEach((w) => console.warn(`  - ${w}`));
        console.warn('\nThese are warnings only - entities may be intentionally missing or placeholders.');
      }

      // This is a warning, not a failure - some entities might be intentionally missing
      // expect(warnings).toHaveLength(0);
    });
  });

  describe('Content Integrity', () => {
    it('spell files should have required fields', () => {
      const spellDir = path.join(CAMPAIGN_DIR, 'spells');
      const errors: string[] = [];

      if (!fs.existsSync(spellDir)) return;

      const files = fs.readdirSync(spellDir).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(spellDir, file), 'utf-8');

        // Check required fields
        if (!content.match(/^name:\s*".+?"/m)) {
          errors.push(`${file}: Missing 'name' field`);
        }
        if (!content.match(/^level:\s*\d+/m)) {
          errors.push(`${file}: Missing 'level' field`);
        }
        if (!content.match(/^school:\s*".+?"/m)) {
          errors.push(`${file}: Missing 'school' field`);
        }
      }

      if (errors.length > 0) {
        console.error('\n=== Spell File Errors ===');
        errors.forEach((e) => console.error(`  - ${e}`));
      }

      expect(errors).toHaveLength(0);
    });

    it('character spell names should not contain ligature artifacts', () => {
      const spellDir = path.join(CAMPAIGN_DIR, 'spells');
      const errors: string[] = [];

      if (!fs.existsSync(spellDir)) return;

      const files = fs.readdirSync(spellDir).filter((f) => f.endsWith('.md'));

      // Common ligature issues from PDF extraction
      const ligaturePatterns = [
        / ict /i, // "Inflict" -> "In ict"
        /fl\s+/i, // "fl" ligature split
        /fi\s+/i, // "fi" ligature split
        /modier/i, // "Modifier" -> "Modier"
        /diculty/i, // "Difficulty" -> "Diculty"
      ];

      for (const file of files) {
        const content = fs.readFileSync(path.join(spellDir, file), 'utf-8');
        const nameMatch = content.match(/^name:\s*"(.+?)"/m);

        if (nameMatch) {
          const name = nameMatch[1];
          for (const pattern of ligaturePatterns) {
            if (pattern.test(name)) {
              errors.push(`${file}: Spell name "${name}" contains ligature artifact`);
            }
          }
        }
      }

      if (errors.length > 0) {
        console.error('\n=== Ligature Artifacts Found ===');
        errors.forEach((e) => console.error(`  - ${e}`));
      }

      expect(errors).toHaveLength(0);
    });
  });
});
