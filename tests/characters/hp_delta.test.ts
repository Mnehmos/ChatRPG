/**
 * HP Delta Notation Tests
 * Tests for relative HP updates using "+X" and "-X" notation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('HP Delta Notation', () => {
  let testCharacterId: string;
  const initialMaxHp = 38; // Fighter Level 5, CON +2: 10 + 2 + (4 * (6 + 2)) = 44

  beforeEach(async () => {
    // Create a test character
    const result = await handleToolCall('create_character', {
      name: 'Delta Test Hero',
      class: 'Fighter',
      level: 5,
      stats: {
        str: 16,
        dex: 14,
        con: 15,
        int: 10,
        wis: 12,
        cha: 8,
      },
      ac: 18,
      speed: 30,
    });

    const text = getTextContent(result);
    const match = text.match(/Character ID: ([a-z0-9-]+)/);
    testCharacterId = match![1];
  });

  describe('String Delta Notation (Single Mode)', () => {
    it('should apply damage with negative string delta "-12"', async () => {
      // Get initial HP
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const initialText = getTextContent(getResult);
      const hpMatch = initialText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const initialHp = parseInt(hpMatch![1]);

      // Apply damage using string delta
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '-12',
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('HP:');
      expect(text).toContain((initialHp - 12).toString());
    });

    it('should apply healing with positive string delta "+8"', async () => {
      // First take damage
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '-20',
      });

      // Get current HP
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const currentText = getTextContent(getResult);
      const hpMatch = currentText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const currentHp = parseInt(hpMatch![1]);

      // Apply healing using string delta
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '+8',
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('HP:');
      expect(text).toContain((currentHp + 8).toString());
    });

    it('should cap healing at maxHp', async () => {
      // Take small damage
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '-5',
      });

      // Try to overheal
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '+50',
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      // Should be capped at maxHp - match the "after" value (after the arrow →)
      const hpMatch = text.match(/HP:.*?→.*?(\d+)\/(\d+)/);
      const finalHp = parseInt(hpMatch![1]);
      const maxHp = parseInt(hpMatch![2]);
      expect(finalHp).toBe(maxHp);
    });

    it('should not allow negative HP (minimum 0)', async () => {
      // Apply massive damage
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: '-100',
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      // HP should be 0, not negative
      expect(text).toContain('HP:');
      expect(text).toContain('0/');
    });
  });

  describe('String Delta Notation (Batch Mode)', () => {
    let secondCharId: string;

    beforeEach(async () => {
      // Create a second character for batch tests
      const result = await handleToolCall('create_character', {
        name: 'Batch Test Hero',
        class: 'Wizard',
        level: 5,
        stats: {
          str: 10,
          dex: 14,
          con: 13,
          int: 16,
          wis: 12,
          cha: 10,
        },
        ac: 12,
        speed: 30,
      });

      const text = getTextContent(result);
      const match = text.match(/Character ID: ([a-z0-9-]+)/);
      secondCharId = match![1];
    });

    it('should apply damage to multiple characters with string deltas', async () => {
      const result = await handleToolCall('update_character', {
        batch: [
          { characterId: testCharacterId, hp: '-12' },
          { characterId: secondCharId, hp: '-8' },
        ],
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('BATCH CHARACTER UPDATE');
      expect(text).toContain('Delta Test Hero');
      expect(text).toContain('Batch Test Hero');
    });

    it('should apply healing to multiple characters with string deltas', async () => {
      // First damage both
      await handleToolCall('update_character', {
        batch: [
          { characterId: testCharacterId, hp: '-15' },
          { characterId: secondCharId, hp: '-10' },
        ],
      });

      // Then heal both
      const result = await handleToolCall('update_character', {
        batch: [
          { characterId: testCharacterId, hp: '+10' },
          { characterId: secondCharId, hp: '+7' },
        ],
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('BATCH CHARACTER UPDATE');
    });
  });

  describe('Numeric Delta Notation (Single Mode)', () => {
    it('should apply damage with negative numeric delta -12', async () => {
      // Get initial HP
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const initialText = getTextContent(getResult);
      const hpMatch = initialText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const initialHp = parseInt(hpMatch![1]);

      // Apply damage using numeric delta
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -12,
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('HP:');
      const afterMatch = text.match(/HP:.*?→.*?(\d+)\/(\d+)/);
      expect(parseInt(afterMatch![1])).toBe(initialHp - 12);
    });

    it('should apply multiple numeric deltas in sequence', async () => {
      // Get initial HP
      const getResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const initialText = getTextContent(getResult);
      const hpMatch = initialText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      const initialHp = parseInt(hpMatch![1]);

      // Take damage
      await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -15,
      });

      // Verify
      const midResult = await handleToolCall('get_character', {
        characterId: testCharacterId,
      });
      const midText = getTextContent(midResult);
      const midMatch = midText.match(/HP: \[.*?\] (\d+)\/(\d+)/);
      expect(parseInt(midMatch![1])).toBe(initialHp - 15);

      // Take more damage
      const finalResult = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -8,
      });

      expect(finalResult.isError).toBeUndefined();
      const finalText = getTextContent(finalResult);
      const finalMatch = finalText.match(/HP:.*?→.*?(\d+)\/(\d+)/);
      expect(parseInt(finalMatch![1])).toBe(initialHp - 15 - 8);
    });

    it('should not allow HP to go below 0 with numeric deltas', async () => {
      // Apply massive damage
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: -999,
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      const hpMatch = text.match(/HP:.*?→.*?(\d+)\/(\d+)/);
      expect(parseInt(hpMatch![1])).toBe(0); // Should be clamped at 0
    });
  });

  describe('Numeric Delta Notation (Batch Mode)', () => {
    let secondCharId: string;

    beforeEach(async () => {
      // Create a second character for batch tests
      const result = await handleToolCall('create_character', {
        name: 'Numeric Batch Hero',
        class: 'Wizard',
        level: 5,
        stats: {
          str: 10,
          dex: 14,
          con: 13,
          int: 16,
          wis: 12,
          cha: 10,
        },
        ac: 12,
        speed: 30,
      });

      const text = getTextContent(result);
      const match = text.match(/Character ID: ([a-z0-9-]+)/);
      secondCharId = match![1];
    });

    it('should apply numeric damage to multiple characters in batch', async () => {
      const result = await handleToolCall('update_character', {
        batch: [
          { characterId: testCharacterId, hp: -18 },
          { characterId: secondCharId, hp: -10 },
        ],
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('BATCH CHARACTER UPDATE');
      expect(text).toContain('Delta Test Hero');
      expect(text).toContain('Numeric Batch Hero');
    });
  });

  describe('Absolute HP Updates (Legacy)', () => {
    it('should still support absolute HP values as numbers', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 25,
      });

      expect(result.isError).toBeUndefined();
      const text = getTextContent(result);
      expect(text).toContain('HP:');
      expect(text).toContain('25');
    });

    it('should reject absolute HP exceeding maxHp', async () => {
      const result = await handleToolCall('update_character', {
        characterId: testCharacterId,
        hp: 9999,
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('HP');
      expect(text).toContain('max');
    });
  });
});
