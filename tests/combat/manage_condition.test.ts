/**
 * manage_condition Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';
import { clearAllConditions } from '../../src/modules/combat.js';

describe('manage_condition', () => {
  // Helper to clear conditions between tests
  beforeEach(() => {
    clearAllConditions();
  });

  describe('Add Condition', () => {
    it('should add a condition to a target', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'blinded',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Blinded');
      expect(text).toContain('test-character-1');
      expect(text).toContain('added');
    });

    it('should add condition with duration in rounds', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'stunned',
        duration: 3,
      });

      const text = getTextContent(result);
      expect(text).toContain('Stunned');
      expect(text).toContain('3 round');
    });

    it('should add condition with concentration duration', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'charmed',
        duration: 'concentration',
        source: 'Wizard',
      });

      const text = getTextContent(result);
      expect(text).toContain('Charmed');
      expect(text).toContain('concentration');
      expect(text).toContain('Wizard');
    });

    it('should add condition with save_ends', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'frightened',
        duration: 'save_ends',
        saveDC: 15,
        saveAbility: 'wis',
      });

      const text = getTextContent(result);
      expect(text).toContain('Frightened');
      expect(text).toContain('save');
      expect(text).toContain('DC 15');
      expect(text).toContain('WIS');
    });
  });

  describe('Remove Condition', () => {
    it('should remove a condition from a target', async () => {
      // First add a condition
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'poisoned',
      });

      // Then remove it
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'remove',
        condition: 'poisoned',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Poisoned');
      expect(text).toContain('removed');
    });

    it('should handle removing non-existent condition gracefully', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'remove',
        condition: 'paralyzed',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Not affected');
    });
  });

  describe('Query Conditions', () => {
    it('should list all active conditions on a target', async () => {
      // Add multiple conditions
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'blinded',
      });
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'deafened',
      });

      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'query',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('BLINDED');
      expect(text).toContain('DEAFENED');
      expect(text).toContain('CONDITION STATUS');
    });

    it('should return empty list for target with no conditions', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-2',
        operation: 'query',
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('No active conditions');
    });
  });

  describe('Exhaustion', () => {
    it('should add exhaustion levels (1-6)', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'exhaustion',
        exhaustionLevels: 2,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Exhaustion');
      expect(text).toContain('Level 2');
    });

    it('should remove exhaustion levels', async () => {
      // Add exhaustion first
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'exhaustion',
        exhaustionLevels: 3,
      });

      // Remove 1 level
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'remove',
        condition: 'exhaustion',
        exhaustionLevels: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Level 2');
    });

    it('should cap exhaustion at 6', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'exhaustion',
        exhaustionLevels: 10,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Level 6');
      expect(text).toContain('DEATH');
    });
  });

  describe('Tick Duration', () => {
    it('should decrement round-based durations', async () => {
      // Add condition with 2 rounds
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'stunned',
        duration: 2,
      });

      // Tick
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'tick',
        roundNumber: 1,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('stunned');
      expect(text).toContain('1 round');
    });

    it('should remove expired conditions', async () => {
      // Add condition with 1 round
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'stunned',
        duration: 1,
      });

      // Tick to expire it
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'tick',
        roundNumber: 1,
      });

      // Query to verify it's gone
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'query',
      });

      const text = getTextContent(result);
      expect(text).toContain('No active conditions');
    });

    it('should not affect concentration or permanent conditions', async () => {
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'charmed',
        duration: 'concentration',
      });

      // Tick
      await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'tick',
        roundNumber: 1,
      });

      // Query - should still be there
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'query',
      });

      const text = getTextContent(result);
      expect(text).toContain('CHARMED');
      expect(text).toContain('concentration');
    });
  });

  describe('Output Format', () => {
    it('should return ASCII art with condition effects', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'paralyzed',
      });

      const text = getTextContent(result);
      expect(text).toContain('╔');  // ASCII box border
      expect(text).toContain('Paralyzed');
      expect(text).toContain('Incapacitated');  // Effect description
      expect(text).toContain('Auto-fail');  // Effect description
    });

    it('should include D&D 5e condition descriptions', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
        condition: 'prone',
      });

      const text = getTextContent(result);
      expect(text).toContain('PRONE');
      expect(text).toContain('crawling');  // Prone effect - using a word that won't be truncated
    });
  });

  describe('Error Handling', () => {
    it('should return error for missing targetId', async () => {
      const result = await handleToolCall('manage_condition', {
        operation: 'add',
        condition: 'blinded',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid operation', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'invalid',
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for missing condition on add', async () => {
      const result = await handleToolCall('manage_condition', {
        targetId: 'test-character-1',
        operation: 'add',
      });

      expect(result.isError).toBe(true);
    });
  });
});
