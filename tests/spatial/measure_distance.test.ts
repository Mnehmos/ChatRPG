/**
 * measure_distance Tests - TDD
 * Red -> Green -> Refactor
 */

import { describe, it, expect } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('measure_distance', () => {
  describe('Grid 5e Mode (Default)', () => {
    it('should calculate horizontal distance (5ft per square)', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 0 },
      });
      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('15 feet');
      expect(text).toContain('3 squares');
    });

    it('should calculate vertical distance', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 4, z: 0 },
      });
      const text = getTextContent(result);
      expect(text).toContain('20 feet');
      expect(text).toContain('4 squares');
    });

    it('should calculate diagonal as 5ft (simplified)', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
        mode: 'grid_5e',
      });
      const text = getTextContent(result);
      // Grid 5e: max(|Δx|, |Δy|) = max(2, 2) = 2 squares = 10 feet
      expect(text).toContain('10 feet');
      expect(text).toContain('2 squares');
    });

    it('should handle multi-square diagonal paths', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 3, z: 0 },
        mode: 'grid_5e',
      });
      const text = getTextContent(result);
      // Grid 5e: max(5, 3) = 5 squares = 25 feet
      expect(text).toContain('25 feet');
      expect(text).toContain('5 squares');
    });
  });

  describe('Euclidean Mode', () => {
    it('should calculate true geometric distance', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 0, z: 0 },
        mode: 'euclidean',
      });
      const text = getTextContent(result);
      // √(3²) × 5 = 15 feet
      expect(text).toContain('15 feet');
      expect(text).toContain('3 squares');
    });

    it('should handle 3-4-5 triangle correctly', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 0 },
        mode: 'euclidean',
      });
      const text = getTextContent(result);
      // √(3² + 4²) × 5 = √25 × 5 = 5 × 5 = 25 feet
      expect(text).toContain('25 feet');
      expect(text).toContain('5 squares');
    });
  });

  describe('Grid Alt Mode', () => {
    it('should alternate diagonal cost 5/10/5/10', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 4, y: 4, z: 0 },
        mode: 'grid_alt',
      });
      const text = getTextContent(result);
      // 4 diagonals: 5+10+5+10 = 30 feet
      expect(text).toContain('30 feet');
      expect(text).toContain('4 squares');
    });

    it('should calculate mixed paths correctly', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 5, y: 3, z: 0 },
        mode: 'grid_alt',
      });
      const text = getTextContent(result);
      // 3 diagonals (5+10+5=20) + 2 straight (2×5=10) = 30 feet
      expect(text).toContain('30 feet');
      expect(text).toContain('5 squares');
    });
  });

  describe('Elevation', () => {
    it('should include Z axis in calculations', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 12 },
        mode: 'euclidean',
        includeElevation: true,
      });
      const text = getTextContent(result);
      // √(3² + 4² + 12²) × 5 = √(9+16+144) × 5 = √169 × 5 = 13 × 5 = 65 feet
      expect(text).toContain('65 feet');
      expect(text).toContain('13 squares');
    });

    it('should ignore elevation when includeElevation is false', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 12 },
        mode: 'euclidean',
        includeElevation: false,
      });
      const text = getTextContent(result);
      // √(3² + 4²) × 5 = 25 feet (ignoring z)
      expect(text).toContain('25 feet');
      expect(text).toContain('5 squares');
    });

    it('should handle flying creature distances', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 6 },
        mode: 'grid_5e',
      });
      const text = getTextContent(result);
      // 6 squares vertical = 30 feet
      expect(text).toContain('30 feet');
      expect(text).toContain('6 squares');
    });
  });

  describe('Output Format', () => {
    it('should return distance in feet', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
      });
      const text = getTextContent(result);
      expect(text).toMatch(/\d+ feet/);
    });

    it('should return distance in squares', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 2, z: 0 },
      });
      const text = getTextContent(result);
      expect(text).toMatch(/\d+ squares/);
    });

    it('should include ASCII art formatting', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 3, y: 4, z: 0 },
      });
      const text = getTextContent(result);
      expect(text).toContain('╔'); // ASCII box border
      expect(text).toContain('DISTANCE');
      expect(text).toContain('Path:'); // Arrow path visualization
    });
  });

  describe('Error Handling', () => {
    it('should handle missing position coordinates', async () => {
      const result = await handleToolCall('measure_distance', {
        from: { x: 0, y: 0 },
        to: { x: 3, y: 4 },
      });
      const text = getTextContent(result);
      // Should default z to 0 and still work
      expect(result.isError).toBeUndefined();
      expect(text).toContain('feet');
    });
  });
});
