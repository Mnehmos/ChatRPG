/**
 * take_rest Character Lookup Tests - BUG-CRITICAL-002
 * 
 * Red Phase: These tests document the bug where take_rest cannot find
 * characters that exist and are accessible via other tools.
 * 
 * Bug Summary:
 * - Characters created via create_character exist in the character store
 * - get_character can find them by ID or name
 * - take_rest FAILS to find the same characters (data store isolation)
 * 
 * These tests MUST FAIL until the bug is fixed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleToolCall } from '../src/registry.js';
import { getTextContent } from './helpers.js';

/**
 * Helper to create a test character and extract its ID
 */
async function createTestCharacter(overrides: Record<string, unknown> = {}): Promise<{
  characterId: string;
  name: string;
}> {
  const name = overrides.name as string || `Test Character ${Date.now()}`;
  const result = await handleToolCall('create_character', {
    name,
    race: 'Human',
    class: 'Fighter',
    level: 5,
    stats: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
    hp: 30,
    maxHp: 44,
    ...overrides,
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9_-]+)/i);
  if (!idMatch) {
    throw new Error(`Failed to create character - no ID in response: ${text}`);
  }
  
  return {
    characterId: idMatch[1],
    name,
  };
}

/**
 * Helper to verify a character exists via get_character
 */
async function verifyCharacterExists(identifier: { characterId?: string; characterName?: string }): Promise<boolean> {
  const result = await handleToolCall('get_character', identifier);
  return !result.isError;
}

describe('take_rest character lookup (BUG-CRITICAL-002)', () => {
  
  describe('Character ID Lookup', () => {
    it('should find character by characterId after creation', async () => {
      // Arrange: Create a character
      const { characterId, name } = await createTestCharacter({
        name: 'Test Fighter',
        class: 'Fighter',
        level: 5,
      });
      
      // Verify the character exists (sanity check)
      const exists = await verifyCharacterExists({ characterId });
      expect(exists).toBe(true);
      
      // Act: Attempt to take a rest using characterId
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });
      
      // Assert: take_rest should succeed and find the character
      // BUG: This currently fails with "Character not found" due to data store isolation
      expect(result.isError).toBeUndefined();
      
      const text = getTextContent(result);
      expect(text).toMatch(/long rest|rest completed/i);
      expect(text).toContain('Test Fighter');
    });
  });

  describe('Character Name Lookup', () => {
    it('should find character by name after creation', async () => {
      // Arrange: Create a character with a specific name
      const uniqueName = `Test Fighter ${Date.now()}`;
      await createTestCharacter({
        name: uniqueName,
        class: 'Fighter',
        level: 5,
      });
      
      // Verify the character exists by name (sanity check)
      const exists = await verifyCharacterExists({ characterName: uniqueName });
      expect(exists).toBe(true);
      
      // Act: Attempt to take a rest using characterName
      const result = await handleToolCall('take_rest', {
        characterName: uniqueName,
        restType: 'short',
      });
      
      // Assert: take_rest should succeed and find the character by name
      // BUG: This currently fails with "Character not found" due to data store isolation
      expect(result.isError).toBeUndefined();
      
      const text = getTextContent(result);
      expect(text).toMatch(/short rest|rest completed/i);
    });
  });

  describe('Encounter Integration', () => {
    it('should find character after adding to encounter', async () => {
      // Arrange: Create a persistent character
      const { characterId } = await createTestCharacter({
        name: 'Combat Tester',
        class: 'Rogue',
        level: 3,
        hp: 18,
        maxHp: 24,
      });
      
      // Add character to an encounter (simulates combat usage)
      const encounterResult = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'combat-tester',
            characterId, // Links to persistent character
            name: 'Combat Tester',
            hp: 18,
            maxHp: 24,
            ac: 15,
            initiativeBonus: 4,
            position: { x: 0, y: 0 },
          },
          {
            id: 'goblin-1',
            name: 'Goblin',
            hp: 7,
            maxHp: 7,
            ac: 13,
            initiativeBonus: 2,
            position: { x: 5, y: 5 },
            isEnemy: true,
          },
        ],
      });
      
      expect(encounterResult.isError).toBeUndefined();

      // Extract encounter ID
      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i) ||
                         encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : '';

      // Act: Attempt to take a rest DURING active combat - should be BLOCKED
      const restDuringCombat = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });

      // Assert: take_rest should FAIL during active combat
      expect(restDuringCombat.isError).toBe(true);
      const errorText = getTextContent(restDuringCombat);
      expect(errorText).toMatch(/cannot rest during combat|in encounter/i);

      // End the encounter
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      // NOW: take_rest should succeed after combat ends
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toMatch(/short rest|rest completed/i);
    });
  });

  describe('Error Handling', () => {
    it('should return clear error for non-existent character', async () => {
      // Arrange: Use a fake ID that never existed
      const fakeId = 'non-existent-id-12345';
      
      // Act: Attempt to take a rest with non-existent character
      const result = await handleToolCall('take_rest', {
        characterId: fakeId,
        restType: 'long',
      });
      
      // Assert: Should return an error with clear message
      expect(result.isError).toBe(true);
      
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist|character not found/i);
    });
  });
});
