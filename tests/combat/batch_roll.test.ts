/**
 * roll_dice (Batch Mode) Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('roll_dice (batch mode)', () => {
  describe('Basic Batch Rolling', () => {
    it('should roll multiple dice expressions', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20+5', label: 'Attack' },
          { expression: '2d6+3', label: 'Damage' }
        ]
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('ROLLING 2 DICE EXPRESSIONS');
      expect(text).toContain('Attack:');
      expect(text).toContain('Damage:');
      expect(text).toContain('TOTAL ACROSS ALL ROLLS:');
    });

    it('should handle rolls without labels', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20' },
          { expression: '1d20' }
        ]
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('Roll 1:');
      expect(text).toContain('Roll 2:');
    });

    it('should include reason when provided', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{ expression: '1d20+5' }],
        reason: 'Multiattack'
      });

      const text = getTextContent(result);
      expect(text).toContain('MULTIATTACK');
    });
  });

  describe('Advantage/Disadvantage in Batch', () => {
    it('should support advantage in batch rolls', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20+5', label: 'Attack 1', advantage: true },
          { expression: '1d20+5', label: 'Attack 2' }
        ]
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('2d20kh1+5'); // First roll has advantage
      expect(text).toContain('1d20+5'); // Second roll doesn't
    });

    it('should support disadvantage in batch rolls', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d20', disadvantage: true }
        ]
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('2d20kl1');
    });
  });

  describe('Total Calculation', () => {
    it('should sum all roll results', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [
          { expression: '1d4' },
          { expression: '1d4' },
          { expression: '1d4' }
        ]
      });

      const text = getTextContent(result);
      const totalMatch = text.match(/TOTAL ACROSS ALL ROLLS: (\d+)/);
      expect(totalMatch).not.toBeNull();
      const total = parseInt(totalMatch![1]);
      expect(total).toBeGreaterThanOrEqual(3); // 1+1+1
      expect(total).toBeLessThanOrEqual(12);   // 4+4+4
    });
  });

  describe('Error Handling', () => {
    it('should return error for empty batch array', async () => {
      const result = await handleToolCall('roll_dice', { batch: [] });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('non-empty array');
    });

    it('should return error for missing batch parameter', async () => {
      const result = await handleToolCall('roll_dice', {});
      expect(result.isError).toBe(true);
    });

    it('should return error for too many rolls', async () => {
      const batch = Array.from({ length: 21 }, (_, i) => ({
        expression: '1d20',
        label: `Roll ${i + 1}`
      }));

      const result = await handleToolCall('roll_dice', { batch });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Too many rolls');
    });

    it('should return error for both advantage and disadvantage', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{
          expression: '1d20',
          advantage: true,
          disadvantage: true
        }]
      });

      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Cannot have both advantage and disadvantage');
    });

    it('should return error for invalid dice expression', async () => {
      const result = await handleToolCall('roll_dice', {
        batch: [{ expression: 'invalid' }]
      });

      expect(result.isError).toBe(true);
    });
  });
});
