import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

/**
 * World Consistency Validation
 *
 * Validates blog posts against the campaign entity database to catch:
 * 1. Pronoun inconsistencies (e.g., using "she" for a male character)
 * 2. Broken entity links (links to non-existent entities)
 * 3. Unlinked entity mentions (bold text that could be linked to entities)
 */

export interface EntityInfo {
  slug: string;
  name: string;
  type: string;
  subtype?: string;
  filePath: string;
  // Extracted from content - pronouns used in the entity's own definition
  pronouns?: {
    subject?: string; // he/she/they
    object?: string; // him/her/them
    possessive?: string; // his/her/their
  };
  variants?: string[]; // Alternative names
}

export interface ValidationIssue {
  file: string;
  line: number;
  type: 'error' | 'warning';
  category: 'pronoun' | 'broken-link' | 'unlinked-entity';
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    filesChecked: number;
    entitiesLoaded: number;
    pronounIssues: number;
    brokenLinks: number;
    unlinkedEntities: number;
  };
}

// Pronoun patterns for detection
const PRONOUN_PATTERNS = {
  subject: {
    male: /\b(he)\b/gi,
    female: /\b(she)\b/gi,
    neutral: /\b(they)\b/gi,
  },
  object: {
    male: /\b(him)\b/gi,
    female: /\b(her)\b/gi,
    neutral: /\b(them)\b/gi,
  },
  possessive: {
    male: /\b(his)\b/gi,
    female: /\b(her|hers)\b/gi,
    neutral: /\b(their|theirs)\b/gi,
  },
};

/**
 * Detect pronouns used in text to describe an entity.
 * Looks for pronouns in the same sentence or nearby context.
 */
function detectPronouns(content: string): EntityInfo['pronouns'] | undefined {
  const pronouns: EntityInfo['pronouns'] = {};

  // Check for subject pronouns
  if (PRONOUN_PATTERNS.subject.male.test(content)) pronouns.subject = 'he';
  else if (PRONOUN_PATTERNS.subject.female.test(content)) pronouns.subject = 'she';
  else if (PRONOUN_PATTERNS.subject.neutral.test(content)) pronouns.subject = 'they';

  // Check for possessive pronouns
  if (PRONOUN_PATTERNS.possessive.male.test(content)) pronouns.possessive = 'his';
  else if (PRONOUN_PATTERNS.possessive.female.test(content)) pronouns.possessive = 'her';
  else if (PRONOUN_PATTERNS.possessive.neutral.test(content)) pronouns.possessive = 'their';

  // Reset regex lastIndex
  Object.values(PRONOUN_PATTERNS).forEach((group) => {
    Object.values(group).forEach((regex) => (regex.lastIndex = 0));
  });

  return Object.keys(pronouns).length > 0 ? pronouns : undefined;
}

/**
 * Load all campaign entities from the content directory.
 */
export function loadEntities(campaignDir: string): Map<string, EntityInfo> {
  const entities = new Map<string, EntityInfo>();
  const entityTypes = ['characters', 'enemies', 'locations', 'factions', 'items'];

  for (const entityType of entityTypes) {
    const typeDir = path.join(campaignDir, entityType);
    if (!fs.existsSync(typeDir)) continue;

    const files = fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(typeDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { data, content: bodyContent } = matter(content);

      const slug = file.replace('.md', '');
      const name = data.name || slug;

      // Extract pronouns from the entity's own description
      const pronouns = detectPronouns(bodyContent);

      // Get variants from authority record if present
      const variants = data.authority?.variants || [];

      entities.set(slug, {
        slug,
        name,
        type: data.type || entityType.slice(0, -1), // Remove 's' from plural
        subtype: data.subtype,
        filePath,
        pronouns,
        variants: [name, ...variants],
      });
    }
  }

  return entities;
}

/**
 * Extract entity links from markdown content.
 * Matches patterns like [Name](/campaign/type/slug)
 */
function extractEntityLinks(
  content: string
): Array<{ text: string; path: string; line: number }> {
  const links: Array<{ text: string; path: string; line: number }> = [];
  const lines = content.split('\n');
  const linkPattern = /\[([^\]]+)\]\(\/campaign\/([^)]+)\)/g;

  lines.forEach((line, index) => {
    let match;
    while ((match = linkPattern.exec(line)) !== null) {
      links.push({
        text: match[1],
        path: match[2],
        line: index + 1,
      });
    }
    linkPattern.lastIndex = 0;
  });

  return links;
}

/**
 * Extract bold text mentions that could be entity references.
 * Matches **Text** patterns that aren't already links.
 */
