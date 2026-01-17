import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { loadEntities } from './validate-world.js';

/**
 * Entity Extraction
 *
 * Scans blog posts to find mentioned entities that don't exist yet,
 * and can generate stub entity files for them.
 */

export interface MentionedEntity {
  name: string;
  slug: string;
  mentions: Array<{
    file: string;
    line: number;
    context: string;
  }>;
  suggestedType?: 'character' | 'location' | 'faction' | 'item' | 'enemy';
  exists: boolean;
}

export interface ExtractionResult {
  existing: string[];
  missing: MentionedEntity[];
  stats: {
    totalMentions: number;
    uniqueEntities: number;
    existingEntities: number;
    missingEntities: number;
  };
}

// Heuristics to guess entity type from context
const TYPE_HINTS = {
  character: [
    /\b(he|she|they|him|her|them|his|hers|their)\b/i,
    /\b(said|spoke|replied|asked|whispered|shouted|exclaimed)\b/i,
    /\b(led|guided|met|greeted|introduced)\b/i,
    /\b(druid|mage|wizard|warrior|knight|priest|cleric|ranger|rogue)\b/i,
    /\b(halfling|elf|dwarf|human|tiefling|dragonborn|gnome|orc|goblin)\b/i,
  ],
  location: [
    /\b(in|at|to|from|within|inside|through)\s+\*\*/i,
    /\b(city|town|village|forest|mountain|cave|dungeon|tower|hall|chamber|district|market)\b/i,
    /\b(hidden|ancient|sacred|ruins|grove|hollow|well|gate|landing)\b/i,
  ],
  faction: [
    /\b(the|join|joined|member|members|leader|leaders|organization|group|circle|enclave|house|clan)\b/i,
    /\b(alliance|guild|order|cult|society)\b/i,
  ],
  item: [
    /\b(the|a|an)\s+\*\*[^*]+\*\*\b.*\b(item|artifact|weapon|armor|ring|amulet|staff|sword|bow|shield)\b/i,
    /\b(held|carried|possessed|wielded|wore|wearing|found|discovered|received)\b/i,
    /\b(magical|enchanted|legendary|ancient|powerful)\b/i,
  ],
  enemy: [
    /\b(attacked|fought|battled|defeated|killed|slain)\b/i,
    /\b(monster|creature|beast|demon|undead|fiend)\b/i,
    /\b(agent|warrior|assassin|minion)\b/i,
  ],
};

/**
 * Generate a URL-safe slug from a name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .trim();
}

/**
 * Extract bold text mentions from markdown content.
 */
function extractMentions(
  content: string
): Array<{ name: string; line: number; context: string; isLinked: boolean }> {
  const mentions: Array<{ name: string; line: number; context: string; isLinked: boolean }> = [];
  const lines = content.split('\n');

  // Match **Text** but not **[Text](link)**
  const boldPattern = /\*\*([^*\[\]]+)\*\*/g;
  const linkedPattern = /\*\*\[([^\]]+)\]\([^)]+\)\*\*/g;

  lines.forEach((line, index) => {
    // First, find linked mentions
    let match;
    while ((match = linkedPattern.exec(line)) !== null) {
      mentions.push({
        name: match[1],
        line: index + 1,
        context: line.trim(),
        isLinked: true,
      });
    }
    linkedPattern.lastIndex = 0;

    // Then find unlinked bold mentions
    while ((match = boldPattern.exec(line)) !== null) {
      // Skip if this is just formatting (all caps, numbers only, etc.)
      const text = match[1];
      if (text.toUpperCase() === text && text.length > 3) continue; // ALL CAPS header
      if (/^\d+$/.test(text)) continue; // Just numbers
      if (text.length < 2) continue; // Too short

      mentions.push({
        name: text,
        line: index + 1,
        context: line.trim(),
        isLinked: false,
      });
    }
    boldPattern.lastIndex = 0;
  });

  return mentions;
}

/**
 * Guess the entity type based on surrounding context.
 */
function guessEntityType(
  context: string
): 'character' | 'location' | 'faction' | 'item' | 'enemy' | undefined {
  const scores: Record<string, number> = {
    character: 0,
    location: 0,
    faction: 0,
    item: 0,
    enemy: 0,
  };

  for (const [type, patterns] of Object.entries(TYPE_HINTS)) {
    for (const pattern of patterns) {
      if (pattern.test(context)) {
        scores[type]++;
      }
    }
  }

  // Find the type with highest score
  let maxScore = 0;
  let bestType: string | undefined;

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type;
    }
  }

  // Only return if we have some confidence
  return maxScore >= 1 ? (bestType as 'character' | 'location' | 'faction' | 'item' | 'enemy') : undefined;
}

/**
 * Scan blog posts and extract entity mentions.
 */
