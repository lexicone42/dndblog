import { z } from 'zod';

/**
 * Campaign Entity Schemas
 *
 * These schemas define the structure for all campaign entities in the D&D blog.
 * They follow library cataloging principles with:
 * - Authority control (canonical names + variants)
 * - Controlled vocabularies (relationship types, statuses)
 * - Cross-references (entity relationships)
 * - Provenance tracking (sources, creation dates)
 *
 * Schema design inspired by MARC21 cataloging standards.
 */

// ============================================================================
// Controlled Vocabularies
// ============================================================================

/**
 * Relationship types following Dublin Core and library cataloging patterns.
 * Organized by category for clarity.
 */
export const relationshipTypes = [
  // Interpersonal
  'ally',
  'enemy',
  'rival',
  'mentor',
  'student',
  'family',
  'lover',
  'friend',
  // Organizational
  'member-of',
  'leader-of',
  'founder-of',
  'former-member-of',
  'serves',
  'employs',
  // Spatial
  'located-in',
  'headquartered-at',
  'originated-from',
  'controls',
  'resides-in',
  // Narrative
  'seeks',
  'guards',
  'created',
  'destroyed',
  'possesses',
  'formerly-possessed',
  'knows-about',
  'hunts',
] as const;

export const relationshipTypeSchema = z.enum(relationshipTypes);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

/**
 * Entity status vocabulary.
 * Tracks the current narrative state of an entity.
 */
export const statusTypes = [
  'active', // Currently relevant to campaign
  'inactive', // Exists but not currently relevant
  'dead', // Character has died
  'destroyed', // Item/location has been destroyed
  'unknown', // Status unclear in narrative
  'missing', // Cannot be located
  'transformed', // Changed into something else
  'dormant', // Temporarily inactive (e.g., sleeping dragon)
] as const;

export const statusSchema = z.enum(statusTypes);
export type Status = z.infer<typeof statusSchema>;

/**
 * Visibility levels for entity access control.
 */
export const visibilityTypes = ['public', 'dm-only'] as const;
export const visibilitySchema = z.enum(visibilityTypes);
export type Visibility = z.infer<typeof visibilitySchema>;

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Relationship to another entity.
 * Forms the basis of the cross-reference index.
 */
export const relationshipSchema = z.object({
  entity: z.string().describe('Slug of the related entity'),
  type: relationshipTypeSchema.describe('Nature of the relationship'),
  note: z.string().optional().describe('Additional context about the relationship'),
  since: z.string().optional().describe('Session when relationship began'),
});

export type Relationship = z.infer<typeof relationshipSchema>;

/**
 * Provenance source for audit trails.
 * Tracks where information about an entity originated.
 */
export const provenanceSourceSchema = z.object({
  type: z.enum(['session-notes', 'dm-notes', 'player-backstory', 'worldbuilding']),
  ref: z.string().optional().describe('Reference to source (e.g., session slug)'),
  date: z.string().optional().describe('ISO date when recorded'),
  excerpt: z.string().optional().describe('Relevant quote from source'),
  note: z.string().optional().describe('Additional context'),
});

/**
 * Full provenance tracking for an entity.
 */
export const provenanceSchema = z.object({
  createdAt: z.string().describe('ISO date of entity creation'),
  createdBy: z.string().default('dm').describe('Who created this record'),
  lastModified: z.string().optional().describe('ISO date of last modification'),
  sources: z.array(provenanceSourceSchema).default([]),
});

/**
 * Authority record for name variants.
 * Enables "see from" references in the catalog.
 */
export const authoritySchema = z.object({
  variants: z.array(z.string()).default([]).describe('Alternative names, aliases, nicknames'),
  broaderTerm: z.string().optional().describe('Hierarchical parent (e.g., region for a city)'),
  narrowerTerms: z.array(z.string()).default([]).describe('Hierarchical children'),
  seeAlso: z.array(z.string()).default([]).describe('Related entities for reference'),
});

// ============================================================================
// Base Entity Schema
// ============================================================================

