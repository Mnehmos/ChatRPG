/**
 * delete_character Tests - TDD Red Phase
 * These tests are intentionally written to FAIL until the handler is implemented
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

/**
 * Helper to create a test character for deletion tests
 */
async function createTestCharacter(name: string = 'Doomed Hero') {
  const result = await handleToolCall('create_character', {
    name,
    race: 'Human',
    class: 'Fighter',
    level: 5,
    stats: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  });
  
  const text = getTextContent(result);
  // Extract character ID from output
  const idMatch = text.match(/ID:\s*([a-zA-Z0-9-]+)/i);
  return idMatch ? idMatch[1] : null;
}

describe('delete_character', () => {
  describe('Basic Deletion', () => {
    it('should delete a character by ID', async () => {
      const characterId = await createTestCharacter('Delete Me');
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toMatch(/delete|removed/i);
      expect(text).toContain('Delete Me');
    });

    it('should delete a character by name', async () => {
      await createTestCharacter('Named Victim');
      
      const result = await handleToolCall('delete_character', {
        characterName: 'Named Victim',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/delete|removed/i);
      expect(text).toContain('Named Victim');
    });

    it('should return confirmation with character details', async () => {
      const characterId = await createTestCharacter('Detailed Deletion');
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Detailed Deletion');
      // Should show some character info in the deletion confirmation
      expect(text).toMatch(/fighter|level|human/i);
    });
  });

  describe('State Verification', () => {
    it('should make character inaccessible after deletion', async () => {
      const characterId = await createTestCharacter('Gone Forever');
      expect(characterId).not.toBeNull();
      
      // Delete the character
      const deleteResult = await handleToolCall('delete_character', {
        characterId,
      });
      expect(deleteResult.isError).toBeUndefined();
      
      // Try to get the character - should fail
      const getResult = await handleToolCall('get_character', {
        characterId,
      });
      
      expect(getResult.isError).toBe(true);
      const text = getTextContent(getResult);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should remove character file from storage', async () => {
      const characterId = await createTestCharacter('File Deleted');
      expect(characterId).not.toBeNull();
      
      // Verify character exists first
      const getBeforeResult = await handleToolCall('get_character', {
        characterId,
      });
      expect(getBeforeResult.isError).toBeUndefined();
      
      // Delete the character
      const deleteResult = await handleToolCall('delete_character', {
        characterId,
      });
      expect(deleteResult.isError).toBeUndefined();
      
      // Verify character no longer exists
      const getAfterResult = await handleToolCall('get_character', {
        characterId,
      });
      expect(getAfterResult.isError).toBe(true);
    });
  });

  describe('Validation & Error Handling', () => {
    it('should return error for non-existent character ID', async () => {
      const result = await handleToolCall('delete_character', {
        characterId: 'non-existent-id-12345',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should return error for non-existent character name', async () => {
      const result = await handleToolCall('delete_character', {
        characterName: 'Nobody With This Name',
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/not found|does not exist/i);
    });

    it('should return error when neither characterId nor characterName provided', async () => {
      const result = await handleToolCall('delete_character', {});

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/characterId|characterName|required/i);
    });

    it('should return error for empty characterId', async () => {
      const result = await handleToolCall('delete_character', {
        characterId: '',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for empty characterName', async () => {
      const result = await handleToolCall('delete_character', {
        characterName: '',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('ASCII Art Output', () => {
    it('should use ASCII box borders in output', async () => {
      const characterId = await createTestCharacter('ASCII Test');
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // Top-left corner
      expect(text).toContain('╗'); // Top-right corner
      expect(text).toContain('╚'); // Bottom-left corner
      expect(text).toContain('╝'); // Bottom-right corner
      expect(text).toContain('║'); // Vertical border
    });

    it('should have appropriate title in box', async () => {
      const characterId = await createTestCharacter('Title Test');
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Title should indicate deletion
      expect(text).toMatch(/CHARACTER DELETED|DELETED|REMOVED/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle character with special characters in name', async () => {
      const characterId = await createTestCharacter("D'Artagnan the 3rd");
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain("D'Artagnan");
    });

    it('should handle deleting the same character twice', async () => {
      const characterId = await createTestCharacter('Double Delete');
      expect(characterId).not.toBeNull();
      
      // First deletion - should succeed
      const firstResult = await handleToolCall('delete_character', {
        characterId,
      });
      expect(firstResult.isError).toBeUndefined();
      
      // Second deletion - should fail
      const secondResult = await handleToolCall('delete_character', {
        characterId,
      });
      expect(secondResult.isError).toBe(true);
      const text = getTextContent(secondResult);
      expect(text).toMatch(/not found|does not exist|already deleted/i);
    });

    it('should handle deletion by ID when name also provided (ID takes precedence)', async () => {
      const characterId = await createTestCharacter('Precedence Test');
      expect(characterId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        characterId,
        characterName: 'Wrong Name',  // This should be ignored
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Precedence Test');
    });
  });

  describe('Batch Support', () => {
    it('should support batch deletion of multiple characters', async () => {
      const id1 = await createTestCharacter('Batch Victim 1');
      const id2 = await createTestCharacter('Batch Victim 2');
      const id3 = await createTestCharacter('Batch Victim 3');
      
      expect(id1).not.toBeNull();
      expect(id2).not.toBeNull();
      expect(id3).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        batch: [
          { characterId: id1 },
          { characterId: id2 },
          { characterId: id3 },
        ],
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Batch Victim 1');
      expect(text).toContain('Batch Victim 2');
      expect(text).toContain('Batch Victim 3');
      expect(text).toMatch(/3.*deleted|deleted.*3/i);
    });

    it('should report partial success in batch deletion', async () => {
      const validId = await createTestCharacter('Valid Deletion');
      expect(validId).not.toBeNull();
      
      const result = await handleToolCall('delete_character', {
        batch: [
          { characterId: validId },
          { characterId: 'non-existent-id' },
        ],
      });

      const text = getTextContent(result);
      // Should complete without full error (partial success)
      expect(text).toContain('Valid Deletion');
      expect(text).toMatch(/1.*success|success.*1|failed.*1|1.*failed/i);
    });
  });
});
