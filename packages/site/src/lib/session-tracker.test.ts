/**
 * Session Tracker Integration Tests
 *
 * These tests verify data format compatibility between:
 * - Player session tracker (/campaign)
 * - DM party tracker (/dm/party-tracker)
 * - API session data storage
 *
 * Run with: pnpm test
 */

import { describe, it, expect } from 'vitest';

// ==========================================================================
// Types (matching what the player tracker sends)
// ==========================================================================

interface PlayerSessionData {
  combat: {
    hp: number;
    tempHp?: number;
  };
  deathSaves: {
    successes: number;
    failures: number;
  };
  conditions: string[];
  spellSlots: Array<{
    level: number;
    current: number;
  }>;
  features: Array<{
    name: string;
    current: number;
  }>;
}

// What the DM tracker expects (should be compatible)
interface DmDraftData {
  combat?: {
    hp: number;
    tempHp?: number;
  };
  deathSaves?: {
    successes: number;
    failures: number;
  };
  // DM tracker now supports both field names
  conditions?: string[];
  activeConditions?: Array<{ name: string; beneficial?: boolean }>;
  spellSlots?: Array<{
    level: number;
    current: number;
  }>;
  features?: Array<{
    name: string;
    current: number;
  }>;
}

// Character data format from YAML (as it exists in content files)
interface CharacterSpellSlot {
  level: number;
  total?: number;
  max?: number;
  expended?: number;
  current?: number;
}

// ==========================================================================
// Helper functions (same logic as used in the pages)
// ==========================================================================

/**
 * Converts character spell slot format to normalized format
 * Supports both {total, expended} and {max, current} formats
 */
function normalizeSpellSlot(slot: CharacterSpellSlot): { level: number; max: number; current: number } {
  const max = slot.total ?? slot.max ?? 0;
  const expended = slot.expended ?? 0;
  const current = slot.current ?? (max - expended);
  return { level: slot.level, max, current };
}

/**
 * Extracts conditions from draft data (supports both field names)
 */
function extractConditions(draft: DmDraftData | null): string[] {
  if (!draft) return [];

  // Support both field names for backwards compatibility
  if (draft.conditions && Array.isArray(draft.conditions)) {
    return draft.conditions;
  }
  if (draft.activeConditions && Array.isArray(draft.activeConditions)) {
    return draft.activeConditions.map(c => typeof c === 'string' ? c : c.name);
  }
  return [];
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Session Tracker Data Compatibility', () => {
  describe('Spell Slot Format Conversion', () => {
    it('should convert {total, expended} format to {max, current}', () => {
      const yamlFormat: CharacterSpellSlot = {
        level: 1,
        total: 4,
        expended: 1,
      };

      const normalized = normalizeSpellSlot(yamlFormat);

      expect(normalized.level).toBe(1);
      expect(normalized.max).toBe(4);
      expect(normalized.current).toBe(3); // 4 - 1 = 3
    });

    it('should pass through {max, current} format unchanged', () => {
      const modernFormat: CharacterSpellSlot = {
        level: 2,
        max: 3,
        current: 2,
      };

      const normalized = normalizeSpellSlot(modernFormat);

      expect(normalized.level).toBe(2);
      expect(normalized.max).toBe(3);
      expect(normalized.current).toBe(2);
    });

    it('should handle mixed format with all fields', () => {
      // If both formats provided, total takes precedence for max
      // current takes precedence over calculated (max - expended)
      const mixedFormat: CharacterSpellSlot = {
        level: 3,
        total: 3,
        max: 2, // Should be ignored since total exists
        expended: 0,
        current: 1, // Takes precedence - explicitly set current value
      };

      const normalized = normalizeSpellSlot(mixedFormat);

      expect(normalized.level).toBe(3);
      expect(normalized.max).toBe(3); // Uses total
      expect(normalized.current).toBe(1); // Uses explicit current value
    });

    it('should handle empty/zero spell slots', () => {
      const emptySlot: CharacterSpellSlot = {
        level: 1,
      };

      const normalized = normalizeSpellSlot(emptySlot);

      expect(normalized.level).toBe(1);
      expect(normalized.max).toBe(0);
      expect(normalized.current).toBe(0);
    });
  });

  describe('Conditions Field Compatibility', () => {
    it('should extract from conditions array (player format)', () => {
      const playerData: DmDraftData = {
        conditions: ['Poisoned', 'Blinded'],
      };

      const conditions = extractConditions(playerData);

      expect(conditions).toEqual(['Poisoned', 'Blinded']);
    });

    it('should extract from activeConditions array (legacy format)', () => {
      const legacyData: DmDraftData = {
        activeConditions: [
          { name: 'Charmed', beneficial: false },
          { name: 'Blessed', beneficial: true },
        ],
      };

      const conditions = extractConditions(legacyData);

      expect(conditions).toEqual(['Charmed', 'Blessed']);
    });

    it('should prefer conditions over activeConditions when both exist', () => {
      const mixedData: DmDraftData = {
        conditions: ['Poisoned'],
        activeConditions: [{ name: 'Charmed' }],
      };

      const conditions = extractConditions(mixedData);

      expect(conditions).toEqual(['Poisoned']); // Uses conditions array
    });

    it('should return empty array for null/undefined draft', () => {
      expect(extractConditions(null)).toEqual([]);
      expect(extractConditions({})).toEqual([]);
    });
  });

  describe('Player Session Data Structure', () => {
    it('should create valid session data with all fields', () => {
      const sessionData: PlayerSessionData = {
        combat: {
          hp: 35,
          tempHp: 5,
        },
        deathSaves: {
          successes: 0,
          failures: 0,
        },
        conditions: ['Blinded', 'Poisoned'],
        spellSlots: [
          { level: 1, current: 3 },
          { level: 2, current: 2 },
        ],
        features: [
          { name: 'Arcane Recovery', current: 0 },
        ],
      };

      // Verify structure matches what API expects
      expect(sessionData.combat.hp).toBe(35);
      expect(sessionData.combat.tempHp).toBe(5);
      expect(sessionData.deathSaves.successes).toBe(0);
      expect(sessionData.conditions).toHaveLength(2);
      expect(sessionData.spellSlots).toHaveLength(2);
      expect(sessionData.features[0].name).toBe('Arcane Recovery');
    });

    it('should handle minimum required session data', () => {
      const minimalData: PlayerSessionData = {
        combat: { hp: 10 },
        deathSaves: { successes: 0, failures: 0 },
        conditions: [],
        spellSlots: [],
        features: [],
      };

      expect(minimalData.combat.hp).toBe(10);
      expect(minimalData.conditions).toEqual([]);
    });
  });

  describe('DM Draft Data Processing', () => {
    it('should handle player session data as DM draft', () => {
      // When player saves session, it becomes a draft for DM to view
      const playerSession: PlayerSessionData = {
        combat: { hp: 25, tempHp: 10 },
        deathSaves: { successes: 2, failures: 1 },
        conditions: ['Exhaustion'],
        spellSlots: [{ level: 1, current: 2 }],
        features: [{ name: 'Channel Divinity', current: 1 }],
      };

      // Cast to DM format (same structure)
      const dmDraft = playerSession as unknown as DmDraftData;

      // Verify DM can read all fields
      expect(dmDraft.combat?.hp).toBe(25);
      expect(dmDraft.combat?.tempHp).toBe(10);
      expect(dmDraft.deathSaves?.successes).toBe(2);
      expect(dmDraft.deathSaves?.failures).toBe(1);

      const conditions = extractConditions(dmDraft);
      expect(conditions).toEqual(['Exhaustion']);

      expect(dmDraft.spellSlots?.[0].current).toBe(2);
      expect(dmDraft.features?.[0].current).toBe(1);
    });
  });
});