/**
 * Base schema shared by all entity types.
 * Corresponds to MARC fields: 100 (name), 240 (slug), 400 (variants), 650 (tags)
 */
export const baseEntitySchema = z.object({
  // Core identification
  name: z.string().min(1, 'Entity name is required'),
  slug: z.string().optional().describe('URL-safe identifier, auto-generated if not provided'),

  // Classification
  type: z.enum(['character', 'enemy', 'location', 'faction', 'item']),
  status: statusSchema.default('active'),
  visibility: visibilitySchema.default('public'),

  // Temporal references
  firstAppearance: z.string().optional().describe('Session slug where entity first appeared'),
  lastAppearance: z.string().optional().describe('Session slug where entity last appeared'),

  // Cataloging
  tags: z.array(z.string()).default([]).describe('Subject terms for indexing'),
  relationships: z.array(relationshipSchema).default([]),

  // Authority control
  authority: authoritySchema.optional(),

  // Provenance
  _provenance: provenanceSchema.optional(),

  // Brief description for summaries
  description: z.string().optional().describe('One-sentence summary for indexes'),
});

export type BaseEntity = z.infer<typeof baseEntitySchema>;

// ============================================================================
// Character Schema
// ============================================================================

/**
 * Schema for player characters and NPCs.
 * Extends base with D&D 5e specific fields.
 */
export const characterSubtypes = ['pc', 'npc', 'deity', 'historical'] as const;

export const characterSchema = baseEntitySchema.extend({
  type: z.literal('character'),
  subtype: z.enum(characterSubtypes),

  // Player info (for PCs)
  player: z.string().optional().describe('Real-world player name'),

  // D&D 5e character details (link to D&D API)
  race: z.string().optional().describe('D&D API race index (e.g., "tiefling")'),
  class: z.string().optional().describe('D&D API class index (e.g., "wizard")'),
  subclass: z.string().optional().describe('Character subclass'),
  level: z.number().int().min(1).max(20).optional(),
  background: z.string().optional().describe('D&D background'),

  // Affiliations
  faction: z.string().optional().describe('Primary faction slug'),
  secondaryFactions: z.array(z.string()).default([]),
  location: z.string().optional().describe('Current location slug'),
  homeLocation: z.string().optional().describe('Origin location slug'),

  // Abilities (link to D&D API)
  knownSpells: z.array(z.string()).default([]).describe('D&D API spell indexes'),
  abilities: z.array(z.string()).default([]).describe('Notable class/racial abilities'),

  // Inventory
  items: z.array(z.string()).default([]).describe('Item entity slugs'),
  notableEquipment: z.array(z.string()).default([]).describe('D&D API equipment indexes'),

  // Personality
  alignment: z.string().optional().describe('D&D alignment (e.g., "chaotic-good")'),
  ideals: z.array(z.string()).default([]),
  bonds: z.array(z.string()).default([]),
  flaws: z.array(z.string()).default([]),
});

export type Character = z.infer<typeof characterSchema>;

// ============================================================================
// Enemy Schema
// ============================================================================

/**
 * Schema for monsters, villains, and hostile entities.
 */
export const enemySubtypes = ['boss', 'lieutenant', 'minion', 'creature', 'swarm', 'trap'] as const;

export const defeatRecordSchema = z.object({
  session: z.string().describe('Session slug when defeated'),
  method: z.string().describe('How the enemy was defeated'),
  defeatedBy: z.array(z.string()).default([]).describe('Character slugs who participated'),
});

export const enemySchema = baseEntitySchema.extend({
  type: z.literal('enemy'),
  subtype: z.enum(enemySubtypes),

  // D&D 5e monster details (link to D&D API)
  baseMonster: z.string().optional().describe('D&D API monster index (e.g., "lich")'),
  cr: z.string().optional().describe('Challenge rating'),
  creatureType: z.string().optional().describe('Monster type (e.g., "undead")'),

  // Modifications
  customizations: z.array(z.string()).default([]).describe('Homebrew modifications'),
  legendaryActions: z.array(z.string()).default([]),
  lairActions: z.array(z.string()).default([]),

  // Affiliations
  faction: z.string().optional().describe('Faction slug'),
  master: z.string().optional().describe('Character/enemy slug they serve'),
  minions: z.array(z.string()).default([]).describe('Enemy slugs they command'),

  // Combat history
  encounters: z.array(z.string()).default([]).describe('Session slugs with encounters'),
  defeats: z.array(defeatRecordSchema).default([]),

  // Location
  lair: z.string().optional().describe('Location slug of lair'),
  territory: z.array(z.string()).default([]).describe('Location slugs they control'),
});

