/**
 * check_line_of_sight Tests - TDD Red Phase
 *
 * Line of sight calculations for D&D 5e:
 * - Trace line from observer to target
 * - Check for obstacles (walls, creatures, terrain)
 * - Support for partial blocking (cover)
 * - 3D support for flying creatures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';
import { getTextContent } from '../helpers.js';

describe('check_line_of_sight', () => {
  // ============================================================
  // CLEAR LINE OF SIGHT
  // ============================================================

  describe('Clear Line of Sight', () => {
    it('should detect clear line of sight between two positions', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 20, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should show distance in result', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toContain('30'); // 30 feet distance
    });

    it('should handle diagonal lines', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 15, y: 15, z: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should handle 3D line of sight with elevation', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 20, y: 0, z: 30 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });
  });

  // ============================================================
  // OBSTACLES - Static blocking
  // ============================================================

  describe('Obstacles', () => {
    it('should detect blocking by obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'wall' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|obstruct/i);
      expect(text).toContain('wall');
    });

    it('should support different obstacle types', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'pillar' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|obstruct/i);
      expect(text).toContain('pillar');
    });

    it('should handle multiple obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 50, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'wall' },
          { x: 30, y: 0, z: 0, type: 'pillar' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|obstruct/i);
    });

    it('should not block when obstacle is off the line', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 10, z: 0, type: 'wall' }, // Off to the side
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should respect obstacle height for flying targets', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 40 }, // Target is 40ft up
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'wall', height: 10 }, // Wall is only 10ft tall
        ],
      });

      const text = getTextContent(result);
      // Line passes over the wall
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should block when obstacle is tall enough', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 10 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'wall', height: 30 },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|obstruct/i);
    });
  });

  // ============================================================
  // ENCOUNTER INTEGRATION
  // ============================================================

  // Note: Full encounter integration (fromId/toId lookups, terrain obstacles)
  // requires encounter system to support custom encounterId or a "current encounter" concept.
  // These tests verify the basic structure works when given positions directly.
  describe('Encounter Integration', () => {
    it('should work with explicit positions even when encounterId provided', async () => {
      // Create an encounter (ID is auto-generated, we don't need it for position-based tests)
      await handleToolCall('create_encounter', {
        participants: [
          { id: 'archer-1', name: 'Archer', type: 'player', hp: 30, maxHp: 30, ac: 14, position: { x: 0, y: 0, z: 0 } },
          { id: 'goblin-1', name: 'Goblin', type: 'enemy', hp: 7, maxHp: 7, ac: 15, position: { x: 6, y: 0, z: 0 } },
        ],
      });

      // Use direct positions (encounter terrain integration is pending)
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 6, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should detect obstacles between positions', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 6, y: 0, z: 0 },
        obstacles: [
          { x: 3, y: 0, z: 0, type: 'wall' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|obstruct/i);
    });

    it('should show positions in output', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 6, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toContain('From:');
      expect(text).toContain('To:');
    });
  });

  // ============================================================
  // COVER DETECTION
  // ============================================================

  describe('Cover Detection', () => {
    it('should detect half cover obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'half_cover' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/half.*cover/i);
      expect(text).toContain('+2'); // +2 AC from half cover
    });

    it('should detect three-quarters cover obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'three_quarters_cover' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/three.*quarter.*cover/i);
      expect(text).toContain('+5'); // +5 AC from 3/4 cover
    });

    it('should detect total cover (blocked)', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'total_cover' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/total.*cover|blocked/i);
    });

    it('should use highest cover when multiple obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 50, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'half_cover' },
          { x: 30, y: 0, z: 0, type: 'three_quarters_cover' },
        ],
      });

      const text = getTextContent(result);
      // Should report 3/4 cover as it's the highest
      expect(text).toMatch(/three.*quarter.*cover/i);
    });
  });

  // ============================================================
  // CREATURE BLOCKING
  // ============================================================

  describe('Creature Blocking', () => {
    it('should optionally treat creatures as obstacles', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        creatures: [
          { x: 15, y: 0, z: 0, size: 'large' },
        ],
        creaturesBlock: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/blocked|cover/i);
    });

    it('should not block by default when creaturesBlock is false', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        creatures: [
          { x: 15, y: 0, z: 0, size: 'medium' },
        ],
        creaturesBlock: false,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/clear|unobstructed/i);
    });

    it('should provide half cover for medium creatures', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        creatures: [
          { x: 15, y: 0, z: 0, size: 'medium' },
        ],
        creaturesBlock: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/half.*cover/i);
    });

    it('should provide 3/4 cover for large creatures', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        creatures: [
          { x: 15, y: 0, z: 0, size: 'large' },
        ],
        creaturesBlock: true,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/three.*quarter.*cover/i);
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================

  describe('Output Format', () => {
    it('should output ASCII art box', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 20, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toMatch(/[╔┌]/); // ASCII box border
    });

    it('should show line visualization', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 20, y: 0, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toContain('LINE OF SIGHT');
    });

    it('should show from and to positions', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 5, y: 10, z: 0 },
        to: { x: 25, y: 30, z: 0 },
      });

      const text = getTextContent(result);
      expect(text).toContain('5');
      expect(text).toContain('10');
      expect(text).toContain('25');
      expect(text).toContain('30');
    });

    it('should clearly indicate blocked status', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 0 },
        obstacles: [
          { x: 15, y: 0, z: 0, type: 'wall' },
        ],
      });

      const text = getTextContent(result);
      expect(text).toMatch(/BLOCKED|OBSTRUCTED/i);
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================

  describe('Error Handling', () => {
    it('should require from position or fromId', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        to: { x: 20, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require to position or toId', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it('should require encounterId when using IDs', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        fromId: 'archer-1',
        toId: 'goblin-1',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle invalid fromId', async () => {
      await handleToolCall('create_encounter', {
        participants: [
          { id: 'test-1', name: 'Tester', type: 'player', hp: 10, maxHp: 10, ac: 10, position: { x: 0, y: 0, z: 0 } },
        ],
      });

      const result = await handleToolCall('check_line_of_sight', {
        encounterId: 'current',
        fromId: 'nonexistent-id',
        toId: 'test-1',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================

  describe('Edge Cases', () => {
    it('should handle same position (distance 0)', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 10, y: 10, z: 0 },
        to: { x: 10, y: 10, z: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/clear|same.*position/i);
    });

    it('should handle very long distances', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 600, y: 0, z: 0 }, // 600 feet - longbow range
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toContain('600');
    });

    it('should handle negative coordinates', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: -10, y: -10, z: 0 },
        to: { x: 10, y: 10, z: 0 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
    });

    it('should handle purely vertical line of sight', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 10, y: 10, z: 0 },
        to: { x: 10, y: 10, z: 60 },
      });

      const text = getTextContent(result);
      expect(result.isError).toBeUndefined();
      expect(text).toMatch(/clear|unobstructed/i);
    });
  });

  // ============================================================
  // SPECIAL SENSES
  // ============================================================

  describe('Special Senses', () => {
    it('should optionally consider darkvision range', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 120, y: 0, z: 0 },
        lighting: 'darkness',
        darkvision: 60,
      });

      const text = getTextContent(result);
      expect(text).toMatch(/darkness|darkvision|obscured/i);
    });

    it('should note blindsight ignores obstacles', async () => {
      // Note: positions are in grid units (1 unit = 5 ft)
      // So x:6 = 30ft distance, blindsightRange:30 = 30ft
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 6, y: 0, z: 0 },  // 6 squares = 30 feet
        obstacles: [
          { x: 3, y: 0, z: 0, type: 'wall' },  // Wall at 15 feet
        ],
        senses: ['blindsight'],
        blindsightRange: 30,  // 30 feet range
      });

      const text = getTextContent(result);
      // Blindsight can detect through obstacles within range
      expect(text).toContain('blindsight');
    });

    it('should note tremorsense limitations', async () => {
      const result = await handleToolCall('check_line_of_sight', {
        from: { x: 0, y: 0, z: 0 },
        to: { x: 30, y: 0, z: 30 }, // Target is flying
        senses: ['tremorsense'],
        tremorsenseRange: 60,
      });

      const text = getTextContent(result);
      // Tremorsense can't detect flying creatures
      expect(text).toMatch(/tremorsense|flying|airborne/i);
    });
  });
});
