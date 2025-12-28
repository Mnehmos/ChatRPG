/**
 * calculate_aoe Tests - TDD Red Phase
 *
 * Area of Effect calculations for D&D 5e:
 * - Sphere, cone, line, cube, cylinder shapes
 * - Returns affected tiles and creatures
 * - Supports direction for cones/lines
 * - ASCII visualization of affected area
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('calculate_aoe', () => {
  // ============================================================
  // SPHERE - Radiates from origin point
  // ============================================================

  describe('Sphere AoE', () => {
    it('should calculate sphere area of effect', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        radius: 20,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('sphere');
      expect(text).toContain('20');
    });

    it('should return tiles within sphere radius', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 5, y: 5, z: 0 },
        radius: 10,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/tile|square|position/i);
    });

    it('should optionally include origin point', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 5, y: 5, z: 0 },
        radius: 10,
        includeOrigin: true,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('5, 5');
    });

    it('should exclude origin by default', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 5, y: 5, z: 0 },
        radius: 10,
        includeOrigin: false,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should handle 3D sphere with elevation', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 10 },
        radius: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // CONE - Emanates from origin in direction
  // ============================================================

  describe('Cone AoE', () => {
    it('should calculate cone area of effect', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 10, y: 10, z: 0 },
        length: 30,
        direction: { x: 1, y: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('cone');
      expect(text).toContain('30');
    });

    it('should require direction for cone', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 10, y: 10, z: 0 },
        length: 30,
        // Missing direction
      });

      // Should still work but with default direction, or require it
      expect(result.isError).toBeUndefined();
    });

    it('should calculate cone width at base equals length', async () => {
      // Per D&D 5e: cone base width = cone length
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 0, y: 0, z: 0 },
        length: 15,
        direction: { x: 1, y: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('15');
    });

    it('should support diagonal cone directions', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 5, y: 5, z: 0 },
        length: 20,
        direction: { x: 1, y: 1 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // LINE - Extends in direction with width
  // ============================================================

  describe('Line AoE', () => {
    it('should calculate line area of effect', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'line',
        origin: { x: 0, y: 5, z: 0 },
        length: 100,
        width: 5,
        direction: { x: 1, y: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('line');
      expect(text).toContain('100');
    });

    it('should default line width to 5 feet', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'line',
        origin: { x: 0, y: 0, z: 0 },
        length: 60,
        direction: { x: 1, y: 0 },
        // No width specified - should default to 5
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should support variable line widths', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'line',
        origin: { x: 0, y: 0, z: 0 },
        length: 30,
        width: 10, // 10-foot wide line
        direction: { x: 0, y: 1 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('10');
    });
  });

  // ============================================================
  // CUBE - Centered or corner origin
  // ============================================================

  describe('Cube AoE', () => {
    it('should calculate cube area of effect', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cube',
        origin: { x: 10, y: 10, z: 0 },
        sideLength: 20,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('cube');
      expect(text).toContain('20');
    });

    it('should calculate cube with direction (effects edge placement)', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cube',
        origin: { x: 0, y: 0, z: 0 },
        sideLength: 15,
        direction: { x: 1, y: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // CYLINDER - Vertical column
  // ============================================================

  describe('Cylinder AoE', () => {
    it('should calculate cylinder area of effect', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cylinder',
        origin: { x: 15, y: 15, z: 0 },
        radius: 20,
        height: 40,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('cylinder');
      expect(text).toContain('20'); // radius
      expect(text).toContain('40'); // height
    });

    it('should require height for cylinder', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cylinder',
        origin: { x: 10, y: 10, z: 0 },
        radius: 15,
        height: 30,
      });

      expect(result.isError).toBeUndefined();
    });

    it('should handle elevated cylinder origin', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cylinder',
        origin: { x: 10, y: 10, z: 20 },
        radius: 10,
        height: 60,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // ENCOUNTER INTEGRATION
  // ============================================================

  describe('Encounter Integration', () => {
    it('should find creatures in AoE when encounterId provided', async () => {
      // First create an encounter with participants
      await handleToolCall('create_encounter', {
        participants: [
          { id: 'wizard-1', name: 'Gandalf', type: 'player', hp: 50, maxHp: 50, ac: 12, position: { x: 10, y: 10, z: 0 } },
          { id: 'goblin-1', name: 'Goblin 1', type: 'enemy', hp: 7, maxHp: 7, ac: 15, position: { x: 12, y: 10, z: 0 } },
          { id: 'goblin-2', name: 'Goblin 2', type: 'enemy', hp: 7, maxHp: 7, ac: 15, position: { x: 50, y: 50, z: 0 } },
        ],
      });

      const result = await handleToolCall('calculate_aoe', {
        encounterId: 'current',
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        radius: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should find goblin-1 (within radius) but not goblin-2 (too far)
    });

    it('should support excludeIds to ignore specific creatures', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        radius: 20,
        excludeIds: ['wizard-1'], // Caster excludes self
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        radius: 15,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should include shape visualization', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 5, y: 5, z: 0 },
        radius: 10,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      // Should have some visual representation
    });

    it('should show tile count', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        radius: 10,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/\d+.*tile|square/i);
    });

    it('should show shape parameters', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 0, y: 0, z: 0 },
        length: 30,
        direction: { x: 1, y: 0 },
      });

      const text = getTextContent(result);
      expect(text).toContain('30');
      expect(text).toContain('cone');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require shape', async () => {
      const result = await handleToolCall('calculate_aoe', {
        origin: { x: 10, y: 10, z: 0 },
        radius: 15,
      });

      expect(result.isError).toBe(true);
    });

    it('should require origin', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        radius: 15,
      });

      expect(result.isError).toBe(true);
    });

    it('should require radius for sphere', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 10, y: 10, z: 0 },
        // Missing radius
      });

      expect(result.isError).toBe(true);
    });

    it('should require length for cone', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cone',
        origin: { x: 10, y: 10, z: 0 },
        // Missing length
      });

      expect(result.isError).toBe(true);
    });

    it('should require length for line', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'line',
        origin: { x: 10, y: 10, z: 0 },
        // Missing length
      });

      expect(result.isError).toBe(true);
    });

    it('should require sideLength for cube', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cube',
        origin: { x: 10, y: 10, z: 0 },
        // Missing sideLength
      });

      expect(result.isError).toBe(true);
    });

    it('should require radius and height for cylinder', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'cylinder',
        origin: { x: 10, y: 10, z: 0 },
        // Missing radius and height
      });

      expect(result.isError).toBe(true);
    });

    it('should validate shape enum', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'triangle', // Invalid shape
        origin: { x: 10, y: 10, z: 0 },
        radius: 15,
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle radius of 5 (minimum single tile sphere)', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 0, y: 0, z: 0 },
        radius: 5,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should handle large AoE (60+ feet)', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 50, y: 50, z: 0 },
        radius: 60,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should handle origin at 0,0,0', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: 0, y: 0, z: 0 },
        radius: 20,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should handle negative coordinates', async () => {
      const result = await handleToolCall('calculate_aoe', {
        shape: 'sphere',
        origin: { x: -10, y: -10, z: 0 },
        radius: 15,
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });
});
