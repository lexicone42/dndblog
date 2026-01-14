import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog post frontmatter schema.
 *
 * Required fields:
 * - title: Post title
 * - description: Short description for SEO and previews
 * - pubDate: Publication date
 *
 * Optional fields for current functionality:
 * - updatedDate: Last update date
 * - heroImage: Path to hero image
 * - draft: Whether post is a draft (excluded from production)
 * - tags: Array of tags for categorization
 * - author: Author name
 *
 * Future Phase 2 fields (added now, used later):
 * - visibility: Access control level
 * - campaignId: Link to specific campaign
 * - contributors: Additional contributors
 */
const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    // Required fields
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),

    // Optional fields
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),

    // Future Phase 2 fields - include now for forward compatibility
    visibility: z.enum(['public', 'private', 'campaign']).default('public'),
    campaignId: z.string().optional(),
    contributors: z.array(z.string()).default([]),
  }),
});

// ============================================================================
// Campaign Entity Schemas
// ============================================================================

/**
 * Shared relationship schema for cross-referencing entities.
 * Follows library cataloging principles for authority control.
 */
const relationshipSchema = z.object({
  entity: z.string(),
  type: z.string(),
  note: z.string().optional(),
  since: z.string().optional(),
});

/**
 * Provenance tracking for audit trails.
 */
const provenanceSchema = z.object({
  createdAt: z.string(),
  createdBy: z.string().default('dm'),
  lastModified: z.string().optional(),
  sources: z.array(z.object({
    type: z.enum(['session-notes', 'dm-notes', 'player-backstory', 'worldbuilding']),
    ref: z.string().optional(),
    date: z.string().optional(),
    excerpt: z.string().optional(),
    note: z.string().optional(),
  })).default([]),
}).optional();

/**
 * Authority control for name variants (MARC 400 equivalent).
 */
const authoritySchema = z.object({
  variants: z.array(z.string()).default([]),
  broaderTerm: z.string().optional(),
  narrowerTerms: z.array(z.string()).default([]),
  seeAlso: z.array(z.string()).default([]),
}).optional();

/**
 * Base fields shared by all campaign entities.
 */
const baseEntityFields = {
  name: z.string(),
  slug: z.string().optional(),
  status: z.enum(['active', 'inactive', 'dead', 'destroyed', 'unknown', 'missing', 'transformed', 'dormant']).default('active'),
  visibility: z.enum(['public', 'dm-only']).default('public'),
  firstAppearance: z.string().optional(),
  lastAppearance: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relationships: z.array(relationshipSchema).default([]),
  authority: authoritySchema,
  _provenance: provenanceSchema,
  description: z.string().optional(),
};

/**
 * Ability score schema for D&D 5e characters.
 */
const abilityScoresSchema = z.object({
  str: z.number().int().min(1).max(30).optional(),
  dex: z.number().int().min(1).max(30).optional(),
  con: z.number().int().min(1).max(30).optional(),
  int: z.number().int().min(1).max(30).optional(),
  wis: z.number().int().min(1).max(30).optional(),
  cha: z.number().int().min(1).max(30).optional(),
}).optional();

/**
 * Combat statistics schema for D&D 5e characters.
 */
const combatStatsSchema = z.object({
  ac: z.number().int().optional(),
  hp: z.number().int().optional(),
  maxHp: z.number().int().optional(),
  tempHp: z.number().int().optional(),
  speed: z.number().int().optional(),
  initiative: z.number().int().optional(),
  proficiencyBonus: z.number().int().optional(),
  hitDice: z.string().optional(),
}).optional();

/**
 * Saving throw proficiencies schema.
 */
const savingThrowsSchema = z.object({
  str: z.boolean().default(false),
  dex: z.boolean().default(false),
  con: z.boolean().default(false),
  int: z.boolean().default(false),
  wis: z.boolean().default(false),
  cha: z.boolean().default(false),
}).optional();

/**
 * Skill proficiency schema with expertise support.
 */
const skillSchema = z.object({
  name: z.string(),
  proficient: z.boolean().default(false),
  expertise: z.boolean().default(false),
  bonus: z.number().int().optional(),
});

/**
 * Senses schema for perception and vision.
 */