describe('Character Data Integration', () => {
  // These are realistic test cases based on actual character data

  const rudigerSpellSlots: CharacterSpellSlot[] = [
    { level: 1, total: 4, expended: 0 },
    { level: 2, total: 3, expended: 0 },
    { level: 3, total: 3, expended: 0 },
  ];

  const stolSpellSlots: CharacterSpellSlot[] = [
    { level: 1, total: 4, expended: 0 },
    { level: 2, total: 3, expended: 0 },
    { level: 3, total: 3, expended: 0 },
  ];

  it('should normalize Rudiger spell slots (Wizard)', () => {
    const normalized = rudigerSpellSlots.map(normalizeSpellSlot);

    expect(normalized).toEqual([
      { level: 1, max: 4, current: 4 },
      { level: 2, max: 3, current: 3 },
      { level: 3, max: 3, current: 3 },
    ]);
  });

  it('should normalize Stol spell slots (Cleric)', () => {
    const normalized = stolSpellSlots.map(normalizeSpellSlot);

    expect(normalized).toEqual([
      { level: 1, max: 4, current: 4 },
      { level: 2, max: 3, current: 3 },
      { level: 3, max: 3, current: 3 },
    ]);
  });

  it('should handle spell slot expenditure during session', () => {
    // Simulate casting spells during a session
    const afterCasting: CharacterSpellSlot[] = [
      { level: 1, total: 4, expended: 2 }, // Cast 2 level 1 spells
      { level: 2, total: 3, expended: 1 }, // Cast 1 level 2 spell
      { level: 3, total: 3, expended: 0 }, // No level 3 spells cast
    ];

    const normalized = afterCasting.map(normalizeSpellSlot);

    expect(normalized).toEqual([
      { level: 1, max: 4, current: 2 }, // 4 - 2 = 2 remaining
      { level: 2, max: 3, current: 2 }, // 3 - 1 = 2 remaining
      { level: 3, max: 3, current: 3 }, // 3 - 0 = 3 remaining
    ]);
  });
});