export function extractEntities(
  blogDir: string,
  campaignDir: string
): ExtractionResult {
  // Load existing entities
  const existingEntities = loadEntities(campaignDir);
  const existingNames = new Set<string>();
  const existingSlugs = new Set<string>();

  for (const [slug, entity] of existingEntities) {
    existingSlugs.add(slug);
    existingNames.add(entity.name.toLowerCase());
    for (const variant of entity.variants || []) {
      existingNames.add(variant.toLowerCase());
    }
  }

  // Track all mentions
  const mentionsBySlug = new Map<string, MentionedEntity>();

  // Scan blog posts
  const blogFiles = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'))
    : [];

  let totalMentions = 0;

  for (const file of blogFiles) {
    const filePath = path.join(blogDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { content: bodyContent } = matter(content);

    const mentions = extractMentions(bodyContent);
    totalMentions += mentions.length;

    for (const mention of mentions) {
      // Skip if already linked
      if (mention.isLinked) continue;

      const slug = generateSlug(mention.name);
      const exists = existingNames.has(mention.name.toLowerCase()) || existingSlugs.has(slug);

      if (!mentionsBySlug.has(slug)) {
        const suggestedType = guessEntityType(mention.context);
        mentionsBySlug.set(slug, {
          name: mention.name,
          slug,
          mentions: [],
          suggestedType,
          exists,
        });
      }

      const entity = mentionsBySlug.get(slug)!;
      entity.mentions.push({
        file,
        line: mention.line,
        context: mention.context,
      });

      // Update suggested type if we didn't have one
      if (!entity.suggestedType) {
        entity.suggestedType = guessEntityType(mention.context);
      }
    }
  }

  // Separate existing and missing
  const existing: string[] = [];
  const missing: MentionedEntity[] = [];

  for (const [slug, entity] of mentionsBySlug) {
    if (entity.exists) {
      existing.push(slug);
    } else {
      missing.push(entity);
    }
  }

  // Sort missing by mention count (most mentioned first)
  missing.sort((a, b) => b.mentions.length - a.mentions.length);

  return {
    existing,
    missing,
    stats: {
      totalMentions,
      uniqueEntities: mentionsBySlug.size,
      existingEntities: existing.length,
      missingEntities: missing.length,
    },
  };
}

/**
 * Generate a stub entity file.
 */
export function generateEntityStub(entity: MentionedEntity): string {
  const type = entity.suggestedType || 'character';
  const subtype = getDefaultSubtype(type);

  // Collect context from all mentions for the description
  const contexts = entity.mentions
    .slice(0, 3)
    .map((m) => `  - ${m.file}:${m.line}: ${truncate(m.context, 80)}`)
    .join('\n');

  return `---
name: "${entity.name}"
type: "${type}"
subtype: "${subtype}"
status: "active"
visibility: "public"
description: "TODO: Add description for ${entity.name}"

tags:
  - ${type === 'character' ? 'npc' : type}

relationships: []
---

# ${entity.name}

TODO: Add description for ${entity.name}.

<!-- Mentioned in:
${contexts}
-->
`;
}

function getDefaultSubtype(type: string): string {
  switch (type) {
    case 'character':
      return 'npc';
    case 'location':
      return 'landmark';
    case 'faction':
      return 'guild';
    case 'item':
      return 'wondrous';
    case 'enemy':
      return 'creature';
    default:
      return 'npc';
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Create entity files for missing entities.
 */
export function createMissingEntities(
  entities: MentionedEntity[],
  campaignDir: string,
  dryRun = true
): Array<{ path: string; created: boolean }> {
  const results: Array<{ path: string; created: boolean }> = [];

  for (const entity of entities) {
    const type = entity.suggestedType || 'character';
    const typeDir = path.join(campaignDir, `${type}s`);
    const filePath = path.join(typeDir, `${entity.slug}.md`);

    if (fs.existsSync(filePath)) {
      results.push({ path: filePath, created: false });
      continue;
    }

    if (!dryRun) {
      // Ensure directory exists
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }

      // Write the stub file
      const content = generateEntityStub(entity);
      fs.writeFileSync(filePath, content);
    }

    results.push({ path: filePath, created: true });
  }

  return results;
}

/**
 * Print extraction results to console.
 */
export function printExtractionResult(result: ExtractionResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('Entity Extraction Results');
  console.log('='.repeat(60));

  console.log(`\nStats:`);
  console.log(`  Total bold mentions: ${result.stats.totalMentions}`);
  console.log(`  Unique entities: ${result.stats.uniqueEntities}`);
  console.log(`  Already exist: ${result.stats.existingEntities}`);
  console.log(`  Missing: ${result.stats.missingEntities}`);

  if (result.missing.length === 0) {
    console.log('\n✓ All mentioned entities already exist!');
    return;
  }

  console.log(`\nMissing entities (${result.missing.length}):`);
  for (const entity of result.missing) {
    const typeLabel = entity.suggestedType ? `[${entity.suggestedType}]` : '[unknown]';
    console.log(`\n  ${entity.name} ${typeLabel}`);
    console.log(`    Slug: ${entity.slug}`);
    console.log(`    Mentions: ${entity.mentions.length}`);
    for (const mention of entity.mentions.slice(0, 3)) {
      console.log(`      - ${mention.file}:${mention.line}`);
    }
    if (entity.mentions.length > 3) {
      console.log(`      ... and ${entity.mentions.length - 3} more`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Run with --create to generate stub files for missing entities');
  console.log('='.repeat(60));
}