const sensesSchema = z.object({
  darkvision: z.number().int().optional(),
  blindsight: z.number().int().optional(),
  tremorsense: z.number().int().optional(),
  truesight: z.number().int().optional(),
  passivePerception: z.number().int().optional(),
  passiveInvestigation: z.number().int().optional(),
  passiveInsight: z.number().int().optional(),
}).optional();

/**
 * Defenses schema for resistances, immunities, and vulnerabilities.
 */
const defensesSchema = z.object({
  resistances: z.array(z.string()).default([]),
  immunities: z.array(z.string()).default([]),
  vulnerabilities: z.array(z.string()).default([]),
  conditionImmunities: z.array(z.string()).default([]),
}).optional();

// ============================================================================
// D&D 5e 2024 (SRD 5.2) Schemas
// ============================================================================

/**
 * Origin schema for 5e 2024 Species + Background system.
 * Species replaces "Race" in 5e 2024 terminology.
 * Background now provides ability score increases and origin feat.
 */
const originSchema = z.object({
  // Species (5e 2024 terminology - replaces "race")
  species: z.string(), // "Human", "Elf", "Dwarf", "Aasimar", etc.
  lineage: z.string().optional(), // "High Elf", "Protector Aasimar", "Gold Dragon", etc.
  size: z.enum(['tiny', 'small', 'medium', 'large']).default('medium'),

  // Background (5e 2024 - provides ASIs + origin feat)
  background: z.string(), // "Acolyte", "Criminal", "Soldier", etc.
  originFeat: z.string().optional(), // Feat from background (e.g., "Magic Initiate")
  backgroundAbilityMods: z.array(z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']))
    .max(3).optional(), // Which abilities background boosted (+2/+1 or +1/+1/+1)
}).optional();

/**
 * Equipped item schema with 5e 2024 Weapon Mastery support.
 */
const equippedItemSchema = z.object({
  slot: z.enum([
    'main-hand', 'off-hand', 'two-hand',
    'armor', 'shield',
    'head', 'cloak', 'neck', 'ring-1', 'ring-2',
    'gloves', 'boots', 'belt', 'other'
  ]),
  item: z.string(), // Entity slug reference to items collection
  attuned: z.boolean().default(false),
  // 5e 2024 Weapon Mastery properties
  mastery: z.enum(['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex']).optional(),
});

/**
 * Equipment schema for character inventory.
 */
const equipmentSchema = z.object({
  equipped: z.array(equippedItemSchema).default([]),
  mundane: z.array(z.object({
    name: z.string(),
    quantity: z.number().default(1),
    weight: z.number().optional(),
    notes: z.string().optional(),
  })).default([]),
  currency: z.object({
    pp: z.number().default(0),
    gp: z.number().default(0),
    ep: z.number().default(0),
    sp: z.number().default(0),
    cp: z.number().default(0),
  }).optional(),
}).optional();

/**
 * Spellcasting schema for caster characters.
 */
const spellSlotSchema = z.object({
  level: z.number().int().min(1).max(9),
  total: z.number().int(),
  expended: z.number().int().default(0),
});

const spellcastingSchema = z.object({
  ability: z.enum(['int', 'wis', 'cha']),
  spellSaveDC: z.number().int().optional(),
  spellAttackBonus: z.number().int().optional(),
  spellSlots: z.array(spellSlotSchema).default([]),
  pactSlots: z.object({ // Warlock Pact Magic
    level: z.number().int().min(1).max(5),
    total: z.number().int(),
    expended: z.number().int().default(0),
  }).optional(),
  cantrips: z.array(z.string()).default([]),
  preparedSpells: z.array(z.string()).default([]),
  knownSpells: z.array(z.string()).default([]), // For spontaneous casters
  spellbook: z.array(z.string()).default([]), // Wizards only
  ritualCaster: z.boolean().default(false),
}).optional();

/**
 * Class/species/feat feature schema with resource tracking.
 */
const featureSchema = z.object({
  name: z.string(),
  source: z.enum(['class', 'subclass', 'species', 'background', 'feat', 'epic-boon', 'item']),
  level: z.number().int().optional(), // Level gained (if class/subclass)
  description: z.string().optional(),
  uses: z.object({
    current: z.number().int(),
    max: z.number().int(),
    recharge: z.enum(['short-rest', 'long-rest', 'dawn', 'turn', 'encounter']),
  }).optional(),
});

const featuresSchema = z.array(featureSchema).default([]);

/**
 * Level progression tracking for character history.
 */
const levelEntrySchema = z.object({
  level: z.number().int().min(1).max(20),
  session: z.string().optional(), // Session slug where level was gained
  hpGained: z.number().int().optional(),
  hpMethod: z.enum(['rolled', 'average', 'max']).optional(),
  featuresGained: z.array(z.string()).default([]),
  asiOrFeat: z.object({
    type: z.enum(['asi', 'feat']),
    choice: z.string(), // "+2 DEX" or "Alert"
  }).optional(),
  subclassChosen: z.string().optional(), // At level 3 in 5e 2024
  epicBoon: z.string().optional(), // At levels 19+
  notes: z.string().optional(),
});

const levelProgressionSchema = z.array(levelEntrySchema).default([]);

/**
 * Character entity schema (PCs, NPCs, deities).
 * Links to D&D 5e API for race, class, and spell data.
 */
const characterCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/characters' }),
  schema: z.object({
    ...baseEntityFields,
    type: z.literal('character').default('character'),
    subtype: z.enum(['pc', 'npc', 'deity', 'historical']),
    player: z.string().optional(),
    race: z.string().optional(),
    class: z.string().optional(),
    subclass: z.string().optional(),
    level: z.number().int().min(1).max(20).optional(),
    background: z.string().optional(),
    faction: z.string().optional(),
    secondaryFactions: z.array(z.string()).default([]),
    location: z.string().optional(),
    homeLocation: z.string().optional(),
    knownSpells: z.array(z.string()).default([]),
    abilities: z.array(z.string()).default([]),
    items: z.array(z.string()).default([]),
    notableEquipment: z.array(z.string()).default([]),
    alignment: z.string().optional(),
    ideals: z.array(z.string()).default([]),
    bonds: z.array(z.string()).default([]),
    flaws: z.array(z.string()).default([]),

    // D&D 5e mechanical stats (optional - for deep character sheet integration)
    abilityScores: abilityScoresSchema,
    combat: combatStatsSchema,
    savingThrows: savingThrowsSchema,
    skills: z.array(skillSchema).default([]),
    senses: sensesSchema,
    defenses: defensesSchema,
    languages: z.array(z.string()).default([]),
    toolProficiencies: z.array(z.string()).default([]),
    weaponProficiencies: z.array(z.string()).default([]),
    armorProficiencies: z.array(z.string()).default([]),

    // D&D 5e 2024 (SRD 5.2) fields
    origin: originSchema,
    equipment: equipmentSchema,
    spellcasting: spellcastingSchema,
    features: featuresSchema,
    levelProgression: levelProgressionSchema,
  }),
});

