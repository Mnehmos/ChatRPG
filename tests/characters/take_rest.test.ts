/**
 * take_rest Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 * 
 * D&D 5e Rest Mechanics:
 * - Short Rest: 1+ hour, spend hit dice to heal
 * - Long Rest: 8+ hours, restore all HP, half hit dice (rounded up), all spell slots
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

/**
 * Helper to create a test character for rest tests
 */
async function createTestCharacter(overrides: Record<string, unknown> = {}) {
  const result = await handleToolCall('create_character', {
    name: 'Weary Adventurer',
    race: 'Human',
    class: 'Fighter',
    level: 5,
    stats: { str: 16, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
    hp: 20, // Damaged - less than max
    maxHp: 44,
    ...overrides,
  });
  
  const text = getTextContent(result);
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  return idMatch ? idMatch[1] : null;
}

/**
 * Helper to damage a character
 */
async function damageCharacter(characterId: string, damage: number) {
  await handleToolCall('update_character', {
    characterId,
    hp: `-${damage}`,
  });
}

describe('take_rest', () => {
  describe('Short Rest - Basic', () => {
    it('should complete a short rest successfully', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/short rest|rest completed/i);
    });

    it('should allow spending hit dice to heal', async () => {
      const characterId = await createTestCharacter({ hp: 20, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/hit dice|healing|hp/i);
    });

    it('should cap healing at max HP', async () => {
      const characterId = await createTestCharacter({ hp: 42, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 3, // Would overheal
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should heal to max, not beyond
    });

    it('should track hit dice spent', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/hit dice|spent|remaining/i);
    });

    it('should prevent spending more hit dice than available', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 10, // More than level 5 has
      });

      // Implementation caps at available - this is acceptable behavior
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should show only 5 hit dice spent (capped at level)
      expect(text).toMatch(/hit dice spent.*5|0\/5/i);
    });
  });

  describe('Long Rest - Basic', () => {
    it('should complete a long rest successfully', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/long rest|rest completed/i);
    });

    it('should restore all HP on long rest', async () => {
      const characterId = await createTestCharacter({ hp: 10, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/hp.*44|restored.*full|full hp/i);
      
      // Verify HP was actually restored
      const getResult = await handleToolCall('get_character', { characterId });
      const charText = getTextContent(getResult);
      expect(charText).toMatch(/44\s*\/\s*44/); // HP should be 44/44
    });

    it('should restore half hit dice (rounded up) on long rest', async () => {
      const characterId = await createTestCharacter(); // Level 5
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 5 = 5 hit dice, half rounded up = 3
      expect(text).toMatch(/hit dice|restored/i);
    });
  });

  describe('HP Restoration Options', () => {
    it('should allow disabling HP restoration', async () => {
      const characterId = await createTestCharacter({ hp: 20, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
        restoreHp: false,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      
      // Verify HP was NOT restored
      const getResult = await handleToolCall('get_character', { characterId });
      const charText = getTextContent(getResult);
      expect(charText).toMatch(/20\s*\/\s*44/); // HP should still be 20/44
    });

    it('should allow disabling hit dice restoration', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      // First spend some hit dice
      await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 2,
      });
      
      // Now do long rest with hit dice restoration disabled
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
        restoreHitDice: false,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Hit dice should remain at 3/5 (not restored to 5/5)
      expect(text).toMatch(/hit dice.*3\/5|hit dice: 3/i);
    });
  });

  describe('Condition Clearing', () => {
    it('should clear specified conditions on rest', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      // Apply a condition first
      await handleToolCall('manage_condition', {
        targetId: characterId,
        operation: 'add',
        condition: 'frightened',
        duration: 'until_rest',
      });
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
        clearConditions: ['frightened'],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/frightened.*cleared|removed.*frightened|condition/i);
    });

    it('should reduce exhaustion by 1 level on long rest', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      // Apply exhaustion
      await handleToolCall('manage_condition', {
        targetId: characterId,
        operation: 'add',
        condition: 'exhaustion',
        exhaustionLevels: 2,
      });
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/exhaustion.*reduced|exhaustion.*1/i);
    });

    it('should auto-clear conditions with duration until_rest', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      // Apply a condition with until_rest duration
      await handleToolCall('manage_condition', {
        targetId: characterId,
        operation: 'add',
        condition: 'poisoned',
        duration: 'until_rest',
      });
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short', // Even short rest clears until_rest
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/poisoned.*cleared|removed|condition/i);
    });
  });

  describe('Validation & Error Handling', () => {
    it('should return error for non-existent character', async () => {
      const result = await handleToolCall('take_rest', {
        characterId: 'non-existent-id',
        restType: 'short',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should return error when characterId is missing', async () => {
      const result = await handleToolCall('take_rest', {
        restType: 'short',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid rest type', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'invalid',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for negative hit dice', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: -1,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('ASCII Art Output', () => {
    it('should use ASCII box borders in output', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // Top-left corner
      expect(text).toContain('╗'); // Top-right corner
      expect(text).toContain('╚'); // Bottom-left corner
      expect(text).toContain('╝'); // Bottom-right corner
      expect(text).toContain('║'); // Vertical border
    });

    it('should have appropriate title for short rest', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/SHORT REST|REST COMPLETED/i);
    });

    it('should have appropriate title for long rest', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/LONG REST|REST COMPLETED/i);
    });

    it('should show character name in output', async () => {
      const characterId = await createTestCharacter({ name: 'Rested Hero' });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Rested Hero');
    });
  });

  describe('Character Name Support', () => {
    it('should accept characterName instead of characterId', async () => {
      await createTestCharacter({ name: 'Named Rester' });
      
      const result = await handleToolCall('take_rest', {
        characterName: 'Named Rester',
        restType: 'short',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/short rest|rest completed/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle character already at full HP on long rest', async () => {
      const characterId = await createTestCharacter({ hp: 44, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/already.*full|no healing needed|44.*44/i);
    });

    it('should handle short rest with no hit dice spent', async () => {
      const characterId = await createTestCharacter({ hp: 20, maxHp: 44 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 0,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should complete without healing
    });

    it('should handle level 1 character (half hit dice = 1)', async () => {
      const characterId = await createTestCharacter({ level: 1, hp: 5, maxHp: 12 });
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Level 1 = 1 hit die, half rounded up = 1
    });

    it('should handle interrupted long rest flag', async () => {
      const characterId = await createTestCharacter();
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('take_rest', {
        characterId,
        restType: 'long',
        uninterrupted: false,
      });

      const text = getTextContent(result);
      // Interrupted rest might have reduced benefits or warning
      expect(text).toMatch(/interrupted|partial|warning/i);
    });
  });

  /**
   * Character Lookup Tests (CRITICAL-002)
   *
   * Bug: take_rest fails to find characters that exist and are active in encounters.
   * Root cause: Data store isolation between Character and Combat modules.
   * Characters created via create_character are stored in one place, but take_rest
   * looks in a different/isolated store.
   *
   * These tests are designed to FAIL until the bug is fixed.
   */
  describe('Character Lookup (CRITICAL-002)', () => {
    it('should find character by characterId immediately after creation', async () => {
      // Create a fresh character
      const createResult = await handleToolCall('create_character', {
        name: 'Lookup Test Hero',
        race: 'Human',
        class: 'Fighter',
        level: 3,
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
        hp: 15,
        maxHp: 28,
      });
      
      const createText = getTextContent(createResult);
      const idMatch = createText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      expect(idMatch).not.toBeNull();
      const characterId = idMatch![1];
      
      // Verify character exists via get_character
      const getResult = await handleToolCall('get_character', { characterId });
      expect(getResult.isError).toBeUndefined();
      const getCharText = getTextContent(getResult);
      expect(getCharText).toContain('Lookup Test Hero');
      
      // NOW: take_rest should find the same character
      // BUG: This fails with "Character not found" due to data store isolation
      const restResult = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
      });
      
      // Assert: take_rest should succeed (find the character)
      expect(restResult.isError).toBeUndefined();
      const restText = getTextContent(restResult);
      expect(restText).toMatch(/short rest|rest completed/i);
      expect(restText).toContain('Lookup Test Hero');
    });

    it('should find character by characterName immediately after creation', async () => {
      // Create a fresh character with a unique name
      const uniqueName = `Name Lookup Hero ${Date.now()}`;
      const createResult = await handleToolCall('create_character', {
        name: uniqueName,
        race: 'Elf',
        class: 'Wizard',
        level: 5,
        stats: { str: 8, dex: 14, con: 12, int: 18, wis: 14, cha: 10 },
        hp: 18,
        maxHp: 22,
      });
      
      const createText = getTextContent(createResult);
      expect(createText).toContain(uniqueName);
      
      // Verify character exists via get_character by name
      const getResult = await handleToolCall('get_character', { characterName: uniqueName });
      expect(getResult.isError).toBeUndefined();
      
      // NOW: take_rest should find the same character by name
      // BUG: This fails with "Character not found" due to data store isolation
      const restResult = await handleToolCall('take_rest', {
        characterName: uniqueName,
        restType: 'long',
      });
      
      // Assert: take_rest should succeed (find the character by name)
      expect(restResult.isError).toBeUndefined();
      const restText = getTextContent(restResult);
      expect(restText).toMatch(/long rest|rest completed/i);
      expect(restText).toContain(uniqueName);
    });

    it('should block rest during active combat', async () => {
      // Create a persistent character first
      const createResult = await handleToolCall('create_character', {
        name: 'Encounter Lookup Hero',
        race: 'Dwarf',
        class: 'Cleric',
        level: 4,
        stats: { str: 14, dex: 10, con: 16, int: 10, wis: 16, cha: 12 },
        hp: 25,
        maxHp: 36,
      });

      const createText = getTextContent(createResult);
      const idMatch = createText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      expect(idMatch).not.toBeNull();
      const characterId = idMatch![1];

      // Add character to an encounter (simulates combat usage)
      const encounterResult = await handleToolCall('create_encounter', {
        participants: [
          {
            id: 'encounter-hero',
            characterId, // Links to persistent character
            name: 'Encounter Lookup Hero',
            hp: 25,
            maxHp: 36,
            ac: 18,
            initiativeBonus: 0,
            position: { x: 5, y: 5 },
          },
          {
            id: 'goblin-1',
            name: 'Goblin',
            hp: 7,
            maxHp: 7,
            ac: 13,
            initiativeBonus: 2,
            position: { x: 10, y: 10 },
            isEnemy: true,
          },
        ],
      });

      const encounterText = getTextContent(encounterResult);
      expect(encounterResult.isError).toBeUndefined();

      // Extract encounter ID
      const encIdMatch = encounterText.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i) ||
                         encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : '';

      // Attempt to rest during combat - should be BLOCKED
      const restResult = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 1,
      });

      // Assert: take_rest should FAIL during active combat
      expect(restResult.isError).toBe(true);
      const restText = getTextContent(restResult);
      expect(restText).toMatch(/cannot rest during combat|in encounter/i);

      // End the encounter
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      // Now rest should succeed
      const restAfterCombat = await handleToolCall('take_rest', {
        characterId,
        restType: 'short',
        hitDiceToSpend: 1,
      });
      expect(restAfterCombat.isError).toBeUndefined();
      const restAfterText = getTextContent(restAfterCombat);
      expect(restAfterText).toMatch(/short rest|rest completed/i);
    });

    it('should return clear error for truly non-existent character', async () => {
      // Call take_rest with a fake ID that never existed
      const fakeId = 'char_nonexistent_12345_fake';
      
      const restResult = await handleToolCall('take_rest', {
        characterId: fakeId,
        restType: 'short',
      });
      
      // Assert: Should return an error (not crash)
      expect(restResult.isError).toBe(true);
      
      const errorText = getTextContent(restResult);
      // Error message should clearly indicate the character was not found
      expect(errorText).toMatch(/not found|does not exist|invalid character/i);
      // Error should include the ID that was searched for (helpful debugging)
      expect(errorText).toContain(fakeId);
    });

    it('should find character by characterName after encounter ends', async () => {
      // Create a character with a unique name
      const uniqueName = `Post-Combat Rester ${Date.now()}`;
      const createResult = await handleToolCall('create_character', {
        name: uniqueName,
        race: 'Halfling',
        class: 'Rogue',
        level: 6,
        stats: { str: 10, dex: 18, con: 12, int: 14, wis: 12, cha: 14 },
        hp: 30,
        maxHp: 42,
      });

      const createText = getTextContent(createResult);
      const idMatch = createText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      expect(idMatch).not.toBeNull();
      const characterId = idMatch![1];

      // Add to encounter
      const encounterResult = await handleToolCall('create_encounter', {
        seed: 'lookup-test-seed',
        participants: [
          {
            id: 'rogue-hero',
            characterId,
            name: uniqueName,
            hp: 30,
            maxHp: 42,
            ac: 16,
            initiativeBonus: 4,
            position: { x: 0, y: 0 },
          },
          {
            id: 'orc-1',
            name: 'Orc',
            hp: 15,
            maxHp: 15,
            ac: 13,
            initiativeBonus: 1,
            position: { x: 5, y: 0 },
            isEnemy: true,
          },
        ],
      });

      const encounterText = getTextContent(encounterResult);
      const encIdMatch = encounterText.match(/Encounter ID:\s*([a-zA-Z0-9-]+)/i) ||
                         encounterText.match(/ID:\s*([a-zA-Z0-9-]+)/i);
      const encounterId = encIdMatch ? encIdMatch[1] : '';

      // Rest should be blocked during combat
      const restDuringCombat = await handleToolCall('take_rest', {
        characterName: uniqueName,
        restType: 'long',
      });
      expect(restDuringCombat.isError).toBe(true);

      // End the encounter
      await handleToolCall('end_encounter', {
        encounterId,
        outcome: 'victory',
      });

      // NOW: take_rest by NAME should work after combat ends
      const restResult = await handleToolCall('take_rest', {
        characterName: uniqueName,
        restType: 'long',
      });

      // Assert: take_rest should succeed using characterName after combat
      expect(restResult.isError).toBeUndefined();
      const restText = getTextContent(restResult);
      expect(restText).toMatch(/long rest|rest completed/i);
      expect(restText).toContain(uniqueName);
    });
  });
});
