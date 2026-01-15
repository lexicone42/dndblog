/**
 * Staging API Integration Tests
 *
 * These tests verify the staging API endpoints work correctly.
 * They test against the production API with real DM and player tokens.
 *
 * Run with: DM_TOKEN=your-token PLAYER_TOKEN=your-player-token pnpm test:staging
 *
 * NOTE: These tests create and delete real data in the staging S3 bucket.
 * They use a unique test branch name to avoid conflicts.
 */

import { test, expect } from '@playwright/test';

// API configuration
const API_URL = process.env.PUBLIC_DM_NOTES_API_URL || 'https://yuze798ofb.execute-api.us-east-1.amazonaws.com';
const DM_TOKEN = process.env.DM_TOKEN;
const PLAYER_TOKEN = process.env.PLAYER_TOKEN;

// Unique test branch name to avoid conflicts
const TEST_BRANCH_NAME = `test-integration-${Date.now()}`;

// Skip all tests if no token provided
test.beforeEach(({ }, testInfo) => {
  if (!DM_TOKEN) {
    testInfo.skip(true, 'DM_TOKEN environment variable not set');
  }
});

test.describe('Staging API Integration Tests', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order

  test.describe('Branch Operations', () => {
    test('should create a new staging branch', async ({ request }) => {
      const response = await request.post(`${API_URL}/staging/branches`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: {
          name: TEST_BRANCH_NAME,
          displayName: 'Integration Test Branch',
          description: 'Created by automated integration tests',
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.name).toBe(TEST_BRANCH_NAME);
      expect(data.displayName).toBe('Integration Test Branch');
      expect(data.status).toBe('draft');
    });

    test('should list branches including test branch', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(Array.isArray(data.branches)).toBeTruthy();

      const testBranch = data.branches.find((b: { name: string }) => b.name === TEST_BRANCH_NAME);
      expect(testBranch).toBeDefined();
      expect(testBranch.displayName).toBe('Integration Test Branch');
    });

    test('should get branch details', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches/${TEST_BRANCH_NAME}`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.branch.name).toBe(TEST_BRANCH_NAME);
      expect(data.entities).toBeDefined();
      expect(Array.isArray(data.entities)).toBeTruthy();
    });

    test('should update branch metadata', async ({ request }) => {
      const response = await request.put(`${API_URL}/staging/branches/${TEST_BRANCH_NAME}`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: {
          displayName: 'Updated Test Branch',
          description: 'Updated by integration tests',
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.displayName).toBe('Updated Test Branch');
    });
  });

  test.describe('Entity Operations', () => {
    const testEntity = {
      entityType: 'character',
      slug: 'test-npc',
      data: {
        name: 'Test NPC',
        slug: 'test-npc',
        role: 'NPC',
        race: 'Human',
        characterClass: 'Commoner',
        alignment: 'neutral',
        status: 'active',
        description: 'A test character created by integration tests.',
        personality: 'Helpful and kind.',
        appearance: 'Average height, brown hair.',
        background: 'A simple townsfolk.',
        goals: 'To help adventurers.',
        fears: 'Dragons.',
        quirks: 'Always smiling.',
        relationships: [],
        tags: ['test'],
      },
    };

    test('should add entity to branch', async ({ request }) => {
      const response = await request.post(`${API_URL}/staging/branches/${TEST_BRANCH_NAME}/entities`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: testEntity,
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBeTruthy();
    });

    test('should get branch with entity', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches/${TEST_BRANCH_NAME}`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      const entity = data.entities.find((e: { slug: string }) => e.slug === 'test-npc');
      expect(entity).toBeDefined();
      expect(entity.type).toBe('character');
      expect(entity.data.name).toBe('Test NPC');
    });

    test('should update entity', async ({ request }) => {
      const updatedData = {
        ...testEntity.data,
        description: 'Updated description by integration tests.',
      };

      const response = await request.put(
        `${API_URL}/staging/branches/${TEST_BRANCH_NAME}/entities/character/test-npc`,
        {
          headers: {
            'X-DM-Token': DM_TOKEN!,
            'Content-Type': 'application/json',
          },
          data: { data: updatedData },
        }
      );

      expect(response.ok()).toBeTruthy();
    });

    test('should delete entity', async ({ request }) => {
      const response = await request.delete(
        `${API_URL}/staging/branches/${TEST_BRANCH_NAME}/entities/character/test-npc`,
        {
          headers: {
            'X-DM-Token': DM_TOKEN!,
          },
        }
      );

      expect(response.ok()).toBeTruthy();
    });
  });

  test.describe('Entity Validation', () => {
    test('should validate correct entity data', async ({ request }) => {
      const response = await request.post(`${API_URL}/staging/validate`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: {
          entityType: 'character',
          data: {
            name: 'Valid Character',
            slug: 'valid-character',
            role: 'NPC',
            race: 'Elf',
            characterClass: 'Wizard',
            alignment: 'neutral-good',
            status: 'active',
            description: 'A valid character for testing.',
            personality: 'Wise and calm.',
            appearance: 'Tall, silver hair.',
            background: 'Former court wizard.',
            goals: 'Seek knowledge.',
            fears: 'Ignorance.',
            quirks: 'Speaks in riddles.',
            relationships: [],
            tags: ['test'],
          },
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.valid).toBeTruthy();
    });

    test('should reject invalid entity data', async ({ request }) => {
      const response = await request.post(`${API_URL}/staging/validate`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: {
          entityType: 'character',
          data: {
            // Missing required fields
            name: 'Invalid Character',
          },
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.valid).toBeFalsy();
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    });

    test('should reject unknown entity type', async ({ request }) => {
      const response = await request.post(`${API_URL}/staging/validate`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
          'Content-Type': 'application/json',
        },
        data: {
          entityType: 'invalid-type',
          data: { name: 'Test' },
        },
      });

      // Should return 400 for unknown type
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Authentication', () => {
    test('should reject requests without token', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches`, {
        headers: {
          // No X-DM-Token
        },
      });

      expect(response.status()).toBe(401);
    });

    test('should reject requests with invalid token', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches`, {
        headers: {
          'X-DM-Token': 'invalid-token-12345',
        },
      });

      expect(response.status()).toBe(403);
    });
  });

  test.describe('Cleanup', () => {
    test('should delete test branch', async ({ request }) => {
      const response = await request.delete(`${API_URL}/staging/branches/${TEST_BRANCH_NAME}`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
        },
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should verify branch is deleted', async ({ request }) => {
      const response = await request.get(`${API_URL}/staging/branches`, {
        headers: {
          'X-DM-Token': DM_TOKEN!,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();

      const testBranch = data.branches.find((b: { name: string }) => b.name === TEST_BRANCH_NAME);
      expect(testBranch).toBeUndefined();
    });
  });
});

/**
 * Player Token Authentication Tests
 *
 * These tests verify the player token validation endpoint works correctly.
 * Run with: PLAYER_TOKEN=your-token pnpm test:staging
 */
test.describe('Player Token Authentication', () => {
  test('should validate correct player token', async ({ request }) => {
    if (!PLAYER_TOKEN) {
      test.skip(true, 'PLAYER_TOKEN environment variable not set');
      return;
    }

    const response = await request.post(`${API_URL}/validate-player-token`, {
      headers: {
        'X-Player-Token': PLAYER_TOKEN,
        'Content-Type': 'application/json',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  test('should reject missing player token', async ({ request }) => {
    const response = await request.post(`${API_URL}/validate-player-token`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.valid).toBe(false);
  });

  test('should reject invalid player token', async ({ request }) => {
    const response = await request.post(`${API_URL}/validate-player-token`, {
      headers: {
        'X-Player-Token': 'invalid-token-12345',
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.valid).toBe(false);
  });

  test('player token should not work as DM token', async ({ request }) => {
    // Verify player token and DM token are different by checking
    // that player token doesn't work for DM endpoints
    if (!PLAYER_TOKEN || !DM_TOKEN) {
      test.skip(true, 'Both PLAYER_TOKEN and DM_TOKEN required');
      return;
    }

    // Skip if tokens are the same (misconfiguration)
    if (PLAYER_TOKEN === DM_TOKEN) {
      test.skip(true, 'PLAYER_TOKEN and DM_TOKEN should be different values');
      return;
    }

    const response = await request.get(`${API_URL}/staging/branches`, {
      headers: {
        'X-DM-Token': PLAYER_TOKEN, // Use player token where DM token expected
      },
    });

    // Should fail because player token !== DM token
    expect(response.status()).toBe(403);
  });
});