/**
 * Enemy entity schema (monsters, villains, bosses).
 * Links to D&D 5e API for monster stat blocks.
 */
const enemyCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/enemies' }),
  schema: z.object({
    ...baseEntityFields,
    type: z.literal('enemy').default('enemy'),
    subtype: z.enum(['boss', 'lieutenant', 'minion', 'creature', 'swarm', 'trap']),
    baseMonster: z.string().optional(),
    cr: z.string().optional(),
    creatureType: z.string().optional(),
    customizations: z.array(z.string()).default([]),
    legendaryActions: z.array(z.string()).default([]),
    lairActions: z.array(z.string()).default([]),
    faction: z.string().optional(),
    master: z.string().optional(),
    minions: z.array(z.string()).default([]),
    encounters: z.array(z.string()).default([]),
    defeats: z.array(z.object({
      session: z.string(),
      method: z.string(),
      defeatedBy: z.array(z.string()).default([]),
    })).default([]),
    lair: z.string().optional(),
    territory: z.array(z.string()).default([]),
  }),
});

/**
 * Location entity schema (places, dungeons, regions).
 * Supports hierarchical organization.
 */
const locationCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/locations' }),
  schema: z.object({
    ...baseEntityFields,
    type: z.literal('location').default('location'),
    subtype: z.enum(['plane', 'continent', 'region', 'city', 'town', 'village', 'dungeon', 'wilderness', 'building', 'room', 'landmark']),
    parentLocation: z.string().optional(),
    childLocations: z.array(z.string()).default([]),
    climate: z.string().optional(),
    terrain: z.string().optional(),
    population: z.string().optional(),
    controlledBy: z.string().optional(),
    formerControllers: z.array(z.string()).default([]),
    pointsOfInterest: z.array(z.string()).default([]),
    dungeonLevel: z.number().int().optional(),
    notableEvents: z.array(z.string()).default([]),
    secrets: z.array(z.string()).default([]),
  }),
});

