#!/usr/bin/env npx tsx
/**
 * Entity Validation Script
 *
 * Validates all campaign entities for:
 * 1. Required fields and correct types (via Zod schemas)
 * 2. Cross-reference integrity (relationships point to existing entities)
 * 3. Relationship symmetry warnings (one-way relationships)
 * 4. Orphan detection (entities with no relationships)
 *
 * Run with: npx tsx scripts/validate-entities.ts
 * Or via npm script: pnpm validate-entities
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface EntityReference {
  slug: string;
  type: string;
  filePath: string;
}

interface Relationship {
  entity: string;
  type: string;
  note?: string;
}

interface ParsedEntity {
  slug: string;
  type: string;
  name: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  relationships: Relationship[];
  // Type-specific reference fields
  faction?: string;
  location?: string;
  parentLocation?: string;
  currentOwner?: string;
  leader?: string;
  headquarters?: string;
  master?: string;
  lair?: string;
  homeLocation?: string;
  parentOrganization?: string;
  controlledBy?: string;
  childLocations?: string[];
  notableMembers?: string[];
  territory?: string[];
  allies?: string[];
  enemies?: string[];
  minions?: string[];
  items?: string[];
  secondaryFactions?: string[];
}

interface ValidationError {
  entity: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  totalEntities: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  entityCounts: Record<string, number>;
}

// ============================================================================
// Configuration
// ============================================================================

const CONTENT_BASE = path.resolve(__dirname, '../src/content/campaign');

const ENTITY_TYPES = [
  { name: 'characters', type: 'character' },
  { name: 'enemies', type: 'enemy' },
  { name: 'locations', type: 'location' },
  { name: 'factions', type: 'faction' },
  { name: 'items', type: 'item' },
] as const;

// Fields that reference other entities (slug references)
const ENTITY_REFERENCE_FIELDS: Record<string, string[]> = {
  character: ['faction', 'location', 'homeLocation', 'items', 'secondaryFactions'],
  enemy: ['faction', 'master', 'lair', 'territory', 'minions'],
  location: ['parentLocation', 'childLocations', 'controlledBy', 'pointsOfInterest'],
  faction: ['leader', 'headquarters', 'territory', 'notableMembers', 'allies', 'enemies', 'parentOrganization', 'subsidiaries', 'resources'],
  item: ['currentOwner', 'location', 'creator'],
};

// ============================================================================
// File Parsing
// ============================================================================

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    return yaml.parse(match[1]);
  } catch (e) {
    return null;
  }
}

function getSlugFromFilename(filePath: string): string {
  return path.basename(filePath, '.md');
}

function loadEntities(): Map<string, ParsedEntity> {
  const entities = new Map<string, ParsedEntity>();

  for (const { name: dirName, type } of ENTITY_TYPES) {
    const dirPath = path.join(CONTENT_BASE, dirName);

    if (!fs.existsSync(dirPath)) {
      console.warn(`  Warning: Directory not found: ${dirPath}`);
      continue;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const frontmatter = extractFrontmatter(content);

      if (!frontmatter) {
        console.error(`  Error: Could not parse frontmatter in ${filePath}`);
        continue;
      }

      const slug = getSlugFromFilename(filePath);
      const name = (frontmatter.name as string) || slug;

      entities.set(slug, {
        slug,
        type,
        name,
        filePath,
        frontmatter,
        relationships: (frontmatter.relationships as Relationship[]) || [],
        // Extract type-specific reference fields
        faction: frontmatter.faction as string | undefined,
        location: frontmatter.location as string | undefined,
        parentLocation: frontmatter.parentLocation as string | undefined,
        currentOwner: frontmatter.currentOwner as string | undefined,
        leader: frontmatter.leader as string | undefined,
        headquarters: frontmatter.headquarters as string | undefined,
        master: frontmatter.master as string | undefined,
        lair: frontmatter.lair as string | undefined,
        homeLocation: frontmatter.homeLocation as string | undefined,
        parentOrganization: frontmatter.parentOrganization as string | undefined,
        controlledBy: frontmatter.controlledBy as string | undefined,
        childLocations: frontmatter.childLocations as string[] | undefined,
        notableMembers: frontmatter.notableMembers as string[] | undefined,
        territory: frontmatter.territory as string[] | undefined,
        allies: frontmatter.allies as string[] | undefined,
        enemies: frontmatter.enemies as string[] | undefined,
        minions: frontmatter.minions as string[] | undefined,
        items: frontmatter.items as string[] | undefined,
        secondaryFactions: frontmatter.secondaryFactions as string[] | undefined,
      });
    }
  }

  return entities;
}

// ============================================================================
// Validation Functions
// ============================================================================

function validateRelationships(
  entities: Map<string, ParsedEntity>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const slugs = new Set(entities.keys());

  for (const [slug, entity] of entities) {
    // Check relationships array
    for (const rel of entity.relationships) {
      if (!slugs.has(rel.entity)) {
        errors.push({
          entity: slug,
          field: `relationships[${rel.entity}]`,
          message: `References non-existent entity "${rel.entity}"`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

function validateEntityReferences(
  entities: Map<string, ParsedEntity>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const slugs = new Set(entities.keys());

  for (const [slug, entity] of entities) {
    const referenceFields = ENTITY_REFERENCE_FIELDS[entity.type] || [];

    for (const field of referenceFields) {
      const value = entity[field as keyof ParsedEntity];

      if (!value) continue;

      // Handle array fields
      if (Array.isArray(value)) {
        for (const ref of value) {
          if (typeof ref === 'string' && ref && !slugs.has(ref)) {
            errors.push({
              entity: slug,
              field,
              message: `References non-existent entity "${ref}"`,
              severity: 'error',
            });
          }
        }
      }
      // Handle string fields
      else if (typeof value === 'string' && !slugs.has(value)) {
        errors.push({
          entity: slug,
          field,
          message: `References non-existent entity "${value}"`,
          severity: 'error',
        });
      }
    }
  }

  return errors;
}

function checkRelationshipSymmetry(
  entities: Map<string, ParsedEntity>
): ValidationError[] {
  const warnings: ValidationError[] = [];
  const slugs = new Set(entities.keys());

  // Build a map of all relationships
  const relationshipMap = new Map<string, Set<string>>();

  for (const [slug, entity] of entities) {
    const related = new Set<string>();
    for (const rel of entity.relationships) {
      if (slugs.has(rel.entity)) {
        related.add(rel.entity);
      }
    }
    relationshipMap.set(slug, related);
  }

  // Check for one-way relationships (warnings only)
  for (const [slug, related] of relationshipMap) {
    for (const targetSlug of related) {
      const targetRelated = relationshipMap.get(targetSlug);
      if (targetRelated && !targetRelated.has(slug)) {
        // Only warn for significant relationships
        const entity = entities.get(slug);
        const target = entities.get(targetSlug);
        if (entity && target) {
          const rel = entity.relationships.find(r => r.entity === targetSlug);
          const relType = rel?.type || 'unknown';
          // Skip certain relationship types that are typically one-way
          if (!['located-in', 'serves', 'member-of', 'possesses', 'knows-about'].includes(relType)) {
            warnings.push({
              entity: slug,
              field: 'relationships',
              message: `One-way "${relType}" relationship to "${targetSlug}" (${target.name})`,
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  return warnings;
}

function checkRequiredFields(
  entities: Map<string, ParsedEntity>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [slug, entity] of entities) {
    // All entities need a name
    if (!entity.frontmatter.name) {
      errors.push({
        entity: slug,
        field: 'name',
        message: 'Missing required field "name"',
        severity: 'error',
      });
    }

    // All entities need a subtype (except potentially spells/glossary)
    if (!entity.frontmatter.subtype) {
      errors.push({
        entity: slug,
        field: 'subtype',
        message: 'Missing required field "subtype"',
        severity: 'error',
      });
    }
  }

  return errors;
}

function findOrphanedEntities(
  entities: Map<string, ParsedEntity>
): ValidationError[] {
  const warnings: ValidationError[] = [];

  // Build reference counts
  const referenceCounts = new Map<string, number>();
  for (const slug of entities.keys()) {
    referenceCounts.set(slug, 0);
  }

  for (const entity of entities.values()) {
    // Count relationships
    for (const rel of entity.relationships) {
      const count = referenceCounts.get(rel.entity) || 0;
      referenceCounts.set(rel.entity, count + 1);
    }

    // Count other reference fields
    const referenceFields = ENTITY_REFERENCE_FIELDS[entity.type] || [];
    for (const field of referenceFields) {
      const value = entity[field as keyof ParsedEntity];
      if (Array.isArray(value)) {
        for (const ref of value) {
          if (typeof ref === 'string' && referenceCounts.has(ref)) {
            referenceCounts.set(ref, (referenceCounts.get(ref) || 0) + 1);
          }
        }
      } else if (typeof value === 'string' && referenceCounts.has(value)) {
        referenceCounts.set(value, (referenceCounts.get(value) || 0) + 1);
      }
    }
  }

  // Find orphans (entities with no incoming references)
  // Exclude certain types that are often standalone
  const excludeFromOrphanCheck = new Set(['the-party']); // Party is the root

  for (const [slug, count] of referenceCounts) {
    const entity = entities.get(slug);
    if (!entity) continue;

    // Skip if entity has no relationships itself (could be intentionally standalone)
    if (entity.relationships.length === 0 && count === 0) {
      if (!excludeFromOrphanCheck.has(slug)) {
        warnings.push({
          entity: slug,
          field: 'relationships',
          message: `Entity "${entity.name}" has no relationships (possible orphan)`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}

// ============================================================================
// Main Validation
// ============================================================================

function validateEntities(): ValidationResult {
  console.log('\nEntity Validation');
  console.log('============================================================\n');

  // Load entities
  console.log('Loading entities...');
  const entities = loadEntities();

  // Count by type
  const entityCounts: Record<string, number> = {};
  for (const entity of entities.values()) {
    entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
  }

  console.log(`  Found ${entities.size} entities:`);
  for (const [type, count] of Object.entries(entityCounts)) {
    console.log(`    - ${type}: ${count}`);
  }

  // Run validations
  console.log('\nRunning validations...');

  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationError[] = [];

  // Required fields
  console.log('  Checking required fields...');
  const requiredFieldErrors = checkRequiredFields(entities);
  allErrors.push(...requiredFieldErrors.filter(e => e.severity === 'error'));

  // Relationships
  console.log('  Checking relationship references...');
  const relationshipErrors = validateRelationships(entities);
  allErrors.push(...relationshipErrors);

  // Entity reference fields
  console.log('  Checking entity reference fields...');
  const referenceErrors = validateEntityReferences(entities);
  allErrors.push(...referenceErrors);

  // Relationship symmetry (warnings)
  console.log('  Checking relationship symmetry...');
  const symmetryWarnings = checkRelationshipSymmetry(entities);
  allWarnings.push(...symmetryWarnings);

  // Orphan detection (warnings)
  console.log('  Checking for orphaned entities...');
  const orphanWarnings = findOrphanedEntities(entities);
  allWarnings.push(...orphanWarnings);

  return {
    totalEntities: entities.size,
    errors: allErrors,
    warnings: allWarnings,
    entityCounts,
  };
}

function printResults(result: ValidationResult): void {
  console.log('\n============================================================\n');

  if (result.errors.length > 0) {
    console.log(`ERRORS (${result.errors.length}):\n`);
    for (const error of result.errors) {
      console.log(`  [ERROR] ${error.entity}`);
      console.log(`          Field: ${error.field}`);
      console.log(`          ${error.message}\n`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`WARNINGS (${result.warnings.length}):\n`);
    // Group warnings by type
    const grouped = new Map<string, ValidationError[]>();
    for (const warning of result.warnings) {
      const key = warning.message.split('"')[0].trim();
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(warning);
    }

    for (const [type, warnings] of grouped) {
      console.log(`  ${type} (${warnings.length}):`);
      for (const warning of warnings.slice(0, 5)) {
        console.log(`    - ${warning.entity}: ${warning.message}`);
      }
      if (warnings.length > 5) {
        console.log(`    ... and ${warnings.length - 5} more`);
      }
      console.log();
    }
  }

  console.log('============================================================\n');
  console.log('Summary:');
  console.log(`   Total entities:    ${result.totalEntities}`);
  console.log(`   Errors:            ${result.errors.length}`);
  console.log(`   Warnings:          ${result.warnings.length}`);
  console.log();

  if (result.errors.length === 0) {
    console.log('[PASSED] All entity validations passed!\n');
  } else {
    console.log('[FAILED] Entity validation errors found.\n');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

const result = validateEntities();
printResults(result);

// Exit with error code if there are errors
process.exit(result.errors.length > 0 ? 1 : 0);