function extractBoldMentions(
  content: string
): Array<{ text: string; line: number; isLinked: boolean }> {
  const mentions: Array<{ text: string; line: number; isLinked: boolean }> = [];
  const lines = content.split('\n');

  // Pattern for bold text: **text** or **[text](link)**
  const boldPattern = /\*\*([^*]+)\*\*/g;

  lines.forEach((line, index) => {
    // Find all bold patterns
    let match;
    while ((match = boldPattern.exec(line)) !== null) {
      const text = match[1];
      // Check if this is a linked bold (contains markdown link)
      const isLinked = text.startsWith('[') && text.includes('](');

      mentions.push({
        text: isLinked ? text.match(/\[([^\]]+)\]/)?.[1] || text : text,
        line: index + 1,
        isLinked,
      });
    }
    boldPattern.lastIndex = 0;
  });

  return mentions;
}

/**
 * Check for pronoun consistency near entity mentions.
 */
function checkPronounConsistency(
  content: string,
  entities: Map<string, EntityInfo>,
  filePath: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  // For each entity with known pronouns, check for mismatches
  for (const [slug, entity] of entities) {
    if (!entity.pronouns) continue;

    const namePattern = new RegExp(
      `\\b(${entity.variants?.map((v) => escapeRegex(v)).join('|') || escapeRegex(entity.name)})\\b`,
      'gi'
    );

    lines.forEach((line, lineIndex) => {
      // Check if this line mentions the entity
      if (!namePattern.test(line)) return;
      namePattern.lastIndex = 0;

      // Look at this line and the next few lines for pronoun context
      const contextWindow = lines.slice(lineIndex, lineIndex + 3).join(' ');

      // Check for pronoun mismatches
      if (entity.pronouns?.subject === 'he') {
        if (/\bshe\b/i.test(contextWindow) && !hasOtherFemaleEntity(contextWindow, entities, slug)) {
          issues.push({
            file: filePath,
            line: lineIndex + 1,
            type: 'error',
            category: 'pronoun',
            message: `Pronoun mismatch: "${entity.name}" uses he/him pronouns, but "she" was used nearby`,
            suggestion: `Change "she" to "he"`,
          });
        }
        if (/\bher\b/i.test(contextWindow) && !hasOtherFemaleEntity(contextWindow, entities, slug)) {
          // Check if it's possessive "her" not object "her"
          const herMatch = contextWindow.match(/\bher\s+\w+/i);
          if (herMatch) {
            issues.push({
              file: filePath,
              line: lineIndex + 1,
              type: 'error',
              category: 'pronoun',
              message: `Pronoun mismatch: "${entity.name}" uses he/him pronouns, but "her" was used nearby`,
              suggestion: `Change "her" to "his"`,
            });
          }
        }
      }

      if (entity.pronouns?.subject === 'she') {
        if (/\bhe\b/i.test(contextWindow) && !hasOtherMaleEntity(contextWindow, entities, slug)) {
          issues.push({
            file: filePath,
            line: lineIndex + 1,
            type: 'error',
            category: 'pronoun',
            message: `Pronoun mismatch: "${entity.name}" uses she/her pronouns, but "he" was used nearby`,
            suggestion: `Change "he" to "she"`,
          });
        }
        if (/\bhis\b/i.test(contextWindow) && !hasOtherMaleEntity(contextWindow, entities, slug)) {
          issues.push({
            file: filePath,
            line: lineIndex + 1,
            type: 'error',
            category: 'pronoun',
            message: `Pronoun mismatch: "${entity.name}" uses she/her pronouns, but "his" was used nearby`,
            suggestion: `Change "his" to "her"`,
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Check if the context mentions another entity that could explain the pronoun.
 */
function hasOtherFemaleEntity(
  context: string,
  entities: Map<string, EntityInfo>,
  excludeSlug: string
): boolean {
  for (const [slug, entity] of entities) {
    if (slug === excludeSlug) continue;
    if (entity.pronouns?.subject !== 'she') continue;

    const namePattern = new RegExp(
      `\\b(${entity.variants?.map((v) => escapeRegex(v)).join('|') || escapeRegex(entity.name)})\\b`,
      'i'
    );
    if (namePattern.test(context)) return true;
  }
  return false;
}

function hasOtherMaleEntity(
  context: string,
  entities: Map<string, EntityInfo>,
  excludeSlug: string
): boolean {
  for (const [slug, entity] of entities) {
    if (slug === excludeSlug) continue;
    if (entity.pronouns?.subject !== 'he') continue;

    const namePattern = new RegExp(
      `\\b(${entity.variants?.map((v) => escapeRegex(v)).join('|') || escapeRegex(entity.name)})\\b`,
      'i'
    );
    if (namePattern.test(context)) return true;
  }
  return false;
}

/**
 * Validate entity links resolve to actual files.
 */
function checkBrokenLinks(
  content: string,
  entities: Map<string, EntityInfo>,
  filePath: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const links = extractEntityLinks(content);

  for (const link of links) {
    // Parse the link path: type/slug
    const parts = link.path.split('/');
    if (parts.length < 2) continue;

    const [type, slug] = parts;
    const validTypes = ['characters', 'enemies', 'locations', 'factions', 'items'];

    if (!validTypes.includes(type)) {
      issues.push({
        file: filePath,
        line: link.line,
        type: 'error',
        category: 'broken-link',
        message: `Invalid entity type "${type}" in link to "${link.text}"`,
        suggestion: `Valid types are: ${validTypes.join(', ')}`,
      });
      continue;
    }

    if (!entities.has(slug)) {
      issues.push({
        file: filePath,
        line: link.line,
        type: 'error',
        category: 'broken-link',
        message: `Broken link: Entity "${slug}" does not exist`,
        suggestion: `Create the entity at packages/site/src/content/campaign/${type}/${slug}.md`,
      });
    }
  }

  return issues;
}

/**
 * Suggest entity links for unlinked bold mentions.
 */
function checkUnlinkedEntities(
  content: string,
  entities: Map<string, EntityInfo>,
  filePath: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const mentions = extractBoldMentions(content);

  // Build a lookup of entity names to their info
  const nameLookup = new Map<string, EntityInfo>();
  for (const [, entity] of entities) {
    nameLookup.set(entity.name.toLowerCase(), entity);
    for (const variant of entity.variants || []) {
      nameLookup.set(variant.toLowerCase(), entity);
    }
  }

  for (const mention of mentions) {
    if (mention.isLinked) continue;

    const matchedEntity = nameLookup.get(mention.text.toLowerCase());
    if (matchedEntity) {
      const linkPath = `/campaign/${matchedEntity.type}s/${matchedEntity.slug}`;
      issues.push({
        file: filePath,
        line: mention.line,
        type: 'warning',
        category: 'unlinked-entity',
        message: `"${mention.text}" matches entity "${matchedEntity.name}" but is not linked`,
        suggestion: `Change **${mention.text}** to **[${mention.text}](${linkPath})**`,
      });
    }
  }

  return issues;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate all blog posts against the campaign entity database.
 */
export function validateWorld(
  blogDir: string,
  campaignDir: string
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    issues: [],
    stats: {
      filesChecked: 0,
      entitiesLoaded: 0,
      pronounIssues: 0,
      brokenLinks: 0,
      unlinkedEntities: 0,
    },
  };

  // Load entities
  const entities = loadEntities(campaignDir);
  result.stats.entitiesLoaded = entities.size;
  console.log(`Loaded ${entities.size} entities from ${campaignDir}`);

  // Find blog posts
  const blogFiles = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((f) => f.endsWith('.md'))
    : [];

  console.log(`Checking ${blogFiles.length} blog posts...`);

  for (const file of blogFiles) {
    const filePath = path.join(blogDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { content: bodyContent } = matter(content);

    result.stats.filesChecked++;

    // Run all checks
    const pronounIssues = checkPronounConsistency(bodyContent, entities, file);
    const linkIssues = checkBrokenLinks(bodyContent, entities, file);
    const unlinkedIssues = checkUnlinkedEntities(bodyContent, entities, file);

    result.issues.push(...pronounIssues, ...linkIssues, ...unlinkedIssues);
    result.stats.pronounIssues += pronounIssues.length;
    result.stats.brokenLinks += linkIssues.length;
    result.stats.unlinkedEntities += unlinkedIssues.length;
  }

  // Check if any errors (not just warnings)
  result.valid = !result.issues.some((i) => i.type === 'error');

  return result;
}

/**
 * Print validation results to console.
 */
export function printValidationResult(result: ValidationResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('World Consistency Validation Results');
  console.log('='.repeat(60));

  console.log(`\nStats:`);
  console.log(`  Files checked: ${result.stats.filesChecked}`);
  console.log(`  Entities loaded: ${result.stats.entitiesLoaded}`);
  console.log(`  Pronoun issues: ${result.stats.pronounIssues}`);
  console.log(`  Broken links: ${result.stats.brokenLinks}`);
  console.log(`  Unlinked entities: ${result.stats.unlinkedEntities}`);

  if (result.issues.length === 0) {
    console.log('\n✓ No issues found!');
    return;
  }

  // Group issues by file
  const byFile = new Map<string, ValidationIssue[]>();
  for (const issue of result.issues) {
    const existing = byFile.get(issue.file) || [];
    existing.push(issue);
    byFile.set(issue.file, existing);
  }

  console.log('\nIssues:');
  for (const [file, issues] of byFile) {
    console.log(`\n  ${file}:`);
    for (const issue of issues) {
      const icon = issue.type === 'error' ? '✗' : '⚠';
      const color = issue.type === 'error' ? '\x1b[31m' : '\x1b[33m';
      const reset = '\x1b[0m';
      console.log(`    ${color}${icon}${reset} Line ${issue.line}: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`      → ${issue.suggestion}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(result.valid ? '✓ Validation passed (warnings only)' : '✗ Validation failed');
  console.log('='.repeat(60));
}
