#!/usr/bin/env node
/**
 * Knowledge Builder
 *
 * Aggregates campaign entities and blog posts into a single JSON file
 * for AI fact-checking and thorough review.
 *
 * Output: campaign-knowledge.json
 *
 * Usage:
 *   pnpm build:knowledge
 *   pnpm tsx src/knowledge-builder.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface Relationship {
  entity: string;
  type: string;
  note?: string;
  since?: string;
}

interface BaseEntity {
  slug: string;
  name: string;
  type: 'character' | 'enemy' | 'location' | 'faction' | 'item';
  subtype?: string;
  status: string;
  visibility: string;
  description?: string;
  tags: string[];
  relationships: Relationship[];
  firstAppearance?: string;
  lastAppearance?: string;
  content: string; // Markdown body
}

interface Session {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  content: string;
}

interface KnowledgeIndex {
  byName: Record<string, string>;
  byVariant: Record<string, string>;
  byTag: Record<string, string[]>;
  bySession: Record<string, string[]>;
  byRelationship: Record<string, Record<string, string[]>>;
  byType: Record<string, string[]>;
}

interface CampaignKnowledge {
  generatedAt: string;
  version: string;
  stats: {
    totalEntities: number;
    totalSessions: number;
    byType: Record<string, number>;
  };
  entities: {
    characters: BaseEntity[];
    enemies: BaseEntity[];
    locations: BaseEntity[];
    factions: BaseEntity[];
    items: BaseEntity[];
  };
  sessions: Record<string, Session>;
  indexes: KnowledgeIndex;
}

// ============================================================================
// Configuration
// ============================================================================

const SITE_DIR = path.resolve(__dirname, '../../site');
const CAMPAIGN_DIR = path.join(SITE_DIR, 'src/content/campaign');
const BLOG_DIR = path.join(SITE_DIR, 'src/content/blog');
const OUTPUT_FILE = path.join(__dirname, '../campaign-knowledge.json');

const ENTITY_TYPES = ['characters', 'enemies', 'locations', 'factions', 'items'] as const;

// ============================================================================
// File Reading
// ============================================================================

function findMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseMarkdownFile(filePath: string): { data: Record<string, unknown>; content: string } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);
    return { data, content: content.trim() };
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

function generateSlug(filePath: string): string {
  const basename = path.basename(filePath, '.md');
  return basename
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

// ============================================================================
// Entity Loading
// ============================================================================

function loadEntities(type: string): BaseEntity[] {
  const dir = path.join(CAMPAIGN_DIR, type);
  const files = findMarkdownFiles(dir);
  const entities: BaseEntity[] = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(file);
    if (!parsed) continue;

    const { data, content } = parsed;
    const slug = (data.slug as string) || generateSlug(file);

    entities.push({
      slug,
      name: (data.name as string) || slug,
      type: data.type as BaseEntity['type'],
      subtype: data.subtype as string | undefined,
      status: (data.status as string) || 'active',
      visibility: (data.visibility as string) || 'public',
      description: data.description as string | undefined,
      tags: (data.tags as string[]) || [],
      relationships: (data.relationships as Relationship[]) || [],
      firstAppearance: data.firstAppearance as string | undefined,
      lastAppearance: data.lastAppearance as string | undefined,
      content,
    });
  }

  return entities;
}

// ============================================================================
// Session Loading
// ============================================================================

function loadSessions(): Record<string, Session> {
  const files = findMarkdownFiles(BLOG_DIR);
  const sessions: Record<string, Session> = {};

  for (const file of files) {
    const parsed = parseMarkdownFile(file);
    if (!parsed) continue;

    const { data, content } = parsed;
    const slug = generateSlug(file);

    // Only include session posts (check tags or title pattern)
    const tags = (data.tags as string[]) || [];
    const title = (data.title as string) || '';
    const isSession = tags.includes('session') || /session[-\s]*\d+/i.test(title) || /session[-\s]*\d+/i.test(slug);

    if (!isSession && !tags.includes('campaign')) continue;

    const pubDate = data.pubDate;
    let dateStr = '';
    if (pubDate instanceof Date) {
      dateStr = pubDate.toISOString().split('T')[0];
    } else if (typeof pubDate === 'string') {
      dateStr = pubDate;
    }

    sessions[slug] = {
      slug,
      title: title || slug,
      date: dateStr,
      description: (data.description as string) || '',
      tags,
      content,
    };
  }

  return sessions;
}

// ============================================================================
// Index Building
// ============================================================================

function buildIndexes(
  entities: CampaignKnowledge['entities'],
  _sessions: Record<string, Session>
): KnowledgeIndex {
  const indexes: KnowledgeIndex = {
    byName: {},
    byVariant: {},
    byTag: {},
    bySession: {},
    byRelationship: {},
    byType: {},
  };

  // Process all entities
  const allEntities = [
    ...entities.characters,
    ...entities.enemies,
    ...entities.locations,
    ...entities.factions,
    ...entities.items,
  ];

  for (const entity of allEntities) {
    // By name
    indexes.byName[entity.name] = entity.slug;

    // By type
    if (!indexes.byType[entity.type]) {
      indexes.byType[entity.type] = [];
    }
    indexes.byType[entity.type].push(entity.slug);

    // By tag
    for (const tag of entity.tags) {
      if (!indexes.byTag[tag]) {
        indexes.byTag[tag] = [];
      }
      indexes.byTag[tag].push(entity.slug);
    }

    // By session appearance
    if (entity.firstAppearance) {
      if (!indexes.bySession[entity.firstAppearance]) {
        indexes.bySession[entity.firstAppearance] = [];
      }
      indexes.bySession[entity.firstAppearance].push(entity.slug);
    }

    // By relationship
    for (const rel of entity.relationships) {
      if (!indexes.byRelationship[rel.type]) {
        indexes.byRelationship[rel.type] = {};
      }
      if (!indexes.byRelationship[rel.type][entity.slug]) {
        indexes.byRelationship[rel.type][entity.slug] = [];
      }
      indexes.byRelationship[rel.type][entity.slug].push(rel.entity);
    }
  }

  return indexes;
}

// ============================================================================
// Validation
// ============================================================================

interface ValidationIssue {
  severity: 'error' | 'warning';
  entity: string;
  field: string;
  message: string;
}

function validateKnowledge(knowledge: CampaignKnowledge): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allSlugs = new Set<string>();

  const allEntities = [
    ...knowledge.entities.characters,
    ...knowledge.entities.enemies,
    ...knowledge.entities.locations,
    ...knowledge.entities.factions,
    ...knowledge.entities.items,
  ];

  // Collect all slugs
  for (const entity of allEntities) {
    allSlugs.add(entity.slug);
  }

  // Validate relationships
  for (const entity of allEntities) {
    for (const rel of entity.relationships) {
      if (!allSlugs.has(rel.entity)) {
        issues.push({
          severity: 'warning',
          entity: entity.slug,
          field: `relationships[${rel.entity}]`,
          message: `References unknown entity "${rel.entity}"`,
        });
      }
    }

    // Validate session references
    if (entity.firstAppearance && !knowledge.sessions[entity.firstAppearance]) {
      issues.push({
        severity: 'warning',
        entity: entity.slug,
        field: 'firstAppearance',
        message: `References unknown session "${entity.firstAppearance}"`,
      });
    }
  }

  return issues;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Building campaign knowledge base...\n');

  // Load entities
  const entities: CampaignKnowledge['entities'] = {
    characters: [],
    enemies: [],
    locations: [],
    factions: [],
    items: [],
  };

  for (const type of ENTITY_TYPES) {
    entities[type] = loadEntities(type);
    console.log(`  Loaded ${entities[type].length} ${type}`);
  }

  // Load sessions
  const sessions = loadSessions();
  console.log(`  Loaded ${Object.keys(sessions).length} sessions\n`);

  // Build indexes
  const indexes = buildIndexes(entities, sessions);

  // Calculate stats
  const totalEntities =
    entities.characters.length +
    entities.enemies.length +
    entities.locations.length +
    entities.factions.length +
    entities.items.length;

  const knowledge: CampaignKnowledge = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    stats: {
      totalEntities,
      totalSessions: Object.keys(sessions).length,
      byType: {
        characters: entities.characters.length,
        enemies: entities.enemies.length,
        locations: entities.locations.length,
        factions: entities.factions.length,
        items: entities.items.length,
      },
    },
    entities,
    sessions,
    indexes,
  };

  // Validate
  const issues = validateKnowledge(knowledge);
  if (issues.length > 0) {
    console.log('Validation issues:');
    for (const issue of issues) {
      const icon = issue.severity === 'error' ? '✗' : '⚠';
      console.log(`  ${icon} ${issue.entity}.${issue.field}: ${issue.message}`);
    }
    console.log();
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(knowledge, null, 2));
  console.log(`Written to: ${OUTPUT_FILE}`);
  console.log(`  Total entities: ${totalEntities}`);
  console.log(`  Total sessions: ${Object.keys(sessions).length}`);
  console.log(`  File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error('Failed to build knowledge base:', error);
  process.exit(1);
});
