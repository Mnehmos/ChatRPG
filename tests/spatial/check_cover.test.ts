/**
 * Tests for check_cover tool
 * Returns AC and Dex save bonuses based on cover between attacker and target
 * D&D 5e PHB p.196 Cover Rules:
 * - Half Cover: +2 AC, +2 Dex saves (low wall, furniture, creatures, narrow tree trunk)
 * - Three-Quarters Cover: +5 AC, +5 Dex saves (portcullis, arrow slit, thick tree trunk)
 * - Total Cover: Cannot be targeted directly (completely concealed)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleToolCall } from '../../src/registry.js';

describe('check_cover', () => {
  // ============================================================
  // NO COVER SCENARIOS
  // ============================================================
  describe('No Cover', () => {
    it('should return no cover when line of sight is clear', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
      });

      expect(result.content[0].text).toContain('NO COVER');
      expect(result.content[0].text).toContain('AC Bonus: +0');
      expect(result.content[0].text).toContain('Dex Save Bonus: +0');
    });

    it('should return no cover when obstacle is not between attacker and target', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 0, y: 5, z: 0, type: 'wall' }, // Wall is off to the side
        ],
      });

      expect(result.content[0].text).toContain('NO COVER');
    });

    it('should return no cover with empty obstacles array', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 5, z: 0 },
        obstacles: [],
      });

      expect(result.content[0].text).toContain('NO COVER');
      expect(result.content[0].text).toContain('AC Bonus: +0');
    });
  });

  // ============================================================
  // HALF COVER SCENARIOS
  // ============================================================
  describe('Half Cover', () => {
    it('should return half cover for low wall between positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' },
        ],
      });

      expect(result.content[0].text).toContain('HALF COVER');
      expect(result.content[0].text).toContain('AC Bonus: +2');
      expect(result.content[0].text).toContain('Dex Save Bonus: +2');
    });

    it('should return half cover for medium creature blocking', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'medium' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('HALF COVER');
      expect(result.content[0].text).toContain('AC Bonus: +2');
    });

    it('should return half cover for small creature blocking', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'small' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('HALF COVER');
    });
  });

  // ============================================================
  // THREE-QUARTERS COVER SCENARIOS
  // ============================================================
  describe('Three-Quarters Cover', () => {
    it('should return three-quarters cover for arrow slit', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'three_quarters_cover' },
        ],
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
      expect(result.content[0].text).toContain('AC Bonus: +5');
      expect(result.content[0].text).toContain('Dex Save Bonus: +5');
    });

    it('should return three-quarters cover for large creature blocking', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'large' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
      expect(result.content[0].text).toContain('AC Bonus: +5');
    });

    it('should return three-quarters cover for huge creature blocking', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'huge' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
    });
  });

  // ============================================================
  // TOTAL COVER SCENARIOS
  // ============================================================
  describe('Total Cover', () => {
    it('should return total cover for wall between positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'wall' },
        ],
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
      expect(result.content[0].text).toContain('Target cannot be directly targeted');
    });

    it('should return total cover for pillar between positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'pillar' },
        ],
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
    });

    it('should return total cover for total_cover obstacle type', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'total_cover' },
        ],
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
    });

    it('should return total cover for gargantuan creature blocking', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'gargantuan' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
    });
  });

  // ============================================================
  // CREATURE COVER OPTIONS
  // ============================================================
  describe('Creature Cover Settings', () => {
    it('should ignore creatures when creaturesProvideCover is false', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'large' },
        ],
        creaturesProvideCover: false,
      });

      expect(result.content[0].text).toContain('NO COVER');
    });

    it('should ignore creatures by default (creaturesProvideCover defaults to false)', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'large' },
        ],
      });

      expect(result.content[0].text).toContain('NO COVER');
    });

    it('should not count tiny creatures as cover', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        creatures: [
          { x: 5, y: 0, z: 0, size: 'tiny' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('NO COVER');
    });
  });

  // ============================================================
  // MULTIPLE OBSTACLES - HIGHEST COVER WINS
  // ============================================================
  describe('Multiple Obstacles', () => {
    it('should use highest cover level when multiple obstacles exist', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 15, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' },
          { x: 10, y: 0, z: 0, type: 'three_quarters_cover' },
        ],
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
      expect(result.content[0].text).toContain('AC Bonus: +5');
    });

    it('should show total cover if any obstacle provides it', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 15, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' },
          { x: 10, y: 0, z: 0, type: 'wall' },
        ],
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
    });

    it('should combine creature and obstacle cover using highest', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 15, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' },
        ],
        creatures: [
          { x: 10, y: 0, z: 0, size: 'large' }, // 3/4 cover
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
    });
  });

  // ============================================================
  // HEIGHT CONSIDERATIONS
  // ============================================================
  describe('Height and Elevation', () => {
    it('should ignore low obstacle when shooting over it from elevation', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 4 }, // Elevated position (20ft high)
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover', height: 5 }, // 5ft wall
        ],
      });

      // Line from z=4 to z=0 at x=5 is at z=2 (10ft), clears 5ft (1 grid) wall
      expect(result.content[0].text).toContain('NO COVER');
    });

    it('should apply cover for tall obstacle blocking elevated shot', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 1 }, // 5ft elevated
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'wall', height: 15 }, // 15ft wall
        ],
      });

      expect(result.content[0].text).toContain('TOTAL COVER');
    });

    it('should handle z-axis differences between attacker and target', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 4 }, // Target elevated 20ft
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover', height: 5 }, // 5ft wall
        ],
      });

      // Line goes up, clears 5ft wall
      expect(result.content[0].text).toContain('NO COVER');
    });
  });

  // ============================================================
  // OUTPUT FORMAT
  // ============================================================
  describe('Output Format', () => {
    it('should include ASCII box with COVER CHECK header', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
      });

      expect(result.content[0].text).toContain('╔');
      expect(result.content[0].text).toContain('COVER CHECK');
    });

    it('should show attacker and target positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 1, y: 2, z: 0 },
        target: { x: 7, y: 8, z: 0 },
      });

      expect(result.content[0].text).toContain('Attacker: (1, 2, 0)');
      expect(result.content[0].text).toContain('Target: (7, 8, 0)');
    });

    it('should show distance between positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 6, y: 0, z: 0 }, // 6 grid = 30ft
      });

      expect(result.content[0].text).toContain('Distance: 30 feet');
    });

    it('should list obstacles providing cover', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' },
        ],
      });

      expect(result.content[0].text).toContain('half_cover');
      expect(result.content[0].text).toContain('(5, 0, 0)');
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle same position (no cover)', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 5, y: 5, z: 0 },
        target: { x: 5, y: 5, z: 0 },
      });

      expect(result.content[0].text).toContain('NO COVER');
      expect(result.content[0].text).toContain('Distance: 0 feet');
    });

    it('should handle diagonal positions', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 5, z: 0 },
        obstacles: [
          { x: 2, y: 2, z: 0, type: 'half_cover' },
        ],
      });

      expect(result.content[0].text).toContain('HALF COVER');
    });

    it('should handle obstacle at target position (still provides cover)', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
        obstacles: [
          { x: 5, y: 0, z: 0, type: 'half_cover' }, // Cover at target position
        ],
      });

      // Target behind cover at their own position still gets cover
      expect(result.content[0].text).toContain('HALF COVER');
    });

    it('should ignore obstacle at attacker position', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
        obstacles: [
          { x: 0, y: 0, z: 0, type: 'half_cover' }, // Cover at attacker position
        ],
      });

      // Cover at attacker's position doesn't help target
      expect(result.content[0].text).toContain('NO COVER');
    });

    it('should default z to 0 when not provided', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0 },
        target: { x: 5, y: 0 },
      });

      expect(result.content[0].text).toContain('(0, 0, 0)');
      expect(result.content[0].text).toContain('(5, 0, 0)');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  describe('Error Handling', () => {
    it('should require attacker position', async () => {
      const result = await handleToolCall('check_cover', {
        target: { x: 5, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('attacker');
    });

    it('should require target position', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('target');
    });

    it('should validate obstacle type', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
        obstacles: [
          { x: 2, y: 0, z: 0, type: 'invalid_type' },
        ],
      });

      expect(result.isError).toBe(true);
    });

    it('should validate creature size', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 5, y: 0, z: 0 },
        creatures: [
          { x: 2, y: 0, z: 0, size: 'invalid_size' },
        ],
        creaturesProvideCover: true,
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // PRACTICAL COMBAT SCENARIOS
  // ============================================================
  describe('Practical Combat Scenarios', () => {
    it('should handle archer behind arrow slit', async () => {
      // Archer is behind a fortification
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 10, y: 0, z: 0 },
        obstacles: [
          { x: 9, y: 0, z: 0, type: 'three_quarters_cover' },
        ],
      });

      expect(result.content[0].text).toContain('THREE-QUARTERS COVER');
      expect(result.content[0].text).toContain('AC Bonus: +5');
      expect(result.content[0].text).toContain('Dex Save Bonus: +5');
    });

    it('should handle melee combat with ally in the way', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 2, y: 0, z: 0 }, // Adjacent target
        creatures: [
          { x: 1, y: 0, z: 0, size: 'medium' }, // Ally in between
        ],
        creaturesProvideCover: true,
      });

      expect(result.content[0].text).toContain('HALF COVER');
    });

    it('should handle ranged attack against target in doorway', async () => {
      const result = await handleToolCall('check_cover', {
        attacker: { x: 0, y: 0, z: 0 },
        target: { x: 8, y: 0, z: 0 },
        obstacles: [
          { x: 7, y: 3, z: 0, type: 'wall' }, // Wall on one side of door (3 tiles away from line)
          { x: 7, y: -3, z: 0, type: 'wall' }, // Wall on other side (3 tiles away)
        ],
      });

      // Target in doorway, walls beside don't provide cover (outside 1-grid tolerance)
      expect(result.content[0].text).toContain('NO COVER');
    });
  });
});