/**
 * Faction entity schema (organizations, cults, groups).
 */
const factionCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/factions' }),
  schema: z.object({
    ...baseEntityFields,
    type: z.literal('faction').default('faction'),
    subtype: z.enum(['cult', 'guild', 'government', 'military', 'religious', 'criminal', 'merchant', 'noble-house', 'adventuring-party', 'secret-society']),
    leader: z.string().optional(),
    formerLeaders: z.array(z.string()).default([]),
    notableMembers: z.array(z.string()).default([]),
    headquarters: z.string().optional(),
    territory: z.array(z.string()).default([]),
    influence: z.array(z.string()).default([]),
    allies: z.array(z.string()).default([]),
    enemies: z.array(z.string()).default([]),
    parentOrganization: z.string().optional(),
    subsidiaries: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([]),
    methods: z.array(z.string()).default([]),
    resources: z.array(z.string()).default([]),
    secrets: z.array(z.string()).default([]),
    symbol: z.string().optional(),
    motto: z.string().optional(),
  }),
});

/**
 * Item entity schema (weapons, artifacts, quest items).
 * Links to D&D 5e API for equipment and magic item data.
 */
const itemCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/items' }),
  schema: z.object({
    ...baseEntityFields,
    type: z.literal('item').default('item'),
    subtype: z.enum(['weapon', 'armor', 'artifact', 'consumable', 'quest', 'treasure', 'tool', 'wondrous', 'vehicle', 'property']),
    baseItem: z.string().optional(),
    magicItem: z.string().optional(),
    rarity: z.enum(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact', 'unique']).optional(),
    attunement: z.boolean().default(false),
    attunementRequirements: z.string().optional(),
    currentOwner: z.string().optional(),
    ownershipHistory: z.array(z.object({
      owner: z.string(),
      acquiredIn: z.string().optional(),
      lostIn: z.string().optional(),
      method: z.string().optional(),
    })).default([]),
    location: z.string().optional(),
    properties: z.array(z.string()).default([]),
    charges: z.number().int().optional(),
    maxCharges: z.number().int().optional(),
    creator: z.string().optional(),
    creationDate: z.string().optional(),
    significance: z.string().optional(),
    secrets: z.array(z.string()).default([]),
  }),
});

/**
 * Spell entity schema for D&D 5e spells.
 * Based on SRD 5.1 spell data structure.
 */
const spellCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/campaign/spells' }),
  schema: z.object({
    name: z.string(),
    level: z.number().int().min(0).max(9), // 0 = cantrip
    school: z.enum([
      'abjuration',
      'conjuration',
      'divination',
      'enchantment',
      'evocation',
      'illusion',
      'necromancy',
      'transmutation',
    ]),
    castingTime: z.string(),
    range: z.string(),
    components: z.array(z.enum(['V', 'S', 'M'])),
    material: z.string().optional(),
    duration: z.string(),
    concentration: z.boolean().default(false),
    ritual: z.boolean().default(false),
    description: z.string(),
    atHigherLevels: z.string().optional(),
    classes: z.array(z.string()).default([]),
    source: z.string().default('SRD 5.1'),
    // Campaign-specific additions
    tags: z.array(z.string()).default([]),
    homebrew: z.boolean().default(false),
    notes: z.string().optional(),
  }),
});

/**
 * Rules Glossary collection for D&D 5e 2024 rule terms.
 * Terms can be linked from character sheets for quick reference.
 */
const glossaryCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/glossary' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    category: z.enum(['action', 'condition', 'area-of-effect', 'hazard', 'attitude', 'skill']).optional(),
    description: z.string(),
    seeAlso: z.array(z.string()).default([]),
    source: z.string().default('SRD 5.2'),
  }),
});

export const collections = {
  blog: blogCollection,
  characters: characterCollection,
  enemies: enemyCollection,
  locations: locationCollection,
  factions: factionCollection,
  items: itemCollection,
  spells: spellCollection,
  glossary: glossaryCollection,
};