export type Enemy = z.infer<typeof enemySchema>;

// ============================================================================
// Location Schema
// ============================================================================

/**
 * Schema for places, dungeons, and regions.
 * Supports hierarchical organization (region > city > building > room).
 */
export const locationSubtypes = [
  'plane',
  'continent',
  'region',
  'city',
  'town',
  'village',
  'dungeon',
  'wilderness',
  'building',
  'room',
  'landmark',
] as const;

export const locationSchema = baseEntitySchema.extend({
  type: z.literal('location'),
  subtype: z.enum(locationSubtypes),

  // Hierarchy
  parentLocation: z.string().optional().describe('Containing location slug'),
  childLocations: z.array(z.string()).default([]).describe('Contained location slugs'),

  // Geography
  climate: z.string().optional(),
  terrain: z.string().optional(),
  population: z.string().optional().describe('Population size or description'),

  // Control
  controlledBy: z.string().optional().describe('Faction or character slug'),
  formerControllers: z.array(z.string()).default([]),

  // Points of interest
  pointsOfInterest: z.array(z.string()).default([]).describe('Notable location slugs within'),
  dungeonLevel: z.number().int().optional().describe('For multi-level dungeons'),

  // Narrative
  notableEvents: z.array(z.string()).default([]).describe('Session slugs of events here'),
  secrets: z.array(z.string()).default([]).describe('DM-only notes (visibility: dm-only)'),
});

export type Location = z.infer<typeof locationSchema>;

// ============================================================================
// Faction Schema
// ============================================================================

/**
 * Schema for organizations, cults, and groups.
 */
export const factionSubtypes = [
  'cult',
  'guild',
  'government',
  'military',
  'religious',
  'criminal',
  'merchant',
  'noble-house',
  'adventuring-party',
  'secret-society',
] as const;

export const factionSchema = baseEntitySchema.extend({
  type: z.literal('faction'),
  subtype: z.enum(factionSubtypes),

  // Leadership
  leader: z.string().optional().describe('Character/enemy slug'),
  formerLeaders: z.array(z.string()).default([]),
  notableMembers: z.array(z.string()).default([]).describe('Character/enemy slugs'),

  // Territory
  headquarters: z.string().optional().describe('Location slug'),
  territory: z.array(z.string()).default([]).describe('Location slugs they control'),
  influence: z.array(z.string()).default([]).describe('Location slugs with presence'),

  // Relationships
  allies: z.array(z.string()).default([]).describe('Allied faction slugs'),
  enemies: z.array(z.string()).default([]).describe('Enemy faction slugs'),
  parentOrganization: z.string().optional().describe('Parent faction slug'),
  subsidiaries: z.array(z.string()).default([]).describe('Child faction slugs'),

  // Mission
  goals: z.array(z.string()).default([]),
  methods: z.array(z.string()).default([]),
  resources: z.array(z.string()).default([]).describe('Item slugs they possess'),
  secrets: z.array(z.string()).default([]).describe('DM-only information'),

  // Symbols
  symbol: z.string().optional().describe('Description of faction symbol'),
  motto: z.string().optional(),
});

export type Faction = z.infer<typeof factionSchema>;

// ============================================================================
// Item Schema
// ============================================================================

/**
 * Schema for items, artifacts, and equipment.
 */
export const itemSubtypes = [
  'weapon',
  'armor',
  'artifact',
  'consumable',
  'quest',
  'treasure',
  'tool',
  'wondrous',
  'vehicle',
  'property',
] as const;

