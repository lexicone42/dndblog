/**
 * Import spells from the D&D 5e SRD API.
 *
 * Usage:
 *   npx tsx scripts/import-spells.ts <spell-name> [spell-name...]
 *   npx tsx scripts/import-spells.ts --all-party  # Import all party spells
 *
 * Examples:
 *   npx tsx scripts/import-spells.ts fireball
 *   npx tsx scripts/import-spells.ts "melf's acid arrow" "magic missile"
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'https://www.dnd5eapi.co/api/2014';
const OUTPUT_DIR = path.join(import.meta.dirname, '../src/content/campaign/spells');

// All spells currently used by the party
const PARTY_SPELLS = [
  'bless',
  'counterspell',
  'cure-wounds',
  'disguise-self',
  'druidcraft',
  'ensnaring-strike',
  'entangle',
  'fire-bolt',
  'fireball',
  'goodberry',
  'guidance',
  'guiding-bolt',
  'healing-word',
  'hunters-mark',
  'light',
  'lightning-bolt',
  'mage-hand',
  'magic-missile',
  'mass-healing-word',
  'melfs-acid-arrow',
  'misty-step',
  'moonbeam',
  'pass-without-trace',
  'prayer-of-healing',
  'ray-of-frost',
  'rope-trick',
  'sacred-flame',
  'shield',
  'shield-of-faith',
  'spare-the-dying',
  'spirit-guardians',
  'spiritual-weapon',
  'thorn-whip',
  'thunderwave',
];

interface ApiSpell {
  index: string;
  name: string;
  level: number;
  school: { name: string };
  casting_time: string;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  desc: string[];
  higher_level?: string[];
  classes: { name: string }[];
}

const schoolMap: Record<string, string> = {
  'Abjuration': 'abjuration',
  'Conjuration': 'conjuration',
  'Divination': 'divination',
  'Enchantment': 'enchantment',
  'Evocation': 'evocation',
  'Illusion': 'illusion',
  'Necromancy': 'necromancy',
  'Transmutation': 'transmutation',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchSpell(slug: string): Promise<ApiSpell | null> {
  const url = `${API_BASE}/spells/${slug}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  ✗ Not found: ${slug}`);
      return null;
    }
    return await response.json() as ApiSpell;
  } catch (error) {
    console.error(`  ✗ Error fetching ${slug}:`, error);
    return null;
  }
}

function spellToMarkdown(spell: ApiSpell): string {
  const components = spell.components.map(c => `"${c}"`).join(', ');
  const classes = spell.classes.map(c => `"${c.name}"`).join(', ');
  const school = schoolMap[spell.school.name] || spell.school.name.toLowerCase();

  // Build frontmatter
  let frontmatter = `---
name: "${spell.name}"
level: ${spell.level}
school: "${school}"
castingTime: "${spell.casting_time}"
range: "${spell.range}"
components: [${components}]`;

  if (spell.material) {
    // Escape quotes in material description
    const material = spell.material.replace(/"/g, '\\"');
    frontmatter += `\nmaterial: "${material}"`;
  }

  frontmatter += `
duration: "${spell.duration}"
concentration: ${spell.concentration}
ritual: ${spell.ritual}
description: |
  ${spell.desc.join('\n\n  ')}`;

  if (spell.higher_level && spell.higher_level.length > 0) {
    frontmatter += `
atHigherLevels: |
  ${spell.higher_level.join('\n\n  ')}`;
  }

  frontmatter += `
classes: [${classes}]
source: "SRD 5.1"
---

# ${spell.name}

*${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} ${spell.school.name}${spell.ritual ? ' (Ritual)' : ''}*

${spell.desc.join('\n\n')}`;

  if (spell.higher_level && spell.higher_level.length > 0) {
    frontmatter += `

**At Higher Levels.** ${spell.higher_level.join('\n\n')}`;
  }

  return frontmatter;
}

async function importSpell(spellName: string): Promise<boolean> {
  const slug = slugify(spellName);
  const outputPath = path.join(OUTPUT_DIR, `${slug}.md`);

  // Check if already exists
  if (fs.existsSync(outputPath)) {
    console.log(`  ⊘ Already exists: ${slug}.md`);
    return true;
  }

  const spell = await fetchSpell(slug);
  if (!spell) {
    return false;
  }

  const markdown = spellToMarkdown(spell);
  fs.writeFileSync(outputPath, markdown);
  console.log(`  ✓ Created: ${slug}.md`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx scripts/import-spells.ts <spell-name> [spell-name...]');
    console.log('  npx tsx scripts/import-spells.ts --all-party');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/import-spells.ts fireball');
    console.log('  npx tsx scripts/import-spells.ts "melf\'s acid arrow"');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let spells: string[];

  if (args[0] === '--all-party') {
    console.log('Importing all party spells...\n');
    spells = PARTY_SPELLS;
  } else {
    spells = args;
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const spell of spells) {
    const slug = slugify(spell);
    const outputPath = path.join(OUTPUT_DIR, `${slug}.md`);

    if (fs.existsSync(outputPath)) {
      console.log(`  ⊘ Already exists: ${slug}.md`);
      skipped++;
      continue;
    }

    const result = await importSpell(spell);
    if (result) {
      success++;
    } else {
      failed++;
    }

    // Rate limit to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('');
  console.log(`Done! Created: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
}

main();
