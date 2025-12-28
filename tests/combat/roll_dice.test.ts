/**
 * roll_dice Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('roll_dice', () => {
  describe('Basic Rolls', () => {
    it('should roll a simple d20', async () => {
      const result = await handleToolCall('roll_dice', { expression: '1d20' });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('1d20');
      // Total should be between 1-20 (match either FINAL RESULT or TOTAL for d20 crits)
      const match = text.match(/(?:FINAL RESULT|TOTAL): (\d+)/);
      expect(match).not.toBeNull();
      const total = parseInt(match![1]);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(20);
    });

    it('should roll 2d6+4', async () => {
      const result = await handleToolCall('roll_dice', { expression: '2d6+4' });
      const text = getTextContent(result);
      expect(text).toContain('2d6+4');
      const match = text.match(/FINAL RESULT: (\d+)/);
      expect(match).not.toBeNull();
      const total = parseInt(match![1]);
      expect(total).toBeGreaterThanOrEqual(6);  // 2+4
      expect(total).toBeLessThanOrEqual(16);    // 12+4
    });

    it('should handle negative modifiers', async () => {
      const result = await handleToolCall('roll_dice', { expression: '1d20-2' });
      const text = getTextContent(result);
      expect(text).toContain('1d20-2');
    });
  });

  describe('Keep/Drop Modifiers', () => {
    it('should keep highest with kh modifier (4d6kh3)', async () => {
      const result = await handleToolCall('roll_dice', { expression: '4d6kh3' });
      const text = getTextContent(result);
      expect(text).toContain('4d6kh3');
      expect(text).toContain('KEPT:');
      const match = text.match(/FINAL RESULT: (\d+)/);
      expect(match).not.toBeNull();
      const total = parseInt(match![1]);
      expect(total).toBeGreaterThanOrEqual(3);   // 1+1+1
      expect(total).toBeLessThanOrEqual(18);     // 6+6+6
    });

    it('should keep lowest with kl modifier (disadvantage)', async () => {
      const result = await handleToolCall('roll_dice', { expression: '2d20kl1' });
      const text = getTextContent(result);
      expect(text).toContain('2d20kl1');
      expect(text).toContain('KEPT:');
    });
  });

  describe('Reason/Context', () => {
    it('should include reason in output when provided', async () => {
      const result = await handleToolCall('roll_dice', { 
        expression: '1d20+5', 
        reason: 'Attack roll' 
      });
      const text = getTextContent(result);
      expect(text).toContain('Attack roll');
    });
  });

  describe('Advantage/Disadvantage', () => {
    it('should roll with advantage (2d20kh1)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        advantage: true
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('2d20kh1'); // Should convert to advantage notation
      expect(text).toContain('KEPT:'); // Shows which was kept
      // Final result should be between 1-20
      const finalMatch = text.match(/FINAL RESULT: (\d+)/);
      expect(finalMatch).not.toBeNull();
      const final = parseInt(finalMatch![1]);
      expect(final).toBeGreaterThanOrEqual(1);
      expect(final).toBeLessThanOrEqual(20);
    });

    it('should roll with disadvantage (2d20kl1)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        disadvantage: true
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('2d20kl1'); // Should convert to disadvantage notation
      expect(text).toContain('KEPT:'); // Shows which was kept
      // Final result should be between 1-20
      const finalMatch = text.match(/FINAL RESULT: (\d+)/);
      expect(finalMatch).not.toBeNull();
      const final = parseInt(finalMatch![1]);
      expect(final).toBeGreaterThanOrEqual(1);
      expect(final).toBeLessThanOrEqual(20);
    });

    it('should roll with advantage and modifier (1d20+5)', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20+5',
        advantage: true
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('2d20kh1+5');
      const match = text.match(/FINAL RESULT: (\d+)/);
      expect(match).not.toBeNull();
      const total = parseInt(match![1]);
      expect(total).toBeGreaterThanOrEqual(6);  // 1+5
      expect(total).toBeLessThanOrEqual(25);    // 20+5
    });

    it('should return error when both advantage and disadvantage are set', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '1d20',
        advantage: true,
        disadvantage: true
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('Cannot have both advantage and disadvantage');
    });

    it('should return error when advantage used with non-d20 roll', async () => {
      const result = await handleToolCall('roll_dice', {
        expression: '2d6',
        advantage: true
      });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toContain('only works with single d20 rolls');
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid expression', async () => {
      const result = await handleToolCall('roll_dice', { expression: 'invalid' });
      expect(result.isError).toBe(true);
      const text = getTextContent(result);
      expect(text).toMatch(/Error|ERROR/i);
    });

    it('should return error for missing expression', async () => {
      const result = await handleToolCall('roll_dice', {});
      expect(result.isError).toBe(true);
    });
  });
});