export const rarityTypes = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
  'unique',
] as const;

export const ownershipRecordSchema = z.object({
  owner: z.string().describe('Character slug'),
  acquiredIn: z.string().optional().describe('Session slug'),
  lostIn: z.string().optional().describe('Session slug'),
  method: z.string().optional().describe('How acquired/lost'),
});

export const itemSchema = baseEntitySchema.extend({
  type: z.literal('item'),
  subtype: z.enum(itemSubtypes),

  // D&D 5e item details (link to D&D API)
  baseItem: z.string().optional().describe('D&D API equipment index'),
  magicItem: z.string().optional().describe('D&D API magic-items index'),
  rarity: z.enum(rarityTypes).optional(),
  attunement: z.boolean().default(false),
  attunementRequirements: z.string().optional(),

  // Ownership
  currentOwner: z.string().optional().describe('Character slug'),
  ownershipHistory: z.array(ownershipRecordSchema).default([]),

  // Location (if not owned)
  location: z.string().optional().describe('Location slug where item is found'),

  // Properties
  properties: z.array(z.string()).default([]).describe('Homebrew properties'),
  charges: z.number().int().optional(),
  maxCharges: z.number().int().optional(),

  // Lore
  creator: z.string().optional().describe('Character slug who created it'),
  creationDate: z.string().optional().describe('In-world date or era'),
  significance: z.string().optional().describe('Narrative importance'),
  secrets: z.array(z.string()).default([]).describe('DM-only properties'),
});

export type Item = z.infer<typeof itemSchema>;

// ============================================================================
// Union Type & Validation
// ============================================================================

/**
 * Union of all entity schemas for type discrimination.
 */
export const entitySchema = z.discriminatedUnion('type', [
  characterSchema,
  enemySchema,
  locationSchema,
  factionSchema,
  itemSchema,
]);

export type Entity = z.infer<typeof entitySchema>;

/**
 * Validates entity data against the appropriate schema.
 * Uses discriminated union for type-safe validation.
 */
export function validateEntity(data: unknown, filePath: string): Entity {
  const result = entitySchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid entity in ${filePath}:\n${errors}`);
  }

  return result.data;
}

/**
 * Generates a slug from entity name if not provided.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Validates all cross-references in an entity collection.
 * Returns validation results with errors and warnings.
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ entity: string; field: string; message: string }>;
  warnings: Array<{ entity: string; field: string; message: string }>;
}

export function validateReferences(
  entities: Map<string, Entity>,
  sessions: Set<string>
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  const slugs = new Set(entities.keys());

  for (const [slug, entity] of entities) {
    // Check relationships reference existing entities
    for (const rel of entity.relationships) {
      if (!slugs.has(rel.entity)) {
        result.errors.push({
          entity: slug,
          field: `relationships[${rel.entity}]`,
          message: `References non-existent entity "${rel.entity}"`,
        });
        result.valid = false;
      }
    }

    // Check session references
    if (entity.firstAppearance && !sessions.has(entity.firstAppearance)) {
      result.warnings.push({
        entity: slug,
        field: 'firstAppearance',
        message: `References unknown session "${entity.firstAppearance}"`,
      });
    }

    // Type-specific validations
    if (entity.type === 'character') {
      if (entity.faction && !slugs.has(entity.faction)) {
        result.errors.push({
          entity: slug,
          field: 'faction',
          message: `References non-existent faction "${entity.faction}"`,
        });
        result.valid = false;
      }
    }

    if (entity.type === 'location') {
      if (entity.parentLocation && !slugs.has(entity.parentLocation)) {
        result.errors.push({
          entity: slug,
          field: 'parentLocation',
          message: `References non-existent location "${entity.parentLocation}"`,
        });
        result.valid = false;
      }
    }

    if (entity.type === 'item') {
      if (entity.currentOwner && !slugs.has(entity.currentOwner)) {
        result.errors.push({
          entity: slug,
          field: 'currentOwner',
          message: `References non-existent character "${entity.currentOwner}"`,
        });
        result.valid = false;
      }
    }
  }

  return result;
}
